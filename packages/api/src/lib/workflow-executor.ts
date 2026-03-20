/**
 * Workflow Execution Engine
 * Walks the DAG, executes nodes sequentially following edges,
 * handles conditions/loops, writes traces.
 */

import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { workflowNodes, workflowEdges, workflowRuns, workflowTraces, documentChunks, userTableRows } from '../db/schema.js';
import { chatCompletion } from './llm.js';
import { executePluginTool } from './plugin-executor.js';

interface NodeExec {
  id: string;
  nodeType: string;
  label: string;
  config: Record<string, unknown> | null;
}

interface EdgeExec {
  fromNodeId: string;
  toNodeId: string;
  sourceHandle: string | null;
  condition: Record<string, unknown> | null;
}

interface ExecutionContext {
  db: Database;
  runId: string;
  workflowId: string;
  workspaceId: string;
  variables: Record<string, unknown>;
  input: Record<string, unknown>;
}

async function writeTrace(
  ctx: ExecutionContext,
  node: NodeExec,
  status: string,
  input: unknown,
  output: unknown,
  error: string | null,
  startedAt: Date,
) {
  const now = new Date();
  await ctx.db.insert(workflowTraces).values({
    id: nanoid(),
    runId: ctx.runId,
    nodeId: node.id,
    nodeType: node.nodeType,
    status,
    input: input as Record<string, unknown>,
    output: output as Record<string, unknown>,
    error,
    durationMs: now.getTime() - startedAt.getTime(),
    startedAt,
    completedAt: now,
    createdAt: now,
  });
}

