/**
 * Knowledge Worker — 混合检索（BM25 + 语义 + RRF）+ Redis 缓存
 *
 * 重构要点：
 *   - BM25 走 @legalai/search（去重、修复）
 *   - 语义检索走 LLMClient.embed
 *   - RRF 走 @legalai/search.rrfFuse
 *   - DB 走 @legalai/database
 *   - 缓存走 redis 客户端
 */

import { init } from "iii-sdk";
import { createHash } from "node:crypto";
import { z } from "zod";
import { loadConfig } from "@legalai/config";
import { WorkerError, createLogger, unwrapApiRequest, wrapApiResponse } from "@legalai/core";
import { query, queryOne } from "@legalai/database";
import { LLMClient } from "@legalai/llm";
import {
	BM25,
	HybridSearch,
	SemanticEngine,
	rrfFuse,
	type SearchDoc,
	type SearchHit,
} from "@legalai/search";
import { createClient, type RedisClientType } from "redis";

const cfg = loadConfig();
const log = createLogger("knowledge-worker");

const llm = new LLMClient(cfg.llm);
const sdk = init(cfg.engine.url, {
	workerName: cfg.engine.workerName,
});

/* ---------- Constants ---------- */

const SEARCH_CACHE_TTL_SEC = 300;
const BM25_DEFAULT_LIMIT = 50;

/* ---------- Types ---------- */

interface ChunkRow {
	id: string;
	document_id: string;
	content: string;
	document_title: string;
}

/* ---------- Redis (optional) ---------- */

let redisClient: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType | null> {
	if (!cfg.redis) return null;
	if (redisClient) return redisClient;
	try {
		redisClient = createClient({ url: cfg.redis.url });
		redisClient.on("error", (err) =>
			log.warn("Redis error", { err: String(err) }),
		);
		await redisClient.connect();
		return redisClient;
	} catch (err) {
		log.warn("Redis unavailable, caching disabled", { err: String(err) });
		return null;
	}
}

/* ---------- BM25 In-Memory ---------- */

let bm25: BM25 = new BM25();
let bm25LoadedAt = 0;

async function syncBM25Index(force = false): Promise<void> {
	if (!force && Date.now() - bm25LoadedAt < 60_000) return;
	const { rows } = await query<ChunkRow>(
		`SELECT c.id, c.document_id, c.content, d.filename AS document_title
     FROM chunks c JOIN documents d ON d.id = c.document_id
     WHERE d.status = 'indexed'`,
	);
	bm25 = new BM25();
	for (const r of rows) {
		bm25.index({ id: r.id, title: r.document_title, content: r.content });
	}
	bm25LoadedAt = Date.now();
	log.info("BM25 index synced", { docs: bm25.size });
}

/* ---------- Cache ---------- */

function cacheKey(query: string, topK: number, collectionId?: string): string {
	return `knowledge:search:${createHash("sha256")
		.update(`${query}|${topK}|${collectionId ?? ""}`)
		.digest("hex")}`;
}

async function cacheGet(key: string): Promise<unknown | null> {
	const r = await getRedis();
	if (!r) return null;
	try {
		const v = await r.get(key);
		return v ? JSON.parse(v) : null;
	} catch (err) {
		log.warn("Cache get failed", { err: String(err) });
		return null;
	}
}

async function cacheSet(
	key: string,
	value: unknown,
	ttl: number,
): Promise<void> {
	const r = await getRedis();
	if (!r) return;
	try {
		await r.setEx(key, ttl, JSON.stringify(value));
	} catch (err) {
		log.warn("Cache set failed", { err: String(err) });
	}
}

/* ---------- Schemas ---------- */

const SearchSchema = z.object({
	query: z.string().min(1),
	topK: z.number().int().min(1).max(100).default(10),
	collectionId: z.string().uuid().optional(),
	useCache: z.boolean().default(true),
	rrfK: z.number().int().min(1).max(500).default(60),
});

const IndexSchema = z.object({
	collectionId: z.string().uuid().optional(),
	force: z.boolean().default(false),
});

