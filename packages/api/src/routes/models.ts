import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { createModelProviderSchema, createModelConfigSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { modelProviders, modelConfigs } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// ── Providers ──

// List model providers for workspace
app.get('/providers', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const providers = await db.select().from(modelProviders)
    .where(eq(modelProviders.workspaceId, workspaceId));

  // Strip encrypted API keys from response
  const safe = providers.map(({ apiKeyEncrypted, ...rest }) => ({
    ...rest,
    hasApiKey: !!apiKeyEncrypted,
  }));

  return c.json({ providers: safe });
});

// Create model provider
app.post('/providers', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const parsed = createModelProviderSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { apiKey, ...rest } = parsed.data;
  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();

  await db.insert(modelProviders).values({
    id,
    workspaceId,
    ...rest,
    apiKeyEncrypted: apiKey,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return c.json({ provider: { id, workspaceId, ...rest, hasApiKey: !!apiKey } }, 201);
});

// Update model provider
app.patch('/providers/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
  if (body.apiKey) updates.apiKeyEncrypted = body.apiKey;
  if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;
  if (body.config) updates.config = body.config;

  await db.update(modelProviders).set(updates).where(eq(modelProviders.id, id));
  return c.json({ ok: true });
});

// Delete model provider
app.delete('/providers/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  await db.delete(modelProviders).where(eq(modelProviders.id, id));
  return c.json({ ok: true });
});

// Test model provider connection
app.post('/providers/:id/test', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [provider] = await db.select().from(modelProviders).where(eq(modelProviders.id, id));
  if (!provider) return c.json({ error: 'Provider not found' }, 404);

  // TODO: implement actual connection test per provider type
  return c.json({ ok: true, message: 'Connection test not yet implemented' });
});

// ── Model Configs ──

// List model configs for a provider
app.get('/configs', async (c) => {
  const db = createDb(c.env);
  const providerId = c.req.query('providerId');
  if (!providerId) return c.json({ error: 'providerId required' }, 400);

  const configs = await db.select().from(modelConfigs)
    .where(eq(modelConfigs.providerId, providerId));

  return c.json({ configs });
});

// Create model config
app.post('/configs', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const parsed = createModelConfigSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = nanoid();
  await db.insert(modelConfigs).values({
    id,
    ...parsed.data,
    createdAt: new Date(),
  });

  return c.json({ config: { id, ...parsed.data } }, 201);
});

// Delete model config
app.delete('/configs/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.delete(modelConfigs).where(eq(modelConfigs.id, id));
  return c.json({ ok: true });
});

export default app;
