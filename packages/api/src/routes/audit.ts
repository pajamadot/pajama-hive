import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// Query audit logs
app.get('/', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.query('graphId');
  const taskId = c.req.query('taskId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);

  let query = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);

  if (graphId) {
    query = db.select().from(auditLogs).where(eq(auditLogs.graphId, graphId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
  } else if (taskId) {
    query = db.select().from(auditLogs).where(eq(auditLogs.taskId, taskId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  const result = await query;
  return c.json({ auditLogs: result });
});

export default app;
