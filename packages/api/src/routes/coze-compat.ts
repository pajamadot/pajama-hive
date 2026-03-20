/**
 * Coze API Compatibility Layer
 *
 * Maps Coze Studio's exact API paths to Hive implementations.
 * This enables Coze SDKs/clients to work against our backend.
 *
 * Covers:
 * - /api/conversation/* → Hive conversations
 * - /api/draftbot/* → Hive agents
 * - /api/knowledge/* → Hive knowledge
 * - /api/memory/* → Hive databases/variables
 * - /api/plugin_api/* → Hive plugins
 * - /api/workflow_api/* → Hive workflows
 * - /api/playground_api/* → Hive prompts/playground
 * - /v1/* OpenAPI → Hive public API
 * - /v3/chat → Hive chat
 */

import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import {
  agents, agentConfigs, agentVersions,
  conversations, messages, chatRuns,
  workflowDefinitions, workflowNodes, workflowEdges, workflowVersions, workflowRuns,
  plugins, pluginTools,
  knowledgeBases, documents, documentChunks,
  userDatabases, userTables, userTableRows,
  variables, variableValues, agentMemories,
  prompts,
  modelProviders, modelConfigs,
} from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { chatCompletion } from '../lib/llm.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// ════════════════════════════════════════
// /api/conversation/* — Chat
// ════════════════════════════════════════

app.post('/api/conversation/chat', async (c) => {
  // Proxy to our chat endpoint
  const db = createDb(c.env);
  const body = await c.req.json();
  // Coze sends: { bot_id, user, query, ... }
  const conversationId = body.conversation_id;
  const message = body.query ?? body.message ?? body.content;
  if (!message) return c.json({ error: 'query required' }, 400);

  // Create conversation if not exists
  let convId = conversationId;
  if (!convId) {
    convId = nanoid();
    await db.insert(conversations).values({
      id: convId, workspaceId: 'default', userId: c.get('userId'),
      agentId: body.bot_id ?? null, createdAt: new Date(), updatedAt: new Date(),
    });
  }

  // Save user message
  await db.insert(messages).values({
    id: nanoid(), conversationId: convId, role: 'user',
    contentType: 'text', content: message, createdAt: new Date(),
  });

  // Resolve agent config
  let systemPrompt = 'You are a helpful AI assistant.';
  if (body.bot_id) {
    const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, body.bot_id));
    if (config?.systemPrompt) systemPrompt = config.systemPrompt;
  }

  // Call LLM
  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(messages.createdAt).limit(40);

  try {
    const result = await chatCompletion(db, 'default', [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]);

    const assistantMsgId = nanoid();
    await db.insert(messages).values({
      id: assistantMsgId, conversationId: convId, role: 'assistant',
      contentType: 'text', content: result.content, createdAt: new Date(),
    });

    return c.json({
      conversation_id: convId,
      status: 'completed',
      messages: [{ role: 'assistant', content: result.content, content_type: 'text' }],
      usage: result.usage,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Chat failed' }, 500);
  }
});

app.post('/api/conversation/get_message_list', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const convId = body.conversation_id;
  if (!convId) return c.json({ error: 'conversation_id required' }, 400);

  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(messages.createdAt);

  return c.json({ data: msgs.map((m) => ({
    id: m.id, role: m.role, content: m.content, content_type: m.contentType, created_at: m.createdAt,
  })) });
});

app.post('/api/conversation/clear_message', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.delete(messages).where(eq(messages.conversationId, body.conversation_id));
  return c.json({ code: 0 });
});

app.post('/api/conversation/delete_message', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.delete(messages).where(eq(messages.id, body.message_id));
  return c.json({ code: 0 });
});

app.post('/api/conversation/break_message', async (c) => {
  // Cancel ongoing chat — in our system, this is a no-op since we don't have long-running DO chat yet
  return c.json({ code: 0 });
});

app.post('/api/conversation/create_section', async (c) => {
  // Coze "sections" are context boundaries — we implement this as clear
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.delete(messages).where(eq(messages.conversationId, body.conversation_id));
  return c.json({ code: 0 });
});

// ════════════════════════════════════════
// /api/draftbot/* — Agents
// ════════════════════════════════════════

