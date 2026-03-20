import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, asc, gt } from 'drizzle-orm';
import { createTaskSchema, createEdgeSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { tasks, edges, taskLogs } from '../db/schema.js';
import { detectCycle } from '../lib/dag.js';
import { clerkAuth, verifyGraphOwner, verifyTaskOwner, verifyEdgeOwner } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// List tasks for a graph
app.get('/graphs/:graphId/tasks', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

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
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

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
  const userId = c.get('userId');

  const check = await verifyTaskOwner(db, taskId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const body = await c.req.json();
  const [updated] = await db.update(tasks)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  if (!updated) return c.json({ error: 'Task not found' }, 404);
  return c.json({ task: updated });
});

// Approve task (change from pending to ready)
app.post('/tasks/:taskId/approve', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');
  const userId = c.get('userId');

  const check = await verifyTaskOwner(db, taskId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const [updated] = await db.update(tasks)
    .set({ status: 'ready', updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  if (!updated) return c.json({ error: 'Task not found' }, 404);
  return c.json({ task: updated });
});

// Retry failed task (reset to pending, increment attempt)
app.post('/tasks/:taskId/retry', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');
  const userId = c.get('userId');

  const check = await verifyTaskOwner(db, taskId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (task.status !== 'failed' && task.status !== 'canceled') {
    return c.json({ error: 'Can only retry failed or canceled tasks' }, 400);
  }

  const [updated] = await db.update(tasks)
    .set({
      status: 'pending',
      leaseId: null,
      leaseExpiresAt: null,
      assignedWorkerId: null,
      outputSummary: null,
      attempt: task.attempt + 1,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();

  return c.json({ task: updated });
});

// Cancel task — also notify worker via orchestrator if task is running
app.post('/tasks/:taskId/cancel', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');
  const userId = c.get('userId');

  const check = await verifyTaskOwner(db, taskId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const [updated] = await db.update(tasks)
    .set({ status: 'canceled', leaseId: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  // If task was running/leased and assigned to a worker, notify them via orchestrator
  if ((task.status === 'running' || task.status === 'leased') && task.assignedWorkerId && task.leaseId) {
    try {
      const orchestratorId = c.env.ORCHESTRATOR.idFromName(task.graphId);
      const orchestrator = c.env.ORCHESTRATOR.get(orchestratorId);
      await orchestrator.fetch(new Request('http://internal/cancel-task', {
        method: 'POST',
        body: JSON.stringify({ taskId, leaseId: task.leaseId, workerId: task.assignedWorkerId }),
      }));
    } catch {
      // Best-effort cancellation notification
    }
  }

  return c.json({ task: updated });
});

// ── Edges ──

// List edges for a graph
app.get('/graphs/:graphId/edges', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

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
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

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
  const userId = c.get('userId');

  const check = await verifyEdgeOwner(db, edgeId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  await db.delete(edges).where(eq(edges.id, edgeId));
  return c.json({ ok: true });
});

// ── Task Logs ──

// Get persisted logs for a task (with optional cursor)
app.get('/tasks/:taskId/logs', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');
  const userId = c.get('userId');

  const check = await verifyTaskOwner(db, taskId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const afterSeq = parseInt(c.req.query('after') ?? '0', 10);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '500', 10), 1000);

  const logs = await db.select()
    .from(taskLogs)
    .where(and(eq(taskLogs.taskId, taskId), gt(taskLogs.seq, afterSeq)))
    .orderBy(asc(taskLogs.seq))
    .limit(limit);

  return c.json({
    logs,
    hasMore: logs.length === limit,
    nextCursor: logs.length > 0 ? logs[logs.length - 1].seq : afterSeq,
  });
});

// Internal: persist a log chunk (called from WsRoom, no auth)
app.post('/tasks/:taskId/logs/internal', async (c) => {
  const db = createDb(c.env);
  const taskId = c.req.param('taskId');
  const body = await c.req.json() as { stream: string; chunk: string; seq: number };

  await db.insert(taskLogs).values({
    id: `log-${nanoid(12)}`,
    taskId,
    stream: body.stream,
    chunk: body.chunk,
    seq: body.seq,
  });

  return c.json({ ok: true });
});

export default app;
