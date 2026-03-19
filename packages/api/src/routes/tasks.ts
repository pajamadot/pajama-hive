import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { createTaskSchema, createEdgeSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { tasks, edges } from '../db/schema.js';
import { detectCycle } from '../lib/dag.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// List tasks for a graph
app.get('/graphs/:graphId/tasks', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const result = await db.select().from(tasks).where(eq(tasks.graphId, graphId));
  return c.json({ tasks: result });
});

// Create task in a graph
app.post('/graphs/:graphId/tasks', async (c) => {
  const body = await c.req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const id = nanoid(12);

  const [task] = await db.insert(tasks).values({
    id,
    graphId,
    title: parsed.data.title,
    type: parsed.data.type,
    input: parsed.data.input,
    priority: parsed.data.priority,
    agentKind: parsed.data.agentKind,
    requiredCapabilities: parsed.data.requiredCapabilities,
    timeoutMs: parsed.data.timeoutMs,
    maxRetries: parsed.data.maxRetries,
    positionX: parsed.data.positionX,
    positionY: parsed.data.positionY,
  }).returning();

  return c.json({ task }, 201);
});

// Update task
app.patch('/tasks/:taskId', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');
  const body = await c.req.json();

  const [updated] = await db.update(tasks)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  if (!updated) return c.json({ error: 'Task not found' }, 404);
  return c.json({ task: updated });
});

// Approve task (change from pending_approval to pending)
app.post('/tasks/:taskId/approve', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');

  const [updated] = await db.update(tasks)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  if (!updated) return c.json({ error: 'Task not found' }, 404);
  return c.json({ task: updated });
});

// Cancel task
app.post('/tasks/:taskId/cancel', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');

  const [updated] = await db.update(tasks)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  if (!updated) return c.json({ error: 'Task not found' }, 404);
  return c.json({ task: updated });
});

// ── Edges ──

// List edges for a graph
app.get('/graphs/:graphId/edges', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const result = await db.select().from(edges).where(eq(edges.graphId, graphId));
  return c.json({ edges: result });
});

// Create edge with cycle detection
app.post('/graphs/:graphId/edges', async (c) => {
  const body = await c.req.json();
  const parsed = createEdgeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const db = createDb(c.env);
  const graphId = c.req.param('graphId');

  // Get existing tasks and edges for this graph
  const existingTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.graphId, graphId));
  const existingEdges = await db.select().from(edges).where(eq(edges.graphId, graphId));

  const nodeIds = existingTasks.map((t) => t.id);
  const edgeList = [
    ...existingEdges.map((e) => ({ from: e.fromTaskId, to: e.toTaskId })),
    { from: parsed.data.fromTaskId, to: parsed.data.toTaskId },
  ];

  // Cycle detection
  const cycleNodes = detectCycle(nodeIds, edgeList);
  if (cycleNodes) {
    return c.json({
      error: 'Adding this edge would create a cycle',
      cycleNodes,
    }, 400);
  }

  const id = nanoid(12);
  const [edge] = await db.insert(edges).values({
    id,
    graphId,
    fromTaskId: parsed.data.fromTaskId,
    toTaskId: parsed.data.toTaskId,
  }).returning();

  return c.json({ edge }, 201);
});

// Delete edge
app.delete('/edges/:edgeId', async (c) => {
  const db = createDb(c.env);
  const edgeId = c.req.param('edgeId');
  await db.delete(edges).where(eq(edges.id, edgeId));
  return c.json({ ok: true });
});

export default app;
