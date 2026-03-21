import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, lt, isNull } from 'drizzle-orm';
import { createAgentSchema, updateAgentSchema, agentConfigSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { agents, agentVersions, agentConfigs, conversations, messages, agentConnectors } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { chatCompletion } from '../lib/llm.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List agents in workspace
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const status = c.req.query('status');

  const conditions = [eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)];
  if (status) conditions.push(eq(agents.status, status));
  if (cursor) conditions.push(lt(agents.updatedAt, new Date(cursor)));

  const result = await db.select().from(agents)
    .where(and(...conditions))
    .orderBy(desc(agents.updatedAt))
    .limit(limit);

  return c.json({
    agents: result,
    nextCursor: result.length === limit ? result[result.length - 1].updatedAt?.toISOString() : null,
  });
});

// Get agent with config
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [agent] = await db.select().from(agents)
    .where(and(eq(agents.id, id), isNull(agents.deletedAt)));
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const [config] = await db.select().from(agentConfigs)
    .where(eq(agentConfigs.agentId, id));

  return c.json({ agent, config: config ?? null });
});

// Create agent
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(agents).values({
    id,
    workspaceId,
    ...parsed.data,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Create default config
  await db.insert(agentConfigs).values({
    id: nanoid(),
    agentId: id,
    memoryEnabled: true,
    memoryWindowSize: 20,
    updatedAt: now,
  });

  return c.json({ agent: { id, workspaceId, ...parsed.data, createdBy: userId } }, 201);
});

// Update agent metadata
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateAgentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await db.update(agents).set({ ...parsed.data, updatedAt: new Date() }).where(eq(agents.id, id));
  return c.json({ ok: true });
});

// Update agent config
app.put('/:id/config', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = agentConfigSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await db.update(agentConfigs).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentConfigs.agentId, id));
  return c.json({ ok: true });
});

// Publish agent (create version)
app.post('/:id/publish', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, id));

  // Get next version number
  const existing = await db.select().from(agentVersions)
    .where(eq(agentVersions.agentId, id))
    .orderBy(desc(agentVersions.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
  const now = new Date();

  await db.insert(agentVersions).values({
    id: nanoid(),
    agentId: id,
    version: nextVersion,
    changelog: body.changelog ?? null,
    snapshot: { agent, config },
    publishedBy: userId,
    createdAt: now,
  });

  await db.update(agents).set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(agents.id, id));

  return c.json({ version: nextVersion });
});

// List agent versions
app.get('/:id/versions', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const versions = await db.select().from(agentVersions)
    .where(eq(agentVersions.agentId, id))
    .orderBy(desc(agentVersions.version));

  return c.json({ versions });
});

// Duplicate agent
app.post('/:id/duplicate', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, id));

  const newId = nanoid();
  const now = new Date();

  await db.insert(agents).values({
    ...agent,
    id: newId,
    name: `${agent.name} (copy)`,
    status: 'draft',
    createdBy: userId,
    publishedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  if (config) {
    await db.insert(agentConfigs).values({
      ...config,
      id: nanoid(),
      agentId: newId,
      updatedAt: now,
    });
  }

  return c.json({ agent: { id: newId } }, 201);
});

// Delete agent (soft)
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  await db.update(agents).set({ deletedAt: new Date() }).where(eq(agents.id, id));
  return c.json({ ok: true });
});

// ── Agent-as-Tool: Invoke an agent programmatically ──

app.post('/:id/invoke', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const message = body.message ?? body.input;
  if (!message) return c.json({ error: 'message required' }, 400);

  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, id));

  const systemPrompt = config?.systemPrompt ?? 'You are a helpful AI assistant.';
  const temperature = config?.temperature ?? 0.7;
  const maxTokens = config?.maxTokens ?? undefined;
  const modelConfigId = config?.modelConfigId ?? null;

  // Build context from prior messages if conversationId provided
  const chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (body.context && Array.isArray(body.context)) {
    for (const msg of body.context) {
      chatMessages.push({ role: msg.role, content: msg.content });
    }
  }

  chatMessages.push({ role: 'user', content: message });

  try {
    const result = await chatCompletion(db, agent.workspaceId, chatMessages, {
      modelConfigId, temperature, maxTokens,
    });

    return c.json({
      agentId: id,
      agentName: agent.name,
      response: result.content,
      usage: result.usage,
      model: result.model,
    });
  } catch (err) {
    return c.json({
      agentId: id,
      error: err instanceof Error ? err.message : 'Agent invocation failed',
    }, 500);
  }
});

// ── Agent Connectors (multi-channel publishing) ──

app.get('/:id/connectors', async (c) => {
  const db = createDb(c.env);
  const agentId = c.req.param('id');
  const connectors = await db.select().from(agentConnectors)
    .where(eq(agentConnectors.agentId, agentId));
  return c.json({ connectors });
});

app.post('/:id/connectors', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const agentId = c.req.param('id');
  const body = await c.req.json();

  const id = nanoid();
  const connectorType = body.connectorType ?? 'web';
  const name = body.name ?? `${connectorType} connector`;

  // Generate URL based on connector type
  let url = '';
  switch (connectorType) {
    case 'web': url = `https://hive.pajamadot.com/chat/${agentId}`; break;
    case 'api': url = `https://hive-api.pajamadot.com/v1/agents/${agentId}/invoke`; break;
    case 'embed': url = `https://hive.pajamadot.com/embed/${agentId}`; break;
    default: url = `https://hive-api.pajamadot.com/v1/agents/${agentId}/invoke`;
  }

  const now = new Date();
  await db.insert(agentConnectors).values({
    id, agentId, connectorType, name, url,
    config: body.config ?? null,
    status: 'active', createdBy: userId, createdAt: now, updatedAt: now,
  });

  return c.json({ connector: { id, connectorType, name, url, status: 'active' } }, 201);
});

app.delete('/connectors/:connectorId', async (c) => {
  const db = createDb(c.env);
  const connectorId = c.req.param('connectorId');
  await db.delete(agentConnectors).where(eq(agentConnectors.id, connectorId));
  return c.json({ ok: true });
});

export default app;
