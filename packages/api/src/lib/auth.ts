import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { createDb, type Database } from '../db/client.js';
import { graphs, tasks as tasksTable, runs as runsTable, edges as edgesTable, apiKeys as apiKeysTable } from '../db/schema.js';
import type { Env } from '../types/index.js';

interface ClerkJWKS {
  keys: {
    kty: string;
    n: string;
    e: string;
    kid: string;
    alg: string;
    use: string;
  }[];
}

let cachedJwks: ClerkJWKS | null = null;
let jwksCachedAt = 0;
const JWKS_CACHE_TTL = 300_000; // 5 minutes

async function getClerkJwks(publishableKey: string): Promise<ClerkJWKS> {
  const now = Date.now();
  if (cachedJwks && now - jwksCachedAt < JWKS_CACHE_TTL) {
    return cachedJwks;
  }

  // Extract Clerk frontend API URL from publishable key
  const decoded = atob(publishableKey.replace('pk_test_', '').replace('pk_live_', ''));
  const frontendApi = decoded.endsWith('$') ? decoded.slice(0, -1) : decoded;

  const res = await fetch(`https://${frontendApi}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);

  cachedJwks = await res.json() as ClerkJWKS;
  jwksCachedAt = now;
  return cachedJwks;
}

async function importJwk(jwk: ClerkJWKS['keys'][0]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyClerkToken(token: string, publishableKey: string): Promise<{ sub: string; [key: string]: unknown }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));

  const jwks = await getClerkJwks(publishableKey);
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('No matching JWK found');

  const key = await importJwk(jwk);
  const signature = base64UrlDecode(signatureB64);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));

  // Check expiration
  if (payload.exp && payload.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }

  return payload;
}

type HonoEnv = { Bindings: Env; Variables: { userId: string; claims: Record<string, unknown> } };

export const clerkAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  // API key auth: tokens starting with hive_
  if (token.startsWith('hive_')) {
    try {
      const db = createDb(c.env);
      const keyHash = await hashApiKey(token);
      const [apiKey] = await db.select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.keyHash, keyHash));

      if (!apiKey) return c.json({ error: 'Invalid API key' }, 401);
      if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
        return c.json({ error: 'API key expired' }, 401);
      }

      c.set('userId', apiKey.userId);
      c.set('claims', { sub: apiKey.userId, scopes: apiKey.scopes });

      // Update last used timestamp (best-effort)
      db.update(apiKeysTable).set({ lastUsedAt: new Date() }).where(eq(apiKeysTable.id, apiKey.id)).catch(() => {});

      await next();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return c.json({ error: `API key authentication failed: ${msg}` }, 401);
    }
  }

  // Clerk JWT auth
  try {
    const claims = await verifyClerkToken(token, c.env.CLERK_PUBLISHABLE_KEY);
    c.set('userId', claims.sub);
    c.set('claims', claims);
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    return c.json({ error: message }, 401);
  }
});

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export { hashApiKey };

type OwnershipResult = { ok: true } | { ok: false; status: 404 | 403; error: string };

export async function verifyGraphOwner(db: Database, graphId: string, userId: string): Promise<OwnershipResult> {
  const [graph] = await db.select({ ownerId: graphs.ownerId }).from(graphs).where(eq(graphs.id, graphId));
  if (!graph) return { ok: false, status: 404, error: 'Graph not found' };
  if (graph.ownerId !== userId) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true };
}

export async function verifyTaskOwner(db: Database, taskId: string, userId: string): Promise<OwnershipResult> {
  const [task] = await db.select({ graphId: tasksTable.graphId }).from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) return { ok: false, status: 404, error: 'Task not found' };
  return verifyGraphOwner(db, task.graphId, userId);
}

export async function verifyRunOwner(db: Database, runId: string, userId: string): Promise<OwnershipResult> {
  const [run] = await db.select({ graphId: runsTable.graphId }).from(runsTable).where(eq(runsTable.id, runId));
  if (!run) return { ok: false, status: 404, error: 'Run not found' };
  return verifyGraphOwner(db, run.graphId, userId);
}

export async function verifyEdgeOwner(db: Database, edgeId: string, userId: string): Promise<OwnershipResult> {
  const [edge] = await db.select({ graphId: edgesTable.graphId }).from(edgesTable).where(eq(edgesTable.id, edgeId));
  if (!edge) return { ok: false, status: 404, error: 'Edge not found' };
  return verifyGraphOwner(db, edge.graphId, userId);
}
