import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { runs, tasks, graphs, runRetrospectives } from '../db/schema.js';
import { clerkAuth, verifyGraphOwner, verifyRunOwner } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// Create a run for a graph
app.post('/graphs/:graphId/runs', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

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
  const userId = c.get('userId');

  const check = await verifyRunOwner(db, runId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json({ run });
});

// List runs for a graph
app.get('/graphs/:graphId/runs', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const result = await db.select().from(runs).where(eq(runs.graphId, graphId)).orderBy(desc(runs.createdAt));
  return c.json({ runs: result });
});

// Get run with full task details
app.get('/runs/:runId/detail', async (c) => {
  const db = createDb(c.env);
  const runId = c.req.param('runId');
  const userId = c.get('userId');

  const check = await verifyRunOwner(db, runId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) return c.json({ error: 'Run not found' }, 404);

  const runTasks = await db.select().from(tasks).where(eq(tasks.graphId, run.graphId));
  const [retro] = await db.select().from(runRetrospectives).where(eq(runRetrospectives.runId, runId));

  return c.json({
    run,
    tasks: runTasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      agentKind: t.agentKind,
      assignedWorkerId: t.assignedWorkerId,
      attempt: t.attempt,
      outputSummary: t.outputSummary,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    retrospective: retro ?? null,
  });
});

export default app;
