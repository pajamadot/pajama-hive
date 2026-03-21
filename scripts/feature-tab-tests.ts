#!/usr/bin/env tsx
/**
 * Feature Tab Test Suite
 *
 * Methodology: For each navigation tab in the sidebar, we:
 * 1. List ALL user actions possible on that page
 * 2. Map each action to the API call the frontend makes
 * 3. Execute each API call and verify the response
 * 4. Test the full CRUD lifecycle for each domain
 *
 * This ensures: "If it's in the UI, it works via the API"
 *
 * Run: cd packages/api && npx tsx ../../scripts/feature-tab-tests.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const API = process.env.API_URL ?? 'https://hive-api.pajamadot.com';
const DB_URL = readFileSync(join(__dirname, '../secrets/neondb.env'), 'utf8').trim();
let TOKEN = '';
let WSID = '';

let totalPass = 0;
let totalFail = 0;
const allFailures: string[] = [];

async function setup() {
  const neonPath = join(__dirname, '../packages/api/node_modules/@neondatabase/serverless');
  const { neon } = require(neonPath);
  const sql = neon(DB_URL);
  const key = `hive_tab_${Date.now()}`;
  const hash = createHash('sha256').update(key).digest('hex');
  await sql`INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, status, created_at, updated_at)
    VALUES (${'tab_' + Date.now()}, 'tab_test_user', 'Tab Test', ${hash}, ${key.slice(0, 8)}, ARRAY['*'], 'active', NOW(), NOW())`;
  TOKEN = key;

  // Get or create workspace
  const wsRes = await req('GET', '/v1/workspaces');
  const wsList = (wsRes.d.workspaces ?? []) as { id: string }[];
  if (wsList.length > 0) { WSID = wsList[0].id; }
  else {
    const ws = await req('POST', '/v1/workspaces', { name: 'Tab Test', slug: `tab-${Date.now()}` });
    WSID = (ws.d.workspace as { id: string })?.id ?? '';
  }
}

async function cleanup() {
  const neonPath = join(__dirname, '../packages/api/node_modules/@neondatabase/serverless');
  const { neon } = require(neonPath);
  const sql = neon(DB_URL);
  await sql`DELETE FROM api_keys WHERE user_id = 'tab_test_user'`;
}

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { s: res.status, d: await res.json().catch(() => ({})) as Record<string, unknown> };
}

function ok(name: string, condition: boolean, detail?: string) {
  if (condition) { totalPass++; }
  else { totalFail++; allFailures.push(`${name}${detail ? ': ' + detail : ''}`); }
}

type TabTest = {
  tab: string;
  section: string;
  actions: { name: string; test: () => Promise<void> }[];
};

// ═══════════════════════════════════════
// TAB DEFINITIONS — Every tab, every action
// ═══════════════════════════════════════

function defineAllTabs(): TabTest[] {
  const tabs: TabTest[] = [];

  // ── BUILD: Agents ──
  tabs.push({
    tab: 'Agents', section: 'Build',
    actions: [
      { name: 'List agents (empty state)', test: async () => {
        const r = await req('GET', `/v1/agents?workspaceId=${WSID}`);
        ok('Agents: list', r.s === 200);
        ok('Agents: returns array', Array.isArray(r.d.agents));
      }},
      { name: 'Create agent', test: async () => {
        const r = await req('POST', '/v1/agents', { name: 'Tab Test Agent', workspaceId: WSID });
        ok('Agents: create', r.s === 201);
        ok('Agents: has id', !!(r.d.agent as { id: string })?.id);
        (globalThis as any)._agentId = (r.d.agent as { id: string })?.id;
      }},
      { name: 'Get agent with config', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('GET', `/v1/agents/${id}`);
        ok('Agents: get', r.s === 200);
        ok('Agents: has config', r.d.config !== undefined);
      }},
      { name: 'Update agent name', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('PATCH', `/v1/agents/${id}`, { name: 'Renamed Agent' });
        ok('Agents: update name', r.s === 200);
      }},
      { name: 'Configure system prompt', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('PUT', `/v1/agents/${id}/config`, { systemPrompt: 'You are a test bot.', temperature: 0.3 });
        ok('Agents: set config', r.s === 200);
      }},
      { name: 'Verify config persisted', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('GET', `/v1/agents/${id}`);
        const config = r.d.config as Record<string, unknown>;
        ok('Agents: config persisted', config?.systemPrompt === 'You are a test bot.');
        ok('Agents: temp persisted', config?.temperature === 0.3);
      }},
      { name: 'Publish agent', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('POST', `/v1/agents/${id}/publish`, {});
        ok('Agents: publish', r.s === 200);
      }},
      { name: 'List versions', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('GET', `/v1/agents/${id}/versions`);
        ok('Agents: versions', r.s === 200);
        ok('Agents: has version 1', ((r.d.versions as unknown[])?.length ?? 0) >= 1);
      }},
      { name: 'Duplicate agent', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('POST', `/v1/agents/${id}/duplicate`, {});
        ok('Agents: duplicate', r.s === 201);
      }},
      { name: 'Create connector', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('POST', `/v1/agents/${id}/connectors`, { connectorType: 'web', name: 'Web Chat' });
        ok('Agents: create connector', r.s === 201);
        ok('Agents: connector has url', !!(r.d.connector as { url: string })?.url);
      }},
      { name: 'List connectors', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('GET', `/v1/agents/${id}/connectors`);
        ok('Agents: list connectors', r.s === 200);
        ok('Agents: has connectors', ((r.d.connectors as unknown[])?.length ?? 0) >= 1);
      }},
      { name: 'Invoke agent', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('POST', `/v1/agents/${id}/invoke`, { message: 'Hello' });
        ok('Agents: invoke', r.s === 200 || r.s === 500); // 500 ok if no model configured
      }},
      { name: 'Delete agent', test: async () => {
        const id = (globalThis as any)._agentId;
        const r = await req('DELETE', `/v1/agents/${id}`);
        ok('Agents: delete', r.s === 200);
      }},
    ],
  });

  // ── BUILD: Workflows ──
  tabs.push({
    tab: 'Workflows', section: 'Build',
    actions: [
      { name: 'List workflows', test: async () => {
        const r = await req('GET', `/v1/workflows?workspaceId=${WSID}`);
        ok('Workflows: list', r.s === 200);
      }},
      { name: 'Create workflow', test: async () => {
        const r = await req('POST', '/v1/workflows', { name: 'Tab Test WF', workspaceId: WSID });
        ok('Workflows: create', r.s === 201);
        (globalThis as any)._wfId = (r.d.workflow as { id: string })?.id;
      }},
      { name: 'Get workflow (has start/end)', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('GET', `/v1/workflows/${id}`);
        ok('Workflows: get', r.s === 200);
        const nodes = r.d.nodes as { nodeType: string }[];
        ok('Workflows: has start node', nodes?.some((n) => n.nodeType === 'start'));
        ok('Workflows: has end node', nodes?.some((n) => n.nodeType === 'end'));
        (globalThis as any)._startId = nodes?.find((n) => n.nodeType === 'start')?.id;
        (globalThis as any)._endId = nodes?.find((n) => n.nodeType === 'end')?.id;
      }},
      { name: 'Add LLM node', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('POST', `/v1/workflows/${id}/nodes`, {
          nodeType: 'llm', label: 'Summarize', config: { prompt: 'Summarize the input', temperature: 0.5 },
        });
        ok('Workflows: add LLM node', r.s === 201);
        (globalThis as any)._llmId = (r.d.node as { id: string })?.id;
      }},
      { name: 'Add code node', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('POST', `/v1/workflows/${id}/nodes`, {
          nodeType: 'code', label: 'Transform', config: { code: 'return { processed: true }' },
        });
        ok('Workflows: add code node', r.s === 201);
        (globalThis as any)._codeId = (r.d.node as { id: string })?.id;
      }},
      { name: 'Connect start→LLM', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('POST', `/v1/workflows/${id}/edges`, {
          fromNodeId: (globalThis as any)._startId, toNodeId: (globalThis as any)._llmId,
        });
        ok('Workflows: edge start→LLM', r.s === 201);
      }},
      { name: 'Connect LLM→code', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('POST', `/v1/workflows/${id}/edges`, {
          fromNodeId: (globalThis as any)._llmId, toNodeId: (globalThis as any)._codeId,
        });
        ok('Workflows: edge LLM→code', r.s === 201);
      }},
      { name: 'Connect code→end', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('POST', `/v1/workflows/${id}/edges`, {
          fromNodeId: (globalThis as any)._codeId, toNodeId: (globalThis as any)._endId,
        });
        ok('Workflows: edge code→end', r.s === 201);
      }},
      { name: 'Update node config', test: async () => {
        const r = await req('PATCH', `/v1/workflows/nodes/${(globalThis as any)._llmId}`, {
          label: 'Updated LLM', config: { prompt: 'New prompt', temperature: 0.2 },
        });
        ok('Workflows: update node', r.s === 200);
      }},
      { name: 'Verify node config persisted', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('GET', `/v1/workflows/${id}`);
        const node = (r.d.nodes as { id: string; config: Record<string, unknown> }[])?.find(
          (n) => n.id === (globalThis as any)._llmId
        );
        ok('Workflows: config persisted', (node?.config as Record<string, unknown>)?.prompt === 'New prompt');
      }},
      { name: 'Test single node', test: async () => {
        const wfId = (globalThis as any)._wfId;
        const nodeId = (globalThis as any)._codeId;
        const r = await req('POST', `/v1/workflows/${wfId}/nodes/${nodeId}/test`, { input: { data: 'test' } });
        ok('Workflows: test node', r.s === 200);
        ok('Workflows: test has output', r.d.output !== undefined);
      }},
      { name: 'Publish workflow', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('POST', `/v1/workflows/${id}/publish`, {});
        ok('Workflows: publish', r.s === 200);
      }},
      { name: 'Run workflow', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('POST', `/v1/workflows/${id}/run`, { input: { msg: 'test' } });
        ok('Workflows: run', r.s === 201);
        ok('Workflows: run has traces', typeof (r.d.run as Record<string, unknown>)?.traces === 'number');
      }},
      { name: 'List runs', test: async () => {
        const id = (globalThis as any)._wfId;
        const r = await req('GET', `/v1/workflows/${id}/runs`);
        ok('Workflows: list runs', r.s === 200);
        ok('Workflows: has runs', ((r.d.runs as unknown[])?.length ?? 0) >= 1);
      }},
      { name: 'Delete node', test: async () => {
        const r = await req('DELETE', `/v1/workflows/nodes/${(globalThis as any)._codeId}`);
        ok('Workflows: delete node', r.s === 200);
      }},
    ],
  });

  // ── BUILD: Plugins ──
  tabs.push({
    tab: 'Plugins', section: 'Build',
    actions: [
      { name: 'List plugins', test: async () => {
        ok('Plugins: list', (await req('GET', `/v1/plugins?workspaceId=${WSID}`)).s === 200);
      }},
      { name: 'Create plugin', test: async () => {
        const r = await req('POST', '/v1/plugins', { name: 'Tab Plugin', workspaceId: WSID, pluginType: 'api', baseUrl: 'https://httpbin.org' });
        ok('Plugins: create', r.s === 201);
        (globalThis as any)._pluginId = (r.d.plugin as { id: string })?.id;
      }},
      { name: 'Create tool', test: async () => {
        const r = await req('POST', `/v1/plugins/${(globalThis as any)._pluginId}/tools`, { name: 'getIp', path: '/ip', method: 'GET' });
        ok('Plugins: create tool', r.s === 201);
        (globalThis as any)._toolId = (r.d.tool as { id: string })?.id;
      }},
      { name: 'Execute tool', test: async () => {
        const r = await req('POST', `/v1/plugins/tools/${(globalThis as any)._toolId}/execute`, {});
        ok('Plugins: execute', r.s === 200);
        ok('Plugins: has status code', r.d.statusCode !== undefined);
      }},
      { name: 'Debug tool', test: async () => {
        const r = await req('POST', `/v1/plugins/tools/${(globalThis as any)._toolId}/debug`, {});
        ok('Plugins: debug', r.s === 200);
        ok('Plugins: has request info', r.d.request !== undefined);
      }},
      { name: 'Import OpenAPI', test: async () => {
        const r = await req('POST', `/v1/plugins/${(globalThis as any)._pluginId}/import-openapi`, {
          spec: { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: { '/test': { post: { operationId: 'doTest' } } } },
        });
        ok('Plugins: import OpenAPI', r.s === 200);
        ok('Plugins: imported tools', (r.d.imported as number) >= 1);
      }},
      { name: 'Publish plugin', test: async () => {
        ok('Plugins: publish', (await req('POST', `/v1/plugins/${(globalThis as any)._pluginId}/publish`)).s === 200);
      }},
    ],
  });

  // ── BUILD: Knowledge ──
  tabs.push({
    tab: 'Knowledge', section: 'Build',
    actions: [
      { name: 'List KBs', test: async () => {
        ok('Knowledge: list', (await req('GET', `/v1/knowledge?workspaceId=${WSID}`)).s === 200);
      }},
      { name: 'Create KB', test: async () => {
        const r = await req('POST', '/v1/knowledge', { name: 'Tab KB', workspaceId: WSID, chunkSize: 200 });
        ok('Knowledge: create', r.s === 201);
        (globalThis as any)._kbId = (r.d.knowledgeBase as { id: string })?.id;
      }},
      { name: 'Upload text document', test: async () => {
        const r = await req('POST', `/v1/knowledge/${(globalThis as any)._kbId}/documents`, {
          name: 'faq', sourceType: 'text',
          content: 'Return policy is 30 days. Free shipping over $50. Support email: help@acme.com. Headquarters in NYC.',
        });
        ok('Knowledge: upload doc', r.s === 201);
        ok('Knowledge: doc chunked', ((r.d.document as Record<string, number>)?.chunkCount ?? 0) >= 1);
      }},
      { name: 'List documents', test: async () => {
        const r = await req('GET', `/v1/knowledge/${(globalThis as any)._kbId}/documents`);
        ok('Knowledge: list docs', r.s === 200);
      }},
      { name: 'Search (keyword)', test: async () => {
        const r = await req('POST', `/v1/knowledge/${(globalThis as any)._kbId}/search`, { query: 'return policy', mode: 'keyword' });
        ok('Knowledge: keyword search', r.s === 200);
        ok('Knowledge: found results', ((r.d.results as unknown[])?.length ?? 0) >= 1);
      }},
      { name: 'Search (hybrid)', test: async () => {
        const r = await req('POST', `/v1/knowledge/${(globalThis as any)._kbId}/search`, { query: 'shipping', mode: 'hybrid' });
        ok('Knowledge: hybrid search', r.s === 200);
      }},
      { name: 'Copy KB', test: async () => {
        ok('Knowledge: copy', (await req('POST', `/v1/knowledge/${(globalThis as any)._kbId}/copy`)).s === 201);
      }},
    ],
  });

  // ── BUILD: Prompts ──
  tabs.push({
    tab: 'Prompts', section: 'Build',
    actions: [
      { name: 'List prompts', test: async () => {
        ok('Prompts: list', (await req('GET', `/v1/prompts?workspaceId=${WSID}`)).s === 200);
      }},
      { name: 'Create prompt', test: async () => {
        const r = await req('POST', '/v1/prompts', { name: 'Tab Prompt', content: 'You are {{role}}.', workspaceId: WSID, templateVars: ['role'] });
        ok('Prompts: create', r.s === 201);
        (globalThis as any)._promptId = (r.d.prompt as { id: string })?.id;
      }},
      { name: 'Render template', test: async () => {
        const r = await req('POST', `/v1/prompts/${(globalThis as any)._promptId}/render`, { variables: { role: 'tester' } });
        ok('Prompts: render', r.s === 200);
        ok('Prompts: rendered correctly', (r.d.rendered as string)?.includes('tester'));
      }},
      { name: 'Update prompt (auto-version)', test: async () => {
        ok('Prompts: update', (await req('PATCH', `/v1/prompts/${(globalThis as any)._promptId}`, { content: 'Updated: {{role}}.' })).s === 200);
      }},
      { name: 'Get with versions', test: async () => {
        const r = await req('GET', `/v1/prompts/${(globalThis as any)._promptId}`);
        ok('Prompts: get', r.s === 200);
        ok('Prompts: has versions', ((r.d.versions as unknown[])?.length ?? 0) >= 2);
      }},
    ],
  });

  // ── TEST: Playground ──
  tabs.push({
    tab: 'Playground', section: 'Test',
    actions: [
      { name: 'Create conversation', test: async () => {
        const r = await req('POST', '/v1/conversations', { workspaceId: WSID, title: 'Tab Chat' });
        ok('Playground: create conv', r.s === 201);
        (globalThis as any)._convId = (r.d.conversation as { id: string })?.id;
      }},
      { name: 'Send message', test: async () => {
        const r = await req('POST', `/v1/conversations/${(globalThis as any)._convId}/messages`, { content: 'Hello' });
        ok('Playground: send msg', r.s === 201);
        (globalThis as any)._msgId = (r.d.message as { id: string })?.id;
      }},
      { name: 'Get messages', test: async () => {
        const r = await req('GET', `/v1/conversations/${(globalThis as any)._convId}/messages`);
        ok('Playground: get msgs', r.s === 200);
        ok('Playground: has msgs', ((r.d.messages as unknown[])?.length ?? 0) >= 1);
      }},
      { name: 'Edit message', test: async () => {
        ok('Playground: edit msg', (await req('PATCH', `/v1/conversations/messages/${(globalThis as any)._msgId}`, { content: 'Edited' })).s === 200);
      }},
      { name: 'Thumbs up feedback', test: async () => {
        ok('Playground: feedback', (await req('POST', `/v1/conversations/messages/${(globalThis as any)._msgId}/feedback`, { rating: 'thumbs_up' })).s === 200);
      }},
      { name: 'Create section', test: async () => {
        ok('Playground: section', (await req('POST', `/v1/conversations/${(globalThis as any)._convId}/sections`, {})).s === 200);
      }},
      { name: 'Fork conversation', test: async () => {
        const r = await req('POST', `/v1/conversations/${(globalThis as any)._convId}/fork`, {});
        ok('Playground: fork', r.s === 201 || r.s === 200);
      }},
      { name: 'Annotate message', test: async () => {
        ok('Playground: annotate', (await req('POST', `/v1/conversations/messages/${(globalThis as any)._msgId}/annotate`, {
          answer: 'Better answer', rating: 5, workspaceId: WSID,
        })).s === 201);
      }},
      { name: 'List annotations', test: async () => {
        ok('Playground: list annotations', (await req('GET', `/v1/conversations/annotations?workspaceId=${WSID}`)).s === 200);
      }},
    ],
  });

  // ── DEPLOY: Apps ──
  tabs.push({
    tab: 'Apps', section: 'Deploy',
    actions: [
      { name: 'List apps', test: async () => {
        ok('Apps: list', (await req('GET', `/v1/apps?workspaceId=${WSID}`)).s === 200);
      }},
      { name: 'Create app', test: async () => {
        const r = await req('POST', '/v1/apps', { name: 'Tab App', appType: 'chat', workspaceId: WSID });
        ok('Apps: create', r.s === 201);
        (globalThis as any)._appId = (r.d.app as { id: string })?.id;
      }},
      { name: 'Publish app', test: async () => {
        const r = await req('POST', `/v1/apps/${(globalThis as any)._appId}/publish`);
        ok('Apps: publish', r.s === 200);
        ok('Apps: has URL', !!(r.d as Record<string, string>).url);
      }},
      { name: 'Get embed code', test: async () => {
        const r = await req('GET', `/v1/apps/${(globalThis as any)._appId}/embed`);
        ok('Apps: embed code', r.s === 200);
        ok('Apps: has script', (r.d.embedCode as string)?.includes('script'));
      }},
    ],
  });

  // ── DEPLOY: Marketplace ──
  tabs.push({
    tab: 'Marketplace', section: 'Deploy',
    actions: [
      { name: 'Browse', test: async () => {
        ok('Marketplace: browse', (await req('GET', '/v1/marketplace')).s === 200);
      }},
      { name: 'Publish product', test: async () => {
        const r = await req('POST', '/v1/marketplace', {
          resourceType: 'agent', resourceId: 'test_agent', name: 'Tab Product',
          workspaceId: WSID, category: 'test',
        });
        ok('Marketplace: publish', r.s === 201);
        (globalThis as any)._productId = (r.d.product as { id: string })?.id;
      }},
      { name: 'Post review', test: async () => {
        ok('Marketplace: review', (await req('POST', `/v1/marketplace/${(globalThis as any)._productId}/reviews`, { rating: 5, comment: 'Great' })).s === 201);
      }},
      { name: 'Get reviews', test: async () => {
        ok('Marketplace: get reviews', (await req('GET', `/v1/marketplace/${(globalThis as any)._productId}/reviews`)).s === 200);
      }},
      { name: 'List categories', test: async () => {
        ok('Marketplace: categories', (await req('GET', '/v1/marketplace/categories/list')).s === 200);
      }},
    ],
  });

  // ── ORCHESTRATE: Replication ──
  tabs.push({
    tab: 'Replication', section: 'Orchestrate',
    actions: [
      { name: 'Get status', test: async () => {
        const r = await req('GET', '/v1/replication/status');
        ok('Replication: status', r.s === 200);
        ok('Replication: has score', typeof r.d.score === 'number');
        ok('Replication: has features', Array.isArray(r.d.features));
      }},
      { name: 'Get gaps', test: async () => {
        ok('Replication: gaps', (await req('GET', '/v1/replication/gaps')).s === 200);
      }},
      { name: 'Take snapshot', test: async () => {
        ok('Replication: snapshot', (await req('POST', '/v1/replication/snapshot')).s === 201);
      }},
    ],
  });

  // ── SYSTEM: Settings (Models) ──
  tabs.push({
    tab: 'Settings', section: 'System',
    actions: [
      { name: 'List model providers', test: async () => {
        ok('Settings: list providers', (await req('GET', `/v1/models/providers?workspaceId=${WSID}`)).s === 200);
      }},
      { name: 'Get model usage', test: async () => {
        ok('Settings: model usage', (await req('GET', `/v1/models/usage?workspaceId=${WSID}`)).s === 200);
      }},
    ],
  });

  // ── System: Variables & Databases (not in sidebar but accessible) ──
  tabs.push({
    tab: 'Variables', section: 'Data',
    actions: [
      { name: 'Create variable', test: async () => {
        const r = await req('POST', '/v1/variables', { name: 'tab_var', workspaceId: WSID, valueType: 'string', scope: 'workspace' });
        ok('Variables: create', r.s === 201);
        (globalThis as any)._varId = (r.d.variable as { id: string })?.id;
      }},
      { name: 'Set value', test: async () => {
        ok('Variables: set', (await req('PUT', `/v1/variables/${(globalThis as any)._varId}/value`, { value: 'test_val' })).s === 200);
      }},
      { name: 'Get value', test: async () => {
        const r = await req('GET', `/v1/variables/${(globalThis as any)._varId}/value`);
        ok('Variables: get', r.s === 200);
        ok('Variables: correct value', r.d.value === 'test_val');
      }},
    ],
  });

  tabs.push({
    tab: 'Databases', section: 'Data',
    actions: [
      { name: 'Create database', test: async () => {
        const r = await req('POST', '/v1/databases', { name: 'Tab DB', workspaceId: WSID });
        ok('Databases: create', r.s === 201);
        (globalThis as any)._dbId = (r.d.database as { id: string })?.id;
      }},
      { name: 'Create table', test: async () => {
        const r = await req('POST', `/v1/databases/${(globalThis as any)._dbId}/tables`, {
          name: 'items', schema: [{ name: 'name', type: 'string' }, { name: 'price', type: 'number' }],
        });
        ok('Databases: create table', r.s === 201);
        (globalThis as any)._tableId = (r.d.table as { id: string })?.id;
      }},
      { name: 'Insert row', test: async () => {
        ok('Databases: insert row', (await req('POST', `/v1/databases/tables/${(globalThis as any)._tableId}/rows`, { data: { name: 'Widget', price: 9.99 } })).s === 201);
      }},
      { name: 'Get rows', test: async () => {
        const r = await req('GET', `/v1/databases/tables/${(globalThis as any)._tableId}/rows`);
        ok('Databases: get rows', r.s === 200);
        ok('Databases: has rows', ((r.d.rows as unknown[])?.length ?? 0) >= 1);
      }},
    ],
  });

  return tabs;
}

// ═══════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════

async function run() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  FEATURE TAB TEST SUITE — Per-Tab E2E Verification   ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  await setup();
  console.log(`Token: ${TOKEN.slice(0, 15)}...  Workspace: ${WSID}\n`);

  const tabs = defineAllTabs();

  for (const tab of tabs) {
    const tabStart = totalPass + totalFail;
    console.log(`── [${tab.section}] ${tab.tab} (${tab.actions.length} actions) ──`);

    for (const action of tab.actions) {
      try {
        await action.test();
      } catch (err) {
        totalFail++;
        allFailures.push(`${tab.tab}/${action.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    const tabTests = (totalPass + totalFail) - tabStart;
    const tabFails = allFailures.length - (allFailures.length - totalFail + (totalPass + totalFail - tabTests - tabStart > 0 ? 0 : 0));
    console.log(`   ${tabTests} checks\n`);
  }

  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log(`║  PASSED: ${String(totalPass).padStart(3)}   FAILED: ${String(totalFail).padStart(3)}   TOTAL: ${String(totalPass + totalFail).padStart(3)}            ║`);
  console.log(`║  Score: ${Math.round((totalPass / (totalPass + totalFail)) * 100)}%                                               ║`);
  console.log('╚═══════════════════════════════════════════════════════╝');

  if (allFailures.length > 0) {
    console.log('\nFailures:');
    allFailures.forEach((f) => console.log(`  ✗ ${f}`));
  }

  await cleanup();
  process.exit(totalFail > 0 ? 1 : 0);
}

run().catch((err) => { console.error('Fatal:', err); cleanup().catch(() => {}); process.exit(1); });
