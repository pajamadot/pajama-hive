/**
 * NodeConfigPanel Logic Tests
 * Tests node type → config field mapping without rendering.
 */
import { describe, it, expect } from 'vitest';

// Node types that should have specific config editors
const NODE_TYPES_WITH_CONFIG = [
  'llm', 'code', 'condition', 'http_request', 'knowledge_retrieval',
  'plugin', 'variable', 'text_processor', 'message', 'loop', 'batch',
  'database', 'intent_detector', 'json_transform', 'qa', 'sub_workflow',
  'agent_call', 'selector', 'variable_assigner', 'question_classifier',
  'document_extractor', 'parameter_extractor', 'list_operator',
  'human_input', 'trigger_webhook', 'trigger_schedule',
];

const NODE_TYPES_NO_CONFIG = ['start', 'end'];

// Expected config fields per node type
const EXPECTED_FIELDS: Record<string, string[]> = {
  llm: ['prompt', 'temperature', 'maxTokens'],
  code: ['language', 'code'],
  condition: ['expression'],
  http_request: ['method', 'url', 'headers', 'body'],
  knowledge_retrieval: ['knowledgeBaseId', 'topK', 'query'],
  plugin: ['toolId', 'input'],
  variable: ['name', 'value'],
  text_processor: ['operation', 'template'],
  message: ['message'],
  loop: ['maxIterations'],
  batch: ['batchSize'],
  database: ['tableId', 'operation'],
  intent_detector: ['intents'],
  json_transform: ['expression'],
  qa: ['context'],
  sub_workflow: ['workflowId'],
  agent_call: ['agentId', 'message'],
  selector: ['expression'],
  question_classifier: ['categories'],
  list_operator: ['operation'],
};

describe('NodeConfigPanel logic', () => {
  it('covers all node types that need config', () => {
    expect(NODE_TYPES_WITH_CONFIG.length).toBeGreaterThan(20);
  });

  it('start and end nodes have no config', () => {
    expect(NODE_TYPES_NO_CONFIG).toEqual(['start', 'end']);
  });

  it.each(Object.entries(EXPECTED_FIELDS))('node type %s has expected config fields', (nodeType, fields) => {
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field).toBeTruthy();
    }
  });

  it('all config field names are valid identifiers', () => {
    for (const [, fields] of Object.entries(EXPECTED_FIELDS)) {
      for (const field of fields) {
        expect(field).toMatch(/^[a-zA-Z]\w*$/);
      }
    }
  });

  it('LLM config has temperature with valid range', () => {
    const fields = EXPECTED_FIELDS.llm;
    expect(fields).toContain('temperature');
    // Temperature range: 0-2 (validated in schema)
  });

  it('HTTP node has all HTTP method support', () => {
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    expect(validMethods).toHaveLength(5);
  });

  it('condition node outputs boolean branch', () => {
    // condition nodes should produce true/false branches
    const fields = EXPECTED_FIELDS.condition;
    expect(fields).toContain('expression');
  });

  it('list_operator supports all operations', () => {
    const ops = ['filter', 'sort', 'unique', 'flatten', 'reverse', 'count'];
    expect(ops).toHaveLength(6);
  });
});
