/**
 * Pluggable adapter interfaces for Pajama Hive.
 * Each adapter has a default implementation and can be swapped via config.
 *
 * Default stack:
 * - Search: Neon Postgres pg_trgm + tsvector
 * - Vector: Neon Postgres pgvector
 * - Storage: Cloudflare R2
 * - Queue: Cloudflare Durable Objects
 * - Cache: Cloudflare KV
 */

export type { SearchAdapter, SearchHit, SearchQuery } from './search.js';
export type { VectorAdapter, VectorDocument, VectorSearchResult, VectorSearchQuery } from './vector.js';
export type { StorageAdapter, StorageObject, UploadOptions } from './storage.js';
export type { QueueAdapter, QueueMessage } from './queue.js';
export type { CacheAdapter, CacheOptions } from './cache.js';

export { PgSearchAdapter } from './search.js';
export { PgVectorAdapter } from './vector.js';
export { R2StorageAdapter } from './storage.js';
export { DOQueueAdapter } from './queue.js';
export { KVCacheAdapter, MemoryCacheAdapter } from './cache.js';
