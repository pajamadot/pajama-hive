import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { workers } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// List workers
app.get('/', async (c) => {
  const db = createDb(c.env);
  const result = await db.select().from(workers);
  return c.json({ workers: result });
});

// Get worker by ID
app.get('/:workerId', async (c) => {
  const db = createDb(c.env);
  const workerId = c.req.param('workerId');
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId));
  if (!worker) return c.json({ error: 'Worker not found' }, 404);
  return c.json({ worker });
});

export default app;
