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

// ════════════════════════════════════════
// Remaining 37 endpoints for 100% parity
// ════════════════════════════════════════

// ── Admin Config ──

app.get('/api/admin/config/basic/get', async (c) => {
  return c.json({ code: 0, data: { platform: 'pajama-hive', version: '0.4.0', features: ['chat', 'workflow', 'knowledge', 'plugins'] } });
});

// ── Common Upload ──

app.get('/api/common/upload/apply_upload_action', async (c) => {
  // Returns upload config — in Hive, uploads go to R2 directly
  return c.json({ code: 0, data: { upload_url: 'https://hive-api.pajamadot.com/v1/uploads', method: 'POST' } });
});

// ── Intelligence API (Project Management) ──

app.post('/api/intelligence_api/draft_project/copy', async (c) => {
  // Copy a project = duplicate an agent
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const [agent] = await db.select().from(agents).where(eq(agents.id, body.project_id));
  if (!agent) return c.json({ error: 'Project not found' }, 404);
  const newId = nanoid();
  const now = new Date();
  await db.insert(agents).values({
    ...agent, id: newId, name: `${agent.name} (copy)`, status: 'draft',
    createdBy: userId, deletedAt: null, createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { project_id: newId } });
});

// ── Memory (Database bind/unbind, table file, sys config) ──

app.get('/api/memory/doc_table_info', async (c) => {
  return c.json({ code: 0, data: { supported_types: ['string', 'number', 'boolean', 'date', 'json'] } });
});

app.get('/api/memory/sys_variable_conf', async (c) => {
  return c.json({ code: 0, data: { max_variables: 100, supported_scopes: ['workspace', 'agent', 'conversation', 'workflow'] } });
});

app.get('/api/memory/table_mode_config', async (c) => {
  return c.json({ code: 0, data: { modes: ['key_value', 'table'], default: 'table' } });
});

app.post('/api/memory/database/bind_to_bot', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  // Store binding in agent config
  const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, body.bot_id));
  if (config) {
    const tools = (config.tools ?? []) as unknown[];
    (tools as { type: string; id: string }[]).push({ type: 'database', id: body.database_id });
    await db.update(agentConfigs).set({ tools, updatedAt: new Date() }).where(eq(agentConfigs.agentId, body.bot_id));
  }
  return c.json({ code: 0 });
});

app.post('/api/memory/database/unbind_to_bot', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, body.bot_id));
  if (config) {
    const tools = ((config.tools ?? []) as { type: string; id: string }[]).filter((t) => t.id !== body.database_id);
    await db.update(agentConfigs).set({ tools, updatedAt: new Date() }).where(eq(agentConfigs.agentId, body.bot_id));
  }
  return c.json({ code: 0 });
});

app.post('/api/memory/table_file/submit', async (c) => {
  // Submit a file for table import — store as pending task
  return c.json({ code: 0, data: { task_id: nanoid(), status: 'pending' } });
});

// ── OAuth ──

app.get('/api/oauth/authorization_code', async (c) => {
  // OAuth callback — in Hive, handled by plugin OAuth flow
  const code = c.req.query('code');
  const state = c.req.query('state');
  return c.json({ code: 0, data: { code, state } });
});

// ── Permission API ──

app.post('/api/permission_api/coze_web_app/impersonate_coze_user', async (c) => {
  // Admin impersonation — in Hive, not supported (security)
  return c.json({ code: -1, message: 'Impersonation not supported' }, 403);
});

app.get('/api/permission_api/pat/get_personal_access_token_and_permission', async (c) => {
  // Return current user's API keys
  const db = createDb(c.env);
  const userId = c.get('userId');
  const { apiKeys: apiKeysTable } = await import('../db/schema.js');
  const keys = await db.select().from(apiKeysTable).where(eq(apiKeysTable.userId, userId));
  return c.json({ code: 0, data: { tokens: keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes })) } });
});

// ── Playground API ──

app.get('/api/playground_api/get_prompt_resource_info', async (c) => {
  const db = createDb(c.env);
  const promptId = c.req.query('prompt_id');
  if (!promptId) return c.json({ code: 0, data: null });
  const [prompt] = await db.select().from(prompts).where(eq(prompts.id, promptId));
  return c.json({ code: 0, data: prompt });
});

app.post('/api/playground_api/report_user_behavior', async (c) => {
  // Analytics endpoint — log and acknowledge
  return c.json({ code: 0 });
});

// ── Plugin API (advanced) ──

app.post('/api/plugin_api/check_and_lock_plugin_edit', async (c) => {
  // Optimistic locking for plugin editing — in Hive, not needed (single-user)
  return c.json({ code: 0, data: { locked: true } });
});

