import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, lt, isNull } from 'drizzle-orm';
import { createConversationSchema, sendMessageSchema, chatRequestSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { conversations, messages, chatRuns, runSteps, agentConfigs, annotations } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { chatCompletion } from '../lib/llm.js';
import { createChatStream } from '../lib/llm-stream.js';
import type { ChatMessage } from '../lib/llm.js';
import { modelProviders, modelConfigs } from '../db/schema.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List conversations
app.get('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const workspaceId = c.req.query('workspaceId');
  const agentId = c.req.query('agentId');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

  const conditions = [eq(conversations.userId, userId), isNull(conversations.deletedAt)];
  if (workspaceId) conditions.push(eq(conversations.workspaceId, workspaceId));
  if (agentId) conditions.push(eq(conversations.agentId, agentId));
  if (cursor) conditions.push(lt(conversations.updatedAt, new Date(cursor)));

  const result = await db.select().from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);

  return c.json({
    conversations: result,
    nextCursor: result.length === limit ? result[result.length - 1].updatedAt?.toISOString() : null,
  });
});

// Create conversation
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(conversations).values({
    id,
    workspaceId,
    userId,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ conversation: { id, workspaceId, userId, ...parsed.data } }, 201);
});

// Get conversation with messages
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  return c.json({ conversation: conv });
});

// Get messages for conversation
app.get('/:id/messages', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);

  const conditions = [eq(messages.conversationId, id)];
  if (cursor) conditions.push(lt(messages.createdAt, new Date(cursor)));

  const result = await db.select().from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return c.json({
    messages: result.reverse(), // chronological order
    nextCursor: result.length === limit ? result[0].createdAt?.toISOString() : null,
  });
});

// Send message (creates user message)
app.post('/:id/messages', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();

  const msgId = nanoid();
  const now = new Date();

  await db.insert(messages).values({
    id: msgId,
    conversationId: id,
    role: 'user',
    contentType: body.contentType ?? 'text',
    content: body.content,
    metadata: body.metadata ?? null,
    createdAt: now,
  });

  // Update conversation timestamp
  await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, id));

  return c.json({ message: { id: msgId, role: 'user', content: body.content } }, 201);
});

// Send message with file attachment
app.post('/:id/messages/upload', async (c) => {
  const db = createDb(c.env);
  const convId = c.req.param('id');
  const formData = await c.req.formData();
  const raw = formData.get('file');
  const text = formData.get('message') as string ?? '';

  if (!raw || typeof raw === 'string') {
    return c.json({ error: 'No file provided' }, 400);
  }

  const file = raw as unknown as { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };
  const buffer = await file.arrayBuffer();

  // Store in R2
  const storageKey = `chat/${convId}/${nanoid()}/${file.name}`;
  await c.env.UPLOADS_BUCKET.put(storageKey, buffer, {
    httpMetadata: { contentType: file.type },
  });

  const msgId = nanoid();
  const now = new Date();
  const contentType = file.type.startsWith('image/') ? 'image' : 'file';

  await db.insert(messages).values({
    id: msgId,
    conversationId: convId,
    role: 'user',
    contentType,
    content: text || file.name,
    metadata: { fileName: file.name, fileSize: file.size, mimeType: file.type, storageKey },
    createdAt: now,
  });

  await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, convId));

  return c.json({
    message: { id: msgId, role: 'user', contentType, content: text || file.name, metadata: { fileName: file.name, storageKey } },
  }, 201);
});

// Clear conversation
app.post('/:id/clear', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  await db.delete(messages).where(eq(messages.conversationId, id));
  return c.json({ ok: true });
});

// Create new section (context boundary — Coze-parity)
app.post('/:id/sections', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const sectionId = nanoid();

  // Mark all existing messages as belonging to previous section
  // Update conversation's lastSectionId
  await db.update(conversations).set({ lastSectionId: sectionId, updatedAt: new Date() })
    .where(eq(conversations.id, id));

  return c.json({ sectionId });
});

// Fork conversation from a specific message (branching)
app.post('/:id/fork', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const fromMessageId = body.fromMessageId;

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  // Get messages up to the fork point
  const allMsgs = await db.select().from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const forkIndex = allMsgs.findIndex((m) => m.id === fromMessageId);
  const msgsToKeep = forkIndex >= 0 ? allMsgs.slice(0, forkIndex + 1) : allMsgs;

  // Create new conversation
  const newConvId = nanoid();
  const now = new Date();
  await db.insert(conversations).values({
    ...conv, id: newConvId, title: `${conv.title ?? 'Chat'} (branch)`,
    metadata: { forkedFrom: id, forkMessageId: fromMessageId },
    createdAt: now, updatedAt: now,
  });

  // Copy messages
  for (const msg of msgsToKeep) {
    await db.insert(messages).values({
      ...msg, id: nanoid(), conversationId: newConvId, createdAt: msg.createdAt,
    });
  }

  return c.json({ conversation: { id: newConvId, forkedFrom: id } }, 201);
});

