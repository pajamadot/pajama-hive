import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import type { Env } from '../types/index.js';

export function createDb(env: Env) {
  // Use DATABASE_URL (direct Neon connection via @neondatabase/serverless WebSocket)
  // Hyperdrive disabled — Neon c-5 region gives error 1016 on Hyperdrive
  // Re-enable when Cloudflare adds c-5 support or DB is migrated to supported region
  const directUrl = (env as unknown as Record<string, string>).DATABASE_URL;
  if (directUrl) {
    return drizzle(neon(directUrl), { schema });
  }

  // Fallback to Hyperdrive
  return drizzle(neon(env.HYPERDRIVE.connectionString), { schema });
}

export function markHyperdriveBroken() {
  // No-op — Hyperdrive disabled in favor of DATABASE_URL
}

export type Database = ReturnType<typeof createDb>;
