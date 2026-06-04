import { registerWorker } from 'iii-sdk';
import { Pool } from 'pg';
import { createClient, type RedisClientType } from '@redis/client';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
// ============================================
// Configuration
// ============================================
interface Config {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
  };
  embedding: {
    provider: 'openai' | 'siliconflow' | 'deepseek';
    apiKey: string;
    baseUrl: string;
    model: string;
    dimensions: number;
  };
  search: {
    semanticWeight: number;
    keywordWeight: number;
    rrfK: number;
    topK: number;
    cacheTTL: number;
  };
}
// LLM Provider 配置
function getEmbeddingConfig(): Config['embedding'] {
  const provider = process.env.LLM_PROVIDER || 'siliconflow';
  const apiKey = process.env.LLM_API_KEY || '';
  switch (provider) {
    case 'siliconflow':
      return {
        provider: 'siliconflow',
        apiKey,
        baseUrl: 'https://api.siliconflow.cn/v1',
        model: 'BAAI/bge-m3',
        dimensions: 1024,
      };
    case 'deepseek':
      return {
        provider: 'deepseek',
        apiKey,
        baseUrl: 'https://api.deepseek.com',
        model: 'text-embedding-3',
        dimensions: 1536,
      };
    default:
      return {
        provider: 'openai',
        apiKey,
        baseUrl: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      };
  }
}
// Chat 模型配置
function getChatConfig() {
  const provider = process.env.LLM_PROVIDER || 'siliconflow';
  const apiKey = process.env.LLM_API_KEY || '';
  const configs: Record<string, { apiKey: string; baseUrl: string; model: string }> = {
    siliconflow: {
      apiKey,
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'MiniMaxAI/MiniMax-M2.5',  // 默认使用 MiniMax
    },
    deepseek: {
      apiKey,
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
    openai: {
      apiKey,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    },
  };
  return configs[provider] || configs.openai;
}
const config: Config = {
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'legalai',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'legalai123',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  embedding: getEmbeddingConfig(),
  search: {
    semanticWeight: 0.6,
    keywordWeight: 0.4,
    rrfK: 60,
    topK: 10,
    cacheTTL: 300,
  },
};

// ============================================
// Database & Cache Clients
// ============================================

let pgPool: Pool | null = null;
let redisClient: RedisClientType | null = null;
let openaiClient: OpenAI | null = null;
function getPgPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    pgPool.on('error', (err: unknown) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }
  return pgPool;
}

function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
    });
    redisClient.on('error', (err: unknown) => {
      console.error('Redis Client Error', err);
    });
  }
  return redisClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.embedding.apiKey,
      baseURL: config.embedding.baseUrl,
    });
  }
  return openaiClient;
}

// ============================================
// BM25 Implementation (in-memory keyword search)
// ============================================

interface BM25Document {
  id: string;
  content: string;
  terms: string[];
}

class BM25 {
  private documents: BM25Document[] = [];
  private documentCount = 0;
  private avgDocLength = 0;
  private docLengths: number[] = [];
  private documentFrequencies: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private k1 = 1.5;
  private b = 0.75;

  /**
   * Index documents for BM25 search
   */
  index(documents: Array<{ id: string; content: string }>): void {
    this.documents = documents.map((doc) => ({
      ...doc,
      terms: this.tokenize(doc.content),
    }));
    this.documentCount = this.documents.length;
    this.calculateAverageDocumentLength();
    this.calculateDocumentFrequencies();
    this.calculateIDF();
  }

  /**
   * Simple tokenizer with Chinese support
   */
  private tokenize(text: string): string[] {
    // Handle Chinese characters (split by character boundary for simplicity)
    const chinesePattern = /[\u4e00-\u9fff]+/g;
    const words = text
      .toLowerCase()
      .replace(chinesePattern, (match) => ` ${match} `)
      .split(/\s+/)
      .filter((term) => term.length > 1 && !this.isStopWord(term));

    return words;
  }

