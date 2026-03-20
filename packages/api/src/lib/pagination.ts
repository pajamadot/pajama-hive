import { desc, lt } from 'drizzle-orm';
import type { PgColumn, PgSelect } from 'drizzle-orm/pg-core';

interface PaginationParams {
  cursor?: string;
  limit?: number;
}

interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function parsePaginationQuery(query: { cursor?: string; limit?: string }): PaginationParams {
  return {
    cursor: query.cursor,
    limit: Math.min(parseInt(query.limit ?? '20', 10), 200),
  };
}

export function buildPaginatedResponse<T extends { createdAt: Date | null }>(
  data: T[],
  limit: number,
): PaginatedResult<T> {
  const hasMore = data.length === limit;
  return {
    data,
    nextCursor: hasMore && data.length > 0 ? data[data.length - 1].createdAt?.toISOString() ?? null : null,
    hasMore,
  };
}
