import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, lt, isNull } from 'drizzle-orm';
import { createPluginSchema, createPluginToolSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { plugins, pluginTools, pluginVersions } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { executePluginTool, debugPluginTool } from '../lib/plugin-executor.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List plugins
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

  const conditions = [eq(plugins.workspaceId, workspaceId), isNull(plugins.deletedAt)];
  if (cursor) conditions.push(lt(plugins.updatedAt, new Date(cursor)));

  const result = await db.select().from(plugins)
    .where(and(...conditions))
    .orderBy(desc(plugins.updatedAt))
    .limit(limit);

  return c.json({
    plugins: result,
    nextCursor: result.length === limit ? result[result.length - 1].updatedAt?.toISOString() : null,
  });
});

// Get plugin with tools
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [plugin] = await db.select().from(plugins)
    .where(and(eq(plugins.id, id), isNull(plugins.deletedAt)));
  if (!plugin) return c.json({ error: 'Plugin not found' }, 404);

  const tools = await db.select().from(pluginTools)
    .where(eq(pluginTools.pluginId, id));

  return c.json({ plugin, tools });
});

// Create plugin
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createPluginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(plugins).values({
    id,
    workspaceId,
    ...parsed.data,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ plugin: { id, workspaceId, ...parsed.data } }, 201);
});

// Update plugin
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
  if (body.authType) updates.authType = body.authType;
  if (body.authConfig) updates.authConfig = body.authConfig;

  await db.update(plugins).set(updates).where(eq(plugins.id, id));
  return c.json({ ok: true });
});

// Delete plugin
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(plugins).set({ deletedAt: new Date() }).where(eq(plugins.id, id));
  return c.json({ ok: true });
});

// ── Tools ──

app.post('/:id/tools', async (c) => {
  const db = createDb(c.env);
  const pluginId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createPluginToolSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(pluginTools).values({
    id,
    pluginId,
    ...parsed.data,
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ tool: { id, pluginId, ...parsed.data } }, 201);
});

app.patch('/tools/:toolId', async (c) => {
  const db = createDb(c.env);
  const toolId = c.req.param('toolId');
  const body = await c.req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.method) updates.method = body.method;
  if (body.path) updates.path = body.path;
  if (body.inputSchema) updates.inputSchema = body.inputSchema;
  if (body.outputSchema) updates.outputSchema = body.outputSchema;
  if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;

  await db.update(pluginTools).set(updates).where(eq(pluginTools.id, toolId));
  return c.json({ ok: true });
});

app.delete('/tools/:toolId', async (c) => {
  const db = createDb(c.env);
  const toolId = c.req.param('toolId');
  await db.delete(pluginTools).where(eq(pluginTools.id, toolId));
  return c.json({ ok: true });
});

// ── Publish ──

app.post('/:id/publish', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [plugin] = await db.select().from(plugins).where(eq(plugins.id, id));
  if (!plugin) return c.json({ error: 'Plugin not found' }, 404);

  const tools = await db.select().from(pluginTools).where(eq(pluginTools.pluginId, id));

  const existing = await db.select().from(pluginVersions)
    .where(eq(pluginVersions.pluginId, id))
    .orderBy(desc(pluginVersions.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
  const now = new Date();

  await db.insert(pluginVersions).values({
    id: nanoid(),
    pluginId: id,
    version: nextVersion,
    snapshot: { plugin, tools },
    publishedBy: userId,
    createdAt: now,
  });

  await db.update(plugins).set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(plugins.id, id));

  return c.json({ version: nextVersion });
});

// ── Import OpenAPI Spec ──

app.post('/:id/import-openapi', async (c) => {
  const db = createDb(c.env);
  const pluginId = c.req.param('id');
  const body = await c.req.json();
  const spec = body.spec ?? body;

  if (!spec || !spec.paths) return c.json({ error: 'Invalid OpenAPI spec — missing paths' }, 400);

  const [plugin] = await db.select().from(plugins).where(eq(plugins.id, pluginId));
  if (!plugin) return c.json({ error: 'Plugin not found' }, 404);

  // Extract base URL from servers
  const baseUrl = spec.servers?.[0]?.url ?? plugin.baseUrl;
  if (baseUrl && baseUrl !== plugin.baseUrl) {
    await db.update(plugins).set({ baseUrl, updatedAt: new Date() }).where(eq(plugins.id, pluginId));
  }

  // Store the spec
  await db.update(plugins).set({ openapiSpec: spec, updatedAt: new Date() }).where(eq(plugins.id, pluginId));

  // Create tools from paths
  const created: string[] = [];
  for (const [path, methods] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
      const op = operation as Record<string, unknown>;
      const name = (op.operationId as string) ?? `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const description = (op.summary as string) ?? (op.description as string) ?? '';

      // Extract input schema from parameters + requestBody
      const inputSchema: Record<string, unknown> = { type: 'object', properties: {} };
      const params = (op.parameters ?? []) as { name: string; in: string; schema?: Record<string, unknown>; required?: boolean }[];
      const properties = inputSchema.properties as Record<string, unknown>;
      for (const param of params) {
        properties[param.name] = param.schema ?? { type: 'string' };
      }
      const reqBody = op.requestBody as Record<string, unknown> | undefined;
      if (reqBody?.content) {
        const jsonContent = (reqBody.content as Record<string, unknown>)['application/json'] as Record<string, unknown> | undefined;
        if (jsonContent?.schema) {
          inputSchema.properties = { ...(inputSchema.properties as Record<string, unknown>), body: jsonContent.schema };
        }
      }

      // Extract output schema
      const responses = op.responses as Record<string, Record<string, unknown>> | undefined;
      const okResponse = responses?.['200'] ?? responses?.['201'];
      let outputSchema: Record<string, unknown> | undefined;
      if (okResponse?.content) {
        const jsonResp = (okResponse.content as Record<string, unknown>)['application/json'] as Record<string, unknown> | undefined;
        outputSchema = jsonResp?.schema as Record<string, unknown> | undefined;
      }

      const toolId = nanoid();
      const now = new Date();
      await db.insert(pluginTools).values({
        id: toolId,
        pluginId,
        name,
        description,
        method: method.toUpperCase(),
        path,
        inputSchema: Object.keys(properties).length > 0 ? inputSchema : undefined,
        outputSchema,
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      created.push(name);
    }
  }

  return c.json({ imported: created.length, tools: created });
});

// ── Execute / Debug Tool ──

app.post('/tools/:toolId/execute', async (c) => {
  const db = createDb(c.env);
  const toolId = c.req.param('toolId');
  const body = await c.req.json().catch(() => ({}));

  const result = await executePluginTool(db, toolId, body.input ?? body);
  return c.json(result);
});

app.post('/tools/:toolId/debug', async (c) => {
  const db = createDb(c.env);
  const toolId = c.req.param('toolId');
  const body = await c.req.json().catch(() => ({}));

  const result = await debugPluginTool(db, toolId, body.input ?? body);
  return c.json(result);
});

export default app;
