/**
 * VectorAdapter — pluggable vector embedding storage & search.
 * Default: Neon Postgres pgvector extension
 * Swappable to: Milvus, Pinecone, Qdrant, Weaviate
 */

export interface VectorDocument {
  id: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  content?: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
  content?: string;
}

export interface VectorSearchQuery {
  embedding: number[];
  collection: string;
  topK?: number;
  filter?: Record<string, unknown>;
  minScore?: number;
}

export interface VectorAdapter {
  /** Create a collection/namespace for vectors */
  createCollection(name: string, dimension: number): Promise<void>;

  /** Delete a collection */
  deleteCollection(name: string): Promise<void>;

  /** Upsert vectors into a collection */
  upsert(collection: string, documents: VectorDocument[]): Promise<void>;

  /** Delete vectors by ID */
  remove(collection: string, ids: string[]): Promise<void>;

  /** Similarity search */
  search(query: VectorSearchQuery): Promise<VectorSearchResult[]>;

  /** Get vectors by ID */
  get(collection: string, ids: string[]): Promise<VectorDocument[]>;
}

/**
 * Default implementation using Neon Postgres pgvector extension.
 * Requires `CREATE EXTENSION IF NOT EXISTS vector;` on the database.
 * Vectors stored in document_chunks table with a vector column.
 */
export class PgVectorAdapter implements VectorAdapter {
  constructor(private readonly connectionString: string) {}

  async createCollection(_name: string, _dimension: number): Promise<void> {
    // Collections map to tables — created via Drizzle migrations
  }

  async deleteCollection(_name: string): Promise<void> {
    // Handled by Drizzle migration drops
  }

  async upsert(_collection: string, _documents: VectorDocument[]): Promise<void> {
    // Implemented in knowledge domain route using Drizzle insert/update
  }

  async remove(_collection: string, _ids: string[]): Promise<void> {
    // Implemented via Drizzle deletes
  }

  async search(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    // Uses pgvector's <=> (cosine distance) operator via raw SQL
    // Each domain implements search using Drizzle + sql`` template
    return [];
  }

  async get(_collection: string, _ids: string[]): Promise<VectorDocument[]> {
    return [];
  }
}
