import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { tasks, edges, graphs } from '../db/schema.js';
import { validatePlanOutput } from '../lib/plan-validator.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

/**
 * Submit a plan output from an agent.
 * Validates the plan, injects new tasks/edges into the graph,
 * and marks them as pending approval.
 */
app.post('/graphs/:graphId/plans', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const body = await c.req.json();

  // Get existing graph state
  const existingTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.graphId, graphId));
  const existingEdges = await db.select().from(edges).where(eq(edges.graphId, graphId));

  const nodeIds = existingTasks.map((t) => t.id);
  const edgeList = existingEdges.map((e) => ({ from: e.fromTaskId, to: e.toTaskId }));

  // Validate the plan
  const result = validatePlanOutput(body, nodeIds, edgeList);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  const plan = result.plan;

  // Map plan task IDs to actual IDs (prefix to avoid collisions)
  const idMap = new Map<string, string>();
  for (const pt of plan.tasks) {
    idMap.set(pt.id, `plan-${nanoid(10)}`);
  }

  // Insert tasks (marked as 'pending' — they'll need approval)
  const newTasks = plan.tasks.map((pt, index) => ({
    id: idMap.get(pt.id)!,
    graphId,
    title: pt.title,
    type: pt.type,
    status: 'pending', // Will need approval before becoming schedulable
    input: pt.input,
    agentKind: 'cc' as const,
    requiredCapabilities: pt.requiredCapabilities ?? [],
    positionX: 300 + (index % 3) * 200,
    positionY: 300 + Math.floor(index / 3) * 150,
    priority: 100,
    timeoutMs: (pt.estimatedMinutes ?? 15) * 60 * 1000,
    maxRetries: 2,
    attempt: 0,
    version: 1,
  }));

  for (const task of newTasks) {
    await db.insert(tasks).values(task);
  }

  // Insert edges (resolving ID mappings)
  const newEdges = plan.edges.map(([from, to]) => ({
    id: nanoid(12),
    graphId,
    fromTaskId: idMap.get(from) ?? from, // may reference existing tasks
    toTaskId: idMap.get(to) ?? to,
  }));

  for (const edge of newEdges) {
    await db.insert(edges).values(edge);
  }

  // Notify MetaObserver about new plan
  try {
    const metaId = c.env.META_OBSERVER.idFromName('global');
    const metaDo = c.env.META_OBSERVER.get(metaId);
    await metaDo.fetch(new Request('http://internal/analyze-plan', {
      method: 'POST',
      body: JSON.stringify({ graphId }),
    }));
  } catch {
    // Non-critical
  }

  return c.json({
    plan: {
      tasksCreated: newTasks.length,
      edgesCreated: newEdges.length,
      taskIds: newTasks.map((t) => t.id),
      assumptions: plan.assumptions,
      risks: plan.risks,
      status: 'pending_approval',
    },
  }, 201);
});

/**
 * Approve all pending plan tasks in a graph (batch approval).
 */
app.post('/graphs/:graphId/plans/approve', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const body = await c.req.json().catch(() => ({})) as { taskIds?: string[] };

  // If specific task IDs provided, approve only those
  const graphTasks = await db.select().from(tasks).where(eq(tasks.graphId, graphId));
  const pendingPlanTasks = graphTasks.filter((t) =>
    t.status === 'pending' && t.id.startsWith('plan-') &&
    (!body.taskIds || body.taskIds.includes(t.id)),
  );

  for (const task of pendingPlanTasks) {
    await db.update(tasks)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(tasks.id, task.id));
  }

  return c.json({
    approved: pendingPlanTasks.length,
    taskIds: pendingPlanTasks.map((t) => t.id),
  });
});

/**
 * Reject plan tasks — cancel them and remove edges.
 */
app.post('/graphs/:graphId/plans/reject', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');

  const graphTasks = await db.select().from(tasks).where(eq(tasks.graphId, graphId));
  const planTasks = graphTasks.filter((t) => t.id.startsWith('plan-') && t.status === 'pending');

  for (const task of planTasks) {
    await db.update(tasks)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(tasks.id, task.id));
  }

  return c.json({ rejected: planTasks.length });
});

export default app;
