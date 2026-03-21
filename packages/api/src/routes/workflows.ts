import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, lt, isNull } from 'drizzle-orm';
import {
  createWorkflowSchema, updateWorkflowSchema,
  createWorkflowNodeSchema, createWorkflowEdgeSchema, runWorkflowSchema,
} from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import {
  workflowDefinitions, workflowNodes, workflowEdges,
  workflowVersions, workflowRuns, workflowTraces,
} from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { executeWorkflow } from '../lib/workflow-executor.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List workflows in workspace
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

  const conditions = [eq(workflowDefinitions.workspaceId, workspaceId), isNull(workflowDefinitions.deletedAt)];
  if (cursor) conditions.push(lt(workflowDefinitions.updatedAt, new Date(cursor)));

  const result = await db.select().from(workflowDefinitions)
    .where(and(...conditions))
    .orderBy(desc(workflowDefinitions.updatedAt))
    .limit(limit);

  return c.json({
    workflows: result,
    nextCursor: result.length === limit ? result[result.length - 1].updatedAt?.toISOString() : null,
  });
});

// Get workflow with nodes and edges
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [workflow] = await db.select().from(workflowDefinitions)
    .where(and(eq(workflowDefinitions.id, id), isNull(workflowDefinitions.deletedAt)));
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  const nodes = await db.select().from(workflowNodes)
    .where(eq(workflowNodes.workflowId, id));

  const edges = await db.select().from(workflowEdges)
    .where(eq(workflowEdges.workflowId, id));

  return c.json({ workflow, nodes, edges });
});

// Create workflow
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createWorkflowSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(workflowDefinitions).values({
    id,
    workspaceId,
    ...parsed.data,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Create default start and end nodes
  const startId = nanoid();
  const endId = nanoid();
  await db.insert(workflowNodes).values([
    { id: startId, workflowId: id, nodeType: 'start', label: 'Start', positionX: 250, positionY: 50, createdAt: now, updatedAt: now },
    { id: endId, workflowId: id, nodeType: 'end', label: 'End', positionX: 250, positionY: 400, createdAt: now, updatedAt: now },
  ]);

  return c.json({ workflow: { id, workspaceId, ...parsed.data }, nodes: [{ id: startId }, { id: endId }] }, 201);
});

// Update workflow
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateWorkflowSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await db.update(workflowDefinitions).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(workflowDefinitions.id, id));
  return c.json({ ok: true });
});

// Delete workflow (soft)
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(workflowDefinitions).set({ deletedAt: new Date() }).where(eq(workflowDefinitions.id, id));
  return c.json({ ok: true });
});

// ── Nodes ──

app.post('/:id/nodes', async (c) => {
  const db = createDb(c.env);
  const workflowId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createWorkflowNodeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = nanoid();
  const now = new Date();
  await db.insert(workflowNodes).values({
    id,
    workflowId,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ node: { id, workflowId, ...parsed.data } }, 201);
});

app.patch('/nodes/:nodeId', async (c) => {
  const db = createDb(c.env);
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.label) updates.label = body.label;
  if (body.positionX !== undefined) updates.positionX = body.positionX;
  if (body.positionY !== undefined) updates.positionY = body.positionY;
  if (body.config !== undefined) updates.config = body.config;

  await db.update(workflowNodes).set(updates).where(eq(workflowNodes.id, nodeId));
  return c.json({ ok: true });
});

app.delete('/nodes/:nodeId', async (c) => {
  const db = createDb(c.env);
  const nodeId = c.req.param('nodeId');
  await db.delete(workflowNodes).where(eq(workflowNodes.id, nodeId));
  return c.json({ ok: true });
});

// ── Edges ──

app.post('/:id/edges', async (c) => {
  const db = createDb(c.env);
  const workflowId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createWorkflowEdgeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = nanoid();
  await db.insert(workflowEdges).values({ id, workflowId, ...parsed.data });
  return c.json({ edge: { id, workflowId, ...parsed.data } }, 201);
});

app.delete('/edges/:edgeId', async (c) => {
  const db = createDb(c.env);
  const edgeId = c.req.param('edgeId');
  await db.delete(workflowEdges).where(eq(workflowEdges.id, edgeId));
  return c.json({ ok: true });
});

// ── Versions & Publishing ──

app.post('/:id/publish', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const [workflow] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, id));
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, id));
  const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, id));

  const existing = await db.select().from(workflowVersions)
    .where(eq(workflowVersions.workflowId, id))
    .orderBy(desc(workflowVersions.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
  const now = new Date();

  await db.insert(workflowVersions).values({
    id: nanoid(),
    workflowId: id,
    version: nextVersion,
    snapshot: { workflow, nodes, edges },
    changelog: body.changelog ?? null,
    publishedBy: userId,
    createdAt: now,
  });

  await db.update(workflowDefinitions).set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(workflowDefinitions.id, id));

  return c.json({ version: nextVersion });
});

app.get('/:id/versions', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const versions = await db.select().from(workflowVersions)
    .where(eq(workflowVersions.workflowId, id))
    .orderBy(desc(workflowVersions.version));

  return c.json({ versions });
});

// ── Run Workflow ──

