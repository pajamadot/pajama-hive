import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, ilike, and, desc, lt } from 'drizzle-orm';
import { createGraphSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { graphs, tasks, edges } from '../db/schema.js';
import { clerkAuth, verifyGraphOwner } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

// All graph routes require auth
app.use('/*', clerkAuth);

// List graphs for current user (with optional search and status filter)
app.get('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const search = c.req.query('search');
  const status = c.req.query('status');

  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '30', 10), 100);

  const conditions = [eq(graphs.ownerId, userId)];
  if (search) conditions.push(ilike(graphs.name, `%${search}%`));
  if (status) conditions.push(eq(graphs.status, status));
  if (cursor) conditions.push(lt(graphs.updatedAt, new Date(cursor)));

  const result = await db.select().from(graphs)
    .where(and(...conditions))
    .orderBy(desc(graphs.updatedAt))
    .limit(limit);

  return c.json({
    graphs: result,
    nextCursor: result.length === limit ? result[result.length - 1].updatedAt?.toISOString() : null,
  });
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

// Export graph as portable JSON
app.get('/:graphId/export', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const [graph] = await db.select().from(graphs).where(eq(graphs.id, graphId));
  if (!graph) return c.json({ error: 'Graph not found' }, 404);

  const graphTasks = await db.select().from(tasks).where(eq(tasks.graphId, graphId));
  const graphEdges = await db.select().from(edges).where(eq(edges.graphId, graphId));

  return c.json({
    version: '1.0',
    graph: { name: graph.name, description: graph.description },
    tasks: graphTasks.map((t) => ({
      refId: t.id,
      title: t.title,
      type: t.type,
      input: t.input,
      agentKind: t.agentKind,
      priority: t.priority,
      requiredCapabilities: t.requiredCapabilities,
      timeoutMs: t.timeoutMs,
      maxRetries: t.maxRetries,
      positionX: t.positionX,
      positionY: t.positionY,
    })),
    edges: graphEdges.map((e) => ({ from: e.fromTaskId, to: e.toTaskId })),
  });
});

// Import graph from portable JSON
app.post('/import', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json() as {
    graph: { name: string; description?: string };
    tasks: { refId: string; title: string; type: string; input?: string; agentKind?: string; priority?: number; requiredCapabilities?: string[]; timeoutMs?: number; maxRetries?: number; positionX?: number; positionY?: number }[];
    edges: { from: string; to: string }[];
  };

  if (!body.graph?.name || !body.tasks?.length) {
    return c.json({ error: 'Invalid import format' }, 400);
  }

  const graphId = nanoid(12);
  await db.insert(graphs).values({
    id: graphId,
    name: body.graph.name,
    description: body.graph.description,
    ownerId: userId,
  });

  const idMap = new Map<string, string>();
  for (const t of body.tasks) {
    const newId = nanoid(12);
    idMap.set(t.refId, newId);
    await db.insert(tasks).values({
      id: newId,
      graphId,
      title: t.title,
      type: t.type,
      input: t.input ?? '',
      agentKind: t.agentKind ?? 'cc',
      priority: t.priority ?? 100,
      requiredCapabilities: t.requiredCapabilities ?? [],
      timeoutMs: t.timeoutMs ?? 900000,
      maxRetries: t.maxRetries ?? 2,
      positionX: t.positionX ?? 0,
      positionY: t.positionY ?? 0,
      version: 1,
      attempt: 0,
    });
  }

  for (const e of body.edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (from && to) {
      await db.insert(edges).values({
        id: nanoid(12),
        graphId,
        fromTaskId: from,
        toTaskId: to,
      });
    }
  }

  return c.json({ graph: { id: graphId } }, 201);
});

