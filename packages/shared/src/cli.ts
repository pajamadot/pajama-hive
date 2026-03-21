#!/usr/bin/env node
/**
 * Pajama Hive CLI — Platform operations from the terminal.
 *
 * Usage:
 *   hive-ops agent list
 *   hive-ops agent create "My Bot"
 *   hive-ops agent invoke <id> "Hello"
 *   hive-ops workflow list
 *   hive-ops workflow run <id> '{"input":"hello"}'
 *   hive-ops kb list
 *   hive-ops kb upload <id> <file>
 *   hive-ops kb search <id> "query"
 *   hive-ops chat <agent_id> "message"
 *   hive-ops prompt render <id> '{"role":"tester"}'
 *   hive-ops status
 *
 * Auth: Set HIVE_API_KEY env var or use `hive login` (Rust CLI)
 */

import { HiveSDK } from './sdk.js';

const API_URL = process.env.HIVE_API_URL ?? 'https://hive-api.pajamadot.com';
const TOKEN = process.env.HIVE_API_KEY ?? '';

if (!TOKEN) {
  console.error('Error: Set HIVE_API_KEY environment variable.');
  console.error('  export HIVE_API_KEY=hive_your_key_here');
  process.exit(1);
}

const sdk = new HiveSDK({ baseUrl: API_URL, token: TOKEN });
const [, , domain, action, ...rest] = process.argv;

async function getWsId(): Promise<string> {
  const { workspaces } = await sdk.listWorkspaces();
  return (workspaces as { id: string }[])[0]?.id ?? 'default';
}