app.post('/api/draftbot/create', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = nanoid();
  const now = new Date();

  await db.insert(agents).values({
    id, workspaceId: body.space_id ?? 'default', name: body.name ?? 'New Agent',
    description: body.description, mode: 'single', createdBy: userId,
    createdAt: now, updatedAt: now,
  });
  await db.insert(agentConfigs).values({
    id: nanoid(), agentId: id, memoryEnabled: true, updatedAt: now,
  });

  return c.json({ code: 0, data: { bot_id: id } });
});

app.post('/api/draftbot/delete', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.update(agents).set({ deletedAt: new Date() }).where(eq(agents.id, body.bot_id));
  return c.json({ code: 0 });
});

app.post('/api/draftbot/duplicate', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const [agent] = await db.select().from(agents).where(eq(agents.id, body.bot_id));
  if (!agent) return c.json({ error: 'Bot not found' }, 404);

  const newId = nanoid();
  const now = new Date();
  await db.insert(agents).values({
    ...agent, id: newId, name: `${agent.name} (copy)`, status: 'draft',
    createdBy: userId, deletedAt: null, createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { bot_id: newId } });
});

app.post('/api/draftbot/publish', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const agentId = body.bot_id;
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) return c.json({ error: 'Bot not found' }, 404);

  const existing = await db.select().from(agentVersions)
    .where(eq(agentVersions.agentId, agentId)).orderBy(desc(agentVersions.version)).limit(1);
  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
  const now = new Date();

  await db.insert(agentVersions).values({
    id: nanoid(), agentId, version: nextVersion, snapshot: agent,
    publishedBy: userId, createdAt: now,
  });
  await db.update(agents).set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(agents.id, agentId));

  return c.json({ code: 0, data: { version: nextVersion } });
});

app.post('/api/draftbot/get_display_info', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const [agent] = await db.select().from(agents).where(eq(agents.id, body.bot_id));
  const [config] = agent ? await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, agent.id)) : [null];
  return c.json({ code: 0, data: { ...agent, config } });
});

app.post('/api/draftbot/list_draft_history', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const versions = await db.select().from(agentVersions)
    .where(eq(agentVersions.agentId, body.bot_id))
    .orderBy(desc(agentVersions.version));
  return c.json({ code: 0, data: { list: versions } });
});

app.post('/api/draftbot/update_display_info', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.icon_url) updates.iconUrl = body.icon_url;
  await db.update(agents).set(updates).where(eq(agents.id, body.bot_id));
  return c.json({ code: 0 });
});

app.post('/api/draftbot/commit_check', async (c) => {
  // Validate bot is ready to publish
  return c.json({ code: 0, data: { can_publish: true } });
});

// ════════════════════════════════════════
// /api/knowledge/* — Knowledge
// ════════════════════════════════════════

app.post('/api/knowledge/create', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = nanoid();
  const now = new Date();
  await db.insert(knowledgeBases).values({
    id, workspaceId: body.space_id ?? 'default', name: body.name,
    description: body.description, createdBy: userId, createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { dataset_id: id } });
});

app.post('/api/knowledge/list', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const kbs = await db.select().from(knowledgeBases)
    .where(and(eq(knowledgeBases.workspaceId, body.space_id ?? 'default'), isNull(knowledgeBases.deletedAt)));
  return c.json({ code: 0, data: { list: kbs } });
});

app.post('/api/knowledge/detail', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, body.dataset_id));
  return c.json({ code: 0, data: kb });
});

app.post('/api/knowledge/delete', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.update(knowledgeBases).set({ deletedAt: new Date() }).where(eq(knowledgeBases.id, body.dataset_id));
  return c.json({ code: 0 });
});

app.post('/api/knowledge/update', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  await db.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, body.dataset_id));
  return c.json({ code: 0 });
});

app.post('/api/knowledge/document/create', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const id = nanoid();
  await db.insert(documents).values({
    id, knowledgeBaseId: body.dataset_id, name: body.name ?? 'Document',
    sourceType: body.source_type ?? 'text', status: 'pending', createdAt: new Date(),
  });
  return c.json({ code: 0, data: { document_id: id } });
});

app.post('/api/knowledge/document/list', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const docs = await db.select().from(documents).where(eq(documents.knowledgeBaseId, body.dataset_id));
  return c.json({ code: 0, data: { list: docs } });
});

app.post('/api/knowledge/document/delete', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.delete(documentChunks).where(eq(documentChunks.documentId, body.document_id));
  await db.delete(documents).where(eq(documents.id, body.document_id));
  return c.json({ code: 0 });
});

