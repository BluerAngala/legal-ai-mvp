/**
 * Upload Worker — 写入文件 + 写库 + 通知后续 worker
 *
 * 重构要点：
 *   - 配置从 @legalai/config 读取（无默认）
 *   - DB 走 @legalai/database
 *   - 文档注册表持久化到 documents 表（不再内存）
 *   - 上传完成后 emit 一个 'document.uploaded' 事件，由 iii 引擎路由到 document-worker
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "@legalai/config";
import { WorkerError, createLogger } from "@legalai/core";
import { query, queryOne, withTransaction } from "@legalai/database";
import { http, registerWorker } from "iii-sdk";
import { z } from "zod";

const cfg = loadConfig();
const log = createLogger("upload-worker");

const UPLOADS_DIR =
	process.env.UPLOADS_DIR ?? join(process.cwd(), "data", "uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ENGINE_URL = cfg.engine.url;
const sdk = registerWorker(ENGINE_URL, { workerName: cfg.engine.workerName });

/* ---------- Schemas ---------- */

const UploadInputSchema = z.object({
	file: z.object({
		data: z.string(), // base64
		filename: z.string(),
		mimeType: z.string().optional(),
	}),
	collectionId: z.string().optional(),
});

const IdParamSchema = z.object({ documentId: z.string().uuid() });

/* ---------- Types ---------- */

interface DocumentRow {
	id: string;
	filename: string;
	mime_type: string;
	size: number;
	checksum: string;
	status: "pending" | "stored" | "indexing" | "indexed" | "error";
	created_at: string;
}

/* ---------- Helpers ---------- */

async function ensureDir(p: string): Promise<void> {
	if (!existsSync(p)) await mkdirSync(p, { recursive: true });
}