// Edit message content
app.patch('/messages/:msgId', async (c) => {
  const db = createDb(c.env);
  const msgId = c.req.param('msgId');
  const body = await c.req.json();
  if (!body.content) return c.json({ error: 'content required' }, 400);

  const [msg] = await db.select().from(messages).where(eq(messages.id, msgId));
  if (!msg) return c.json({ error: 'Message not found' }, 404);

  await db.update(messages).set({ content: body.content }).where(eq(messages.id, msgId));
  return c.json({ ok: true, message: { id: msgId, content: body.content } });
});

// Regenerate assistant message (re-run LLM from that point)
app.post('/messages/:msgId/regenerate', async (c) => {
  const db = createDb(c.env);
  const msgId = c.req.param('msgId');

  const [msg] = await db.select().from(messages).where(eq(messages.id, msgId));
  if (!msg || msg.role !== 'assistant') return c.json({ error: 'Can only regenerate assistant messages' }, 400);

  // Get conversation and all messages up to (but not including) this one
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, msg.conversationId));
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, msg.conversationId))
    .orderBy(messages.createdAt);

  const msgIndex = history.findIndex((m) => m.id === msgId);
  const priorMessages = history.slice(0, msgIndex);

  // Resolve agent config
  let systemPrompt = 'You are a helpful AI assistant.';
  let modelConfigId: string | null = null;
  let temperature = 0.7;
  let maxTokens: number | undefined;

  if (conv.agentId) {
    const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, conv.agentId));
    if (config) {
      if (config.systemPrompt) systemPrompt = config.systemPrompt;
      modelConfigId = config.modelConfigId;
      if (config.temperature != null) temperature = config.temperature;
      if (config.maxTokens != null) maxTokens = config.maxTokens;
    }
  }

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...priorMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  try {
    const result = await chatCompletion(db, conv.workspaceId, chatMessages, { modelConfigId, temperature, maxTokens });
    await db.update(messages).set({ content: result.content, tokenCount: result.usage?.totalTokens ?? null })
      .where(eq(messages.id, msgId));
    return c.json({ ok: true, message: { id: msgId, content: result.content } });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Regeneration failed' }, 500);
  }
});

// Delete conversation (soft)
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(conversations).set({ deletedAt: new Date() }).where(eq(conversations.id, id));
  return c.json({ ok: true });
});

// ── Chat API (SSE streaming) ──

app.post('/chat', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { conversationId, message } = parsed.data;
  const now = new Date();

  // Save user message
  const userMsgId = nanoid();
  await db.insert(messages).values({
    id: userMsgId,
    conversationId,
    role: 'user',
    contentType: 'text',
    content: message,
    createdAt: now,
  });

  // Create chat run
  const runId = nanoid();
  await db.insert(chatRuns).values({
    id: runId,
    conversationId,
    status: 'pending',
    startedAt: now,
    createdAt: now,
  });

  // Resolve agent config and system prompt
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  let systemPrompt = 'You are a helpful AI assistant.';
  let modelConfigId: string | null = null;
  let temperature = 0.7;
  let maxTokens: number | undefined;
  const workspaceId = conv?.workspaceId ?? 'default';

  if (conv?.agentId) {
    const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, conv.agentId));
    if (config) {
      if (config.systemPrompt) systemPrompt = config.systemPrompt;
      modelConfigId = config.modelConfigId;
      if (config.temperature != null) temperature = config.temperature;
      if (config.maxTokens != null) maxTokens = config.maxTokens;
    }
  }

  // Build message history
  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(40);

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ];

  // Call LLM
  let assistantContent: string;
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

  try {
    await db.update(chatRuns).set({ status: 'running' }).where(eq(chatRuns.id, runId));

    const result = await chatCompletion(db, workspaceId, chatMessages, {
      modelConfigId,
      temperature,
      maxTokens,
    });

    assistantContent = result.content;
    usage = result.usage;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'LLM call failed';
    assistantContent = `[Error: ${errorMsg}]`;

    await db.update(chatRuns).set({ status: 'failed', error: errorMsg, completedAt: new Date() })
      .where(eq(chatRuns.id, runId));

    // Still save the error as a message for visibility
    const assistantMsgId = nanoid();
    await db.insert(messages).values({
      id: assistantMsgId, conversationId, role: 'assistant',
      contentType: 'text', content: assistantContent, createdAt: new Date(),
    });

    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));

    return c.json({
      run: { id: runId, status: 'failed', error: errorMsg },
      message: { id: assistantMsgId, role: 'assistant', content: assistantContent },
    });
  }

  // Save assistant message
  const assistantMsgId = nanoid();
  await db.insert(messages).values({
    id: assistantMsgId, conversationId, role: 'assistant',
    contentType: 'text', content: assistantContent,
    tokenCount: usage?.totalTokens ?? null, createdAt: new Date(),
  });

  await db.update(chatRuns).set({
    status: 'completed',
    usage: usage ?? null,
    completedAt: new Date(),
  }).where(eq(chatRuns.id, runId));

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))

  return c.json({
    run: { id: runId, status: 'completed', usage },
    message: { id: assistantMsgId, role: 'assistant', content: assistantContent },
  });
});

