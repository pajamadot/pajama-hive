import { describe, it, expect } from 'vitest';
import {
  createGraphSchema,
  createTaskSchema,
  createEdgeSchema,
  graphExportSchema,
  batchTaskActionSchema,
  createApiKeySchema,
  createWebhookSchema,
  planOutputSchema,
  wsMessageSchema,
  workerRegisterSchema,
  taskResultSchema,
} from '@pajamadot/hive-shared';

describe('createGraphSchema', () => {
  it('validates valid graph', () => {
    expect(createGraphSchema.safeParse({ name: 'Test Graph' }).success).toBe(true);
  });
  it('rejects empty name', () => {
    expect(createGraphSchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('rejects long name', () => {
    expect(createGraphSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('createTaskSchema', () => {
  it('validates minimal task', () => {
    expect(createTaskSchema.safeParse({ title: 'Test', type: 'code' }).success).toBe(true);
  });
  it('applies defaults', () => {
    const result = createTaskSchema.parse({ title: 'Test', type: 'code' });
    expect(result.priority).toBe(100);
    expect(result.agentKind).toBe('cc');
    expect(result.timeoutMs).toBe(900000);
  });
  it('rejects invalid type', () => {
    expect(createTaskSchema.safeParse({ title: 'Test', type: 'invalid' }).success).toBe(false);
  });
  it('rejects negative priority', () => {
    expect(createTaskSchema.safeParse({ title: 'T', type: 'code', priority: -1 }).success).toBe(false);
  });
});

describe('createEdgeSchema', () => {
  it('validates edge', () => {
    expect(createEdgeSchema.safeParse({ fromTaskId: 'a', toTaskId: 'b' }).success).toBe(true);
  });
  it('rejects empty IDs', () => {
    expect(createEdgeSchema.safeParse({ fromTaskId: '', toTaskId: 'b' }).success).toBe(false);
  });
});

describe('graphExportSchema', () => {
  it('validates complete export', () => {
    const data = {
      version: '1.0',
      graph: { name: 'Test' },
      tasks: [{ refId: 't1', title: 'Task', type: 'code' }],
      edges: [],
    };
    expect(graphExportSchema.safeParse(data).success).toBe(true);
  });
  it('rejects wrong version', () => {
    const data = {
      version: '2.0',
      graph: { name: 'Test' },
      tasks: [{ refId: 't1', title: 'Task', type: 'code' }],
      edges: [],
    };
    expect(graphExportSchema.safeParse(data).success).toBe(false);
  });
  it('rejects empty tasks', () => {
    const data = {
      version: '1.0',
      graph: { name: 'Test' },
      tasks: [],
      edges: [],
    };
    expect(graphExportSchema.safeParse(data).success).toBe(false);
  });
});

describe('batchTaskActionSchema', () => {
  it('validates approve action', () => {
    expect(batchTaskActionSchema.safeParse({ action: 'approve', taskIds: ['t1'] }).success).toBe(true);
  });
  it('rejects unknown action', () => {
    expect(batchTaskActionSchema.safeParse({ action: 'delete', taskIds: ['t1'] }).success).toBe(false);
  });
  it('rejects empty taskIds', () => {
    expect(batchTaskActionSchema.safeParse({ action: 'cancel', taskIds: [] }).success).toBe(false);
  });
});

describe('createApiKeySchema', () => {
  it('validates key creation', () => {
    expect(createApiKeySchema.safeParse({ name: 'CI Key' }).success).toBe(true);
  });
  it('rejects empty name', () => {
    expect(createApiKeySchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('rejects expiry > 365 days', () => {
    expect(createApiKeySchema.safeParse({ name: 'K', expiresInDays: 400 }).success).toBe(false);
  });
});

describe('createWebhookSchema', () => {
  it('validates webhook', () => {
    expect(createWebhookSchema.safeParse({ url: 'https://example.com/hook', events: ['run.completed'] }).success).toBe(true);
  });
  it('rejects non-URL', () => {
    expect(createWebhookSchema.safeParse({ url: 'not-a-url', events: ['run.completed'] }).success).toBe(false);
  });
});

describe('wsMessageSchema', () => {
  it('validates message envelope', () => {
    const msg = { type: 'task.log', requestId: 'r1', ts: '2024-01-01T00:00:00Z', payload: {} };
    expect(wsMessageSchema.safeParse(msg).success).toBe(true);
  });
});

describe('taskResultSchema', () => {
  it('validates done result', () => {
    const result = { taskId: 't1', leaseId: 'l1', status: 'done', summary: 'ok' };
    expect(taskResultSchema.safeParse(result).success).toBe(true);
  });
  it('validates failed result', () => {
    const result = { taskId: 't1', leaseId: 'l1', status: 'failed', errorMessage: 'oops', errorKind: 'retryable' };
    expect(taskResultSchema.safeParse(result).success).toBe(true);
  });
  it('rejects invalid status', () => {
    expect(taskResultSchema.safeParse({ taskId: 't1', leaseId: 'l1', status: 'running' }).success).toBe(false);
  });
});

describe('planOutputSchema', () => {
  it('validates plan with edges', () => {
    const plan = {
      tasks: [
        { id: 't1', title: 'Code', type: 'code', input: 'write code' },
        { id: 't2', title: 'Test', type: 'test', input: 'npm test' },
      ],
      edges: [['t1', 't2']],
      assumptions: ['spec is done'],
      risks: ['may break'],
    };
    expect(planOutputSchema.safeParse(plan).success).toBe(true);
  });
  it('rejects plan task type "plan"', () => {
    const plan = {
      tasks: [{ id: 't1', title: 'Plan', type: 'plan', input: 'plan stuff' }],
      edges: [],
      assumptions: [],
      risks: [],
    };
    expect(planOutputSchema.safeParse(plan).success).toBe(false);
  });
});
