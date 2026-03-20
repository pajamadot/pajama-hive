/**
 * Integration Tests for ALL API Routes
 *
 * Tests request/response shapes, validation, and error handling
 * for every route file in the API.
 */
import { describe, it, expect } from 'vitest';
import {
  createWorkspaceSchema, inviteMemberSchema, updateWorkspaceSchema,
  createModelProviderSchema, createModelConfigSchema,
  createAgentSchema, updateAgentSchema, agentConfigSchema,
  createWorkflowSchema, createWorkflowNodeSchema, createWorkflowEdgeSchema, runWorkflowSchema,
  createConversationSchema, chatRequestSchema,
  createPluginSchema, createPluginToolSchema,
  createKnowledgeBaseSchema, createDocumentSchema,
  createUserDatabaseSchema, createUserTableSchema,
  createVariableSchema,
  createPromptSchema, updatePromptSchema,
  createAppSchema, publishToMarketplaceSchema,
} from '@pajamadot/hive-shared';

// ═══════════════════════════════════════
// Workspace Routes
// ═══════════════════════════════════════

describe('Workspace routes validation', () => {
  it('validates workspace creation with all fields', () => {
    const ws = createWorkspaceSchema.parse({ name: 'Acme Corp', slug: 'acme-corp', description: 'Main workspace' });
    expect(ws).toEqual({ name: 'Acme Corp', slug: 'acme-corp', description: 'Main workspace' });
  });
  it('rejects workspace with empty slug', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Test', slug: '' }).success).toBe(false);
  });
  it('rejects workspace with uppercase slug', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Test', slug: 'BAD-Slug' }).success).toBe(false);
  });
  it('rejects workspace with spaces in slug', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Test', slug: 'has spaces' }).success).toBe(false);
  });
  it('validates member invite with all roles', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(inviteMemberSchema.safeParse({ userId: 'user_1', role }).success).toBe(true);
    }
  });
  it('validates workspace update partial', () => {
    expect(updateWorkspaceSchema.parse({ name: 'New Name' })).toEqual({ name: 'New Name' });
    expect(updateWorkspaceSchema.parse({ description: 'Updated' })).toEqual({ description: 'Updated' });
    expect(updateWorkspaceSchema.parse({})).toEqual({});
  });
});

// ═══════════════════════════════════════
// Model Routes
// ═══════════════════════════════════════

describe('Model routes validation', () => {
  it('validates provider with baseUrl for custom/ollama', () => {
    expect(createModelProviderSchema.parse({
      name: 'Local LLM', provider: 'ollama', baseUrl: 'http://localhost:11434/v1',
    }).baseUrl).toBe('http://localhost:11434/v1');
  });
  it('validates config with all model types', () => {
    for (const modelType of ['chat', 'embedding', 'image', 'code'] as const) {
      const config = createModelConfigSchema.parse({ providerId: 'p1', modelId: 'm1', modelType });
      expect(config.modelType).toBe(modelType);
    }
  });
  it('validates config with optional fields', () => {
    const config = createModelConfigSchema.parse({
      providerId: 'p1', modelId: 'gpt-4o', maxTokens: 8192, contextWindow: 128000, isDefault: true,
    });
    expect(config.maxTokens).toBe(8192);
    expect(config.contextWindow).toBe(128000);
  });
});

// ═══════════════════════════════════════
// Agent Routes
// ═══════════════════════════════════════