/* ---------- Functions ---------- */

async function knowledgeSearch(input: unknown) {
	const data = unwrapApiRequest(input);
	const args = SearchSchema.parse(data);
	const key = cacheKey(args.query, args.topK, args.collectionId);

	if (args.useCache) {
		const cached = await cacheGet(key);
		if (cached) {
			log.debug("Search cache hit", { query: args.query });
			return { results: cached, cached: true };
		}
	}

	// 同步 BM25
	await syncBM25Index();
	bm25 = bm25; // typecheck

	// 构造语义查询
	const semantic = new SemanticEngine(async (q, limit) => {
		const [qEmbed] = await llm.embed([q]);
		const qVec = await vectorToLiteral(qEmbed.vector);
		const { rows } = await query<{ id: string; distance: number }>(
			`SELECT id, embedding <=> $1::vector AS distance
       FROM chunks
       ORDER BY distance ASC
       LIMIT $2`,
			[qVec, limit],
		);
		return rows.map((r) => ({ id: r.id, score: 1 - r.distance }));
	});

	const hybrid = new HybridSearch(bm25, semantic, { k: args.rrfK });
	const result = await hybrid.search(args.query, args.topK);

	// enrich 命中的 chunk
	const ids = result.hits.map((h) => h.id);
	const enriched =
		ids.length > 0
			? (
					await query<ChunkRow>(
						`SELECT c.id, c.document_id, c.content, d.filename AS document_title
         FROM chunks c JOIN documents d ON d.id = c.document_id
         WHERE c.id = ANY($1::uuid[])`,
						[ids],
					)
				).rows
			: [];
	const docMap = new Map(enriched.map((r) => [r.id, r]));

	const finalResults = result.hits
		.map((h) => {
			const r = docMap.get(h.id);
			if (!r) return null;
			return {
				chunkId: h.id,
				documentId: r.document_id,
				documentTitle: r.document_title,
				content: r.content,
				snippet: h.snippet,
				score: h.score,
				source: h.source,
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	if (args.useCache) await cacheSet(key, finalResults, SEARCH_CACHE_TTL_SEC);
	return {
		results: finalResults,
		cached: false,
		stats: {
			bm25Count: result.bm25Count,
			semanticCount: result.semanticCount,
			total: finalResults.length,
		},
	};
}
async function knowledgeReindex(input: unknown) {
	const data = unwrapApiRequest(input);
	const args = IndexSchema.parse(data ?? {});
	await syncBM25Index(args.force);
	return { bm25Docs: bm25.size, syncedAt: new Date().toISOString() };
}

async function knowledgeHealth() {
	const { rows } = await query<{ count: string }>(
		`SELECT COUNT(*)::text AS count FROM chunks`,
	);
	return {
		ok: true,
		bm25Docs: bm25.size,
		chunks: Number(rows[0]?.count ?? 0),
		cacheEnabled: !!cfg.redis,
	};
}

/* ---------- Helpers ---------- */

async function vectorToLiteral(v: number[]): Promise<string> {
	return `[${v.join(",")}]`;
}

/* ---------- Registration ---------- */

sdk.registerFunction(
	{ id: "knowledge::search", description: "Hybrid search (BM25 + semantic + RRF) with Redis cache" },
	wrapApiResponse(knowledgeSearch),
);
sdk.registerFunction(
	{ id: "knowledge::reindex", description: "Rebuild the in-memory BM25 index" },
	wrapApiResponse(knowledgeReindex),
);
sdk.registerFunction(
	{ id: "knowledge::health", description: "Health check for the knowledge worker" },
	wrapApiResponse(knowledgeHealth),
);

sdk.registerTrigger({
	type: "http",
	function_id: "knowledge::search",
	config: { api_path: "/api/search", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "knowledge::reindex",
	config: { api_path: "/api/search/reindex", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "knowledge::health",
	config: { api_path: "/api/search/health", http_method: "GET" },
});

log.info("Knowledge worker registered", { engine: cfg.engine.url });

export { knowledgeSearch, knowledgeReindex, knowledgeHealth };