  /**
   * Basic English stop words
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
      'they', 'what', 'which', 'who', 'whom', 'if', 'then', 'so', 'because',
    ]);
    return stopWords.has(word);
  }

  private calculateAverageDocumentLength(): void {
    this.docLengths = this.documents.map((doc) => doc.terms.length);
    this.avgDocLength =
      this.docLengths.reduce((a, b) => a + b, 0) / this.documentCount || 1;
  }

  private calculateDocumentFrequencies(): void {
    this.documentFrequencies.clear();
    for (const doc of this.documents) {
      const uniqueTerms = new Set(doc.terms);
      for (const term of uniqueTerms) {
        this.documentFrequencies.set(
          term,
          (this.documentFrequencies.get(term) || 0) + 1
        );
      }
    }
  }

  private calculateIDF(): void {
    this.idf.clear();
    for (const [term, df] of this.documentFrequencies) {
      // Smoothed IDF formula
      this.idf.set(
        term,
        Math.log((this.documentCount - df + 0.5) / (df + 0.5) + 1)
      );
    }
  }

  /**
   * Search documents using BM25
   */
  search(query: string, topK = 10): Array<{ id: string; score: number }> {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) {
      return [];
    }

    const scores: Array<{ id: string; score: number }> = [];

    for (let i = 0; i < this.documents.length; i++) {
      const doc = this.documents[i];
      let score = 0;

      for (const term of queryTerms) {
        const termFreq = doc.terms.filter((t) => t === term).length;
        if (termFreq === 0) continue;

        const idf = this.idf.get(term) || 0;
        const docLen = this.docLengths[i];

        // BM25 formula
        const numerator = termFreq * (this.k1 + 1);
        const denominator =
          termFreq +
          this.k1 * (1 - this.b + (this.b * docLen) / this.avgDocLength);
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.push({ id: doc.id, score });
      }
    }

    // Normalize scores to 0-1 range
    const maxScore = Math.max(...scores.map((s) => s.score), 1);
    return scores
      .map((s) => ({ id: s.id, score: s.score / maxScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Clear index
   */
  clear(): void {
    this.documents = [];
    this.documentCount = 0;
    this.docLengths = [];
    this.documentFrequencies.clear();
    this.idf.clear();
  }
}

// In-memory BM25 index (in production, consider using Elasticsearch or similar)
const bm25Index = new BM25();

// ============================================
// Reciprocal Rank Fusion (RRF)
// ============================================

/**
 * Reciprocal Rank Fusion to combine multiple ranked lists
 * @param rankings Array of ranking results with their weights
 * @param k RRF constant (typically 60)
 */
function reciprocalRankFusion(
  rankings: Array<{ id: string; score: number; rank: number }>,
  k = 60
): number {
  return rankings.reduce((sum, r) => sum + r.score * (1 / (k + r.rank)), 0);
}

function fuseResults(
  semanticResults: Array<{ id: string; score: number }>,
  keywordResults: Array<{ id: string; score: number }>,
  semanticWeight: number,
  keywordWeight: number,
  rrfK: number
): Array<{ id: string; fusedScore: number }> {
  // Create maps for easy lookup
  const semanticMap = new Map(semanticResults.map((r) => [r.id, r.score]));
  const keywordMap = new Map(keywordResults.map((r) => [r.id, r.score]));

  // Get all unique document IDs
  const allIds = new Set([
    ...semanticResults.map((r) => r.id),
    ...keywordResults.map((r) => r.id),
  ]);

  const fused: Array<{ id: string; fusedScore: number }> = [];

  for (const id of allIds) {
    // Get ranks (1-based)
    const semanticRank =
      semanticResults.findIndex((r) => r.id === id) + 1 || allIds.size + 1;
    const keywordRank =
      keywordResults.findIndex((r) => r.id === id) + 1 || allIds.size + 1;

    // Get normalized scores (0-1)
    const semanticScore = semanticMap.get(id) || 0;
    const keywordScore = keywordMap.get(id) || 0;

    // Calculate RRF contribution
    const rrfScore =
      semanticWeight * (1 / (rrfK + semanticRank)) +
      keywordWeight * (1 / (rrfK + keywordRank));

    // Combine with original scores
    const fusedScore =
      semanticWeight * semanticScore +
      keywordWeight * keywordScore +
      rrfScore * 0.2; // Small RRF boost

    fused.push({ id, fusedScore });
  }

  return fused.sort((a, b) => b.fusedScore - a.fusedScore);
}

// ============================================
// Redis Cache
// ============================================

function getCacheKey(query: string, filters?: Record<string, unknown>): string {
  const filterStr = filters ? JSON.stringify(filters) : '';
  return `knowledge:search:${Buffer.from(`${query}:${filterStr}`).toString('base64')}`;
}

async function getCachedResults(
  cacheKey: string
): Promise<SearchResultType[] | null> {
  try {
    const redis = getRedisClient();
    await redis.connect();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as SearchResultType[];
    }
  } catch (error) {
    console.error('Redis get error:', error);
  }
  return null;
}

async function cacheResults(
  cacheKey: string,
  results: SearchResultType[],
  ttl: number
): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.connect();
    await redis.setEx(cacheKey, ttl, JSON.stringify(results));
  } catch (error) {
    console.error('Redis set error:', error);
  }
}

