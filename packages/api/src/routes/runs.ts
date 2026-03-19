import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { runs, tasks, graphs } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// Create a run for a graph
app.post('/graphs/:graphId/runs', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const id = nanoid(12);

  // Update graph status to running
  await db.update(graphs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(graphs.id, graphId));

  // Create the run
  const [run] = await db.insert(runs).values({
    id,
    graphId,
    status: 'running',
    startedAt: new Date(),
  }).returning();

  // Mark root tasks (no incoming edges) as ready
  // This is done by the orchestrator in production, but we bootstrap here
  const graphTasks = await db.select().from(tasks).where(eq(tasks.graphId, graphId));

  // Notify orchestrator DO to start scheduling
  const orchestratorId = c.env.ORCHESTRATOR.idFromName(graphId);
  const orchestrator = c.env.ORCHESTRATOR.get(orchestratorId);
  await orchestrator.fetch(new Request('http://internal/start-run', {
    method: 'POST',
    body: JSON.stringify({ runId: id, graphId }),
  }));

  return c.json({ run }, 201);
});

// Get run status
app.get('/runs/:runId', async (c) => {
  const db = createDb(c.env);
  const runId = c.req.param('runId');
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));

  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json({ run });
});

export default app;
