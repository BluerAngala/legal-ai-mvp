/**
 * Document Worker — 解析 → chunk → embedding → 写库
 *
 * 流程：
 *   1) 收到 documentId，从 documents 表读 storage_path
 *   2) 解析（@legalai/document）
 *   3) 切分（@legalai/document.chunkText）
 *   4) 批量 embedding（@legalai/llm.embed）
 *   5) 写 chunks 表（含 embedding vector）
 *   6) 更新 documents.status = 'indexed'
 *
 * 触发：
 *   - HTTP: POST /api/documents/:id/parse
 *   - Event: document.uploaded  (来自 upload-worker)
 */

import { readFile } from "node:fs/promises";
import { loadConfig } from "@legalai/config";
import { WorkerError, createLogger, unwrapApiRequest, wrapApiResponse } from "@legalai/core";
import { query, queryOne, withTransaction } from "@legalai/database";
import { chunkText, parseDocument } from "@legalai/document";
import { LLMClient } from "@legalai/llm";
import { init } from "iii-sdk";
import { z } from "zod";

const cfg = loadConfig();
const log = createLogger("document-worker");

const llm = new LLMClient(cfg.llm);
const sdk = init(cfg.engine.url, {
	workerName: cfg.engine.workerName,
	invocationTimeoutMs: 400_000,
});

/* ---------- Constants ---------- */

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH = 20;

/* ---------- Types ---------- */

interface DocRow {
	id: string;
	filename: string;
	mime_type: string;
	storage_path: string | null;
	status: string;
}

/* ---------- Helpers ---------- */

async function loadEmbeddingVector(vec: number[]): Promise<string> {
	// pgvector 用 '[1,2,3]' 格式
	return `[${vec.join(",")}]`;
}

/* ---------- Functions ---------- */

async function documentParse(input: unknown) {
	const data = unwrapApiRequest(input);
	const { documentId } = z
		.object({ documentId: z.string().uuid() })
		.parse(data);
	const doc = await queryOne<DocRow>(
		`SELECT id, filename, mime_type, storage_path, status FROM documents WHERE id = $1`,
		[documentId],
	);
	if (!doc)
		throw new WorkerError(
			"document",
			`Document not found: ${documentId}`,
			undefined,
			{ statusCode: 404 },
		);
	if (!doc.storage_path)
		throw new WorkerError(
			"document",
			`Document has no storage_path: ${documentId}`,
		);

	// 1) 解析
	log.info("Parsing document", { documentId, filename: doc.filename });
	const buffer = await readFile(doc.storage_path);
	const parsed = await parseDocument(buffer, doc.filename);
	log.info("Document parsed", {
		documentId,
		textLength: parsed.text.length,
		pages: parsed.meta.pages,
	});

	// 2) 切分
	const chunks = chunkText(parsed.text, {
		chunkSize: CHUNK_SIZE,
		overlap: CHUNK_OVERLAP,
	});
	if (chunks.length === 0) {
		throw new WorkerError(
			"document",
			`Document has no extractable text: ${documentId}`,
		);
	}
	log.info("Chunked", { documentId, chunks: chunks.length });

	// 3) 状态置 indexing（可观察性）
	await query(`UPDATE documents SET status = 'indexing' WHERE id = $1`, [
		documentId,
	]);

	// 4) 批量 embedding
	const vectors: number[][] = [];
	for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
		const batch = chunks.slice(i, i + EMBED_BATCH).map((c) => c.text);
		const embeds = await llm.embed(batch);
		for (const e of embeds) vectors.push(e.vector);
	}
	if (vectors.length !== chunks.length) {
		throw new WorkerError(
			"document",
			`Embedding count mismatch: ${vectors.length} vs ${chunks.length}`,
		);
	}

	// 5) 落库（事务：删旧 chunk + 写新 chunk + 更新状态）
	await withTransaction(async (client) => {
		await client.query(`DELETE FROM chunks WHERE document_id = $1`, [
			documentId,
		]);
		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i]!;
			const v = vectors[i]!;
			const vecLiteral = await loadEmbeddingVector(v);
			await client.query(
				`INSERT INTO chunks (id, document_id, chunk_index, content, start_char, end_char, token_count, embedding)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::vector)`,
				[
					documentId,
					i,
					c.text,
					c.startChar,
					c.endChar,
					c.text.length,
					vecLiteral,
				],
			);
		}
		await client.query(
			`UPDATE documents SET status = 'indexed', indexed_at = NOW() WHERE id = $1`,
			[documentId],
		);
	});

	log.info("Indexing complete", { documentId, chunks: chunks.length });
	return {
		documentId,
		chunks: chunks.length,
		pages: parsed.meta.pages,
		bytes: parsed.meta.size,
	};
}

async function documentStatus(input: unknown) {
	const data = unwrapApiRequest(input);
	const { documentId } = z
		.object({ documentId: z.string().uuid() })
		.parse(data);
	const doc = await queryOne<DocRow & { indexed_at: string | null }>(
		`SELECT id, filename, mime_type, status, indexed_at FROM documents WHERE id = $1`,
		[documentId],
	);
	if (!doc)
		throw new WorkerError(
			"document",
			`Document not found: ${documentId}`,
			undefined,
			{ statusCode: 404 },
		);
	const { rows: countRows } = await query<{ count: string }>(
		`SELECT COUNT(*)::text AS count FROM chunks WHERE document_id = $1`,
		[documentId],
	);
	return {
		documentId: doc.id,
		filename: doc.filename,
		status: doc.status,
		indexedAt: doc.indexed_at,
		chunkCount: Number(countRows[0]?.count ?? 0),
	};
}

/* ---------- Registration ---------- */

sdk.registerFunction(
	{ id: "document::parse", description: "Parse a document: read storage, chunk, embed, persist." },
	wrapApiResponse(documentParse),
);
sdk.registerFunction(
	{ id: "document::status", description: "Get document status and chunk count." },
	wrapApiResponse(documentStatus),
);

sdk.registerTrigger({
	type: "http",
	function_id: "document::parse",
	config: { api_path: "/api/documents/:id/parse", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "document::status",
	config: { api_path: "/api/documents/:id/status", http_method: "GET" },
});

// 队列触发：upload-worker 发出 'document-parse' topic 时自动解析
// 相比 event trigger，队列提供持久化、重试、DLQ
try {
	sdk.registerTrigger({
		type: "durable:subscriber",
		function_id: "document::parse",
		config: { topic: "document-parse" },
	});
} catch {
	// 部分 SDK 版本不支持 durable:subscriber，忽略
}

log.info("Document worker registered", { engine: cfg.engine.url });

export { documentParse, documentStatus };