// ============================================
// Schema Definitions
// ============================================

const IndexChunkSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  collectionId: z.string().uuid().optional(),
});

const SearchQuerySchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(100).optional().default(10),
  collectionId: z.string().uuid().optional(),
  filters: z
    .object({
      documentTypes: z.array(z.string()).optional(),
      dateRange: z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  useCache: z.boolean().optional().default(true),
});

const DeleteDocumentSchema = z.object({
  documentId: z.string().uuid(),
  collectionId: z.string().uuid().optional(),
});

const SearchResult = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()),
  score: z.number(),
  rank: z.number(),
});

type IndexChunk = z.infer<typeof IndexChunkSchema>;
type SearchQuery = z.infer<typeof SearchQuerySchema>;
type DeleteDocument = z.infer<typeof DeleteDocumentSchema>;
type SearchResultType = z.infer<typeof SearchResult>;

// ============================================
// Worker Implementation
// ============================================

interface WorkerState {
  isInitialized: boolean;
  bm25SyncedAt: number;
}

async function initializeWorker(): Promise<void> {
  console.log('Initializing Knowledge Worker...');

  // Test PostgreSQL connection
  const pool = getPgPool();
  const result = await pool.query('SELECT NOW()');
  console.log('PostgreSQL connected:', result.rows[0].now);

  // Test Redis connection
  const redis = getRedisClient();
  await redis.connect();
  const pong = await redis.ping();
  console.log('Redis connected:', pong);

  // Sync BM25 index with current chunks
  await syncBM25Index();

  console.log('Knowledge Worker initialized successfully');
}

async function syncBM25Index(): Promise<void> {
  const pool = getPgPool();

  // Get all chunks for BM25 indexing
  const result = await pool.query(`
    SELECT id::text, content
    FROM document_chunks
    WHERE embedding IS NOT NULL
  `);

  const documents = result.rows.map((row) => ({
    id: row.id,
    content: row.content,
  }));

  bm25Index.index(documents);
  console.log(`BM25 index synced with ${documents.length} documents`);
}

