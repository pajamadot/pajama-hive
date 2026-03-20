/**
 * Table-Driven Tests (Coze Go Testing Pattern)
 *
 * Uses arrays of test cases with { name, input, expected, shouldFail }
 * to systematically cover every edge case for every schema.
 * Follows Coze's testify/assert table-driven pattern.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createWorkspaceSchema, createAgentSchema, agentConfigSchema,
  createWorkflowSchema, createWorkflowNodeSchema, createWorkflowEdgeSchema,
  createConversationSchema, chatRequestSchema,
  createPluginSchema, createPluginToolSchema,
  createKnowledgeBaseSchema, createDocumentSchema,
  createUserDatabaseSchema, createUserTableSchema,
  createVariableSchema, createPromptSchema,
  createAppSchema, publishToMarketplaceSchema,
  createModelProviderSchema, createModelConfigSchema,
  inviteMemberSchema,
  workflowNodeTypeSchema,
} from '@pajamadot/hive-shared';

// Helper for table-driven test pattern
function runTableTests<T extends z.ZodType>(
  schema: T,
  testCases: { name: string; input: unknown; shouldPass: boolean; expected?: Partial<z.output<T>> }[],
) {
  for (const tc of testCases) {
    it(tc.name, () => {
      const result = schema.safeParse(tc.input);
      if (tc.shouldPass) {
        expect(result.success, `Expected pass but got: ${JSON.stringify((result as { error?: unknown }).error)}`).toBe(true);
        if (tc.expected && result.success) {
          for (const [key, value] of Object.entries(tc.expected)) {
            expect((result.data as Record<string, unknown>)[key]).toEqual(value);
          }
        }
      } else {
        expect(result.success, `Expected fail but got: ${JSON.stringify(result)}`).toBe(false);
      }
    });
  }
}

// ═══════════════════════════════════════
// Workspace Schema — Table-Driven
// ═══════════════════════════════════════

describe('Workspace schema (table-driven)', () => {
  runTableTests(createWorkspaceSchema, [
    { name: 'valid minimal', input: { name: 'Test', slug: 'test' }, shouldPass: true },
    { name: 'valid with description', input: { name: 'Test', slug: 'test-ws', description: 'A workspace' }, shouldPass: true },
    { name: 'valid slug with numbers', input: { name: 'W', slug: 'ws-123' }, shouldPass: true },
    { name: 'reject empty name', input: { name: '', slug: 'test' }, shouldPass: false },
    { name: 'reject empty slug', input: { name: 'T', slug: '' }, shouldPass: false },
    { name: 'reject uppercase slug', input: { name: 'T', slug: 'BAD' }, shouldPass: false },
    { name: 'reject slug with spaces', input: { name: 'T', slug: 'has space' }, shouldPass: false },
    { name: 'reject slug with special chars', input: { name: 'T', slug: 'bad@slug!' }, shouldPass: false },
    { name: 'reject missing slug', input: { name: 'T' }, shouldPass: false },
    { name: 'reject missing name', input: { slug: 'test' }, shouldPass: false },
    { name: 'reject null input', input: null, shouldPass: false },
    { name: 'reject too long name', input: { name: 'x'.repeat(101), slug: 'test' }, shouldPass: false },
    { name: 'reject too long slug', input: { name: 'T', slug: 'x'.repeat(51) }, shouldPass: false },
  ]);
});

// ═══════════════════════════════════════
// Agent Schema — Table-Driven
// ═══════════════════════════════════════

describe('Agent schema (table-driven)', () => {
  runTableTests(createAgentSchema, [
    { name: 'valid minimal', input: { name: 'Bot' }, shouldPass: true, expected: { mode: 'single' } },
    { name: 'valid single mode', input: { name: 'B', mode: 'single' }, shouldPass: true },
    { name: 'valid workflow mode', input: { name: 'B', mode: 'workflow' }, shouldPass: true },
    { name: 'valid multi-agent', input: { name: 'B', mode: 'multi-agent' }, shouldPass: true },
    { name: 'valid with all fields', input: { name: 'Bot', description: 'A bot', mode: 'single', iconUrl: 'https://img.com/a.png' }, shouldPass: true },
    { name: 'reject empty name', input: { name: '' }, shouldPass: false },
    { name: 'reject too long name', input: { name: 'x'.repeat(201) }, shouldPass: false },
    { name: 'reject invalid mode', input: { name: 'B', mode: 'invalid' }, shouldPass: false },
    { name: 'reject invalid iconUrl', input: { name: 'B', iconUrl: 'not-a-url' }, shouldPass: false },
  ]);
});

// ═══════════════════════════════════════
// Agent Config — Table-Driven
// ═══════════════════════════════════════

describe('Agent config (table-driven)', () => {
  runTableTests(agentConfigSchema, [
    { name: 'empty config valid', input: {}, shouldPass: true },
    { name: 'valid temperature 0', input: { temperature: 0 }, shouldPass: true },
    { name: 'valid temperature 2', input: { temperature: 2 }, shouldPass: true },
    { name: 'reject temperature -1', input: { temperature: -1 }, shouldPass: false },
    { name: 'reject temperature 3', input: { temperature: 3 }, shouldPass: false },
    { name: 'valid topP 0', input: { topP: 0 }, shouldPass: true },
    { name: 'valid topP 1', input: { topP: 1 }, shouldPass: true },
    { name: 'reject topP > 1', input: { topP: 1.5 }, shouldPass: false },
    { name: 'reject topP < 0', input: { topP: -0.1 }, shouldPass: false },
    { name: 'valid memoryWindowSize 1', input: { memoryWindowSize: 1 }, shouldPass: true },
    { name: 'valid memoryWindowSize 100', input: { memoryWindowSize: 100 }, shouldPass: true },
    { name: 'reject memoryWindowSize 0', input: { memoryWindowSize: 0 }, shouldPass: false },
    { name: 'reject memoryWindowSize 101', input: { memoryWindowSize: 101 }, shouldPass: false },
    { name: 'valid full config', input: {
      modelConfigId: 'mc_1', systemPrompt: 'You are a bot.', temperature: 0.7,
      maxTokens: 4096, topP: 0.95, memoryEnabled: true, memoryWindowSize: 20,
      knowledgeBaseIds: ['kb_1'], pluginIds: ['p_1'], workflowId: 'wf_1',
      openingMessage: 'Hi', suggestedReplies: ['A', 'B'],
    }, shouldPass: true },
  ]);
});

// ═══════════════════════════════════════
// Workflow Node Types — Exhaustive
// ═══════════════════════════════════════

describe('Workflow node types (exhaustive)', () => {
  const allTypes = [
    'start', 'end', 'llm', 'code', 'condition', 'loop', 'variable',
    'http_request', 'plugin', 'knowledge_retrieval', 'message',
    'sub_workflow', 'database', 'image_gen', 'text_processor',
    'intent_detector', 'variable_assigner', 'batch', 'selector',
    'json_transform', 'qa', 'emitter', 'receiver',
  ];

  const cases = allTypes.map((type) => ({
    name: `valid: ${type}`,
    input: { nodeType: type, label: type },
    shouldPass: true,
  }));

  cases.push(
    { name: 'reject: empty type', input: { nodeType: '', label: 'x' }, shouldPass: false },
    { name: 'reject: unknown type', input: { nodeType: 'magic', label: 'x' }, shouldPass: false },
    { name: 'reject: null type', input: { nodeType: null, label: 'x' }, shouldPass: false },
  );

  runTableTests(createWorkflowNodeSchema, cases);
});

// ═══════════════════════════════════════
// Knowledge Base — Table-Driven
// ═══════════════════════════════════════

describe('Knowledge base schema (table-driven)', () => {
  runTableTests(createKnowledgeBaseSchema, [
    { name: 'valid minimal', input: { name: 'KB' }, shouldPass: true, expected: { chunkSize: 500, chunkOverlap: 50 } },
    { name: 'valid custom chunks', input: { name: 'KB', chunkSize: 1000, chunkOverlap: 100 }, shouldPass: true },
    { name: 'valid max chunk size', input: { name: 'KB', chunkSize: 4000 }, shouldPass: true },
    { name: 'valid min chunk size', input: { name: 'KB', chunkSize: 100 }, shouldPass: true },
    { name: 'reject chunk < 100', input: { name: 'KB', chunkSize: 99 }, shouldPass: false },
    { name: 'reject chunk > 4000', input: { name: 'KB', chunkSize: 4001 }, shouldPass: false },
    { name: 'reject overlap > 500', input: { name: 'KB', chunkOverlap: 501 }, shouldPass: false },
    { name: 'reject overlap < 0', input: { name: 'KB', chunkOverlap: -1 }, shouldPass: false },
    { name: 'reject empty name', input: { name: '' }, shouldPass: false },
  ]);
});

// ═══════════════════════════════════════
// Model Provider — Table-Driven
// ═══════════════════════════════════════

describe('Model provider schema (table-driven)', () => {
  const providers = ['openai', 'anthropic', 'google', 'volcengine', 'deepseek', 'qwen', 'ollama', 'custom'];
  const cases = providers.map((p) => ({
    name: `valid: ${p}`,
    input: { name: p, provider: p },
    shouldPass: true,
  }));
  cases.push(
    { name: 'valid with API key', input: { name: 'OAI', provider: 'openai', apiKey: 'sk-test' }, shouldPass: true },
    { name: 'valid with base URL', input: { name: 'Custom', provider: 'custom', baseUrl: 'https://api.my.com/v1' }, shouldPass: true },
    { name: 'reject unknown provider', input: { name: 'X', provider: 'llama-cloud' }, shouldPass: false },
    { name: 'reject empty name', input: { name: '', provider: 'openai' }, shouldPass: false },
  );

  runTableTests(createModelProviderSchema, cases);
});

// ═══════════════════════════════════════
// Chat Request — Table-Driven
// ═══════════════════════════════════════

describe('Chat request schema (table-driven)', () => {
  runTableTests(chatRequestSchema, [
    { name: 'valid minimal', input: { conversationId: 'c1', message: 'Hi' }, shouldPass: true, expected: { stream: true } },
    { name: 'valid with stream=false', input: { conversationId: 'c1', message: 'Hi', stream: false }, shouldPass: true },
    { name: 'reject empty message', input: { conversationId: 'c1', message: '' }, shouldPass: false },
    { name: 'reject missing conversationId', input: { message: 'Hi' }, shouldPass: false },
    { name: 'reject missing message', input: { conversationId: 'c1' }, shouldPass: false },
    { name: 'reject null', input: null, shouldPass: false },
  ]);
});

// ═══════════════════════════════════════
// Plugin Tool — Table-Driven
// ═══════════════════════════════════════

describe('Plugin tool schema (table-driven)', () => {
  runTableTests(createPluginToolSchema, [
    { name: 'valid GET', input: { name: 'get', path: '/items', method: 'GET' }, shouldPass: true },
    { name: 'valid POST', input: { name: 'create', path: '/items', method: 'POST' }, shouldPass: true },
    { name: 'valid PUT', input: { name: 'update', path: '/items/:id', method: 'PUT' }, shouldPass: true },
    { name: 'valid DELETE', input: { name: 'delete', path: '/items/:id', method: 'DELETE' }, shouldPass: true },
    { name: 'valid with schemas', input: {
      name: 'search', path: '/search', method: 'POST',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { results: { type: 'array' } } },
    }, shouldPass: true },
    { name: 'reject empty name', input: { name: '', path: '/x' }, shouldPass: false },
    { name: 'reject empty path', input: { name: 'x', path: '' }, shouldPass: false },
    { name: 'reject invalid method', input: { name: 'x', path: '/x', method: 'PATCH' }, shouldPass: false },
  ]);
});

// ═══════════════════════════════════════
// Marketplace — Table-Driven
// ═══════════════════════════════════════

describe('Marketplace publish (table-driven)', () => {
  runTableTests(publishToMarketplaceSchema, [
    { name: 'valid agent', input: { resourceType: 'agent', resourceId: 'a_1', name: 'Bot' }, shouldPass: true },
    { name: 'valid plugin', input: { resourceType: 'plugin', resourceId: 'p_1', name: 'API' }, shouldPass: true },
    { name: 'valid workflow', input: { resourceType: 'workflow', resourceId: 'w_1', name: 'Flow' }, shouldPass: true },
    { name: 'valid prompt', input: { resourceType: 'prompt', resourceId: 'pr_1', name: 'Template' }, shouldPass: true },
    { name: 'valid with tags', input: { resourceType: 'agent', resourceId: 'a_1', name: 'Bot', tags: ['ai', 'chat'] }, shouldPass: true },
    { name: 'reject invalid type', input: { resourceType: 'model', resourceId: 'x', name: 'X' }, shouldPass: false },
    { name: 'reject empty name', input: { resourceType: 'agent', resourceId: 'a_1', name: '' }, shouldPass: false },
    { name: 'reject missing id', input: { resourceType: 'agent', name: 'Bot' }, shouldPass: false },
  ]);
});

// ═══════════════════════════════════════
// Variable — Table-Driven
// ═══════════════════════════════════════

describe('Variable schema (table-driven)', () => {
  const scopes = ['workspace', 'agent', 'conversation', 'workflow'] as const;
  const types = ['string', 'number', 'boolean', 'json', 'array'] as const;

  // Test all scope × type combinations
  const combos: { name: string; input: unknown; shouldPass: boolean }[] = [];
  for (const scope of scopes) {
    for (const valueType of types) {
      combos.push({
        name: `valid: ${scope}/${valueType}`,
        input: { name: `var_${scope}_${valueType}`, scope, valueType },
        shouldPass: true,
      });
    }
  }
  combos.push(
    { name: 'reject invalid scope', input: { name: 'v', scope: 'global' }, shouldPass: false },
    { name: 'reject invalid type', input: { name: 'v', valueType: 'date' }, shouldPass: false },
    { name: 'reject empty name', input: { name: '' }, shouldPass: false },
  );

  runTableTests(createVariableSchema, combos);
});

// ═══════════════════════════════════════
// Document Source Types — Table-Driven
// ═══════════════════════════════════════

describe('Document schema (table-driven)', () => {
  runTableTests(createDocumentSchema, [
    { name: 'valid file', input: { name: 'doc.pdf', sourceType: 'file' }, shouldPass: true },
    { name: 'valid url', input: { name: 'page', sourceType: 'url', sourceUrl: 'https://docs.com' }, shouldPass: true },
    { name: 'valid text', input: { name: 'note', sourceType: 'text', content: 'Hello world' }, shouldPass: true },
    { name: 'valid api', input: { name: 'feed', sourceType: 'api' }, shouldPass: true },
    { name: 'reject invalid source type', input: { name: 'x', sourceType: 'ftp' }, shouldPass: false },
    { name: 'reject empty name', input: { name: '' }, shouldPass: false },
  ]);
});

// ═══════════════════════════════════════
// Chunker Property Tests
// ═══════════════════════════════════════

describe('Chunker property tests', () => {
  it('chunk count increases with longer text', async () => {
    const { chunkText } = await import('../lib/chunker.js');
    const short = chunkText('A short sentence.', 100, 10);
    const medium = chunkText(Array(10).fill('This is a medium length sentence for testing.').join(' '), 100, 10);
    const long = chunkText(Array(50).fill('This is a long paragraph with many words to test chunking behavior.').join(' '), 100, 10);

    expect(short.length).toBeLessThanOrEqual(medium.length);
    expect(medium.length).toBeLessThanOrEqual(long.length);
  });

  it('chunks never exceed max size significantly', async () => {
    const { chunkText } = await import('../lib/chunker.js');
    const text = Array(100).fill('Word').join(' ') + '. ' + Array(100).fill('More').join(' ') + '.';
    const chunks = chunkText(text, 50, 10);
    for (const chunk of chunks) {
      // Token estimate: length / 4
      const estimatedTokens = chunk.content.length / 4;
      // Allow 2x buffer since we split on sentences not tokens
      expect(estimatedTokens).toBeLessThan(200);
    }
  });

  it('all chunk indices are sequential', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    const text = Array(30).fill('Sentence number X is here.').join(' ');
    const chunks = processDocument(text, 'doc_1', 100, 20);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });

  it('empty input produces no chunks', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    expect(processDocument('', 'doc', 500, 50)).toHaveLength(0);
    expect(processDocument('   ', 'doc', 500, 50)).toHaveLength(0);
    expect(processDocument('\n\n\n', 'doc', 500, 50)).toHaveLength(0);
  });
});
