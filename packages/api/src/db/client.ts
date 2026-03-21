import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import type { Env } from '../types/index.js';

export function createDb(env: Env) {
  // Use DATABASE_URL secret if available (direct Neon connection)
  // Falls back to Hyperdrive if DATABASE_URL is not set
  const directUrl = (env as unknown as Record<string, string>).DATABASE_URL;
  const connectionString = directUrl || env.HYPERDRIVE.connectionString;
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