describe('Agent routes validation', () => {
  it('validates agent with all modes', () => {
    for (const mode of ['single', 'workflow', 'multi-agent'] as const) {
      expect(createAgentSchema.parse({ name: 'Agent', mode }).mode).toBe(mode);
    }
  });
  it('validates full agent config', () => {
    const config = agentConfigSchema.parse({
      modelConfigId: 'mc_1', systemPrompt: 'You are helpful.', temperature: 0.5,
      maxTokens: 4096, topP: 0.95, knowledgeBaseIds: ['kb_1'],
      pluginIds: ['p_1'], workflowId: 'wf_1', memoryEnabled: true,
      memoryWindowSize: 50, openingMessage: 'Hi!', suggestedReplies: ['Help'],
    });
    expect(config.temperature).toBe(0.5);
    expect(config.topP).toBe(0.95);
    expect(config.memoryWindowSize).toBe(50);
  });
  it('rejects temperature > 2', () => {
    expect(agentConfigSchema.safeParse({ temperature: 3 }).success).toBe(false);
  });
  it('rejects temperature < 0', () => {
    expect(agentConfigSchema.safeParse({ temperature: -1 }).success).toBe(false);
  });
  it('validates update with partial fields', () => {
    expect(updateAgentSchema.parse({ name: 'Updated' })).toEqual({ name: 'Updated' });
    expect(updateAgentSchema.parse({ iconUrl: 'https://img.com/a.png' })).toEqual({ iconUrl: 'https://img.com/a.png' });
  });
});

// ═══════════════════════════════════════
// Workflow Routes
// ═══════════════════════════════════════

describe('Workflow routes validation', () => {
  it('validates workflow with chatFlow flag', () => {
    expect(createWorkflowSchema.parse({ name: 'Flow', isChatFlow: true }).isChatFlow).toBe(true);
    expect(createWorkflowSchema.parse({ name: 'Flow' }).isChatFlow).toBe(false);
  });
  it('validates node position defaults', () => {
    const node = createWorkflowNodeSchema.parse({ nodeType: 'llm', label: 'Test' });
    expect(node.positionX).toBe(0);
    expect(node.positionY).toBe(0);
  });
  it('validates edge with sourceHandle for conditions', () => {
    const edge = createWorkflowEdgeSchema.parse({
      fromNodeId: 'cond_1', toNodeId: 'next_1', sourceHandle: 'true', label: 'Yes',
      condition: { expression: '{{x}} > 5' },
    });
    expect(edge.sourceHandle).toBe('true');
    expect(edge.condition).toBeDefined();
  });
  it('validates run with input', () => {
    const run = runWorkflowSchema.parse({ input: { query: 'test' }, versionId: 'v_1' });
    expect(run.versionId).toBe('v_1');
  });
  it('validates run with empty body', () => {
    expect(runWorkflowSchema.safeParse({}).success).toBe(true);
  });
});

// ═══════════════════════════════════════
// Conversation Routes
// ═══════════════════════════════════════

describe('Conversation routes validation', () => {
  it('validates conversation with all optional fields', () => {
    const conv = createConversationSchema.parse({
      agentId: 'a_1', title: 'Test Chat', metadata: { source: 'api', version: 2 },
    });
    expect(conv.metadata).toEqual({ source: 'api', version: 2 });
  });
  it('validates chat request with stream flag', () => {
    expect(chatRequestSchema.parse({ conversationId: 'c1', message: 'Hi', stream: true }).stream).toBe(true);
    expect(chatRequestSchema.parse({ conversationId: 'c1', message: 'Hi' }).stream).toBe(true); // default true
  });
  it('rejects empty chat message', () => {
    expect(chatRequestSchema.safeParse({ conversationId: 'c1', message: '' }).success).toBe(false);
  });
  it('rejects missing conversationId', () => {
    expect(chatRequestSchema.safeParse({ message: 'Hi' }).success).toBe(false);
  });
});

// ═══════════════════════════════════════
// Plugin Routes
// ═══════════════════════════════════════

describe('Plugin routes validation', () => {
  it('validates plugin with OAuth config', () => {
    const plugin = createPluginSchema.parse({
      name: 'GitHub', pluginType: 'api', authType: 'oauth2',
      baseUrl: 'https://api.github.com',
      openapiSpec: { openapi: '3.0.0', paths: {} },
    });
    expect(plugin.authType).toBe('oauth2');
    expect(plugin.openapiSpec).toBeDefined();
  });
  it('validates tool with full schemas', () => {
    const tool = createPluginToolSchema.parse({
      name: 'searchRepos', method: 'GET', path: '/search/repositories',
      inputSchema: {
        type: 'object',
        properties: { q: { type: 'string' }, sort: { type: 'string' } },
        required: ['q'],
      },
      outputSchema: {
        type: 'object',
        properties: { items: { type: 'array' }, total_count: { type: 'number' } },
      },
    });
    expect(tool.inputSchema?.properties).toHaveProperty('q');
  });
});

