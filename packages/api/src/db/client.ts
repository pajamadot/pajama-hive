import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import type { Env } from '../types/index.js';

export function createDb(env: Env) {
  const sql = neon(env.HYPERDRIVE.connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
