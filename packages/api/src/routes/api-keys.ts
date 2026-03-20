import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import { clerkAuth, hashApiKey } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// List API keys for current user (never return the hash)
app.get('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const result = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    prefix: apiKeys.prefix,
    scopes: apiKeys.scopes,
    lastUsedAt: apiKeys.lastUsedAt,
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
  }).from(apiKeys).where(eq(apiKeys.userId, userId));
  return c.json({ apiKeys: result });
});

// Create API key (returns raw key ONCE)
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json() as {
    name: string;
    scopes?: string[];
    expiresInDays?: number;
  };

  if (!body.name) return c.json({ error: 'Name is required' }, 400);

  const rawKey = `hive_${nanoid(32)}`;
  const keyHash = await hashApiKey(rawKey);
  const prefix = rawKey.slice(0, 12);
  const id = nanoid(12);

  await db.insert(apiKeys).values({
    id,
    userId,
    name: body.name,
    keyHash,
    prefix,
    scopes: body.scopes ?? ['*'],
    expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000) : null,
  });

  return c.json({
    apiKey: { id, name: body.name, prefix },
    rawKey, // Only returned once!
  }, 201);
});

// Revoke API key
app.delete('/:keyId', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const keyId = c.req.param('keyId');

  await db.delete(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
  return c.json({ ok: true });
});

export default app;
