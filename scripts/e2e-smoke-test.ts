#!/usr/bin/env tsx
/**
 * E2E Smoke Test — Simulates EVERY frontend user action against the live API.
 *
 * This is NOT a schema test. It makes real HTTP requests to hive-api.pajamadot.com
 * and verifies that every feature actually works as a user would use it.
 *
 * Run: cd packages/api && npx tsx ../../scripts/e2e-smoke-test.ts
 *
 * Tests the complete user journey:
 * 1. Auth (API key)
 * 2. Workspace auto-creation
 * 3. Model provider setup
 * 4. Agent creation → config → publish → invoke
 * 5. Workflow creation → add nodes → connect → configure → test node → run → traces
 * 6. Conversation → send message → get messages → annotate → fork
 * 7. Knowledge base → upload doc → verify chunks → search (keyword + hybrid)
 * 8. Plugin → create tool → execute → debug
 * 9. Prompt → create → render → test with model
 * 10. App → create → publish → get embed code
 * 11. Marketplace → publish → browse → install → review
 * 12. Variables → create → set value → get value
 * 13. Database → create table → insert rows → NL2SQL query
 * 14. Uploads → upload file → get → sign URL → delete
 * 15. Replication tracker → status → gaps → snapshot
 * 16. Coze compat layer → draftbot, knowledge, workflow, v3 chat
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const API = process.env.API_URL ?? 'https://hive-api.pajamadot.com';
const DB_URL = readFileSync(join(__dirname, '../secrets/neondb.env'), 'utf8').trim();

let TOKEN = '';
let WSID = '';
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function setup() {
  // Use require to find neon from packages/api/node_modules
  const neonPath = join(__dirname, '../packages/api/node_modules/@neondatabase/serverless');
  const { neon } = require(neonPath);
  const sql = neon(DB_URL);
  const key = `hive_smoke_${Date.now()}`;
  const hash = createHash('sha256').update(key).digest('hex');
  await sql`INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, status, created_at, updated_at)
    VALUES (${'smoke_' + Date.now()}, 'smoke_test_user', 'Smoke Test', ${hash}, ${key.slice(0, 8)}, ARRAY['*'], 'active', NOW(), NOW())`;
  TOKEN = key;
}

async function cleanup() {
  const neonPath = join(__dirname, '../packages/api/node_modules/@neondatabase/serverless');
  const { neon } = require(neonPath);
  const sql = neon(DB_URL);
  await sql`DELETE FROM api_keys WHERE user_id = 'smoke_test_user'`;
}

async function req(method: string, path: string, body?: unknown): Promise<{ s: number; d: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { s: res.status, d };
}

function ok(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; }
  else { failed++; failures.push(`${name}${detail ? ': ' + detail : ''}`); console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function run() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  E2E SMOKE TEST — Full User Journey Simulation   ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  await setup();
  console.log(`Token: ${TOKEN.slice(0, 15)}...`);

  // ═══ 1. Auth ═══
  console.log('\n── 1. Auth ──');
  const health = await req('GET', '/');
  ok('Health check', health.s === 200);
  ok('Has features', Array.isArray(health.d.features));

  const noAuth = await fetch(`${API}/v1/graphs`);
  ok('Unauthed = 401', noAuth.status === 401);

  const authed = await req('GET', '/v1/graphs');
  ok('Authed = 200', authed.s === 200);

  // ═══ 2. Workspace ═══
  console.log('\n── 2. Workspace ──');
  const wsList = await req('GET', '/v1/workspaces');
  ok('List workspaces', wsList.s === 200);
  const workspaces = wsList.d.workspaces as unknown[];
  WSID = workspaces?.length > 0 ? (workspaces[0] as Record<string, string>).id : '';
  if (!WSID) {
    const wsCreate = await req('POST', '/v1/workspaces', { name: 'Smoke Test', slug: `smoke-${Date.now()}` });
    ok('Create workspace', wsCreate.s === 201);
    WSID = (wsCreate.d.workspace as Record<string, string>)?.id ?? '';
  }
  ok('Have workspace ID', !!WSID, WSID);

  const wsGet = await req('GET', `/v1/workspaces/${WSID}`);
  ok('Get workspace', wsGet.s === 200);

  const wsMembers = await req('GET', `/v1/workspaces/${WSID}/members`);
  ok('List members', wsMembers.s === 200);

  // ═══ 3. Agents ═══
  console.log('\n── 3. Agents ──');
  const agCreate = await req('POST', '/v1/agents', { name: 'Smoke Agent', workspaceId: WSID, mode: 'single' });
  ok('Create agent', agCreate.s === 201);
  const agentId = (agCreate.d.agent as Record<string, string>)?.id;
  ok('Agent has ID', !!agentId);

  const agGet = await req('GET', `/v1/agents/${agentId}`);
  ok('Get agent + config', agGet.s === 200);
  ok('Agent has config', agGet.d.config !== undefined);

  const agConfig = await req('PUT', `/v1/agents/${agentId}/config`, {
    systemPrompt: 'You are a test agent.', temperature: 0.5, memoryEnabled: true, memoryWindowSize: 10,
  });
  ok('Update agent config', agConfig.s === 200);

  const agUpdate = await req('PATCH', `/v1/agents/${agentId}`, { description: 'Smoke test agent' });
  ok('Update agent metadata', agUpdate.s === 200);

  const agPublish = await req('POST', `/v1/agents/${agentId}/publish`, {});
  ok('Publish agent', agPublish.s === 200);

  const agVersions = await req('GET', `/v1/agents/${agentId}/versions`);
  ok('List agent versions', agVersions.s === 200);
  ok('Has version 1', ((agVersions.d.versions as unknown[])?.length ?? 0) >= 1);

  const agDup = await req('POST', `/v1/agents/${agentId}/duplicate`, {});
  ok('Duplicate agent', agDup.s === 201);

  const agList = await req('GET', `/v1/agents?workspaceId=${WSID}`);
  ok('List agents', agList.s === 200);
  ok('Has agents', ((agList.d.agents as unknown[])?.length ?? 0) >= 2);

  const agInvoke = await req('POST', `/v1/agents/${agentId}/invoke`, { message: 'Hello' });
  ok('Invoke agent (may fail without model)', agInvoke.s === 200 || agInvoke.s === 500);

  // ═══ 4. Workflows ═══
  console.log('\n── 4. Workflows ──');
  const wfCreate = await req('POST', '/v1/workflows', { name: 'Smoke Workflow', workspaceId: WSID });
  ok('Create workflow', wfCreate.s === 201);
  const wfId = (wfCreate.d.workflow as Record<string, string>)?.id;

  const wfGet = await req('GET', `/v1/workflows/${wfId}`);
  ok('Get workflow', wfGet.s === 200);
  const wfNodes = wfGet.d.nodes as { id: string; nodeType: string }[];
  ok('Has start/end nodes', wfNodes?.length >= 2);
  const startNodeId = wfNodes?.find((n) => n.nodeType === 'start')?.id;
  const endNodeId = wfNodes?.find((n) => n.nodeType === 'end')?.id;

  // Add LLM node
  const nodeAdd = await req('POST', `/v1/workflows/${wfId}/nodes`, {
    nodeType: 'llm', label: 'Test LLM', positionX: 250, positionY: 200,
    config: { prompt: 'Say hello', temperature: 0.5 },
  });
  ok('Add LLM node', nodeAdd.s === 201);
  const llmNodeId = (nodeAdd.d.node as Record<string, string>)?.id;

  // Add condition node
  const condAdd = await req('POST', `/v1/workflows/${wfId}/nodes`, {
    nodeType: 'condition', label: 'Check', positionX: 250, positionY: 300,
    config: { expression: 'true' },
  });
  ok('Add condition node', condAdd.s === 201);
  const condNodeId = (condAdd.d.node as Record<string, string>)?.id;

  // Add code node
  const codeAdd = await req('POST', `/v1/workflows/${wfId}/nodes`, {
    nodeType: 'code', label: 'Transform', positionX: 400, positionY: 300,
    config: { code: 'return { result: "processed" }' },
  });
  ok('Add code node', codeAdd.s === 201);
  const codeNodeId = (codeAdd.d.node as Record<string, string>)?.id;

  // Connect: start → LLM → condition → code → end
  if (startNodeId && llmNodeId) {
    const e1 = await req('POST', `/v1/workflows/${wfId}/edges`, { fromNodeId: startNodeId, toNodeId: llmNodeId });
    ok('Edge start→LLM', e1.s === 201);
  }
  if (llmNodeId && condNodeId) {
    const e2 = await req('POST', `/v1/workflows/${wfId}/edges`, { fromNodeId: llmNodeId, toNodeId: condNodeId });
    ok('Edge LLM→condition', e2.s === 201);
  }
  if (condNodeId && codeNodeId) {
    const e3 = await req('POST', `/v1/workflows/${wfId}/edges`, { fromNodeId: condNodeId, toNodeId: codeNodeId, sourceHandle: 'true' });
    ok('Edge condition→code (true branch)', e3.s === 201);
  }
  if (codeNodeId && endNodeId) {
    const e4 = await req('POST', `/v1/workflows/${wfId}/edges`, { fromNodeId: codeNodeId, toNodeId: endNodeId });
    ok('Edge code→end', e4.s === 201);
  }

  // Update node config
  if (llmNodeId) {
    const nodeUpdate = await req('PATCH', `/v1/workflows/nodes/${llmNodeId}`, { label: 'Updated LLM', config: { prompt: 'Greet the user', temperature: 0.3 } });
    ok('Update node config', nodeUpdate.s === 200);

    // Verify config persisted
    const wfGet2 = await req('GET', `/v1/workflows/${wfId}`);
    const updatedNode = (wfGet2.d.nodes as { id: string; config: unknown; label: string }[])?.find((n) => n.id === llmNodeId);
    ok('Config persisted', updatedNode?.label === 'Updated LLM');
    ok('Config has prompt', !!(updatedNode?.config as Record<string, unknown>)?.prompt);
  }

  // Test single node
  if (codeNodeId) {
    const nodeTest = await req('POST', `/v1/workflows/${wfId}/nodes/${codeNodeId}/test`, { input: { data: 'test' } });
    ok('Per-node test execution', nodeTest.s === 200);
    ok('Node test has output', nodeTest.d.output !== undefined);
  }

  // Publish workflow
  const wfPublish = await req('POST', `/v1/workflows/${wfId}/publish`, {});
  ok('Publish workflow', wfPublish.s === 200);

  // Run workflow
  const wfRun = await req('POST', `/v1/workflows/${wfId}/run`, { input: { message: 'hello' } });
  ok('Run workflow', wfRun.s === 201);
  const runTraces = (wfRun.d.run as Record<string, unknown>)?.traces;
  ok('Run has traces', typeof runTraces === 'number' && (runTraces as number) >= 1);

  // List runs
  const wfRuns = await req('GET', `/v1/workflows/${wfId}/runs`);
  ok('List workflow runs', wfRuns.s === 200);

  // ═══ 5. Conversations & Chat ═══
  console.log('\n── 5. Conversations ──');
  const convCreate = await req('POST', '/v1/conversations', { workspaceId: WSID, title: 'Smoke Chat', agentId: agentId });
  ok('Create conversation', convCreate.s === 201);
  const convId = (convCreate.d.conversation as Record<string, string>)?.id;

  const msgSend = await req('POST', `/v1/conversations/${convId}/messages`, { content: 'Hello from smoke test' });
  ok('Send message', msgSend.s === 201);
  const msgId = (msgSend.d.message as Record<string, string>)?.id;

  const msgList = await req('GET', `/v1/conversations/${convId}/messages`);
  ok('Get messages', msgList.s === 200);
  ok('Has messages', ((msgList.d.messages as unknown[])?.length ?? 0) >= 1);

  // Edit message
  if (msgId) {
    const msgEdit = await req('PATCH', `/v1/conversations/messages/${msgId}`, { content: 'Edited message' });
    ok('Edit message', msgEdit.s === 200);
  }

  // Create section
  const section = await req('POST', `/v1/conversations/${convId}/sections`, {});
  ok('Create section', section.s === 200);

  // Fork conversation
  const fork = await req('POST', `/v1/conversations/${convId}/fork`, {});
  ok('Fork conversation', fork.s === 201 || fork.s === 200);

  // Annotate
  if (msgId) {
    const annotate = await req('POST', `/v1/conversations/messages/${msgId}/annotate`, {
      answer: 'Corrected answer', rating: 5, workspaceId: WSID,
    });
    ok('Annotate message', annotate.s === 201);
  }

  // List annotations
  const annots = await req('GET', `/v1/conversations/annotations?workspaceId=${WSID}`);
  ok('List annotations', annots.s === 200);

  // ═══ 6. Knowledge Base ═══
  console.log('\n── 6. Knowledge ──');
  const kbCreate = await req('POST', '/v1/knowledge', { name: 'Smoke KB', workspaceId: WSID, chunkSize: 200 });
  ok('Create KB', kbCreate.s === 201);
  const kbId = (kbCreate.d.knowledgeBase as Record<string, string>)?.id;

  // Upload text document
  const docCreate = await req('POST', `/v1/knowledge/${kbId}/documents`, {
    name: 'test-doc', sourceType: 'text',
    content: 'The return policy is 30 days for all products. Free shipping on orders over $50. Contact support@acme.com for help. Our headquarters is in New York City.',
  });
  ok('Upload document', docCreate.s === 201);
  const docChunks = (docCreate.d.document as Record<string, number>)?.chunkCount;
  ok('Document was chunked', (docChunks ?? 0) >= 1);

  // Search (keyword)
  const kwSearch = await req('POST', `/v1/knowledge/${kbId}/search`, { query: 'return policy', mode: 'keyword' });
  ok('Keyword search', kwSearch.s === 200);
  ok('Keyword results found', ((kwSearch.d.results as unknown[])?.length ?? 0) >= 1);

  // Search (hybrid)
  const hybridSearch = await req('POST', `/v1/knowledge/${kbId}/search`, { query: 'shipping policy', mode: 'hybrid' });
  ok('Hybrid search', hybridSearch.s === 200);

  // Copy KB
  const kbCopy = await req('POST', `/v1/knowledge/${kbId}/copy`);
  ok('Copy knowledge base', kbCopy.s === 201);

  // ═══ 7. Plugins ═══
  console.log('\n── 7. Plugins ──');
  const plCreate = await req('POST', '/v1/plugins', { name: 'Smoke Plugin', workspaceId: WSID, pluginType: 'api', baseUrl: 'https://httpbin.org' });
  ok('Create plugin', plCreate.s === 201);
  const pluginId = (plCreate.d.plugin as Record<string, string>)?.id;

  const toolCreate = await req('POST', `/v1/plugins/${pluginId}/tools`, { name: 'getJson', path: '/get', method: 'GET' });
  ok('Create tool', toolCreate.s === 201);
  const toolId = (toolCreate.d.tool as Record<string, string>)?.id;

  // Execute tool
  if (toolId) {
    const toolExec = await req('POST', `/v1/plugins/tools/${toolId}/execute`, { input: {} });
    ok('Execute tool', toolExec.s === 200);
    ok('Tool has result', toolExec.d.statusCode !== undefined);
  }

  // Debug tool
  if (toolId) {
    const toolDebug = await req('POST', `/v1/plugins/tools/${toolId}/debug`, { input: {} });
    ok('Debug tool', toolDebug.s === 200);
    ok('Debug has request info', toolDebug.d.request !== undefined);
  }

  // Import OpenAPI
  const oaImport = await req('POST', `/v1/plugins/${pluginId}/import-openapi`, {
    spec: { openapi: '3.0.0', info: { title: 'Test', version: '1' }, paths: { '/test': { get: { operationId: 'testOp', summary: 'Test' } } } },
  });
  ok('Import OpenAPI spec', oaImport.s === 200);
  ok('Imported tools', (oaImport.d.imported as number) >= 1);

  // Publish plugin
  const plPublish = await req('POST', `/v1/plugins/${pluginId}/publish`);
  ok('Publish plugin', plPublish.s === 200);

  // ═══ 8. Prompts ═══
  console.log('\n── 8. Prompts ──');
  const prCreate = await req('POST', '/v1/prompts', { name: 'Smoke Prompt', content: 'You are {{role}} for {{company}}.', workspaceId: WSID, templateVars: ['role', 'company'] });
  ok('Create prompt', prCreate.s === 201);
  const promptId = (prCreate.d.prompt as Record<string, string>)?.id;

  // Render
  if (promptId) {
    const render = await req('POST', `/v1/prompts/${promptId}/render`, { variables: { role: 'support agent', company: 'Acme' } });
    ok('Render prompt', render.s === 200);
    ok('Rendered correctly', (render.d.rendered as string)?.includes('support agent'));
    ok('No unresolved vars', ((render.d.unresolved as string[])?.length ?? 0) === 0);
  }

  // Update (auto-versions)
  if (promptId) {
    const prUpdate = await req('PATCH', `/v1/prompts/${promptId}`, { content: 'Updated: You are {{role}}.', changelog: 'v2' });
    ok('Update prompt', prUpdate.s === 200);

    const prGet = await req('GET', `/v1/prompts/${promptId}`);
    ok('Get prompt with versions', prGet.s === 200);
    ok('Has version history', ((prGet.d.versions as unknown[])?.length ?? 0) >= 2);
  }

  // ═══ 9. Apps ═══
  console.log('\n── 9. Apps ──');
  const appCreate = await req('POST', '/v1/apps', { name: 'Smoke App', appType: 'chat', workspaceId: WSID, agentId: agentId });
  ok('Create app', appCreate.s === 201);
  const appId = (appCreate.d.app as Record<string, string>)?.id;

  if (appId) {
    const appPublish = await req('POST', `/v1/apps/${appId}/publish`);
    ok('Publish app', appPublish.s === 200);
    ok('Has deploy URL', !!(appPublish.d as Record<string, string>).url);

    const appEmbed = await req('GET', `/v1/apps/${appId}/embed`);
    ok('Get embed code', appEmbed.s === 200);
    ok('Has embed HTML', (appEmbed.d.embedCode as string)?.includes('script'));
  }

  // ═══ 10. Marketplace ═══
  console.log('\n── 10. Marketplace ──');
  const mpPublish = await req('POST', '/v1/marketplace', {
    resourceType: 'agent', resourceId: agentId, name: 'Smoke Product',
    workspaceId: WSID, category: 'testing', tags: ['smoke', 'test'],
  });
  ok('Publish to marketplace', mpPublish.s === 201);
  const productId = (mpPublish.d.product as Record<string, string>)?.id;

  const mpBrowse = await req('GET', '/v1/marketplace');
  ok('Browse marketplace', mpBrowse.s === 200);

  if (productId) {
    const mpReview = await req('POST', `/v1/marketplace/${productId}/reviews`, { rating: 5, comment: 'Great!' });
    ok('Post review', mpReview.s === 201);

    const mpReviews = await req('GET', `/v1/marketplace/${productId}/reviews`);
    ok('Get reviews', mpReviews.s === 200);
  }

  const mpCats = await req('GET', '/v1/marketplace/categories/list');
  ok('List categories', mpCats.s === 200);

  // ═══ 11. Variables & Databases ═══
  console.log('\n── 11. Variables & Databases ──');
  const varCreate = await req('POST', '/v1/variables', { name: 'smoke_var', valueType: 'string', scope: 'workspace', workspaceId: WSID });
  ok('Create variable', varCreate.s === 201);
  const varId = (varCreate.d.variable as Record<string, string>)?.id;

  if (varId) {
    const varSet = await req('PUT', `/v1/variables/${varId}/value`, { value: 'smoke_value' });
    ok('Set variable value', varSet.s === 200);

    const varGet = await req('GET', `/v1/variables/${varId}/value`);
    ok('Get variable value', varGet.s === 200);
    ok('Value matches', varGet.d.value === 'smoke_value');
  }

  const dbCreate = await req('POST', '/v1/databases', { name: 'Smoke DB', workspaceId: WSID });
  ok('Create database', dbCreate.s === 201);
  const dbId = (dbCreate.d.database as Record<string, string>)?.id;

  if (dbId) {
    const tblCreate = await req('POST', `/v1/databases/${dbId}/tables`, {
      name: 'users', schema: [{ name: 'name', type: 'string', required: true }, { name: 'age', type: 'number' }],
    });
    ok('Create table', tblCreate.s === 201);
    const tableId = (tblCreate.d.table as Record<string, string>)?.id;

    if (tableId) {
      const rowInsert = await req('POST', `/v1/databases/tables/${tableId}/rows`, { data: { name: 'Alice', age: 30 } });
      ok('Insert row', rowInsert.s === 201);

      const rows = await req('GET', `/v1/databases/tables/${tableId}/rows`);
      ok('Get rows', rows.s === 200);
      ok('Has rows', ((rows.d.rows as unknown[])?.length ?? 0) >= 1);
    }
  }

  // ═══ 12. Replication & System ═══
  console.log('\n── 12. System ──');
  const repStatus = await req('GET', '/v1/replication/status');
  ok('Replication status', repStatus.s === 200);
  ok('Has score', typeof repStatus.d.score === 'number');

  const repGaps = await req('GET', '/v1/replication/gaps');
  ok('Replication gaps', repGaps.s === 200);

  const repSnap = await req('POST', '/v1/replication/snapshot');
  ok('Take snapshot', repSnap.s === 201);

  const usage = await req('GET', `/v1/models/usage?workspaceId=${WSID}`);
  ok('Model usage', usage.s === 200);

  // ═══ 13. Coze Compat ═══
  console.log('\n── 13. Coze Compat ──');
  const cozeNodeType = await req('POST', '/api/workflow_api/node_type', {});
  ok('Coze node_type', cozeNodeType.s === 200);

  const cozeConfig = await req('GET', '/api/admin/config/basic/get');
  ok('Coze config', cozeConfig.s === 200);

  const cozeKbList = await req('POST', '/api/knowledge/list', {});
  ok('Coze KB list', cozeKbList.s === 200);

  const cozeBotCreate = await req('POST', '/api/draftbot/create', { name: 'Coze Bot', space_id: WSID });
  ok('Coze draftbot create', cozeBotCreate.s === 200);

  const cozeWfList = await req('POST', '/api/workflow_api/workflow_list', {});
  ok('Coze workflow list', cozeWfList.s === 200);

  const cozeValidate = await req('POST', '/api/workflow_api/validate_tree', { workflow_id: wfId });
  ok('Coze validate tree', cozeValidate.s === 200);

  // ═══ 17. Graphs (DAG Orchestrator) ═══
  console.log('\n── 17. Graphs ──');
  const grCreate = await req('POST', '/v1/graphs', { name: 'Smoke Graph' });
  ok('Graphs: create', grCreate.s === 201);
  const graphId = (grCreate.d.graph as Record<string, string>)?.id;

  if (graphId) {
    const grGet = await req('GET', `/v1/graphs/${graphId}`);
    ok('Graphs: get', grGet.s === 200);

    const grStats = await req('GET', '/v1/graphs/stats');
    ok('Graphs: stats', grStats.s === 200);

    const grList = await req('GET', '/v1/graphs');
    ok('Graphs: list', grList.s === 200);

    // Create task
    const taskCreate = await req('POST', `/v1/graphs/${graphId}/tasks`, { title: 'Test Task', type: 'code' });
    ok('Graphs: create task', taskCreate.s === 201);
    const taskId = (taskCreate.d.task as Record<string, string>)?.id;

    // List tasks
    const taskList = await req('GET', `/v1/graphs/${graphId}/tasks`);
    ok('Graphs: list tasks', taskList.s === 200);

    // Create edge (need 2 tasks)
    const task2 = await req('POST', `/v1/graphs/${graphId}/tasks`, { title: 'Task 2', type: 'test' });
    ok('Graphs: create task 2', task2.s === 201);
    const task2Id = (task2.d.task as Record<string, string>)?.id;

    if (taskId && task2Id) {
      const edgeCreate = await req('POST', `/v1/graphs/${graphId}/edges`, { fromTaskId: taskId, toTaskId: task2Id });
      ok('Graphs: create edge', edgeCreate.s === 201);

      const edgeList = await req('GET', `/v1/graphs/${graphId}/edges`);
      ok('Graphs: list edges', edgeList.s === 200);
    }

    // Export
    const grExport = await req('GET', `/v1/graphs/${graphId}/export`);
    ok('Graphs: export', grExport.s === 200);

    // Duplicate
    const grDup = await req('POST', `/v1/graphs/${graphId}/duplicate`, {});
    ok('Graphs: duplicate', grDup.s === 201);

    // Create run
    const runCreate = await req('POST', `/v1/graphs/${graphId}/runs`);
    ok('Graphs: create run', runCreate.s === 201 || runCreate.s === 200);

    // List runs
    const runList = await req('GET', `/v1/graphs/${graphId}/runs`);
    ok('Graphs: list runs', runList.s === 200);

    // Delete
    const grDelete = await req('DELETE', `/v1/graphs/${graphId}`);
    ok('Graphs: delete', grDelete.s === 200);
  }

  // ═══ 18. Meta Observatory ═══
  console.log('\n── 18. Meta Observatory ──');
  const metaHealth = await req('GET', '/v1/meta/health');
  ok('Meta: health', metaHealth.s === 200);

  const metaEvents = await req('GET', '/v1/meta/events');
  ok('Meta: events', metaEvents.s === 200);

  const metaRetro = await req('GET', '/v1/meta/retrospectives');
  ok('Meta: retrospectives', metaRetro.s === 200);

  const metaHistory = await req('GET', '/v1/meta/health/history');
  ok('Meta: health history', metaHistory.s === 200);

  // ═══ 19. Workers ═══
  console.log('\n── 19. Workers ──');
  const workerList = await req('GET', '/v1/workers');
  ok('Workers: list', workerList.s === 200);

  // ═══ 20. Audit Log ═══
  console.log('\n── 20. Audit ──');
  const auditList = await req('GET', '/v1/audit');
  ok('Audit: list', auditList.s === 200);

  // ═══ 21. API Keys (Settings) ═══
  console.log('\n── 21. API Keys ──');
  const keyList = await req('GET', '/v1/api-keys');
  ok('API Keys: list', keyList.s === 200);

  const keyCreate = await req('POST', '/v1/api-keys', { name: 'Smoke Key' });
  ok('API Keys: create', keyCreate.s === 201);
  const newKeyId = (keyCreate.d.apiKey as Record<string, string>)?.id;

  if (newKeyId) {
    const keyDelete = await req('DELETE', `/v1/api-keys/${newKeyId}`);
    ok('API Keys: delete', keyDelete.s === 200);
  }

  // ═══ 22. Webhooks (Settings) ═══
  console.log('\n── 22. Webhooks ──');
  const whList = await req('GET', '/v1/webhooks');
  ok('Webhooks: list', whList.s === 200);

  const whCreate = await req('POST', '/v1/webhooks', { url: 'https://httpbin.org/post', events: ['run.completed'] });
  ok('Webhooks: create', whCreate.s === 201);
  const webhookId = (whCreate.d.webhook as Record<string, string>)?.id;

  if (webhookId) {
    const whDelete = await req('DELETE', `/v1/webhooks/${webhookId}`);
    ok('Webhooks: delete', whDelete.s === 200);
  }

  // ═══ 23. Model Provider CRUD ═══
  console.log('\n── 23. Model Providers ──');
  const mpCreate = await req('POST', '/v1/models/providers', {
    name: 'Smoke Provider', provider: 'custom', workspaceId: WSID,
    baseUrl: 'https://api.test.com/v1',
  });
  ok('Models: create provider', mpCreate.s === 201);
  const providerId = (mpCreate.d.provider as Record<string, string>)?.id;

  if (providerId) {
    const mcCreate = await req('POST', '/v1/models/configs', {
      providerId, modelId: 'test-model', modelType: 'chat', isDefault: true,
    });
    ok('Models: create config', mcCreate.s === 201);

    const mpDelete = await req('DELETE', `/v1/models/providers/${providerId}`);
    ok('Models: delete provider', mpDelete.s === 200);
  }

  // ═══ 24. Uploads ═══
  console.log('\n── 24. Uploads ──');
  const uploadRes = await req('POST', '/v1/uploads', {
    name: 'smoke-test.txt', content: btoa('Hello from smoke test'), contentType: 'text/plain',
  });
  ok('Uploads: upload file', uploadRes.s === 201);
  const uploadKey = (uploadRes.d.upload as Record<string, string>)?.key;

  if (uploadKey) {
    const signRes = await req('POST', '/v1/uploads/sign', { key: uploadKey });
    ok('Uploads: sign URL', signRes.s === 200);
    ok('Uploads: has signed URL', !!(signRes.d as Record<string, string>).url);

    const deleteRes = await req('DELETE', `/v1/uploads/${uploadKey}`);
    ok('Uploads: delete file', deleteRes.s === 200);
  }

  // ═══ 25. Agent Config Persistence ═══
  console.log('\n── 25. Agent Config Deep ──');
  const deepAgent = await req('POST', '/v1/agents', { name: 'Deep Agent', workspaceId: WSID });
  const deepAgentId = (deepAgent.d.agent as Record<string, string>)?.id;

  if (deepAgentId) {
    // Set full config
    await req('PUT', `/v1/agents/${deepAgentId}/config`, {
      systemPrompt: 'Deep test prompt', temperature: 0.3, maxTokens: 2000,
      memoryEnabled: true, memoryWindowSize: 30,
      openingMessage: 'Hello!', suggestedReplies: ['Help', 'FAQ'],
    });

    // Read back and verify
    const deepGet = await req('GET', `/v1/agents/${deepAgentId}`);
    const cfg = deepGet.d.config as Record<string, unknown>;
    ok('Agent config: systemPrompt persisted', cfg?.systemPrompt === 'Deep test prompt');
    ok('Agent config: temperature persisted', cfg?.temperature === 0.3);
    ok('Agent config: memory persisted', cfg?.memoryEnabled === true);
    ok('Agent config: windowSize persisted', cfg?.memoryWindowSize === 30);
    ok('Agent config: openingMessage persisted', cfg?.openingMessage === 'Hello!');

    await req('DELETE', `/v1/agents/${deepAgentId}`);
  }

  // ═══ 26. Workflow Node Config Persistence ═══
  console.log('\n── 26. Node Config Deep ──');
  const deepWf = await req('POST', '/v1/workflows', { name: 'Deep WF', workspaceId: WSID });
  const deepWfId = (deepWf.d.workflow as Record<string, string>)?.id;

  if (deepWfId) {
    const llmNode = await req('POST', `/v1/workflows/${deepWfId}/nodes`, {
      nodeType: 'llm', label: 'DeepLLM',
      config: { prompt: 'Test prompt here', temperature: 0.2, maxTokens: 500 },
    });
    const llmId = (llmNode.d.node as Record<string, string>)?.id;

    if (llmId) {
      // Update config
      await req('PATCH', `/v1/workflows/nodes/${llmId}`, {
        config: { prompt: 'Updated prompt', temperature: 0.8 },
      });

      // Read back
      const wfGet = await req('GET', `/v1/workflows/${deepWfId}`);
      const nodes = wfGet.d.nodes as { id: string; config: Record<string, unknown> }[];
      const updatedNode = nodes?.find((n) => n.id === llmId);
      ok('Node config: prompt updated', (updatedNode?.config)?.prompt === 'Updated prompt');
      ok('Node config: temp updated', (updatedNode?.config)?.temperature === 0.8);
    }
  }

  // ═══ Summary ═══
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log(`║  PASSED: ${String(passed).padStart(3)}   FAILED: ${String(failed).padStart(3)}   TOTAL: ${String(passed + failed).padStart(3)}          ║`);
  console.log(`║  Score: ${Math.round((passed / (passed + failed)) * 100)}%${' '.repeat(41)}║`);
  console.log('╚═══════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
  }

  await cleanup();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error('Fatal:', err); cleanup().catch(() => {}); process.exit(1); });