// ── SSE Streaming Chat ──

app.post('/chat/stream', async (c) => {
  const db = createDb(c.env);
  const body = await c.req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { conversationId, message } = parsed.data;
  const now = new Date();

  // Save user message
  await db.insert(messages).values({
    id: nanoid(), conversationId, role: 'user',
    contentType: 'text', content: message, createdAt: now,
  });

  // Resolve agent config
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  let systemPrompt = 'You are a helpful AI assistant.';
  let modelConfigId: string | null = null;
  let temperature = 0.7;
  let maxTokens: number | undefined;
  const workspaceId = conv?.workspaceId ?? 'default';

  if (conv?.agentId) {
    const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.agentId, conv.agentId));
    if (config) {
      if (config.systemPrompt) systemPrompt = config.systemPrompt;
      modelConfigId = config.modelConfigId;
      if (config.temperature != null) temperature = config.temperature;
      if (config.maxTokens != null) maxTokens = config.maxTokens;
    }
  }

  // Build message history
  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(40);

  const chatMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // Resolve provider
  let providerConfig = null;
  if (modelConfigId) {
    const [mc] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, modelConfigId));
    if (mc) {
      const [prov] = await db.select().from(modelProviders).where(eq(modelProviders.id, mc.providerId));
      if (prov?.apiKeyEncrypted) {
        providerConfig = { provider: prov.provider, baseUrl: prov.baseUrl, apiKey: prov.apiKeyEncrypted, modelId: mc.modelId };
      }
    }
  }
  if (!providerConfig) {
    const providers = await db.select().from(modelProviders).where(eq(modelProviders.workspaceId, workspaceId));
    for (const prov of providers) {
      if (!prov.isEnabled || !prov.apiKeyEncrypted) continue;
      const configs = await db.select().from(modelConfigs).where(eq(modelConfigs.providerId, prov.id));
      const mc = configs.find((c) => c.isDefault) ?? configs[0];
      if (mc) {
        providerConfig = { provider: prov.provider, baseUrl: prov.baseUrl, apiKey: prov.apiKeyEncrypted, modelId: mc.modelId };
        break;
      }
    }
  }

  if (!providerConfig) {
    return c.json({ error: 'No model provider configured' }, 400);
  }

  const stream = createChatStream(providerConfig, chatMessages, { temperature, maxTokens });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// ── Annotations (Dify pattern: feedback/RLHF data collection) ──

// Annotate a message (correct/approve an answer)
app.post('/messages/:msgId/annotate', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const msgId = c.req.param('msgId');
  const body = await c.req.json();

  const [msg] = await db.select().from(messages).where(eq(messages.id, msgId));
  if (!msg) return c.json({ error: 'Message not found' }, 404);

  // Get the preceding user message as the question
  const allMsgs = await db.select().from(messages)
    .where(eq(messages.conversationId, msg.conversationId))
    .orderBy(messages.createdAt);
  const msgIndex = allMsgs.findIndex((m) => m.id === msgId);
  const question = msgIndex > 0 ? allMsgs[msgIndex - 1].content : '';

  const id = nanoid();
  await db.insert(annotations).values({
    id,
    workspaceId: body.workspaceId ?? 'default',
    messageId: msgId,
    conversationId: msg.conversationId,
    agentId: body.agentId ?? null,
    question,
    answer: body.answer ?? msg.content,
    source: body.source ?? 'console',
    rating: body.rating ?? null,
    createdBy: userId,
    createdAt: new Date(),
  });

  return c.json({ annotation: { id, question, answer: body.answer ?? msg.content, rating: body.rating } }, 201);
});

// List annotations for an agent/workspace
app.get('/annotations', async (c) => {
  const db = createDb(c.env);
  const agentId = c.req.query('agentId');
  const workspaceId = c.req.query('workspaceId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);

  const conditions = [];
  if (agentId) conditions.push(eq(annotations.agentId, agentId));
  if (workspaceId) conditions.push(eq(annotations.workspaceId, workspaceId));

  const result = conditions.length > 0
    ? await db.select().from(annotations).where(and(...conditions)).orderBy(desc(annotations.createdAt)).limit(limit)
    : await db.select().from(annotations).orderBy(desc(annotations.createdAt)).limit(limit);

  return c.json({ annotations: result });
});

export default app;
