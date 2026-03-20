import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { createGraphSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { graphs } from '../db/schema.js';
import { clerkAuth, verifyGraphOwner } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

// All graph routes require auth
app.use('/*', clerkAuth);

// List graphs for current user
app.get('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const result = await db.select().from(graphs).where(eq(graphs.ownerId, userId));
  return c.json({ graphs: result });
});

// Create graph
app.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createGraphSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = nanoid(12);

  const [graph] = await db.insert(graphs).values({
    id,
    name: parsed.data.name,
    description: parsed.data.description,
    ownerId: userId,
  }).returning();

  return c.json({ graph }, 201);
});

// Get graph by ID
app.get('/:graphId', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const [graph] = await db.select().from(graphs).where(eq(graphs.id, graphId));
  if (!graph) return c.json({ error: 'Graph not found' }, 404);
  if (graph.ownerId !== userId) return c.json({ error: 'Forbidden' }, 403);
  return c.json({ graph });
});

// Update graph
app.patch('/:graphId', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const body = await c.req.json();
  const [updated] = await db.update(graphs)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(graphs.id, graphId))
    .returning();

  if (!updated) return c.json({ error: 'Graph not found' }, 404);
  return c.json({ graph: updated });
});

// Delete graph
app.delete('/:graphId', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  await db.delete(graphs).where(eq(graphs.id, graphId));
  return c.json({ ok: true });
});

export default app;
