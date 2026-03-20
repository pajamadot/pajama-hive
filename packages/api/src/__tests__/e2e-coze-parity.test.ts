/**
 * End-to-End Tests for Coze Parity Features
 * Tests the full flow: workspace → agent → knowledge → conversation → chat → workflow → publish
 */
import { describe, it, expect } from 'vitest';
import {
  createWorkspaceSchema, createAgentSchema, agentConfigSchema,
  createWorkflowSchema, createWorkflowNodeSchema, createWorkflowEdgeSchema,
  createConversationSchema, chatRequestSchema, sendMessageSchema,
  createPluginSchema, createPluginToolSchema,
  createKnowledgeBaseSchema, createDocumentSchema,
  createUserDatabaseSchema, createUserTableSchema,
  createVariableSchema, createPromptSchema, updatePromptSchema,
  createAppSchema, publishToMarketplaceSchema,
  createModelProviderSchema, createModelConfigSchema,
  inviteMemberSchema,
} from '@pajamadot/hive-shared';

// ═══════════════════════════════════════════════
// Phase 1: Core Platform Schemas
// ═══════════════════════════════════════════════

describe('Workspace schemas', () => {
  it('validates workspace creation', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'My Workspace', slug: 'my-ws' }).success).toBe(true);
  });
  it('rejects invalid slug', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Test', slug: 'INVALID SLUG!' }).success).toBe(false);
  });
  it('validates member invite', () => {
    expect(inviteMemberSchema.safeParse({ userId: 'user_123', role: 'admin' }).success).toBe(true);
  });
  it('rejects invalid role', () => {
    expect(inviteMemberSchema.safeParse({ userId: 'user_123', role: 'superadmin' }).success).toBe(false);
  });
});

describe('Model schemas', () => {
  it('validates model provider creation', () => {
    expect(createModelProviderSchema.safeParse({
      name: 'OpenAI', provider: 'openai', apiKey: 'sk-test123',
    }).success).toBe(true);
  });
  it('validates all provider types', () => {
    for (const p of ['openai', 'anthropic', 'google', 'volcengine', 'deepseek', 'qwen', 'ollama', 'custom']) {
      expect(createModelProviderSchema.safeParse({ name: p, provider: p }).success).toBe(true);
    }
  });
  it('rejects unknown provider', () => {
    expect(createModelProviderSchema.safeParse({ name: 'test', provider: 'unknown' }).success).toBe(false);
  });
  it('validates model config', () => {
    expect(createModelConfigSchema.safeParse({
      providerId: 'prov_1', modelId: 'gpt-4o', modelType: 'chat',
    }).success).toBe(true);
  });
  it('validates model types', () => {
    for (const t of ['chat', 'embedding', 'image', 'code']) {
      expect(createModelConfigSchema.safeParse({ providerId: 'p', modelId: 'm', modelType: t }).success).toBe(true);
    }
  });
});

describe('Agent schemas', () => {
  it('validates agent creation', () => {
    expect(createAgentSchema.safeParse({ name: 'My Agent' }).success).toBe(true);
  });
  it('validates all agent modes', () => {
    for (const mode of ['single', 'workflow', 'multi-agent']) {
      expect(createAgentSchema.safeParse({ name: 'A', mode }).success).toBe(true);
    }
  });
  it('validates agent config', () => {
    expect(agentConfigSchema.safeParse({
      systemPrompt: 'You are helpful',
      temperature: 0.7,
      memoryEnabled: true,
      memoryWindowSize: 20,
      knowledgeBaseIds: ['kb_1'],
      pluginIds: ['plug_1'],
    }).success).toBe(true);
  });
  it('rejects out-of-range temperature', () => {
    expect(agentConfigSchema.safeParse({ temperature: 5 }).success).toBe(false);
  });
});