// Duplicate a graph (deep clone tasks + edges)
app.post('/:graphId/duplicate', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  const [source] = await db.select().from(graphs).where(eq(graphs.id, graphId));
  if (!source) return c.json({ error: 'Graph not found' }, 404);

  const body = await c.req.json().catch(() => ({})) as { name?: string };
  const newGraphId = nanoid(12);

  await db.insert(graphs).values({
    id: newGraphId,
    name: body.name ?? `${source.name} (copy)`,
    description: source.description,
    ownerId: userId,
    status: 'draft',
  });

  const sourceTasks = await db.select().from(tasks).where(eq(tasks.graphId, graphId));
  const sourceEdges = await db.select().from(edges).where(eq(edges.graphId, graphId));

  const idMap = new Map<string, string>();
  for (const t of sourceTasks) {
    const newId = nanoid(12);
    idMap.set(t.id, newId);
    await db.insert(tasks).values({
      id: newId,
      graphId: newGraphId,
      title: t.title,
      type: t.type,
      status: 'pending',
      input: t.input,
      priority: t.priority,
      agentKind: t.agentKind,
      requiredCapabilities: t.requiredCapabilities,
      timeoutMs: t.timeoutMs,
      maxRetries: t.maxRetries,
      positionX: t.positionX,
      positionY: t.positionY,
      version: 1,
      attempt: 0,
    });
  }

  for (const e of sourceEdges) {
    const from = idMap.get(e.fromTaskId);
    const to = idMap.get(e.toTaskId);
    if (from && to) {
      await db.insert(edges).values({
        id: nanoid(12),
        graphId: newGraphId,
        fromTaskId: from,
        toTaskId: to,
      });
    }
  }

  return c.json({ graph: { id: newGraphId, name: body.name ?? `${source.name} (copy)` } }, 201);
});

// Save graph as template
app.post('/:graphId/save-template', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.param('graphId');
  const userId = c.get('userId');

  const check = await verifyGraphOwner(db, graphId, userId);
  if (!check.ok) return c.json({ error: check.error }, check.status);

  await db.update(graphs)
    .set({ isTemplate: 1, updatedAt: new Date() })
    .where(eq(graphs.id, graphId));

  return c.json({ ok: true });
});

// List templates
app.get('/templates/list', async (c) => {
  const db = createDb(c.env);
  const result = await db.select().from(graphs).where(eq(graphs.isTemplate, 1)).orderBy(desc(graphs.updatedAt));
  return c.json({ templates: result });
});

/**
 * Seed a test graph — a pre-built DAG that validates the hive system.
 * Creates parallel lint + typecheck tasks, then a test task, then a code review via cx (Codex).
 */
app.post('/seed-test', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const graphId = `test-${nanoid(8)}`;

  await db.insert(graphs).values({
    id: graphId,
    name: 'System Self-Test',
    description: 'Automated test graph: lint, typecheck, vitest, and Codex code review in parallel then sequentially.',
    ownerId: userId,
  });

  const taskDefs = [
    { id: `${graphId}-lint`, title: 'Lint Check', type: 'lint', agentKind: 'generic', input: 'cd /repo && pnpm lint 2>&1; echo "EXIT:$?"', priority: 100, x: 0, y: 0 },
    { id: `${graphId}-typecheck`, title: 'Type Check', type: 'test', agentKind: 'generic', input: 'cd /repo && pnpm typecheck 2>&1; echo "EXIT:$?"', priority: 100, x: 250, y: 0 },
    { id: `${graphId}-test`, title: 'Run Vitest', type: 'test', agentKind: 'generic', input: 'cd /repo/packages/api && npx vitest run 2>&1; echo "EXIT:$?"', priority: 200, x: 125, y: 150 },
    { id: `${graphId}-review`, title: 'Codex Code Review', type: 'review', agentKind: 'cx', input: 'Review the packages/api/src/lib/ directory for correctness, security issues, and potential bugs. Output a summary of findings.', priority: 50, x: 125, y: 300 },
  ];

  for (const t of taskDefs) {
    await db.insert(tasks).values({
      id: t.id,
      graphId,
      title: t.title,
      type: t.type,
      status: 'pending',
      input: t.input,
      agentKind: t.agentKind,
      priority: t.priority,
      positionX: t.x,
      positionY: t.y,
      timeoutMs: 600_000,
      maxRetries: 1,
      attempt: 0,
      version: 1,
    });
  }

  // Edges: lint + typecheck → test → review
  const edgeDefs = [
    { from: `${graphId}-lint`, to: `${graphId}-test` },
    { from: `${graphId}-typecheck`, to: `${graphId}-test` },
    { from: `${graphId}-test`, to: `${graphId}-review` },
  ];

  for (const e of edgeDefs) {
    await db.insert(edges).values({
      id: nanoid(12),
      graphId,
      fromTaskId: e.from,
      toTaskId: e.to,
    });
  }

  return c.json({
    graph: { id: graphId },
    tasks: taskDefs.length,
    edges: edgeDefs.length,
    message: 'Test graph created. Lint and typecheck run in parallel, then vitest, then Codex review.',
  }, 201);
});

export default app;
