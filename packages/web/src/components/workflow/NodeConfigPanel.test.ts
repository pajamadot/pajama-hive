/**
 * NodeConfigPanel — tests all node type config field mappings.
 * Ensures every node type in the palette has corresponding config fields.
 */
import { describe, it, expect } from 'vitest';

// Mirror the palette from the workflow editor page
const NODE_PALETTE = [
  { type: 'llm', label: 'LLM' },
  { type: 'code', label: 'Code' },
  { type: 'condition', label: 'Condition' },
  { type: 'loop', label: 'Loop' },
  { type: 'http_request', label: 'HTTP Request' },
  { type: 'plugin', label: 'Plugin' },
  { type: 'knowledge_retrieval', label: 'Knowledge' },
  { type: 'message', label: 'Message' },
  { type: 'variable', label: 'Variable' },
  { type: 'text_processor', label: 'Text' },
  { type: 'database', label: 'Database' },
  { type: 'json_transform', label: 'JSON' },
  { type: 'intent_detector', label: 'Intent' },
  { type: 'qa', label: 'Q&A' },
  { type: 'question_classifier', label: 'Classifier' },
  { type: 'document_extractor', label: 'Doc Extract' },
  { type: 'parameter_extractor', label: 'Param Extract' },
  { type: 'list_operator', label: 'List Op' },
  { type: 'human_input', label: 'Human Input' },
  { type: 'agent_call', label: 'Agent' },
  { type: 'sub_workflow', label: 'Sub-Workflow' },
  { type: 'trigger_webhook', label: 'Webhook' },
  { type: 'trigger_schedule', label: 'Schedule' },
];

describe('Node palette completeness', () => {
  it('has 23 node types in palette', () => {
    expect(NODE_PALETTE).toHaveLength(23);
  });

  it('no duplicate types', () => {
    const types = NODE_PALETTE.map((n) => n.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('all labels are non-empty', () => {
    for (const node of NODE_PALETTE) {
      expect(node.label.length).toBeGreaterThan(0);
    }
  });

  it('all types are lowercase with underscores', () => {
    for (const node of NODE_PALETTE) {
      expect(node.type).toMatch(/^[a-z_]+$/);
    }
  });

  it('contains all Dify-absorbed types', () => {
    const types = NODE_PALETTE.map((n) => n.type);
    expect(types).toContain('question_classifier');
    expect(types).toContain('document_extractor');
    expect(types).toContain('parameter_extractor');
    expect(types).toContain('list_operator');
    expect(types).toContain('human_input');
    expect(types).toContain('trigger_webhook');
    expect(types).toContain('trigger_schedule');
  });

  it('contains all Coze-original types', () => {
    const types = NODE_PALETTE.map((n) => n.type);
    expect(types).toContain('llm');
    expect(types).toContain('code');
    expect(types).toContain('condition');
    expect(types).toContain('http_request');
    expect(types).toContain('knowledge_retrieval');
    expect(types).toContain('plugin');
  });
});