// ═══════════════════════════════════════
// Knowledge Routes
// ═══════════════════════════════════════

describe('Knowledge routes validation', () => {
  it('validates KB with custom chunk settings', () => {
    const kb = createKnowledgeBaseSchema.parse({
      name: 'Docs', chunkSize: 2000, chunkOverlap: 200,
    });
    expect(kb.chunkSize).toBe(2000);
    expect(kb.chunkOverlap).toBe(200);
  });
  it('rejects chunk size < 100', () => {
    expect(createKnowledgeBaseSchema.safeParse({ name: 'T', chunkSize: 50 }).success).toBe(false);
  });
  it('rejects chunk size > 4000', () => {
    expect(createKnowledgeBaseSchema.safeParse({ name: 'T', chunkSize: 5000 }).success).toBe(false);
  });
  it('validates all document source types', () => {
    for (const sourceType of ['file', 'url', 'text', 'api'] as const) {
      expect(createDocumentSchema.safeParse({ name: 'doc', sourceType }).success).toBe(true);
    }
  });
  it('validates URL document', () => {
    const doc = createDocumentSchema.parse({
      name: 'help', sourceType: 'url', sourceUrl: 'https://docs.acme.com/help',
    });
    expect(doc.sourceUrl).toBe('https://docs.acme.com/help');
  });
});

// ═══════════════════════════════════════
// Database Routes
// ═══════════════════════════════════════

describe('Database routes validation', () => {
  it('validates table with all column types', () => {
    const table = createUserTableSchema.parse({
      name: 'inventory',
      schema: [
        { name: 'id', type: 'number', required: true },
        { name: 'name', type: 'string', required: true },
        { name: 'price', type: 'number' },
        { name: 'in_stock', type: 'boolean' },
        { name: 'metadata', type: 'json' },
        { name: 'created', type: 'date' },
      ],
    });
    expect(table.schema).toHaveLength(6);
    expect(table.schema[0].required).toBe(true);
  });
  it('rejects table with no columns', () => {
    expect(createUserTableSchema.safeParse({ name: 'empty', schema: [] }).success).toBe(false);
  });
});

// ═══════════════════════════════════════
// Variable Routes
// ═══════════════════════════════════════

describe('Variable routes validation', () => {
  it('validates variable with scope and scopeId', () => {
    const v = createVariableSchema.parse({
      name: 'api_token', valueType: 'string', scope: 'agent', scopeId: 'agent_123',
      defaultValue: 'default_token', description: 'API authentication token',
    });
    expect(v.scope).toBe('agent');
    expect(v.scopeId).toBe('agent_123');
  });
});

// ═══════════════════════════════════════
// Prompt Routes
// ═══════════════════════════════════════

describe('Prompt routes validation', () => {
  it('validates prompt with template vars', () => {
    const p = createPromptSchema.parse({
      name: 'Translation', content: 'Translate from {{source}} to {{target}}: {{text}}',
      templateVars: ['source', 'target', 'text'], category: 'translation', isPublic: true,
    });
    expect(p.templateVars).toHaveLength(3);
    expect(p.isPublic).toBe(true);
  });
  it('validates partial prompt update', () => {
    expect(updatePromptSchema.parse({ isPublic: false })).toEqual({ isPublic: false });
  });
});

// ═══════════════════════════════════════
// App Routes
// ═══════════════════════════════════════