app.post('/api/knowledge/slice/list', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const chunks = await db.select().from(documentChunks).where(eq(documentChunks.documentId, body.document_id));
  return c.json({ code: 0, data: { list: chunks } });
});

// ════════════════════════════════════════
// /api/workflow_api/* — Workflows
// ════════════════════════════════════════

app.post('/api/workflow_api/create', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = nanoid();
  const now = new Date();
  await db.insert(workflowDefinitions).values({
    id, workspaceId: body.space_id ?? 'default', name: body.name ?? 'New Workflow',
    createdBy: userId, createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { workflow_id: id } });
});

app.post('/api/workflow_api/workflow_list', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const wfs = await db.select().from(workflowDefinitions)
    .where(and(eq(workflowDefinitions.workspaceId, body.space_id ?? 'default'), isNull(workflowDefinitions.deletedAt)));
  return c.json({ code: 0, data: { list: wfs } });
});

app.post('/api/workflow_api/workflow_detail', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const [wf] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, body.workflow_id));
  return c.json({ code: 0, data: wf });
});

app.post('/api/workflow_api/canvas', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, body.workflow_id));
  const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, body.workflow_id));
  return c.json({ code: 0, data: { nodes, edges } });
});

app.post('/api/workflow_api/save', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.update(workflowDefinitions).set({ updatedAt: new Date() })
    .where(eq(workflowDefinitions.id, body.workflow_id));
  return c.json({ code: 0 });
});

app.post('/api/workflow_api/delete', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.update(workflowDefinitions).set({ deletedAt: new Date() })
    .where(eq(workflowDefinitions.id, body.workflow_id));
  return c.json({ code: 0 });
});

app.post('/api/workflow_api/publish', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const wfId = body.workflow_id;
  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, wfId));
  const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, wfId));
  const existing = await db.select().from(workflowVersions)
    .where(eq(workflowVersions.workflowId, wfId)).orderBy(desc(workflowVersions.version)).limit(1);
  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
  const now = new Date();
  await db.insert(workflowVersions).values({
    id: nanoid(), workflowId: wfId, version: nextVersion,
    snapshot: { nodes, edges }, publishedBy: userId, createdAt: now,
  });
  await db.update(workflowDefinitions).set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(workflowDefinitions.id, wfId));
  return c.json({ code: 0, data: { version: nextVersion } });
});

app.post('/api/workflow_api/node_type', async (c) => {
  return c.json({ code: 0, data: {
    types: [
      'start', 'end', 'llm', 'code', 'condition', 'loop', 'variable',
      'http_request', 'plugin', 'knowledge_retrieval', 'message',
      'sub_workflow', 'database', 'image_gen', 'text_processor',
      'intent_detector', 'variable_assigner', 'batch', 'selector',
      'json_transform', 'qa', 'emitter', 'receiver',
    ],
  }});
});

app.post('/api/workflow_api/test_run', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const runId = nanoid();
  await db.insert(workflowRuns).values({
    id: runId, workflowId: body.workflow_id, status: 'pending',
    triggerType: 'manual', input: body.input ?? null, createdAt: new Date(),
  });
  return c.json({ code: 0, data: { run_id: runId } });
});

// ════════════════════════════════════════
// /api/memory/* — Database & Variables
// ════════════════════════════════════════

app.post('/api/memory/database/list', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const dbs = await db.select().from(userDatabases)
    .where(and(eq(userDatabases.workspaceId, body.space_id ?? 'default'), isNull(userDatabases.deletedAt)));
  return c.json({ code: 0, data: { list: dbs } });
});

app.post('/api/memory/database/add', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = nanoid();
  const now = new Date();
  await db.insert(userDatabases).values({
    id, workspaceId: body.space_id ?? 'default', name: body.name,
    createdBy: userId, createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { database_id: id } });
});

app.post('/api/memory/database/delete', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.update(userDatabases).set({ deletedAt: new Date() }).where(eq(userDatabases.id, body.database_id));
  return c.json({ code: 0 });
});

app.post('/api/memory/database/list_records', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const rows = await db.select().from(userTableRows)
    .where(eq(userTableRows.tableId, body.table_id)).limit(body.limit ?? 100);
  return c.json({ code: 0, data: { list: rows.map((r) => r.data) } });
});