describe('Workflow schemas', () => {
  it('validates workflow creation', () => {
    expect(createWorkflowSchema.safeParse({ name: 'My Workflow' }).success).toBe(true);
  });
  it('validates chat flow', () => {
    expect(createWorkflowSchema.safeParse({ name: 'Chat Flow', isChatFlow: true }).success).toBe(true);
  });
  it('validates all node types', () => {
    const types = [
      'start', 'end', 'llm', 'code', 'condition', 'loop', 'variable',
      'http_request', 'plugin', 'knowledge_retrieval', 'message',
      'sub_workflow', 'database', 'image_gen', 'text_processor',
      'intent_detector', 'variable_assigner', 'batch', 'selector',
      'json_transform', 'qa', 'emitter', 'receiver',
    ];
    for (const nodeType of types) {
      expect(createWorkflowNodeSchema.safeParse({
        nodeType, label: `${nodeType} node`,
      }).success).toBe(true);
    }
  });
  it('rejects unknown node type', () => {
    expect(createWorkflowNodeSchema.safeParse({
      nodeType: 'magic', label: 'test',
    }).success).toBe(false);
  });
  it('validates workflow edge', () => {
    expect(createWorkflowEdgeSchema.safeParse({
      fromNodeId: 'n1', toNodeId: 'n2',
    }).success).toBe(true);
  });
  it('validates edge with condition', () => {
    expect(createWorkflowEdgeSchema.safeParse({
      fromNodeId: 'n1', toNodeId: 'n2',
      sourceHandle: 'true', label: 'Yes',
      condition: { expression: '{{value}} > 10' },
    }).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Phase 1: Conversation & Chat Schemas
// ═══════════════════════════════════════════════

describe('Conversation schemas', () => {
  it('validates conversation creation', () => {
    expect(createConversationSchema.safeParse({ agentId: 'agent_1' }).success).toBe(true);
  });
  it('validates chat request', () => {
    expect(chatRequestSchema.safeParse({
      conversationId: 'conv_1', message: 'Hello',
    }).success).toBe(true);
  });
  it('rejects empty message', () => {
    expect(chatRequestSchema.safeParse({
      conversationId: 'conv_1', message: '',
    }).success).toBe(false);
  });
  it('validates message with streaming', () => {
    expect(chatRequestSchema.safeParse({
      conversationId: 'c', message: 'Hi', stream: true,
    }).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Phase 2: Resources & Integrations Schemas
// ═══════════════════════════════════════════════

describe('Plugin schemas', () => {
  it('validates plugin creation', () => {
    expect(createPluginSchema.safeParse({
      name: 'Weather API', pluginType: 'api', baseUrl: 'https://api.weather.com',
    }).success).toBe(true);
  });
  it('validates all plugin types', () => {
    for (const t of ['api', 'webhook', 'workflow']) {
      expect(createPluginSchema.safeParse({ name: 'P', pluginType: t }).success).toBe(true);
    }
  });
  it('validates all auth types', () => {
    for (const t of ['none', 'api_key', 'oauth2', 'bearer']) {
      expect(createPluginSchema.safeParse({ name: 'P', authType: t }).success).toBe(true);
    }
  });
  it('validates plugin tool', () => {
    expect(createPluginToolSchema.safeParse({
      name: 'getWeather', path: '/weather', method: 'GET',
      inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
    }).success).toBe(true);
  });
});

describe('Knowledge schemas', () => {
  it('validates knowledge base creation', () => {
    expect(createKnowledgeBaseSchema.safeParse({
      name: 'Product Docs', chunkSize: 1000, chunkOverlap: 100,
    }).success).toBe(true);
  });
  it('rejects too-small chunk size', () => {
    expect(createKnowledgeBaseSchema.safeParse({
      name: 'Test', chunkSize: 50,
    }).success).toBe(false);
  });
  it('validates document creation', () => {
    expect(createDocumentSchema.safeParse({
      name: 'guide.md', sourceType: 'text', content: 'Hello world',
    }).success).toBe(true);
  });
  it('validates all source types', () => {
    for (const t of ['file', 'url', 'text', 'api']) {
      expect(createDocumentSchema.safeParse({ name: 'doc', sourceType: t }).success).toBe(true);
    }
  });
});

describe('Database schemas', () => {
  it('validates database creation', () => {
    expect(createUserDatabaseSchema.safeParse({ name: 'Customers' }).success).toBe(true);
  });
  it('validates table creation with schema', () => {
    expect(createUserTableSchema.safeParse({
      name: 'users',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'number', required: false },
        { name: 'active', type: 'boolean' },
      ],
    }).success).toBe(true);
  });
  it('rejects empty schema', () => {
    expect(createUserTableSchema.safeParse({ name: 'test', schema: [] }).success).toBe(false);
  });
});

describe('Variable schemas', () => {
  it('validates variable creation', () => {
    expect(createVariableSchema.safeParse({
      name: 'user_name', valueType: 'string', scope: 'conversation',
    }).success).toBe(true);
  });
  it('validates all scopes', () => {
    for (const s of ['workspace', 'agent', 'conversation', 'workflow']) {
      expect(createVariableSchema.safeParse({ name: 'v', scope: s }).success).toBe(true);
    }
  });
  it('validates all value types', () => {
    for (const t of ['string', 'number', 'boolean', 'json', 'array']) {
      expect(createVariableSchema.safeParse({ name: 'v', valueType: t }).success).toBe(true);
    }
  });
});

describe('Prompt schemas', () => {
  it('validates prompt creation', () => {
    expect(createPromptSchema.safeParse({
      name: 'System Prompt', content: 'You are {{role}}',
      templateVars: ['role'],
    }).success).toBe(true);
  });
  it('validates prompt update', () => {
    expect(updatePromptSchema.safeParse({
      content: 'Updated prompt', isPublic: true,
    }).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Phase 3: Publishing & API Schemas
// ═══════════════════════════════════════════════

describe('App schemas', () => {
  it('validates app creation', () => {
    expect(createAppSchema.safeParse({
      name: 'Customer Bot', appType: 'chat', agentId: 'agent_1',
    }).success).toBe(true);
  });
  it('validates all app types', () => {
    for (const t of ['chat', 'workflow', 'custom']) {
      expect(createAppSchema.safeParse({ name: 'A', appType: t }).success).toBe(true);
    }
  });
});

describe('Marketplace schemas', () => {
  it('validates marketplace publish', () => {
    expect(publishToMarketplaceSchema.safeParse({
      resourceType: 'agent', resourceId: 'agent_1',
      name: 'My Agent', category: 'productivity',
      tags: ['ai', 'chat'],
    }).success).toBe(true);
  });
  it('validates all resource types', () => {
    for (const t of ['agent', 'plugin', 'workflow', 'prompt']) {
      expect(publishToMarketplaceSchema.safeParse({
        resourceType: t, resourceId: 'r1', name: 'Test',
      }).success).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════
// Document Chunker Unit Tests
// ═══════════════════════════════════════════════

describe('Document chunker', () => {
  // Import at test time to avoid module resolution issues
  it('chunks text into multiple pieces', async () => {
    const { chunkText } = await import('../lib/chunker.js');
    const text = 'The quick brown fox jumps over the lazy dog near the river bank. ' +
      'Meanwhile the cat sat on the mat watching birds fly across the bright blue sky. ' +
      'A gentle breeze swept through the tall grass fields stretching out to the horizon. ' +
      'The sun began to set painting the clouds in shades of orange and deep purple hues. ' +
      'Stars slowly appeared one by one as darkness crept across the vast open landscape.';
    const chunks = chunkText(text, 20, 5);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content).toContain('fox');
  });

  it('handles empty text', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    const chunks = processDocument('', 'doc_1', 500, 50);
    expect(chunks).toHaveLength(0);
  });

  it('single chunk for short text', async () => {
    const { chunkText } = await import('../lib/chunker.js');
    const chunks = chunkText('Short text.', 500, 50);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Short text.');
  });

  it('preserves sentence boundaries', async () => {
    const { chunkText } = await import('../lib/chunker.js');
    const text = 'This is sentence one. This is sentence two. This is sentence three.';
    const chunks = chunkText(text, 30, 5);
    // No chunk should end mid-sentence
    for (const chunk of chunks) {
      expect(chunk.content.endsWith('.') || chunk.content.endsWith('three.')).toBe(true);
    }
  });

  it('includes chunk metadata', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    const chunks = processDocument('Hello world. This is a test.', 'doc_123', 500, 50);
    expect(chunks[0].metadata).toHaveProperty('documentId', 'doc_123');
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// Cross-Domain Integration Tests (Schema-level)
// ═══════════════════════════════════════════════

describe('Cross-domain flow validation', () => {
  it('agent → knowledge base attachment is valid', () => {
    const agent = agentConfigSchema.parse({ knowledgeBaseIds: ['kb_1', 'kb_2'] });
    expect(agent.knowledgeBaseIds).toHaveLength(2);
  });

  it('agent → plugin attachment is valid', () => {
    const agent = agentConfigSchema.parse({ pluginIds: ['plug_1'] });
    expect(agent.pluginIds).toHaveLength(1);
  });

  it('agent → workflow attachment is valid', () => {
    const agent = agentConfigSchema.parse({ workflowId: 'wf_1' });
    expect(agent.workflowId).toBe('wf_1');
  });

  it('full agent config round-trip', () => {
    const config = {
      modelConfigId: 'mc_1',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.8,
      maxTokens: 2000,
      topP: 0.9,
      knowledgeBaseIds: ['kb_1'],
      pluginIds: ['plug_1', 'plug_2'],
      workflowId: 'wf_1',
      memoryEnabled: true,
      memoryWindowSize: 30,
      openingMessage: 'Hi! How can I help?',
      suggestedReplies: ['Tell me more', 'Help me with X'],
    };
    const parsed = agentConfigSchema.parse(config);
    expect(parsed).toEqual(config);
  });

  it('marketplace publish → install flow types are compatible', () => {
    const publish = publishToMarketplaceSchema.parse({
      resourceType: 'agent', resourceId: 'agent_1',
      name: 'Super Agent', tags: ['productivity'],
    });
    expect(publish.resourceType).toBe('agent');
    expect(publish.resourceId).toBe('agent_1');
  });
});