function computeChecksum(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

/* ---------- Functions ---------- */

async function uploadCreate(input: unknown) {
	const { file, collectionId } = UploadInputSchema.parse(input);
	const buffer = Buffer.from(file.data, "base64");
	if (buffer.length > MAX_FILE_SIZE) {
		throw new WorkerError(
			"upload",
			`File too large: ${buffer.length} > ${MAX_FILE_SIZE}`,
		);
	}
	const documentId = randomUUID();
	const checksum = computeChecksum(buffer);
	const mimeType = file.mimeType ?? "application/octet-stream";

	// 写本地（兼容回退：即使 storage worker 不可用，文件仍能落地）
	const dirPath = join(UPLOADS_DIR, documentId);
	await ensureDir(dirPath);
	const filePath = join(dirPath, file.filename);
	await writeFile(filePath, buffer);
	// 写到 storage worker（生产环境 S3/R2 桶；开发环境 local provider）
	// 失败不阻塞主流程（本地副本足够前端预览/重试）
	const storageKey = `${documentId}/${file.filename}`;
	try {
		await sdk.trigger("storage::putObject", {
			bucket: "documents",
			key: storageKey,
			body_base64: file.data,
			content_type: mimeType,
		});
		log.info("File persisted to storage", { documentId, storageKey });
	} catch (err) {
		log.warn("storage::putObject failed (kept local copy)", {
			documentId,
			error: err instanceof Error ? err.message : String(err),
		});
	}

	// 落库（同时建空 chunks 占位以保持 schema 一致）
	await withTransaction(async (client) => {
		await client.query(
			`INSERT INTO documents (id, collection_id, filename, mime_type, size, checksum, status, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6, 'stored', $7)`,
			[
				documentId,
				collectionId ?? null,
				file.filename,
				mimeType,
				buffer.length,
				checksum,
				filePath,
			],
		);
	});

	// 触发后续：通过 durable 队列发布（持久化 + 重试 + DLQ）
	try {
		await sdk.trigger("iii::durable::publish", {
			topic: "document-parse",
			data: { documentId, filename: file.filename, storageKey },
		});
	} catch (err) {
		log.warn("iii::durable::publish failed (continuing)", {
			documentId,
			error: err instanceof Error ? err.message : String(err),
		});
	}

	log.info("Upload complete", {
		documentId,
		filename: file.filename,
		size: buffer.length,
	});
	return {
		documentId,
		filename: file.filename,
		size: buffer.length,
		checksum,
		status: "stored" as const,
	};
}

async function uploadStatus(input: unknown) {
	const { documentId } = IdParamSchema.parse(input);
	const row = await queryOne<DocumentRow>(
		`SELECT id, filename, mime_type, size, checksum, status, created_at
     FROM documents WHERE id = $1`,
		[documentId],
	);
	if (!row)
		throw new WorkerError(
			"upload",
			`Document not found: ${documentId}`,
			undefined,
			{ statusCode: 404 },
		);
	return {
		documentId: row.id,
		filename: row.filename,
		mimeType: row.mime_type,
		size: row.size,
		checksum: row.checksum,
		status: row.status,
		createdAt: row.created_at,
	};
}

async function uploadDelete(input: unknown) {
	const { documentId } = IdParamSchema.parse(input);
	const row = await queryOne<{ storage_path: string }>(
		`SELECT storage_path FROM documents WHERE id = $1`,
		[documentId],
	);
	if (!row)
		throw new WorkerError(
			"upload",
			`Document not found: ${documentId}`,
			undefined,
			{ statusCode: 404 },
		);
	await query(`DELETE FROM documents WHERE id = $1`, [documentId]);
	// 本地副本
	if (row.storage_path && existsSync(row.storage_path)) {
		await rm(row.storage_path, { force: true });
	}
	// storage worker 副本（best-effort）
	try {
		await sdk.trigger("storage::deleteObject", {
			bucket: "documents",
			key: `${documentId}/`,
		});
	} catch (err) {
		log.warn("storage::deleteObject failed", {
			documentId,
			error: err instanceof Error ? err.message : String(err),
		});
	}
	return { documentId, deleted: true };
}

async function uploadList(input: unknown) {
	const args = z
		.object({
			collectionId: z.string().optional(),
			limit: z.number().int().min(1).max(100).default(20),
			offset: z.number().int().min(0).default(0),
		})
		.parse(input ?? {});
	const rows = await query<DocumentRow>(
		`SELECT id, filename, mime_type, size, checksum, status, created_at
     FROM documents
     WHERE ($1::text IS NULL OR collection_id = $1)
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
		[args.collectionId ?? null, args.limit, args.offset],
	);
	return {
		documents: rows.rows.map((r) => ({
			documentId: r.id,
			filename: r.filename,
			mimeType: r.mime_type,
			size: r.size,
			checksum: r.checksum,
			status: r.status,
			createdAt: r.created_at,
		})),
		limit: args.limit,
		offset: args.offset,
	};
}

/* ---------- HTTP Triggers ---------- */

sdk.registerTrigger({
	type: "http",
	function_id: "upload::create",
	config: { api_path: "/api/documents/upload", http_method: "POST" },
});

sdk.registerTrigger({
	type: "http",
	function_id: "upload::list",
	config: { api_path: "/api/documents", http_method: "GET" },
});

sdk.registerTrigger({
	type: "http",
	function_id: "upload::status",
	config: { api_path: "/api/documents/:id", http_method: "GET" },
});

sdk.registerTrigger({
	type: "http",
	function_id: "upload::delete",
	config: { api_path: "/api/documents/:id", http_method: "DELETE" },
});

/* ---------- Function Registration ---------- */

sdk.registerFunction("upload::create", uploadCreate);
sdk.registerFunction("upload::status", uploadStatus);
sdk.registerFunction("upload::delete", uploadDelete);
sdk.registerFunction("upload::list", uploadList);

log.info("Upload worker registered", {
	engine: ENGINE_URL,
	uploadsDir: UPLOADS_DIR,
});

// 显式导出以避免 unused 警告
export { uploadCreate, uploadStatus, uploadDelete, uploadList };
