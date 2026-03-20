import { Hono } from 'hono';
import { eq, desc, and, lt, sql } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// Query audit logs with cursor pagination
app.get('/', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.query('graphId');
  const taskId = c.req.query('taskId');
  const action = c.req.query('action');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);

  const conditions = [];
  if (graphId) conditions.push(eq(auditLogs.graphId, graphId));
  if (taskId) conditions.push(eq(auditLogs.taskId, taskId));
  if (action) conditions.push(eq(auditLogs.action, action));
  if (cursor) conditions.push(lt(auditLogs.createdAt, new Date(cursor)));

  const result = conditions.length > 0
    ? await db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit)
    : await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);

  return c.json({
    auditLogs: result,
    nextCursor: result.length === limit ? result[result.length - 1].createdAt?.toISOString() : null,
  });
});

// List distinct actions for filter dropdown
app.get('/actions', async (c) => {
  const db = createDb(c.env);
  const result = await db.selectDistinct({ action: auditLogs.action }).from(auditLogs);
  return c.json({ actions: result.map((r) => r.action) });
});

export default app;
