/**
 * MCP Server Endpoints
 *
 * Implements Model Context Protocol (MCP) for AI tool integration.
 * Allows Claude, Cursor, Windsurf, and other AI tools to discover
 * and use Hive agents, workflows, and knowledge bases as tools.
 *
 * Protocol: JSON-RPC 2.0 over HTTP
 * Auth: Bearer token (API key or Clerk JWT)
 */

import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { agents, agentConfigs, workflowDefinitions, knowledgeBases, conversations, messages, plugins, pluginTools, prompts } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { chatCompletion } from '../lib/llm.js';
import { executeWorkflow } from '../lib/workflow-executor.js';
import { executePluginTool } from '../lib/plugin-executor.js';
import { resolveWorkspaceId } from '../lib/workspace.js';
import type { Env } from '../types/index.js';
// MCP tools defined inline to avoid import issues
const HIVE_MCP_TOOLS = [
  { name: 'hive_agent_invoke', description: 'Invoke a Hive AI agent with a message', inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, message: { type: 'string' } }, required: ['agent_id', 'message'] } },
  { name: 'hive_agent_list', description: 'List all AI agents', inputSchema: { type: 'object', properties: { workspace_id: { type: 'string' } } } },
  { name: 'hive_agent_create', description: 'Create a new AI agent', inputSchema: { type: 'object', properties: { name: { type: 'string' }, system_prompt: { type: 'string' } }, required: ['name'] } },
  { name: 'hive_workflow_run', description: 'Run a workflow with input', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, input: { type: 'object' } }, required: ['workflow_id'] } },
  { name: 'hive_workflow_list', description: 'List all workflows', inputSchema: { type: 'object', properties: { workspace_id: { type: 'string' } } } },
  { name: 'hive_knowledge_search', description: 'Search a knowledge base', inputSchema: { type: 'object', properties: { knowledge_base_id: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number' } }, required: ['knowledge_base_id', 'query'] } },
  { name: 'hive_knowledge_list', description: 'List knowledge bases', inputSchema: { type: 'object', properties: { workspace_id: { type: 'string' } } } },
  { name: 'hive_knowledge_upload', description: 'Upload a document to a knowledge base', inputSchema: { type: 'object', properties: { knowledge_base_id: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } }, required: ['knowledge_base_id', 'name', 'content'] } },
  { name: 'hive_chat', description: 'Chat with an AI agent', inputSchema: { type: 'object', properties: { message: { type: 'string' }, conversation_id: { type: 'string' }, agent_id: { type: 'string' } }, required: ['message'] } },
  { name: 'hive_plugin_execute', description: 'Execute a plugin tool', inputSchema: { type: 'object', properties: { tool_id: { type: 'string' }, input: { type: 'object' } }, required: ['tool_id'] } },
  { name: 'hive_prompt_render', description: 'Render a prompt template', inputSchema: { type: 'object', properties: { prompt_id: { type: 'string' }, variables: { type: 'object' } }, required: ['prompt_id', 'variables'] } },
  { name: 'hive_database_query', description: 'Query a database table', inputSchema: { type: 'object', properties: { table_id: { type: 'string' }, query: { type: 'string' } }, required: ['table_id', 'query'] } },
];

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// MCP Tool List (tools/list)
app.get('/tools', async (c) => {
  return c.json({ tools: HIVE_MCP_TOOLS });
});

// MCP Tool Call (tools/call)
app.post('/tools/call', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const { name, arguments: args } = body;

  if (!name) return c.json({ error: 'Missing tool name' }, 400);

  const wsId = await resolveWorkspaceId(db, userId, args?.workspace_id ?? 'default');

  try {
    switch (name) {
      case 'hive_agent_invoke': {
        const agentId = args.agent_id;
        const message = args.message;
        if (!agentId || !message) return c.json({ error: 'agent_id and message required' }, 400);

        const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
        if (!agent) return c.json({ error: 'Agent not found' }, 404);

        const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, agentId));
        const systemPrompt = config?.systemPrompt ?? 'You are a helpful assistant.';

        const result = await chatCompletion(db, agent.workspaceId, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ], { modelConfigId: config?.modelConfigId, temperature: config?.temperature ?? 0.7 });

        return c.json({ content: [{ type: 'text', text: result.content }] });
      }

      case 'hive_agent_list': {
        const agentList = await db.select().from(agents)
          .where(eq(agents.workspaceId, wsId)).limit(50);
        const text = agentList.map((a) => `- ${a.name} (${a.id}) [${a.status}]`).join('\n');
        return c.json({ content: [{ type: 'text', text: text || 'No agents found.' }] });
      }

      case 'hive_agent_create': {
        const id = nanoid();
        const now = new Date();
        await db.insert(agents).values({
          id, workspaceId: wsId, name: args.name ?? 'New Agent',
          mode: 'single', createdBy: userId, createdAt: now, updatedAt: now,
        });
        if (args.system_prompt) {
          await db.insert(agentConfigs).values({
            id: nanoid(), agentId: id, systemPrompt: args.system_prompt,
            memoryEnabled: true, updatedAt: now,
          });
        }
        return c.json({ content: [{ type: 'text', text: `Created agent "${args.name}" with ID: ${id}` }] });
      }

      case 'hive_workflow_run': {
        const workflowId = args.workflow_id;
        if (!workflowId) return c.json({ error: 'workflow_id required' }, 400);

        const [wf] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, workflowId));
        if (!wf) return c.json({ error: 'Workflow not found' }, 404);

        const { workflowRuns } = await import('../db/schema.js');
        const runId = nanoid();
        await db.insert(workflowRuns).values({
          id: runId, workflowId, status: 'pending', triggerType: 'api',
          input: args.input ?? null, createdAt: new Date(),
        });

        const result = await executeWorkflow(db, runId, workflowId, wf.workspaceId, args.input ?? {});
        return c.json({ content: [{ type: 'text', text: JSON.stringify(result.output, null, 2) }] });
      }

      case 'hive_workflow_list': {
        const wfList = await db.select().from(workflowDefinitions)
          .where(eq(workflowDefinitions.workspaceId, wsId)).limit(50);
        const text = wfList.map((w) => `- ${w.name} (${w.id}) [${w.status}]`).join('\n');
        return c.json({ content: [{ type: 'text', text: text || 'No workflows found.' }] });
      }

      case 'hive_knowledge_search': {
        const kbId = args.knowledge_base_id;
        const query = args.query;
        if (!kbId || !query) return c.json({ error: 'knowledge_base_id and query required' }, 400);

        const { documentChunks } = await import('../db/schema.js');
        const chunks = await db.select().from(documentChunks)
          .where(eq(documentChunks.knowledgeBaseId, kbId));

        const terms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
        const results = chunks.map((c) => {
          const score = terms.filter((t: string) => c.content.toLowerCase().includes(t)).length;
          return { content: c.content, score, chunkIndex: c.chunkIndex };
        }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, args.limit ?? 5);

        const text = results.map((r, i) => `[${i + 1}] (score: ${r.score})\n${r.content}`).join('\n\n');
        return c.json({ content: [{ type: 'text', text: text || 'No results found.' }] });
      }

      case 'hive_knowledge_list': {
        const kbs = await db.select().from(knowledgeBases)
          .where(eq(knowledgeBases.workspaceId, wsId)).limit(50);
        const text = kbs.map((k) => `- ${k.name} (${k.id}) [${k.documentCount} docs, ${k.totalChunks} chunks]`).join('\n');
        return c.json({ content: [{ type: 'text', text: text || 'No knowledge bases found.' }] });
      }

      case 'hive_knowledge_upload': {
        const { documents, documentChunks: chunks } = await import('../db/schema.js');
        const { processDocument } = await import('../lib/chunker.js');
        const kbId = args.knowledge_base_id;
        const docName = args.name;
        const content = args.content;

        const docId = nanoid();
        const now = new Date();
        await db.insert(documents).values({
          id: docId, knowledgeBaseId: kbId, name: docName,
          sourceType: 'text', status: 'completed', createdAt: now, updatedAt: now,
        });

        const processed = processDocument(content, docId, 500, 50);
        if (processed.length > 0) {
          await db.insert(chunks).values(processed.map((c) => ({
            id: c.id, documentId: docId, knowledgeBaseId: kbId,
            content: c.content, chunkIndex: c.chunkIndex,
            metadata: c.metadata, tokenCount: c.tokenCount, createdAt: now, updatedAt: now,
          })));
        }

        return c.json({ content: [{ type: 'text', text: `Uploaded "${docName}" — ${processed.length} chunks created.` }] });
      }

      case 'hive_chat': {
        const message = args.message;
        if (!message) return c.json({ error: 'message required' }, 400);

        let convId = args.conversation_id;
        if (!convId) {
          convId = nanoid();
          await db.insert(conversations).values({
            id: convId, workspaceId: wsId, userId, agentId: args.agent_id ?? null,
            createdAt: new Date(), updatedAt: new Date(),
          });
        }

        await db.insert(messages).values({
          id: nanoid(), conversationId: convId, role: 'user',
          contentType: 'text', content: message, createdAt: new Date(), updatedAt: new Date(),
        });

        let systemPrompt = 'You are a helpful assistant.';
        if (args.agent_id) {
          const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, args.agent_id));
          if (config?.systemPrompt) systemPrompt = config.systemPrompt;
        }

        const history = await db.select().from(messages)
          .where(eq(messages.conversationId, convId)).orderBy(messages.createdAt).limit(20);

        const result = await chatCompletion(db, wsId, [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ]);

        await db.insert(messages).values({
          id: nanoid(), conversationId: convId, role: 'assistant',
          contentType: 'text', content: result.content, createdAt: new Date(), updatedAt: new Date(),
        });

        return c.json({ content: [{ type: 'text', text: result.content }] });
      }

      case 'hive_plugin_execute': {
        const toolId = args.tool_id;
        if (!toolId) return c.json({ error: 'tool_id required' }, 400);
        const result = await executePluginTool(db, toolId, args.input ?? {});
        return c.json({ content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] });
      }

      case 'hive_prompt_render': {
        const promptId = args.prompt_id;
        const variables = args.variables ?? {};
        const [prompt] = await db.select().from(prompts).where(eq(prompts.id, promptId));
        if (!prompt) return c.json({ error: 'Prompt not found' }, 404);

        let rendered = prompt.content;
        for (const [key, value] of Object.entries(variables)) {
          rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        }
        return c.json({ content: [{ type: 'text', text: rendered }] });
      }

      case 'hive_database_query': {
        const { userTables, userTableRows } = await import('../db/schema.js');
        const tableId = args.table_id;
        const query = args.query;
        const rows = await db.select().from(userTableRows).where(eq(userTableRows.tableId, tableId)).limit(100);
        const text = rows.length > 0
          ? JSON.stringify(rows.map((r) => r.data), null, 2)
          : 'No rows found.';
        return c.json({ content: [{ type: 'text', text }] });
      }

      default:
        return c.json({ error: `Unknown tool: ${name}` }, 400);
    }
  } catch (err) {
    return c.json({
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}` }],
      isError: true,
    });
  }
});

// MCP Server Info
app.get('/', async (c) => {
  return c.json({
    name: 'pajama-hive',
    version: '1.0.0',
    description: 'AI Agent Development Platform — agents, workflows, knowledge bases, plugins',
    capabilities: { tools: { listChanged: false } },
    instructions: 'Use hive_agent_invoke to chat with agents, hive_workflow_run to execute workflows, hive_knowledge_search to search knowledge bases.',
  });
});

export default app;