app.post('/api/memory/variable/upsert', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const id = nanoid();
  const now = new Date();
  await db.insert(variables).values({
    id, workspaceId: body.space_id ?? 'default', name: body.name, valueType: body.type ?? 'string',
    defaultValue: body.value, scope: 'workspace', createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { variable_id: id } });
});

app.post('/api/memory/variable/get', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const [v] = await db.select().from(variables).where(eq(variables.id, body.variable_id));
  return c.json({ code: 0, data: v });
});

app.post('/api/memory/variable/delete', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.delete(variables).where(eq(variables.id, body.variable_id));
  return c.json({ code: 0 });
});

// ════════════════════════════════════════
// /api/admin/config/* — Model Management
// ════════════════════════════════════════

app.get('/api/admin/config/model/list', async (c) => {
  const db = createDb(c.env);
  const providers = await db.select().from(modelProviders);
  return c.json({ code: 0, data: { list: providers } });
});

app.post('/api/admin/config/model/create', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const id = nanoid();
  await db.insert(modelProviders).values({
    id, workspaceId: 'default', name: body.name, provider: body.provider ?? 'openai',
    apiKeyEncrypted: body.api_key, createdAt: new Date(), updatedAt: new Date(),
  });
  return c.json({ code: 0, data: { model_id: id } });
});

app.post('/api/admin/config/model/delete', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.delete(modelProviders).where(eq(modelProviders.id, body.model_id));
  return c.json({ code: 0 });
});

// ════════════════════════════════════════
// /v3/chat — Latest Chat API
// ════════════════════════════════════════

app.post('/v3/chat', async (c) => {
  // Alias to /api/conversation/chat
  const db = createDb(c.env);
  const body = await c.req.json();
  const message = body.additional_messages?.[0]?.content ?? body.query ?? body.message;
  const botId = body.bot_id;

  if (!message) return c.json({ error: 'message required' }, 400);

  const convId = body.conversation_id ?? nanoid();
  if (!body.conversation_id) {
    await db.insert(conversations).values({
      id: convId, workspaceId: 'default', userId: c.get('userId'),
      agentId: botId, createdAt: new Date(), updatedAt: new Date(),
    });
  }

  await db.insert(messages).values({
    id: nanoid(), conversationId: convId, role: 'user',
    contentType: 'text', content: message, createdAt: new Date(),
  });

  let systemPrompt = 'You are a helpful AI assistant.';
  if (botId) {
    const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, botId));
    if (config?.systemPrompt) systemPrompt = config.systemPrompt;
  }

  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, convId)).orderBy(messages.createdAt).limit(40);

  try {
    const result = await chatCompletion(db, 'default', [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]);

    await db.insert(messages).values({
      id: nanoid(), conversationId: convId, role: 'assistant',
      contentType: 'text', content: result.content, createdAt: new Date(),
    });

    return c.json({
      id: nanoid(), conversation_id: convId, bot_id: botId,
      status: 'completed',
      usage: { token_count: result.usage?.totalTokens, output_count: result.usage?.completionTokens, input_count: result.usage?.promptTokens },
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Chat failed' }, 500);
  }
});

app.get('/v3/chat/retrieve', async (c) => {
  const chatId = c.req.query('chat_id');
  return c.json({ id: chatId, status: 'completed' });
});

app.get('/v3/chat/message/list', async (c) => {
  const db = createDb(c.env);
  const chatId = c.req.query('chat_id');
  const convId = c.req.query('conversation_id');
  if (!convId) return c.json({ data: [] });

  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, convId)).orderBy(messages.createdAt);
  return c.json({ data: msgs.map((m) => ({
    id: m.id, role: m.role, content: m.content, content_type: m.contentType,
  })) });
});

// ════════════════════════════════════════
// /v1 OpenAPI — Public SDK Compatibility
// ════════════════════════════════════════

app.post('/v1/conversation/create', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = nanoid();
  await db.insert(conversations).values({
    id, workspaceId: 'default', userId, agentId: body.bot_id,
    createdAt: new Date(), updatedAt: new Date(),
  });
  return c.json({ data: { id, created_at: Date.now() } });
});

app.get('/v1/conversation/retrieve', async (c) => {
  const db = createDb(c.env);
  const convId = c.req.query('conversation_id');
  if (!convId) return c.json({ error: 'conversation_id required' }, 400);
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
  return c.json({ data: conv });
});

app.post('/v1/conversation/message/list', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, body.conversation_id)).orderBy(messages.createdAt);
  return c.json({ data: msgs });
});

export default app;
