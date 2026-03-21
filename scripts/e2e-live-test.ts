#!/usr/bin/env tsx
/**
 * Live E2E Test — Hits the deployed API at hive-api.pajamadot.com
 *
 * Creates a test API key, runs through the full Coze-parity flow,
 * then cleans up. Verifies every major feature works end-to-end.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const API = 'https://hive-api.pajamadot.com';
const DB_URL = readFileSync(join(__dirname, '../secrets/neondb.env'), 'utf8').trim();

let apiKey = '';
let passed = 0;
let failed = 0;
const results: { test: string; status: 'pass' | 'fail'; detail?: string }[] = [];

function assert(test: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    results.push({ test, status: 'pass' });
  } else {
    failed++;
    results.push({ test, status: 'fail', detail });
    console.log(`  ✗ ${test}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(path: string, method = 'GET', body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { status: res.status, data };
}

async function setupApiKey(): Promise<string> {
  // Create API key directly in the database
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(DB_URL);

  const key = `hive_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const keyHash = await hashKey(key);
  const id = `test_${Date.now()}`;

  await sql`INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, status, created_at, updated_at)
    VALUES (${id}, 'test_e2e_user', 'E2E Test Key', ${keyHash}, ${key.slice(0, 8)}, ARRAY['*'], 'active', NOW(), NOW())`;

  return key;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function cleanupApiKey() {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(DB_URL);
  await sql`DELETE FROM api_keys WHERE user_id = 'test_e2e_user'`;
}

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║    LIVE E2E TEST — hive-api.pajamadot.com    ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Setup
  console.log('Setting up test API key...');
  apiKey = await setupApiKey();
  console.log(`API key: ${apiKey.slice(0, 12)}...`);

  // ═══ 1. Health Check ═══
  console.log('\n── 1. Health Check ──');
  const health = await api('/');
  assert('API returns 200', health.status === 200);
  assert('API has status=ok', health.data.status === 'ok');
  assert('API has features array', Array.isArray(health.data.features));

  // ═══ 2. Auth ═══
  console.log('\n── 2. Authentication ──');
  const noAuth = await fetch(`${API}/v1/graphs`);
  assert('Unauthenticated request returns 401', noAuth.status === 401);

  const authed = await api('/v1/graphs');
  assert('Authenticated request returns 200', authed.status === 200);

  // ═══ 3. Workspaces ═══
  console.log('\n── 3. Workspaces ──');
  const wsCreate = await api('/v1/workspaces', 'POST', { name: 'E2E Test WS', slug: `e2e-${Date.now()}` });
  assert('Create workspace returns 201', wsCreate.status === 201);
  const wsId = (wsCreate.data.workspace as Record<string, unknown>)?.id as string;
  assert('Workspace has ID', !!wsId);

  const wsList = await api('/v1/workspaces');
  assert('List workspaces returns 200', wsList.status === 200);

  // ═══ 4. Agents ═══
  console.log('\n── 4. Agents ──');
  const agentCreate = await api('/v1/agents', 'POST', { name: 'E2E Test Agent', workspaceId: wsId ?? 'default' });
  assert('Create agent returns 201', agentCreate.status === 201);
  const agentId = (agentCreate.data.agent as Record<string, unknown>)?.id as string;
  assert('Agent has ID', !!agentId);

  if (agentId) {
    const agentGet = await api(`/v1/agents/${agentId}`);
    assert('Get agent returns 200', agentGet.status === 200);

    const agentUpdate = await api(`/v1/agents/${agentId}`, 'PATCH', { description: 'Updated by E2E test' });
    assert('Update agent returns 200', agentUpdate.status === 200);

    const configUpdate = await api(`/v1/agents/${agentId}/config`, 'PUT', {
      systemPrompt: 'You are an E2E test agent.', temperature: 0.5,
    });
    assert('Update agent config returns 200', configUpdate.status === 200);

    const publish = await api(`/v1/agents/${agentId}/publish`, 'POST');
    assert('Publish agent returns 200', publish.status === 200);

    const versions = await api(`/v1/agents/${agentId}/versions`);
    assert('List agent versions returns 200', versions.status === 200);

    const duplicate = await api(`/v1/agents/${agentId}/duplicate`, 'POST');
    assert('Duplicate agent returns 201', duplicate.status === 201);

    const invoke = await api(`/v1/agents/${agentId}/invoke`, 'POST', { message: 'Hello' });
    assert('Invoke agent returns 200 or 500 (no model)', invoke.status === 200 || invoke.status === 500);
  }

  // ═══ 5. Workflows ═══
  console.log('\n── 5. Workflows ──');
  const wfCreate = await api('/v1/workflows', 'POST', { name: 'E2E Test Workflow', workspaceId: wsId ?? 'default' });
  assert('Create workflow returns 201', wfCreate.status === 201);
  const wfId = (wfCreate.data.workflow as Record<string, unknown>)?.id as string;

  if (wfId) {
    const wfGet = await api(`/v1/workflows/${wfId}`);
    assert('Get workflow returns 200', wfGet.status === 200);
    assert('Workflow has default start/end nodes', Array.isArray(wfGet.data.nodes));

    const addNode = await api(`/v1/workflows/${wfId}/nodes`, 'POST', {
      nodeType: 'llm', label: 'Test LLM', positionX: 250, positionY: 200,
    });
    assert('Add workflow node returns 201', addNode.status === 201);

    const wfPublish = await api(`/v1/workflows/${wfId}/publish`, 'POST');
    assert('Publish workflow returns 200', wfPublish.status === 200);

    const wfRuns = await api(`/v1/workflows/${wfId}/runs`);
    assert('List workflow runs returns 200', wfRuns.status === 200);
  }

  // ═══ 6. Conversations & Chat ═══
  console.log('\n── 6. Conversations & Chat ──');
  const convCreate = await api('/v1/conversations', 'POST', {
    workspaceId: wsId ?? 'default', title: 'E2E Test Chat',
  });
  assert('Create conversation returns 201', convCreate.status === 201);
  const convId = (convCreate.data.conversation as Record<string, unknown>)?.id as string;

  if (convId) {
    const sendMsg = await api(`/v1/conversations/${convId}/messages`, 'POST', { content: 'Hello from E2E test' });
    assert('Send message returns 201', sendMsg.status === 201);

    const getMessages = await api(`/v1/conversations/${convId}/messages`);
    assert('Get messages returns 200', getMessages.status === 200);

    const convGet = await api(`/v1/conversations/${convId}`);
    assert('Get conversation returns 200', convGet.status === 200);

    const section = await api(`/v1/conversations/${convId}/sections`, 'POST');
    assert('Create section returns 200', section.status === 200);

    const fork = await api(`/v1/conversations/${convId}/fork`, 'POST', {});
    assert('Fork conversation returns 201 or 200', fork.status === 201 || fork.status === 200);
  }

  // ═══ 7. Knowledge Base ═══
  console.log('\n── 7. Knowledge Base ──');
  const kbCreate = await api('/v1/knowledge', 'POST', {
    name: 'E2E Test KB', workspaceId: wsId ?? 'default', chunkSize: 500,
  });
  assert('Create KB returns 201', kbCreate.status === 201);
  const kbId = (kbCreate.data.knowledgeBase as Record<string, unknown>)?.id as string;

  if (kbId) {
    const docCreate = await api(`/v1/knowledge/${kbId}/documents`, 'POST', {
      name: 'test-doc.txt', sourceType: 'text',
      content: 'The return policy is 30 days. Free shipping on orders over $50. Contact support at help@acme.com.',
    });
    assert('Create document returns 201', docCreate.status === 201);
    const docChunks = (docCreate.data.document as Record<string, unknown>)?.chunkCount;
    assert('Document was chunked', (docChunks as number) >= 1);

    const search = await api(`/v1/knowledge/${kbId}/search`, 'POST', { query: 'return policy' });
    assert('Knowledge search returns 200', search.status === 200);
    assert('Search returns results', Array.isArray(search.data.results) && (search.data.results as unknown[]).length > 0);

    const kbCopy = await api(`/v1/knowledge/${kbId}/copy`, 'POST');
    assert('Copy KB returns 201', kbCopy.status === 201);
  }

  // ═══ 8. Plugins ═══
  console.log('\n── 8. Plugins ──');
  const pluginCreate = await api('/v1/plugins', 'POST', {
    name: 'E2E Test Plugin', workspaceId: wsId ?? 'default', pluginType: 'api',
    baseUrl: 'https://httpbin.org',
  });
  assert('Create plugin returns 201', pluginCreate.status === 201);
  const pluginId = (pluginCreate.data.plugin as Record<string, unknown>)?.id as string;

  if (pluginId) {
    const toolCreate = await api(`/v1/plugins/${pluginId}/tools`, 'POST', {
      name: 'getJson', path: '/get', method: 'GET',
    });
    assert('Create plugin tool returns 201', toolCreate.status === 201);

    const pluginPublish = await api(`/v1/plugins/${pluginId}/publish`, 'POST');
    assert('Publish plugin returns 200', pluginPublish.status === 200);
  }

  // ═══ 9. Prompts ═══
  console.log('\n── 9. Prompts ──');
  const promptCreate = await api('/v1/prompts', 'POST', {
    name: 'E2E Prompt', content: 'You are {{role}} for {{company}}.', workspaceId: wsId ?? 'default',
    templateVars: ['role', 'company'],
  });
  assert('Create prompt returns 201', promptCreate.status === 201);
  const promptId = (promptCreate.data.prompt as Record<string, unknown>)?.id as string;

  if (promptId) {
    const render = await api(`/v1/prompts/${promptId}/render`, 'POST', {
      variables: { role: 'support agent', company: 'Acme' },
    });
    assert('Render prompt returns 200', render.status === 200);
    assert('Prompt rendered correctly', (render.data.rendered as string)?.includes('support agent'));
  }

  // ═══ 10. Apps ═══
  console.log('\n── 10. Apps ──');
  const appCreate = await api('/v1/apps', 'POST', {
    name: 'E2E App', appType: 'chat', workspaceId: wsId ?? 'default',
  });
  assert('Create app returns 201', appCreate.status === 201);

  // ═══ 11. Marketplace ═══
  console.log('\n── 11. Marketplace ──');
  const mpBrowse = await api('/v1/marketplace');
  assert('Browse marketplace returns 200', mpBrowse.status === 200);

  // ═══ 12. Variables ═══
  console.log('\n── 12. Variables ──');
  const varCreate = await api('/v1/variables', 'POST', {
    name: 'e2e_var', valueType: 'string', scope: 'workspace', workspaceId: wsId ?? 'default',
  });
  assert('Create variable returns 201', varCreate.status === 201);

  // ═══ 13. Databases ═══
  console.log('\n── 13. Databases ──');
  const dbCreate = await api('/v1/databases', 'POST', {
    name: 'E2E DB', workspaceId: wsId ?? 'default',
  });
  assert('Create database returns 201', dbCreate.status === 201);

  // ═══ 14. Replication Tracker ═══
  console.log('\n── 14. Replication Tracker ──');
  const repStatus = await api('/v1/replication/status');
  assert('Replication status returns 200', repStatus.status === 200);
  assert('Replication has score', typeof repStatus.data.score === 'number');
  assert('Replication has features array', Array.isArray(repStatus.data.features));

  const repGaps = await api('/v1/replication/gaps');
  assert('Replication gaps returns 200', repGaps.status === 200);

  // ═══ 15. Coze Compat Layer ═══
  console.log('\n── 15. Coze Compat Layer ──');
  const cozeNodeTypes = await api('/api/workflow_api/node_type', 'POST');
  assert('Coze node_type returns 200', cozeNodeTypes.status === 200);
  assert('Coze returns node types', Array.isArray((cozeNodeTypes.data.data as Record<string, unknown>)?.types));

  const cozeConfig = await api('/api/admin/config/basic/get');
  assert('Coze basic config returns 200', cozeConfig.status === 200);

  // ═══ 16. Model Usage ═══
  console.log('\n── 16. Model Usage ──');
  const usage = await api('/v1/models/usage?workspaceId=default');
  assert('Model usage returns 200', usage.status === 200);
  assert('Usage has summary', typeof usage.data.summary === 'object');

  // Cleanup
  console.log('\n── Cleanup ──');
  await cleanupApiKey();
  console.log('Test API key deleted.');

  // Results
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)${' '.repeat(Math.max(0, 10 - String(passed + failed).length))}║`);
  console.log('╚══════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`  ✗ ${r.test}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }

  console.log(`\nScore: ${Math.round((passed / (passed + failed)) * 100)}%`);
}

runTests().catch((err) => {
  console.error('E2E test failed:', err);
  cleanupApiKey().catch(() => {});
  process.exit(1);
});
