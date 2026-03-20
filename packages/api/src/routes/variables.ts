import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc } from 'drizzle-orm';
import { createVariableSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { variables, variableValues, agentMemories } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List variables
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const scope = c.req.query('scope');
  const scopeId = c.req.query('scopeId');

  const conditions = [eq(variables.workspaceId, workspaceId)];
  if (scope) conditions.push(eq(variables.scope, scope));
  if (scopeId) conditions.push(eq(variables.scopeId, scopeId));

  const result = await db.select().from(variables).where(and(...conditions));
  return c.json({ variables: result });
});

// Create variable
app.post('/', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const parsed = createVariableSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(variables).values({
    id, workspaceId, ...parsed.data, createdAt: now, updatedAt: now,
  });

  return c.json({ variable: { id, workspaceId, ...parsed.data } }, 201);
});

// Update variable
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.defaultValue !== undefined) updates.defaultValue = body.defaultValue;

  await db.update(variables).set(updates).where(eq(variables.id, id));
  return c.json({ ok: true });
});

// Delete variable
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.delete(variableValues).where(eq(variableValues.variableId, id));
  await db.delete(variables).where(eq(variables.id, id));
  return c.json({ ok: true });
});

// Get/set variable value
app.get('/:id/value', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [val] = await db.select().from(variableValues)
    .where(and(eq(variableValues.variableId, id), eq(variableValues.userId, userId)));

  if (!val) {
    const [variable] = await db.select().from(variables).where(eq(variables.id, id));
    return c.json({ value: variable?.defaultValue ?? null });
  }

  return c.json({ value: val.value });
});

app.put('/:id/value', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const [existing] = await db.select().from(variableValues)
    .where(and(eq(variableValues.variableId, id), eq(variableValues.userId, userId)));

  if (existing) {
    await db.update(variableValues).set({ value: body.value, updatedAt: new Date() })
      .where(eq(variableValues.id, existing.id));
  } else {
    await db.insert(variableValues).values({
      id: nanoid(), variableId: id, userId, value: body.value, updatedAt: new Date(),
    });
  }

  return c.json({ ok: true });
});

// ── Agent Memory ──

app.get('/memory/:agentId', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');

  const result = await db.select().from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.userId, userId)));

  return c.json({ memories: result });
});

app.put('/memory/:agentId/:key', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const key = c.req.param('key');
  const body = await c.req.json();

  const [existing] = await db.select().from(agentMemories)
    .where(and(
      eq(agentMemories.agentId, agentId),
      eq(agentMemories.userId, userId),
      eq(agentMemories.key, key),
    ));

  const now = new Date();
  if (existing) {
    await db.update(agentMemories).set({ value: body.value, updatedAt: now })
      .where(eq(agentMemories.id, existing.id));
  } else {
    await db.insert(agentMemories).values({
      id: nanoid(), agentId, userId, key, value: body.value, createdAt: now, updatedAt: now,
    });
  }

  return c.json({ ok: true });
});

export default app;
