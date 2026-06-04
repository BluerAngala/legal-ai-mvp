/**
 * Cache Utilities - Legal AI MVP
 * Redis-based caching for retrieval and analysis
 */

import { createClient, type RedisClientType } from '@redis/client';

interface CacheConfig {
  url?: string;
  ttl?: number;
  maxRetries?: number;
}

let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis client
 */
export async function initCache(config: CacheConfig = {}): Promise<RedisClientType> {
  if (redisClient) return redisClient;

  const url = config.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379';

  redisClient = createClient({ url });

  redisClient.on('error', (err: unknown) => {
    console.error('Redis cache error:', err);
  });

  await redisClient.connect();
  return redisClient;
}

/**
 * Get cache client (throws if not initialized)
 */
export function getCache(): RedisClientType {
  if (!redisClient) {
    throw new Error('Cache not initialized. Call initCache() first.');
  }
  return redisClient;
}

/**
 * Close cache connection
 */
export async function closeCache(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// ============================================================================
// Cache Key Generators
// ============================================================================

/**
 * Generate cache key for search query
 */
export function searchCacheKey(
  query: string,
  filters?: {
    collection_id?: string;
    document_types?: string[];
    date_range?: { start: string; end: string };
    tags?: string[];
  }
): string {
  const normalized = query.toLowerCase().trim();
  const filterStr = filters ? JSON.stringify(filters) : '';
  return `search:${hashString(normalized + filterStr)}`;
}

/**
 * Generate cache key for analysis result
 */
export function analysisCacheKey(
  documentId: string,
  action: string,
  params?: Record<string, unknown>
): string {
  const paramsHash = params ? hashString(JSON.stringify(params)) : '';
  return `analysis:${documentId}:${action}:${paramsHash}`;
}

/**
 * Generate cache key for embedding
 */
export function embeddingCacheKey(text: string): string {
  return `embedding:${hashString(text)}`;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get cached value
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cache = getCache();
    const value = await cache.get(key);
    if (value) {
      return JSON.parse(value) as T;
    }
    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set cached value with TTL
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<void> {
  try {
    const cache = getCache();
    await cache.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Delete cached value
 */
export async function deleteCached(key: string): Promise<void> {
  try {
    const cache = getCache();
    await cache.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

/**
 * Invalidate cache by pattern
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    const cache = getCache();
    const keys = await cache.keys(pattern);
    if (keys.length > 0) {
      await cache.del(keys);
    }
  } catch (error) {
    console.error('Cache invalidate error:', error);
  }
}

// ============================================================================
// Specialized Cache Functions
// ============================================================================

/**
 * Cache search results
 */
export async function cacheSearchResults(
  query: string,
  filters: Parameters<typeof searchCacheKey>[1],
  results: unknown,
  ttlSeconds: number = 300
): Promise<void> {
  const key = searchCacheKey(query, filters);
  await setCached(key, results, ttlSeconds);
}

/**
 * Get cached search results
 */
export async function getCachedSearchResults(
  query: string,
  filters: Parameters<typeof searchCacheKey>[1]
): Promise<unknown | null> {
  const key = searchCacheKey(query, filters);
  return getCached(key);
}

/**
 * Cache analysis result
 */
export async function cacheAnalysisResult(
  documentId: string,
  action: string,
  params: Record<string, unknown> | undefined,
  result: unknown,
  ttlMinutes: number = 30
): Promise<void> {
  const key = analysisCacheKey(documentId, action, params);
  await setCached(key, result, ttlMinutes * 60);
}

/**
 * Get cached analysis result
 */
export async function getCachedAnalysisResult(
  documentId: string,
  action: string,
  params: Record<string, unknown> | undefined
): Promise<unknown | null> {
  const key = analysisCacheKey(documentId, action, params);
  return getCached(key);
}

/**
 * Cache embedding
 */
export async function cacheEmbedding(
  text: string,
  embedding: number[],
  ttlHours: number = 24
): Promise<void> {
  const key = embeddingCacheKey(text);
  await setCached(key, embedding, ttlHours * 60 * 60);
}

/**
 * Get cached embedding
 */
export async function getCachedEmbedding(text: string): Promise<number[] | null> {
  const key = embeddingCacheKey(text);
  return getCached<number[]>(key);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple string hash function
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Cache statistics
 */
export async function getCacheStats(): Promise<{
  hits: number;
  misses: number;
  keys: number;
}> {
  try {
    const cache = getCache();
    const info = await cache.info('stats');
    const match = info.match(/keyspace_hits:(\d+)/);
    const hits = match ? parseInt(match[1], 10) : 0;
    const missMatch = info.match(/keyspace_misses:(\d+)/);
    const misses = missMatch ? parseInt(missMatch[1], 10) : 0;
    const dbSize = await cache.dbSize();

    return { hits, misses, keys: dbSize };
  } catch {
    return { hits: 0, misses: 0, keys: 0 };
  }
}
