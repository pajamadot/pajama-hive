import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import type { Env } from '../types/index.js';

// Track whether Hyperdrive works to avoid repeated failures
let hyperdriveWorks: boolean | null = null;

export function createDb(env: Env) {
  // If we already know Hyperdrive doesn't work, go straight to direct
  if (hyperdriveWorks === false) {
    const directUrl = (env as unknown as Record<string, string>).DATABASE_URL;
    if (!directUrl) throw new Error('No database connection configured');
    return drizzle(neon(directUrl), { schema });
  }

  // Try Hyperdrive first
  try {
    const hyperdriveUrl = env.HYPERDRIVE?.connectionString;
    if (hyperdriveUrl) {
      const sql = neon(hyperdriveUrl);
      const db = drizzle(sql, { schema });
      // We'll detect failure on first query — the error propagates to the route handler
      // which triggers the auth middleware catch block. If we see error 1016,
      // we mark Hyperdrive as broken.
      if (hyperdriveWorks === null) hyperdriveWorks = true;
      return db;
    }
  } catch {
    hyperdriveWorks = false;
  }

  // Direct connection
  const directUrl = (env as unknown as Record<string, string>).DATABASE_URL;
  if (!directUrl) throw new Error('No database connection configured');
  return drizzle(neon(directUrl), { schema });
}

/**
 * Call this when a Hyperdrive query fails with error 1016.
 * Next createDb call will skip Hyperdrive.
 */
export function markHyperdriveBroken() {
  hyperdriveWorks = false;
}

export type Database = ReturnType<typeof createDb>;
