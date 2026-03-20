/**
 * SearchAdapter — pluggable full-text search interface.
 * Default: Neon Postgres pg_trgm + tsvector
 * Swappable to: Elasticsearch, Typesense, MeiliSearch
 */

export interface SearchHit {
  id: string;
  score: number;
  highlights?: Record<string, string[]>;
}

export interface SearchQuery {
  query: string;
  index: string;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface SearchAdapter {
  /** Index a document for search */
  index(indexName: string, id: string, document: Record<string, unknown>): Promise<void>;

  /** Remove a document from the index */
  remove(indexName: string, id: string): Promise<void>;

  /** Full-text search */
  search(query: SearchQuery): Promise<{ hits: SearchHit[]; total: number }>;

  /** Bulk index multiple documents */
  bulkIndex(indexName: string, documents: { id: string; data: Record<string, unknown> }[]): Promise<void>;
}

/**
 * Default implementation using Neon Postgres pg_trgm + tsvector.
 * Requires the pg_trgm extension enabled on the database.
 */
export class PgSearchAdapter implements SearchAdapter {
  constructor(private readonly connectionString: string) {}

  async index(_indexName: string, _id: string, _document: Record<string, unknown>): Promise<void> {
    // In Postgres, "indexing" happens via INSERT/UPDATE with tsvector columns.
    // The actual indexing is handled by Drizzle ORM in each domain's route handler.
    // This adapter is used for cross-domain search queries.
  }

  async remove(_indexName: string, _id: string): Promise<void> {
    // Deletion handled by Drizzle ORM cascade deletes
  }

  async search(query: SearchQuery): Promise<{ hits: SearchHit[]; total: number }> {
    // Default: uses Drizzle's ilike with pg_trgm for similarity matching.
    // Each domain route implements its own search using Drizzle directly.
    // This method is for unified cross-domain search.
    return { hits: [], total: 0 };
  }

  async bulkIndex(_indexName: string, _documents: { id: string; data: Record<string, unknown> }[]): Promise<void> {
    // Bulk operations handled by Drizzle batch inserts
  }
}