// ============================================
// Worker Actions
// ============================================
async function indexChunk(
  params: IndexChunk,
  _ctx: unknown
): Promise<{ success: boolean; chunkId: string }> {
  const { chunkId, documentId, content, metadata, collectionId } = params;

  const pool = getPgPool();

  // Generate embedding for the chunk
  const openai = getOpenAIClient();
  const embeddingResponse = await openai.embeddings.create({
    model: config.embedding.model,
    input: content,
  });
  const embedding = embeddingResponse.data[0].embedding;

  // Insert or update chunk in database
  // Using JSONB for embeddings (Windows-compatible, no pgvector needed)
  await pool.query(
    `
    INSERT INTO document_chunks (id, document_id, content, metadata, embedding, chunk_index)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    ON CONFLICT (id) DO UPDATE SET
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding
    `,
    [
      chunkId,
      documentId,
      content,
      JSON.stringify(metadata || {}),
      JSON.stringify(embedding),
      0,
    ]
  );

  // Add to BM25 index
  bm25Index.index([{ id: chunkId, content }]);

  // If collection specified, create association
  if (collectionId) {
    await pool.query(
      `
      INSERT INTO collection_documents (collection_id, document_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [collectionId, documentId]
    );
  }

  // Invalidate related cache entries
  try {
    const redis = getRedisClient();
    await redis.connect();
    const keys = await redis.keys('knowledge:search:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }

  return { success: true, chunkId };
}

/**
 * knowledge::search - Hybrid search combining vector + BM25
 * Uses JSONB for embeddings (Windows-compatible)
 */
async function searchKnowledge(
  params: SearchQuery,
  _ctx: unknown
): Promise<{ results: SearchResultType[]; query: string }> {
  const { query, topK, collectionId, filters, useCache } = params;
  // Check cache first
  if (useCache) {
    const cacheKey = getCacheKey(query, filters as Record<string, unknown>);
    const cached = await getCachedResults(cacheKey);
    if (cached) {
      console.log('Returning cached results for query:', query);
      return { results: cached, query };
    }
  }
  const pool = getPgPool();
  const openai = getOpenAIClient();
  // Build filter conditions
  const filterConditions: string[] = [];
  const filterParams: unknown[] = [];
  if (filters?.documentTypes && filters.documentTypes.length > 0) {
    filterConditions.push(`d.type = ANY($1)`);
    filterParams.push(filters.documentTypes);
  }
  if (filters?.dateRange) {
    if (filters.dateRange.from) {
      filterConditions.push(`d.created_at >= $${filterParams.length + 1}`);
      filterParams.push(filters.dateRange.from);
    }
    if (filters.dateRange.to) {
      filterConditions.push(`d.created_at <= $${filterParams.length + 1}`);
      filterParams.push(filters.dateRange.to);
    }
  }
  if (filters?.tags && filters.tags.length > 0) {
    filterConditions.push(`d.tags && $${filterParams.length + 1}`);
    filterParams.push(filters.tags);
  }
  const whereClause = filterConditions.length > 0 ? `AND ${filterConditions.join(' AND ')}` : '';
  // 1. Generate query embedding for semantic similarity
  const embeddingResponse = await openai.embeddings.create({
    model: config.embedding.model,
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;
  const queryNorm = Math.sqrt(queryEmbedding.reduce((sum, v) => sum + v * v, 0));
  // 2. Get all chunks for similarity calculation (Windows-compatible: no pgvector)
  const collectionClause = collectionId
    ? `AND dc.document_id IN (SELECT document_id FROM collection_documents WHERE collection_id = $${filterParams.length + 1})`
    : '';
  const queryParams = collectionId ? [...filterParams, collectionId] : filterParams;
  const chunksQuery = `
    SELECT
      dc.id::text as chunk_id,
      dc.document_id::text as document_id,
      dc.content,
      dc.metadata,
      dc.embedding
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE dc.embedding IS NOT NULL
      ${collectionClause}
      ${whereClause}
  `;
  const allChunks = await pool.query(chunksQuery, queryParams);
  // Calculate cosine similarity in JavaScript
  const semanticResults = allChunks.rows
    .map((row) => {
      const embedding = row.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        return { id: row.chunk_id, score: 0 };
      }
      const dotProduct = embedding.reduce(
        (sum: number, v: number, i: number) => sum + v * (queryEmbedding[i] || 0),
        0
      );
      const embeddingNorm = Math.sqrt(embedding.reduce((sum: number, v: number) => sum + v * v, 0));
      const similarity = embeddingNorm > 0 ? dotProduct / (queryNorm * embeddingNorm) : 0;
      return { id: row.chunk_id, score: similarity };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  // 3. Keyword search (BM25)
  const keywordResults = bm25Index.search(query, topK);
  // 4. Fuse results using RRF
  const fusedResults = fuseResults(
    semanticResults,
    keywordResults,
    config.search.semanticWeight,
    config.search.keywordWeight,
    config.search.rrfK
  );
  // 5. Fetch full document details for top results
  const topChunkIds = fusedResults.slice(0, topK).map((r) => r.id);
  if (topChunkIds.length === 0) {
    return { results: [], query };
  }
  const fullResultsQuery = `
    SELECT
      dc.id::text as chunk_id,
      dc.document_id::text as document_id,
      dc.content,
      dc.metadata
    FROM document_chunks dc
    WHERE dc.id = ANY($1)
  `;
  const fullResults = await pool.query(fullResultsQuery, [topChunkIds]);
  const resultsMap = new Map(fullResults.rows.map((r) => [r.chunk_id, r]));
  const results: SearchResultType[] = fusedResults.slice(0, topK).map((fused, index) => {
    const chunkData = resultsMap.get(fused.id);
    return {
      chunkId: fused.id,
      documentId: chunkData?.document_id || '',
      content: chunkData?.content || '',
      metadata: chunkData?.metadata || {},
      score: fused.fusedScore,
      rank: index + 1,
    };
  });
  // Cache results
  if (useCache) {
    const cacheKey = getCacheKey(query, filters as Record<string, unknown>);
    await cacheResults(cacheKey, results, config.search.cacheTTL);
  }
  return { results, query };
}

/**
 * knowledge::delete - Delete document from index
 */
async function deleteDocument(
  params: DeleteDocument,
  _ctx: unknown
): Promise<{ success: boolean; deletedChunks: number }> {
  const { documentId, collectionId } = params;

  const pool = getPgPool();

  // Get chunk IDs before deletion for BM25 cleanup
  const chunkIds = await pool
    .query(
      'SELECT id::text FROM document_chunks WHERE document_id = $1',
      [documentId]
    )
    .then((res) => res.rows.map((r) => r.id));

  // Delete from database (cascades to chunks)
  const deleteResult = await pool.query(
    'DELETE FROM documents WHERE id = $1 RETURNING id',
    [documentId]
  );

  if (deleteResult.rowCount === 0) {
    return { success: false, deletedChunks: 0 };
  }

  // Remove from collection if specified
  if (collectionId) {
    await pool.query(
      'DELETE FROM collection_documents WHERE collection_id = $1 AND document_id = $2',
      [collectionId, documentId]
    );
  }

  // Invalidate cache
  try {
    const redis = getRedisClient();
    await redis.connect();
    const keys = await redis.keys('knowledge:search:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }

  return { success: true, deletedChunks: chunkIds.length };
}

// ============================================
// SDK Initialization
// ============================================

const ENGINE_URL = process.env['ENGINE_URL'] ?? 'http://localhost:4000';

const sdk = registerWorker(ENGINE_URL, { workerName: 'knowledge-worker' });

// ============================================
// Worker Startup
// ============================================

async function onStart(): Promise<void> {
  console.log('Knowledge Worker starting...');
  await initializeWorker();
}

async function onHealthCheck(): Promise<{ healthy: boolean; message?: string }> {
  try {
    const pool = getPgPool();
    await pool.query('SELECT 1');

    const redis = getRedisClient();
    await redis.connect();
    await redis.ping();

    return { healthy: true };
  } catch (error) {
    return { healthy: false, message: String(error) };
  }
}

// ============================================
// Function Registration
// ============================================

sdk.registerFunction('knowledge::index', async (input: IndexChunk) => {
  return indexChunk(input, undefined);
});

sdk.registerFunction('knowledge::search', async (input: SearchQuery) => {
  return searchKnowledge(input, undefined);
});

sdk.registerFunction('knowledge::delete', async (input: DeleteDocument) => {
  return deleteDocument(input, undefined);
});

sdk.registerFunction('knowledge::reindex', async () => {
  await syncBM25Index();
  return { success: true, message: 'BM25 index rebuilt' };
});

// ============================================
// HTTP Trigger Registration
// ============================================

sdk.registerTrigger({
  type: 'http',
  function_id: 'knowledge::search',
  config: {
    api_path: '/api/knowledge/search',
    http_method: 'POST',
  },
});

// ============================================
// Lifecycle Hooks
// ============================================

export { onStart, onHealthCheck };