async function run() {
  const wsId = await getWsId();

  switch (domain) {
    case 'agent': {
      switch (action) {
        case 'list': {
          const { agents } = await sdk.listAgents(wsId) as { agents: { id: string; name: string; status: string }[] };
          if (agents.length === 0) { console.log('No agents.'); break; }
          console.log('ID'.padEnd(24) + 'Name'.padEnd(30) + 'Status');
          console.log('-'.repeat(64));
          for (const a of agents) console.log(`${a.id.padEnd(24)}${a.name.padEnd(30)}${a.status}`);
          break;
        }
        case 'create': {
          const name = rest[0] ?? 'New Agent';
          const result = await sdk.createAgent(name, wsId);
          const agent = (result as { agent: { id: string } }).agent;
          console.log(`Created agent: ${agent.id}`);
          break;
        }
        case 'invoke': {
          const [agentId, ...msgParts] = rest;
          const message = msgParts.join(' ');
          if (!agentId || !message) { console.error('Usage: hive-ops agent invoke <id> <message>'); break; }
          const result = await sdk.invokeAgent(agentId, message);
          console.log((result as { response: string }).response);
          break;
        }
        case 'publish': {
          await sdk.publishAgent(rest[0]);
          console.log('Published.');
          break;
        }
        case 'delete': {
          await sdk.deleteAgent(rest[0]);
          console.log('Deleted.');
          break;
        }
        default:
          console.log('Usage: hive-ops agent [list|create|invoke|publish|delete]');
      }
      break;
    }

    case 'workflow': {
      switch (action) {
        case 'list': {
          const { workflows } = await sdk.listWorkflows(wsId) as { workflows: { id: string; name: string; status: string }[] };
          if (workflows.length === 0) { console.log('No workflows.'); break; }
          console.log('ID'.padEnd(24) + 'Name'.padEnd(30) + 'Status');
          console.log('-'.repeat(64));
          for (const w of workflows) console.log(`${w.id.padEnd(24)}${w.name.padEnd(30)}${w.status}`);
          break;
        }
        case 'create': {
          const name = rest[0] ?? 'New Workflow';
          const result = await sdk.createWorkflow(name, wsId);
          console.log(`Created workflow: ${(result as { workflow: { id: string } }).workflow.id}`);
          break;
        }
        case 'run': {
          const [wfId, inputJson] = rest;
          if (!wfId) { console.error('Usage: hive-ops workflow run <id> [input_json]'); break; }
          let input = {};
          if (inputJson) try { input = JSON.parse(inputJson); } catch { input = { message: inputJson }; }
          const result = await sdk.runWorkflow(wfId, input);
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        default:
          console.log('Usage: hive-ops workflow [list|create|run]');
      }
      break;
    }

    case 'kb': {
      switch (action) {
        case 'list': {
          const { knowledgeBases } = await sdk.listKnowledgeBases(wsId) as { knowledgeBases: { id: string; name: string; documentCount: number }[] };
          if (knowledgeBases.length === 0) { console.log('No knowledge bases.'); break; }
          console.log('ID'.padEnd(24) + 'Name'.padEnd(25) + 'Docs');
          console.log('-'.repeat(55));
          for (const kb of knowledgeBases) console.log(`${kb.id.padEnd(24)}${kb.name.padEnd(25)}${kb.documentCount}`);
          break;
        }
        case 'create': {
          const name = rest[0] ?? 'New KB';
          const result = await sdk.createKnowledgeBase(name, wsId);
          console.log(`Created KB: ${(result as { knowledgeBase: { id: string } }).knowledgeBase.id}`);
          break;
        }
        case 'upload': {
          const [kbId, filePath] = rest;
          if (!kbId || !filePath) { console.error('Usage: hive-ops kb upload <kb_id> <file_path>'); break; }
          const { readFileSync } = await import('fs');
          const content = readFileSync(filePath, 'utf8');
          const name = filePath.split('/').pop() ?? 'document';
          const result = await sdk.uploadDocument(kbId, name, content);
          const doc = (result as { document: { chunkCount: number } }).document;
          console.log(`Uploaded "${name}" — ${doc.chunkCount} chunks`);
          break;
        }
        case 'search': {
          const [kbId, ...queryParts] = rest;
          const query = queryParts.join(' ');
          if (!kbId || !query) { console.error('Usage: hive-ops kb search <kb_id> <query>'); break; }
          const result = await sdk.searchKnowledge(kbId, query);
          const results = (result as { results: { content: string; score: number }[] }).results;
          if (results.length === 0) { console.log('No results.'); break; }
          for (const [i, r] of results.entries()) {
            console.log(`\n[${i + 1}] score: ${r.score.toFixed(2)}`);
            console.log(r.content.slice(0, 200));
          }
          break;
        }
        default:
          console.log('Usage: hive-ops kb [list|create|upload|search]');
      }
      break;
    }

    case 'chat': {
      const agentId = action;
      const message = rest.join(' ');
      if (!agentId || !message) {
        console.error('Usage: hive-ops chat <agent_id> <message>');
        break;
      }
      const result = await sdk.invokeAgent(agentId, message);
      console.log((result as { response: string }).response);
      break;
    }

    case 'prompt': {
      switch (action) {
        case 'list': {
          const { prompts } = await sdk.listPrompts(wsId) as { prompts: { id: string; name: string }[] };
          for (const p of prompts) console.log(`${p.id.padEnd(24)}${p.name}`);
          break;
        }
        case 'render': {
          const [promptId, varsJson] = rest;
          if (!promptId || !varsJson) { console.error('Usage: hive-ops prompt render <id> \'{"key":"value"}\''); break; }
          const vars = JSON.parse(varsJson);
          const result = await sdk.renderPrompt(promptId, vars);
          console.log((result as { rendered: string }).rendered);
          break;
        }
        default:
          console.log('Usage: hive-ops prompt [list|render]');
      }
      break;
    }

    case 'status': {
      const result = await sdk.getReplicationStatus();
      const r = result as { score: number; metrics: Record<string, number> };
      console.log(`Parity Score: ${r.score}%`);
      if (r.metrics) {
        console.log(`Features: ${r.metrics.done ?? 0} done, ${r.metrics.stub ?? 0} stub`);
        console.log(`Tables: ${r.metrics.tables}, Routes: ${r.metrics.apiRoutes}, Pages: ${r.metrics.frontendPages}`);
      }
      break;
    }

    default:
      console.log(`
Pajama Hive CLI

Usage:
  hive-ops agent list|create|invoke|publish|delete
  hive-ops workflow list|create|run
  hive-ops kb list|create|upload|search
  hive-ops chat <agent_id> <message>
  hive-ops prompt list|render
  hive-ops status

Environment:
  HIVE_API_KEY    API key for authentication
  HIVE_API_URL    API base URL (default: https://hive-api.pajamadot.com)
      `.trim());
  }
}

run().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