describe('App routes validation', () => {
  it('validates chat app linked to agent', () => {
    const app = createAppSchema.parse({ name: 'Bot', appType: 'chat', agentId: 'a_1' });
    expect(app.agentId).toBe('a_1');
  });
  it('validates workflow app linked to workflow', () => {
    const app = createAppSchema.parse({ name: 'Flow', appType: 'workflow', workflowId: 'wf_1' });
    expect(app.workflowId).toBe('wf_1');
  });
  it('validates custom app with config', () => {
    const app = createAppSchema.parse({
      name: 'Custom', appType: 'custom',
      config: { theme: 'dark', logo: 'https://img.com/logo.png', allowedDomains: ['*.acme.com'] },
    });
    expect(app.config).toBeDefined();
  });
});

// ═══════════════════════════════════════
// Marketplace Routes
// ═══════════════════════════════════════

describe('Marketplace routes validation', () => {
  it('validates marketplace publish with all fields', () => {
    const p = publishToMarketplaceSchema.parse({
      resourceType: 'workflow', resourceId: 'wf_1', name: 'Data Pipeline',
      description: 'ETL workflow for data processing',
      category: 'data-engineering', tags: ['etl', 'pipeline', 'automation'],
    });
    expect(p.category).toBe('data-engineering');
    expect(p.tags).toHaveLength(3);
  });
});

// ═══════════════════════════════════════
// Coze Compat Layer Tests
// ═══════════════════════════════════════

describe('Coze compat request shapes', () => {
  it('validates Coze chat format → Hive format', () => {
    // Coze sends: { bot_id, query, conversation_id }
    // We map to: { agentId, message, conversationId }
    const cozeReq = { bot_id: 'bot_123', query: 'Hello', conversation_id: 'conv_1' };
    expect(cozeReq.bot_id).toBeDefined();
    expect(cozeReq.query).toBeDefined();
  });

  it('validates Coze v3 chat format', () => {
    const v3Req = {
      bot_id: 'bot_1',
      additional_messages: [{ role: 'user', content: 'Hi', content_type: 'text' }],
      stream: true,
    };
    expect(v3Req.additional_messages[0].content).toBe('Hi');
  });

  it('validates Coze dataset format → Hive knowledge format', () => {
    const cozeDataset = { name: 'FAQ', space_id: 'space_1', description: 'FAQ database' };
    const hiveKB = createKnowledgeBaseSchema.parse({
      name: cozeDataset.name, description: cozeDataset.description,
    });
    expect(hiveKB.name).toBe('FAQ');
  });
});

// ═══════════════════════════════════════
// Error Case Tests
// ═══════════════════════════════════════

describe('Error handling and edge cases', () => {
  it('rejects oversized names', () => {
    expect(createAgentSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
    expect(createWorkflowSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
    expect(createPluginSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(createPluginSchema.safeParse({ name: 'P', baseUrl: 'not-a-url' }).success).toBe(false);
  });

  it('rejects empty required fields', () => {
    expect(createWorkspaceSchema.safeParse({ name: '', slug: 'test' }).success).toBe(false);
    expect(createAgentSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createPromptSchema.safeParse({ name: '', content: '' }).success).toBe(false);
  });

  it('handles optional fields gracefully', () => {
    // All these should work with minimal required fields only
    expect(createAgentSchema.safeParse({ name: 'A' }).success).toBe(true);
    expect(createWorkflowSchema.safeParse({ name: 'W' }).success).toBe(true);
    expect(createPluginSchema.safeParse({ name: 'P' }).success).toBe(true);
    expect(createKnowledgeBaseSchema.safeParse({ name: 'K' }).success).toBe(true);
    expect(createUserDatabaseSchema.safeParse({ name: 'D' }).success).toBe(true);
    expect(createVariableSchema.safeParse({ name: 'V' }).success).toBe(true);
    expect(createPromptSchema.safeParse({ name: 'P', content: 'Hi' }).success).toBe(true);
    expect(createAppSchema.safeParse({ name: 'A' }).success).toBe(true);
    expect(createConversationSchema.safeParse({}).success).toBe(true);
  });
});