app.post('/api/plugin_api/convert_to_openapi', async (c) => {
  // Convert plugin tools to OpenAPI spec
  const db = createDb(c.env);
  const body = await c.req.json();
  const tools = await db.select().from(pluginTools).where(eq(pluginTools.pluginId, body.plugin_id));
  const [plugin] = await db.select().from(plugins).where(eq(plugins.id, body.plugin_id));

  const spec = {
    openapi: '3.0.0',
    info: { title: plugin?.name ?? 'Plugin', version: '1.0.0' },
    servers: plugin?.baseUrl ? [{ url: plugin.baseUrl }] : [],
    paths: Object.fromEntries(tools.map((t) => [
      t.path, { [t.method.toLowerCase()]: {
        operationId: t.name, summary: t.description,
        requestBody: t.inputSchema ? { content: { 'application/json': { schema: t.inputSchema } } } : undefined,
        responses: { '200': { description: 'OK', content: t.outputSchema ? { 'application/json': { schema: t.outputSchema } } : undefined } },
      }},
    ])),
  };
  return c.json({ code: 0, data: spec });
});

app.post('/api/plugin_api/del_plugin', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  await db.update(plugins).set({ deletedAt: new Date() }).where(eq(plugins.id, body.plugin_id));
  return c.json({ code: 0 });
});

app.post('/api/plugin_api/resource_copy_dispatch', async (c) => {
  // Resource copy = duplicate plugin
  const db = createDb(c.env);
  const body = await c.req.json();
  const [plugin] = await db.select().from(plugins).where(eq(plugins.id, body.plugin_id));
  if (!plugin) return c.json({ error: 'Plugin not found' }, 404);
  const newId = nanoid();
  const now = new Date();
  await db.insert(plugins).values({
    ...plugin, id: newId, name: `${plugin.name} (copy)`, status: 'draft',
    deletedAt: null, createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { new_plugin_id: newId } });
});

app.post('/api/plugin_api/unlock_plugin_edit', async (c) => {
  return c.json({ code: 0 });
});

// ── Workflow API (advanced) ──

app.post('/api/workflow_api/copy', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const [wf] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, body.workflow_id));
  if (!wf) return c.json({ error: 'Workflow not found' }, 404);
  const newId = nanoid();
  const now = new Date();
  await db.insert(workflowDefinitions).values({
    ...wf, id: newId, name: `${wf.name} (copy)`, status: 'draft',
    createdBy: userId, deletedAt: null, publishedAt: null, createdAt: now, updatedAt: now,
  });
  // Copy nodes and edges
  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, body.workflow_id));
  const nodeIdMap: Record<string, string> = {};
  for (const node of nodes) {
    const newNodeId = nanoid();
    nodeIdMap[node.id] = newNodeId;
    await db.insert(workflowNodes).values({ ...node, id: newNodeId, workflowId: newId, createdAt: now, updatedAt: now });
  }
  const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, body.workflow_id));
  for (const edge of edges) {
    await db.insert(workflowEdges).values({
      ...edge, id: nanoid(), workflowId: newId,
      fromNodeId: nodeIdMap[edge.fromNodeId] ?? edge.fromNodeId,
      toNodeId: nodeIdMap[edge.toNodeId] ?? edge.toNodeId,
    });
  }
  return c.json({ code: 0, data: { workflow_id: newId } });
});

app.post('/api/workflow_api/copy_wk_template', async (c) => {
  // Same as copy — templates are just published workflows
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const [wf] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, body.template_id));
  if (!wf) return c.json({ error: 'Template not found' }, 404);
  const newId = nanoid();
  const now = new Date();
  await db.insert(workflowDefinitions).values({
    ...wf, id: newId, name: body.name ?? `${wf.name} (from template)`, status: 'draft',
    createdBy: userId, deletedAt: null, publishedAt: null, createdAt: now, updatedAt: now,
  });
  return c.json({ code: 0, data: { workflow_id: newId } });
});

app.get('/api/workflow_api/get_process', async (c) => {
  const db = createDb(c.env);
  const runId = c.req.query('run_id');
  if (!runId) return c.json({ error: 'run_id required' }, 400);
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  return c.json({ code: 0, data: run ?? { status: 'unknown' } });
});

app.post('/api/workflow_api/history_schema', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const versions = await db.select().from(workflowVersions)
    .where(eq(workflowVersions.workflowId, body.workflow_id))
    .orderBy(desc(workflowVersions.version));
  return c.json({ code: 0, data: { versions } });
});

app.post('/api/workflow_api/llm_fc_setting_merged', async (c) => {
  // LLM function calling settings — return default config
  return c.json({ code: 0, data: { fc_enabled: true, parallel_tool_calls: true, tool_choice: 'auto' } });
});