app.post('/:id/run', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = runWorkflowSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const runId = nanoid();
  const now = new Date();

  await db.insert(workflowRuns).values({
    id: runId,
    workflowId: id,
    versionId: parsed.data?.versionId ?? null,
    status: 'pending',
    triggerType: 'manual',
    input: parsed.data?.input ?? null,
    createdAt: now,
  });

  // Get workspace ID for LLM resolution
  const [wf] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, id));
  const workspaceId = wf?.workspaceId ?? 'default';

  // Execute workflow (walks DAG, executes nodes, writes traces)
  const result = await executeWorkflow(db, runId, id, workspaceId, (parsed.data?.input ?? {}) as Record<string, unknown>);

  return c.json({ run: { id: runId, workflowId: id, status: 'completed', output: result.output, traces: result.traces } }, 201);
});

// Per-node test execution (Dify pattern: test individual nodes)
app.post('/:id/nodes/:nodeId/test', async (c) => {
  const db = createDb(c.env);
  const workflowId = c.req.param('id');
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json().catch(() => ({}));

  // Get the node
  const [node] = await db.select().from(workflowNodes).where(eq(workflowNodes.id, nodeId));
  if (!node) return c.json({ error: 'Node not found' }, 404);

  const [wf] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, workflowId));
  const workspaceId = wf?.workspaceId ?? 'default';

  // Create a minimal execution context and run just this node
  const { nanoid: genId } = await import('nanoid');
  const testRunId = genId();

  // Import the executor's node execution logic
  const { executeWorkflow } = await import('../lib/workflow-executor.js');

  // Create a temporary single-node workflow: start → target node → end
  // by running the full executor with just input mapped to this node
  try {
    const startTime = Date.now();

    // For simple node testing, we use the chatCompletion / fetch directly based on node type
    const config = (node.config ?? {}) as Record<string, unknown>;
    const input = body.input ?? body;
    let output: unknown = null;
    let error: string | null = null;

    const { chatCompletion } = await import('../lib/llm.js');

    switch (node.nodeType) {
      case 'llm': {
        const prompt = (config.prompt as string) ?? 'Respond to the input.';
        const resp = await chatCompletion(db, workspaceId, [
          { role: 'system', content: prompt },
          { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) },
        ], { temperature: (config.temperature as number) ?? 0.7 });
        output = { content: resp.content, usage: resp.usage, model: resp.model };
        break;
      }
      case 'code': {
        const code = (config.code as string) ?? 'return input';
        try {
          const fn = new Function('input', `'use strict'; ${code}`);
          output = fn(input);
        } catch (e) { error = e instanceof Error ? e.message : 'Code error'; }
        break;
      }
      case 'http_request': {
        const url = config.url as string;
        if (!url) { error = 'No URL configured'; break; }
        const method = (config.method as string) ?? 'GET';
        const res = await fetch(url, { method, headers: config.headers as Record<string, string> ?? {} });
        output = { status: res.status, body: await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; } }) };
        break;
      }
      case 'condition': {
        const expr = (config.expression as string) ?? 'true';
        try {
          const fn = new Function('input', `'use strict'; return !!(${expr})`);
          output = { result: fn(input), branch: fn(input) ? 'true' : 'false' };
        } catch { output = { result: false, branch: 'false' }; }
        break;
      }
      case 'text_processor': {
        const op = (config.operation as string) ?? 'template';
        const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
        if (op === 'uppercase') output = inputStr.toUpperCase();
        else if (op === 'lowercase') output = inputStr.toLowerCase();
        else if (op === 'trim') output = inputStr.trim();
        else if (op === 'template') {
          let tmpl = (config.template as string) ?? '{{input}}';
          tmpl = tmpl.replace(/\{\{input\}\}/g, inputStr);
          output = tmpl;
        } else output = inputStr;
        break;
      }
      case 'json_transform': {
        const expr = (config.expression as string) ?? '.';
        try {
          const keys = expr.replace(/^\./, '').split('.').filter(Boolean);
          let current: unknown = input;
          for (const key of keys) {
            if (typeof current === 'object' && current !== null) current = (current as Record<string, unknown>)[key];
          }
          output = current;
        } catch { output = null; }
        break;
      }
      default:
        output = { message: `Node type '${node.nodeType}' tested with input`, input };
    }

    return c.json({
      nodeId, nodeType: node.nodeType, label: node.label,
      input, output, error,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    return c.json({
      nodeId, nodeType: node.nodeType, error: err instanceof Error ? err.message : 'Test failed',
    }, 500);
  }
});

// List workflow runs
app.get('/:id/runs', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const result = await db.select().from(workflowRuns)
    .where(eq(workflowRuns.workflowId, id))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(50);

  return c.json({ runs: result });
});

// Get run with traces
app.get('/runs/:runId', async (c) => {
  const db = createDb(c.env);
  const runId = c.req.param('runId');

  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  if (!run) return c.json({ error: 'Run not found' }, 404);

  const traces = await db.select().from(workflowTraces)
    .where(eq(workflowTraces.runId, runId))
    .orderBy(workflowTraces.createdAt);

  return c.json({ run, traces });
});

export default app;
