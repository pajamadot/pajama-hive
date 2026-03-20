import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { workers, tasks, auditLogs } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// List workers (optionally filter by status)
app.get('/', async (c) => {
  const db = createDb(c.env);
  const status = c.req.query('status');
  const result = status
    ? await db.select().from(workers).where(eq(workers.status, status)).orderBy(desc(workers.createdAt))
    : await db.select().from(workers).orderBy(desc(workers.createdAt));
  return c.json({ workers: result });
});

// Get worker by ID
app.get('/:workerId', async (c) => {
  const db = createDb(c.env);
  const workerId = c.req.param('workerId');
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId));
  if (!worker) return c.json({ error: 'Worker not found' }, 404);

  // Include recent tasks assigned to this worker
  const recentTasks = await db.select({ id: tasks.id, title: tasks.title, status: tasks.status, graphId: tasks.graphId })
    .from(tasks)
    .where(eq(tasks.assignedWorkerId, workerId))
    .orderBy(desc(tasks.updatedAt))
    .limit(10);

  return c.json({ worker, recentTasks });
});

// Register/upsert worker via REST (for DB persistence)
app.post('/register', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json() as {
    workerId: string;
    agentKinds: string[];
    capabilities?: string[];
    maxConcurrency?: number;
    version?: string;
  };

  if (!body.workerId || !body.agentKinds?.length) {
    return c.json({ error: 'workerId and agentKinds are required' }, 400);
  }

  // Upsert: update if exists, insert if not
  const [existing] = await db.select().from(workers).where(eq(workers.id, body.workerId));
  if (existing) {
    await db.update(workers).set({
      agentKinds: body.agentKinds,
      capabilities: body.capabilities ?? [],
      maxConcurrency: body.maxConcurrency ?? 1,
      version: body.version,
      status: 'online',
      lastHeartbeatAt: new Date(),
    }).where(eq(workers.id, body.workerId));
  } else {
    await db.insert(workers).values({
      id: body.workerId,
      userId,
      agentKinds: body.agentKinds,
      capabilities: body.capabilities ?? [],
      maxConcurrency: body.maxConcurrency ?? 1,
      version: body.version,
      status: 'online',
      lastHeartbeatAt: new Date(),
    });
  }

  await db.insert(auditLogs).values({
    id: `audit-${nanoid(10)}`,
    workerId: body.workerId,
    userId,
    action: 'worker.registered',
    payload: { agentKinds: body.agentKinds, capabilities: body.capabilities },
  });

  return c.json({ ok: true, workerId: body.workerId });
});

// Mark worker offline
app.post('/:workerId/offline', async (c) => {
  const db = createDb(c.env);
  const workerId = c.req.param('workerId');

  await db.update(workers)
    .set({ status: 'offline' })
    .where(eq(workers.id, workerId));

  return c.json({ ok: true });
});

export default app;