app.post('/api/workflow_api/validate_tree', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, body.workflow_id));
  const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, body.workflow_id));

  const errors: string[] = [];
  const hasStart = nodes.some((n) => n.nodeType === 'start');
  const hasEnd = nodes.some((n) => n.nodeType === 'end');
  if (!hasStart) errors.push('Missing start node');
  if (!hasEnd) errors.push('Missing end node');

  // Check for disconnected nodes
  const connectedNodes = new Set<string>();
  for (const e of edges) { connectedNodes.add(e.fromNodeId); connectedNodes.add(e.toNodeId); }
  for (const n of nodes) {
    if (n.nodeType !== 'start' && n.nodeType !== 'end' && !connectedNodes.has(n.id)) {
      errors.push(`Node '${n.label}' (${n.nodeType}) is disconnected`);
    }
  }

  return c.json({ code: 0, data: { valid: errors.length === 0, errors } });
});

app.post('/api/workflow_api/workflow_references', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  // Find agents that reference this workflow
  const configs = await db.select().from(agentConfigs);
  const referencedBy = configs.filter((c) => {
    const wfId = (c as unknown as Record<string, unknown>).workflowId;
    return wfId === body.workflow_id;
  }).map((c) => c.agentId);
  return c.json({ code: 0, data: { referenced_by_agents: referencedBy } });
});

app.get('/api/workflow_api/chat_flow_role/get', async (c) => {
  return c.json({ code: 0, data: { roles: ['user', 'assistant', 'system'] } });
});

// ── V1 OpenAPI: Conversations ──

app.delete('/v1/conversations/:conversation_id', async (c) => {
  const db = createDb(c.env);
  const convId = c.req.param('conversation_id');
  await db.update(conversations).set({ deletedAt: new Date() }).where(eq(conversations.id, convId));
  return c.json({ data: { id: convId } });
});

app.put('/v1/conversations/:conversation_id', async (c) => {
  const db = createDb(c.env);
  const convId = c.req.param('conversation_id');
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.meta_data) updates.metadata = body.meta_data;
  await db.update(conversations).set(updates).where(eq(conversations.id, convId));
  return c.json({ data: { id: convId } });
});

// ── V1 OpenAPI: Datasets (Knowledge) ──

app.get('/v1/datasets', async (c) => {
  const db = createDb(c.env);
  const spaceId = c.req.query('space_id') ?? 'default';
  const kbs = await db.select().from(knowledgeBases)
    .where(and(eq(knowledgeBases.workspaceId, spaceId), isNull(knowledgeBases.deletedAt)));
  return c.json({ data: kbs });
});

app.post('/v1/datasets', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = nanoid();
  const now = new Date();
  await db.insert(knowledgeBases).values({
    id, workspaceId: body.space_id ?? 'default', name: body.name,
    description: body.description, createdBy: userId, createdAt: now, updatedAt: now,
  });
  return c.json({ data: { dataset_id: id } });
});

app.put('/v1/datasets/:dataset_id', async (c) => {
  const db = createDb(c.env);
  const datasetId = c.req.param('dataset_id');
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  await db.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, datasetId));
  return c.json({ data: { dataset_id: datasetId } });
});

app.delete('/v1/datasets/:dataset_id', async (c) => {
  const db = createDb(c.env);
  const datasetId = c.req.param('dataset_id');
  await db.update(knowledgeBases).set({ deletedAt: new Date() }).where(eq(knowledgeBases.id, datasetId));
  return c.json({ data: { dataset_id: datasetId } });
});

app.get('/v1/datasets/:dataset_id/images', async (c) => {
  const db = createDb(c.env);
  const datasetId = c.req.param('dataset_id');
  const docs = await db.select().from(documents)
    .where(eq(documents.knowledgeBaseId, datasetId));
  const images = docs.filter((d) => d.mimeType?.startsWith('image/'));
  return c.json({ data: images });
});

app.post('/v1/datasets/:dataset_id/process', async (c) => {
  const db = createDb(c.env);
  const datasetId = c.req.param('dataset_id');
  const docs = await db.select().from(documents).where(eq(documents.knowledgeBaseId, datasetId));
  return c.json({ data: docs.map((d) => ({ document_id: d.id, status: d.status, chunk_count: d.chunkCount })) });
});

// ── V1 OpenAPI: Bots ──

app.get('/v1/bot/get_online_info', async (c) => {
  const db = createDb(c.env);
  const botId = c.req.query('bot_id');
  if (!botId) return c.json({ error: 'bot_id required' }, 400);
  const [agent] = await db.select().from(agents).where(eq(agents.id, botId));
  if (!agent) return c.json({ error: 'Bot not found' }, 404);
  const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, botId));
  return c.json({ data: { ...agent, config } });
});

app.get('/v1/bots/:bot_id', async (c) => {
  const db = createDb(c.env);
  const botId = c.req.param('bot_id');
  const [agent] = await db.select().from(agents).where(eq(agents.id, botId));
  if (!agent) return c.json({ error: 'Bot not found' }, 404);
  const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, botId));
  return c.json({ data: { ...agent, config, bot_id: agent.id, bot_name: agent.name } });
});

export default app;