async function executeNode(ctx: ExecutionContext, node: NodeExec): Promise<Record<string, unknown>> {
  const config = node.config ?? {};
  const startedAt = new Date();

  try {
    let result: Record<string, unknown> = {};

    switch (node.nodeType) {
      case 'start':
        result = { output: ctx.input };
        break;

      case 'end':
        result = { output: ctx.variables };
        break;

      case 'llm': {
        const prompt = (config.prompt as string) ?? 'Respond to the user input.';
        const inputText = JSON.stringify(ctx.variables._lastOutput ?? ctx.input);
        const response = await chatCompletion(ctx.db, ctx.workspaceId, [
          { role: 'system', content: prompt },
          { role: 'user', content: inputText },
        ], { temperature: (config.temperature as number) ?? 0.7 });
        result = { output: response.content, usage: response.usage };
        break;
      }

      case 'code': {
        const code = (config.code as string) ?? '';
        // Execute JS code in a safe-ish way (for CF Workers, use eval with care)
        // In production, this should use Workers for Platforms
        try {
          const fn = new Function('input', 'variables', `'use strict'; ${code}`);
          const output = fn(ctx.variables._lastOutput ?? ctx.input, ctx.variables);
          result = { output };
        } catch (e) {
          result = { output: null, error: e instanceof Error ? e.message : 'Code execution failed' };
        }
        break;
      }

      case 'http_request': {
        const url = config.url as string;
        const method = (config.method as string) ?? 'GET';
        const headers = (config.headers as Record<string, string>) ?? {};
        const body = config.body ? JSON.stringify(config.body) : undefined;

        if (!url) { result = { output: null, error: 'No URL configured' }; break; }

        const res = await fetch(url, { method, headers, body: method !== 'GET' ? body : undefined });
        const responseBody = await res.text();
        let parsed;
        try { parsed = JSON.parse(responseBody); } catch { parsed = responseBody; }
        result = { output: parsed, status: res.status };
        break;
      }

      case 'condition': {
        const expression = (config.expression as string) ?? 'true';
        // Simple expression evaluation
        try {
          const fn = new Function('input', 'variables', `'use strict'; return !!(${expression})`);
          const condResult = fn(ctx.variables._lastOutput ?? ctx.input, ctx.variables);
          result = { output: condResult, branch: condResult ? 'true' : 'false' };
        } catch {
          result = { output: false, branch: 'false' };
        }
        break;
      }

      case 'variable': {
        const varName = config.name as string;
        const varValue = config.value ?? ctx.variables._lastOutput;
        if (varName) ctx.variables[varName] = varValue;
        result = { output: varValue };
        break;
      }

      case 'text_processor': {
        const operation = (config.operation as string) ?? 'passthrough';
        const input = String(ctx.variables._lastOutput ?? '');
        switch (operation) {
          case 'uppercase': result = { output: input.toUpperCase() }; break;
          case 'lowercase': result = { output: input.toLowerCase() }; break;
          case 'trim': result = { output: input.trim() }; break;
          case 'template': {
            let tmpl = (config.template as string) ?? '{{input}}';
            tmpl = tmpl.replace(/\{\{input\}\}/g, input);
            for (const [k, v] of Object.entries(ctx.variables)) {
              tmpl = tmpl.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
            }
            result = { output: tmpl };
            break;
          }
          default: result = { output: input };
        }
        break;
      }

      case 'json_transform': {
        const jqExpr = (config.expression as string) ?? '.';
        // Basic property access
        try {
          const input = ctx.variables._lastOutput ?? ctx.input;
          const keys = jqExpr.replace(/^\./, '').split('.');
          let current: unknown = input;
          for (const key of keys) {
            if (key && typeof current === 'object' && current !== null) {
              current = (current as Record<string, unknown>)[key];
            }
          }
          result = { output: current };
        } catch {
          result = { output: null };
        }
        break;
      }

      case 'message':
        result = { output: config.message ?? ctx.variables._lastOutput };
        break;

      case 'knowledge_retrieval': {
        const kbId = config.knowledgeBaseId as string;
        const queryText = String(ctx.variables._lastOutput ?? config.query ?? '');
        const topK = (config.topK as number) ?? 5;
        if (!kbId) { result = { output: [], error: 'No knowledge base configured' }; break; }

        // Keyword search on chunks (vector search requires async embedding call)
        const chunks = await ctx.db.select().from(documentChunks)
          .where(eq(documentChunks.knowledgeBaseId, kbId));
        const terms = queryText.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
        const scored = chunks.map((c) => {
          const lower = c.content.toLowerCase();
          const score = terms.filter((t) => lower.includes(t)).length;
          return { content: c.content, score, chunkIndex: c.chunkIndex };
        }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
        result = { output: scored };
        break;
      }

      case 'plugin': {
        const toolId = config.toolId as string;
        if (!toolId) { result = { output: null, error: 'No tool ID configured' }; break; }
        const pluginInput = (config.input as Record<string, unknown>) ?? ctx.variables._lastOutput ?? {};
        const execResult = await executePluginTool(ctx.db, toolId, typeof pluginInput === 'object' ? pluginInput as Record<string, unknown> : {});
        result = { output: execResult.data, success: execResult.success, statusCode: execResult.statusCode };
        break;
      }

      case 'database': {
        const tableId = config.tableId as string;
        const operation = (config.operation as string) ?? 'read';
        if (!tableId) { result = { output: null, error: 'No table configured' }; break; }

        if (operation === 'read') {
          const rows = await ctx.db.select().from(userTableRows)
            .where(eq(userTableRows.tableId, tableId)).limit(100);
          result = { output: rows.map((r) => r.data) };
        } else {
          result = { output: null, message: `Database ${operation} not yet implemented in workflow` };
        }
        break;
      }

      case 'loop': {
        const items = Array.isArray(ctx.variables._lastOutput) ? ctx.variables._lastOutput : [];
        const maxIter = (config.maxIterations as number) ?? 100;
        const loopResults: unknown[] = [];
        for (let i = 0; i < Math.min(items.length, maxIter); i++) {
          ctx.variables._loopIndex = i;
          ctx.variables._loopItem = items[i];
          loopResults.push(items[i]);
        }
        result = { output: loopResults };
        break;
      }

      case 'batch': {
        const items = Array.isArray(ctx.variables._lastOutput) ? ctx.variables._lastOutput : [];
        const batchSize = (config.batchSize as number) ?? 10;
        const batches: unknown[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
          batches.push(items.slice(i, i + batchSize));
        }
        result = { output: batches };
        break;
      }

      case 'selector': {
        const expression = (config.expression as string) ?? '0';
        const items = Array.isArray(ctx.variables._lastOutput) ? ctx.variables._lastOutput : [];
        try {
          const fn = new Function('items', 'variables', `'use strict'; return items[${expression}]`);
          result = { output: fn(items, ctx.variables) };
        } catch {
          result = { output: items[0] ?? null };
        }
        break;
      }

      case 'variable_assigner': {
        const assignments = (config.assignments as Record<string, unknown>) ?? {};
        for (const [key, value] of Object.entries(assignments)) {
          ctx.variables[key] = value;
        }
        result = { output: assignments };
        break;
      }

      case 'intent_detector': {
        const inputText = String(ctx.variables._lastOutput ?? '');
        const intents = (config.intents as string[]) ?? [];
        // Use LLM to detect intent
        try {
          const resp = await chatCompletion(ctx.db, ctx.workspaceId, [
            { role: 'system', content: `Classify the following text into one of these intents: ${intents.join(', ')}. Respond with only the intent name.` },
            { role: 'user', content: inputText },
          ], { temperature: 0 });
          result = { output: resp.content.trim(), branch: resp.content.trim() };
        } catch {
          result = { output: intents[0] ?? 'unknown', branch: intents[0] ?? 'unknown' };
        }
        break;
      }

      case 'qa': {
        const question = String(ctx.variables._lastOutput ?? config.question ?? '');
        const context = (config.context as string) ?? '';
        const resp = await chatCompletion(ctx.db, ctx.workspaceId, [
          { role: 'system', content: `Answer the question based on the given context.\n\nContext:\n${context}` },
          { role: 'user', content: question },
        ]);
        result = { output: resp.content };
        break;
      }

      case 'sub_workflow': {
        const subWorkflowId = config.workflowId as string;
        if (!subWorkflowId) { result = { output: null, error: 'No sub-workflow ID configured' }; break; }
        const subInput = (ctx.variables._lastOutput ?? ctx.input) as Record<string, unknown>;
        // Recursive execution with depth guard
        const depth = (ctx.variables._subWorkflowDepth as number) ?? 0;
        if (depth >= 5) { result = { output: null, error: 'Sub-workflow depth limit (5) exceeded' }; break; }
        const subResult = await executeWorkflow(ctx.db, nanoid(), subWorkflowId, ctx.workspaceId, subInput);
        result = { output: subResult.output, traces: subResult.traces };
        break;
      }

      case 'image_gen':
      case 'emitter':
      case 'receiver':
        result = { output: ctx.variables._lastOutput, _stub: true, message: `Node type '${node.nodeType}' not yet implemented` };
        break;

      default:
        result = { output: null, error: `Unknown node type: ${node.nodeType}` };
    }

    ctx.variables._lastOutput = result.output;
    await writeTrace(ctx, node, 'completed', ctx.variables._lastOutput, result, null, startedAt);
    return result;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Node execution failed';
    await writeTrace(ctx, node, 'failed', ctx.variables._lastOutput, null, errorMsg, startedAt);
    throw err;
  }
}

/**
 * Execute a workflow run: walk the DAG from start → end.
 */
export async function executeWorkflow(
  db: Database,
  runId: string,
  workflowId: string,
  workspaceId: string,
  input: Record<string, unknown> = {},
): Promise<{ output: unknown; traces: number }> {
  // Load nodes and edges
  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflowId));
  const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflowId));

  const ctx: ExecutionContext = {
    db, runId, workflowId, workspaceId,
    variables: { _lastOutput: input },
    input,
  };

  // Update run to running
  await db.update(workflowRuns).set({ status: 'running', startedAt: new Date() }).where(eq(workflowRuns.id, runId));

  // Find start node
  const startNode = nodes.find((n) => n.nodeType === 'start');
  if (!startNode) {
    await db.update(workflowRuns).set({ status: 'failed', error: 'No start node found', completedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
    return { output: null, traces: 0 };
  }

  // Build adjacency map
  const adjacency = new Map<string, EdgeExec[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromNodeId) ?? [];
    list.push({
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      sourceHandle: edge.sourceHandle,
      condition: edge.condition as Record<string, unknown> | null,
    });
    adjacency.set(edge.fromNodeId, list);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, {
    id: n.id, nodeType: n.nodeType, label: n.label,
    config: n.config as Record<string, unknown> | null,
  }]));

  // Walk the DAG
  let currentNodeId: string | null = startNode.id;
  let traceCount = 0;
  const visited = new Set<string>();
  const MAX_STEPS = 100; // prevent infinite loops

  try {
    while (currentNodeId && traceCount < MAX_STEPS) {
      if (visited.has(currentNodeId) && nodeMap.get(currentNodeId)?.nodeType !== 'loop') {
        break; // prevent cycles (except in loop nodes)
      }
      visited.add(currentNodeId);

      const node = nodeMap.get(currentNodeId);
      if (!node) break;

      const result = await executeNode(ctx, node);
      traceCount++;

      if (node.nodeType === 'end') break;

      // Find next node(s)
      const outEdges: EdgeExec[] = adjacency.get(currentNodeId!) ?? [];
      if (outEdges.length === 0) break;

      if (node.nodeType === 'condition' && result.branch) {
        // Follow the matching branch
        const branch = String(result.branch);
        const matchedEdge: EdgeExec | undefined = outEdges.find((e: EdgeExec) => e.sourceHandle === branch) ?? outEdges[0];
        currentNodeId = matchedEdge?.toNodeId ?? null;
      } else {
        // Follow first edge (linear flow)
        currentNodeId = outEdges[0].toNodeId;
      }
    }

    // Complete
    await db.update(workflowRuns).set({
      status: 'completed',
      output: ctx.variables as Record<string, unknown>,
      completedAt: new Date(),
    }).where(eq(workflowRuns.id, runId));

    return { output: ctx.variables._lastOutput, traces: traceCount };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Workflow execution failed';
    await db.update(workflowRuns).set({
      status: 'failed', error: errorMsg, completedAt: new Date(),
    }).where(eq(workflowRuns.id, runId));

    return { output: null, traces: traceCount };
  }
}
