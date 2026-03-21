/**
 * Tests for newly absorbed Coze+Dify features.
 * Covers: new node types, app modes, connectors, feedback, MCP tools.
 */
import { describe, it, expect } from 'vitest';
import {
  createWorkflowNodeSchema, appTypeSchema, messageFeedbackSchema,
  createConnectorSchema, connectorTypeSchema, workflowNodeTypeSchema,
} from '@pajamadot/hive-shared';
import { HIVE_MCP_TOOLS } from '../../../shared/src/mcp-tools.js';

describe('New workflow node types (Dify-absorbed)', () => {
  const newTypes = [
    'question_classifier', 'document_extractor', 'parameter_extractor',
    'list_operator', 'trigger_webhook', 'trigger_schedule', 'human_input', 'agent_call',
  ];

  it.each(newTypes)('node type %s is valid', (type) => {
    expect(workflowNodeTypeSchema.safeParse(type).success).toBe(true);
    expect(createWorkflowNodeSchema.safeParse({ nodeType: type, label: type }).success).toBe(true);
  });

  it('has 31 total node types', () => {
    const allTypes = workflowNodeTypeSchema.options;
    expect(allTypes.length).toBe(31);
  });

  it('question_classifier config', () => {
    expect(createWorkflowNodeSchema.safeParse({
      nodeType: 'question_classifier', label: 'Classify',
      config: { categories: ['billing', 'support', 'sales'] },
    }).success).toBe(true);
  });

  it('document_extractor config', () => {
    expect(createWorkflowNodeSchema.safeParse({
      nodeType: 'document_extractor', label: 'Extract',
      config: { schema: 'Extract name, email, phone as JSON' },
    }).success).toBe(true);
  });

  it('list_operator config', () => {
    expect(createWorkflowNodeSchema.safeParse({
      nodeType: 'list_operator', label: 'Filter',
      config: { operation: 'unique' },
    }).success).toBe(true);
  });

  it('trigger_webhook config', () => {
    expect(createWorkflowNodeSchema.safeParse({
      nodeType: 'trigger_webhook', label: 'Webhook',
      config: { path: '/hooks/my-workflow' },
    }).success).toBe(true);
  });

  it('human_input config', () => {
    expect(createWorkflowNodeSchema.safeParse({
      nodeType: 'human_input', label: 'Approve',
      config: { formSchema: { fields: [{ name: 'approved', type: 'boolean' }] }, expiresInHours: 24 },
    }).success).toBe(true);
  });
});

describe('Extended app modes (Dify pattern)', () => {
  it.each(['chat', 'advanced-chat', 'agent-chat', 'workflow', 'completion', 'custom'])(
    'app type %s is valid', (type) => {
      expect(appTypeSchema.safeParse(type).success).toBe(true);
    },
  );

  it('has 6 app types', () => {
    expect(appTypeSchema.options.length).toBe(6);
  });

  it('rejects invalid app type', () => {
    expect(appTypeSchema.safeParse('rag-pipeline').success).toBe(false);
  });
});

describe('Message feedback (Dify pattern)', () => {
  it('validates thumbs up', () => {
    expect(messageFeedbackSchema.safeParse({ messageId: 'm1', rating: 'thumbs_up' }).success).toBe(true);
  });

  it('validates thumbs down with comment', () => {
    expect(messageFeedbackSchema.safeParse({
      messageId: 'm1', rating: 'thumbs_down', comment: 'Wrong answer',
    }).success).toBe(true);
  });

  it('rejects invalid rating', () => {
    expect(messageFeedbackSchema.safeParse({ messageId: 'm1', rating: 'neutral' }).success).toBe(false);
  });

  it('rejects missing messageId', () => {
    expect(messageFeedbackSchema.safeParse({ rating: 'thumbs_up' }).success).toBe(false);
  });
});

describe('Agent connectors (Coze pattern)', () => {
  it.each(['web', 'api', 'embed', 'slack', 'discord', 'telegram'])(
    'connector type %s is valid', (type) => {
      expect(connectorTypeSchema.safeParse(type).success).toBe(true);
    },
  );

  it('has 6 connector types', () => {
    expect(connectorTypeSchema.options.length).toBe(6);
  });

  it('validates connector creation', () => {
    expect(createConnectorSchema.safeParse({
      agentId: 'agent_1', connectorType: 'web', name: 'Web Chat',
    }).success).toBe(true);
  });

  it('validates connector with config', () => {
    expect(createConnectorSchema.safeParse({
      agentId: 'a1', connectorType: 'slack', name: 'Slack Bot',
      config: { channelId: 'C12345', botToken: 'xoxb-...' },
    }).success).toBe(true);
  });

  it('rejects invalid connector type', () => {
    expect(createConnectorSchema.safeParse({
      agentId: 'a1', connectorType: 'whatsapp', name: 'WA',
    }).success).toBe(false);
  });
});

describe('MCP tools completeness', () => {
  it('has 12 tools', () => {
    expect(HIVE_MCP_TOOLS).toHaveLength(12);
  });

  it('covers all core domains', () => {
    const names = HIVE_MCP_TOOLS.map((t) => t.name);
    expect(names).toContain('hive_agent_invoke');
    expect(names).toContain('hive_agent_list');
    expect(names).toContain('hive_agent_create');
    expect(names).toContain('hive_workflow_run');
    expect(names).toContain('hive_workflow_list');
    expect(names).toContain('hive_knowledge_search');
    expect(names).toContain('hive_knowledge_list');
    expect(names).toContain('hive_knowledge_upload');
    expect(names).toContain('hive_chat');
    expect(names).toContain('hive_plugin_execute');
    expect(names).toContain('hive_prompt_render');
    expect(names).toContain('hive_database_query');
  });

  it('all tools have descriptions > 20 chars', () => {
    for (const tool of HIVE_MCP_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('all tools have input schemas', () => {
    for (const tool of HIVE_MCP_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });
});
