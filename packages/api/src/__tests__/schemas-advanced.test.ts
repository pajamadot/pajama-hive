import { describe, it, expect } from 'vitest';
import {
  graphExportSchema,
  planOutputSchema,
  workerRegisterSchema,
  taskAssignSchema,
  taskCancelSchema,
  graphUpdateSchema,
} from '@pajamadot/hive-shared';

describe('graphExportSchema — edge cases', () => {
  it('validates all task types', () => {
    const types = ['code', 'review', 'test', 'lint', 'docs', 'custom'];
    for (const type of types) {
      const data = {
        version: '1.0',
        graph: { name: 'Test' },
        tasks: [{ refId: 't1', title: 'Task', type }],
        edges: [],
      };
      expect(graphExportSchema.safeParse(data).success).toBe(true);
    }
  });

  it('validates all agent kinds in tasks', () => {
    for (const agentKind of ['cc', 'cx', 'generic']) {
      const data = {
        version: '1.0',
        graph: { name: 'Test' },
        tasks: [{ refId: 't1', title: 'Task', type: 'code', agentKind }],
        edges: [],
      };
      expect(graphExportSchema.safeParse(data).success).toBe(true);
    }
  });

  it('validates edges between tasks', () => {
    const data = {
      version: '1.0',
      graph: { name: 'Test' },
      tasks: [
        { refId: 't1', title: 'A', type: 'code' },
        { refId: 't2', title: 'B', type: 'test' },
      ],
      edges: [{ from: 't1', to: 't2' }],
    };
    expect(graphExportSchema.safeParse(data).success).toBe(true);
  });

  it('rejects invalid agent kind', () => {
    const data = {
      version: '1.0',
      graph: { name: 'Test' },
      tasks: [{ refId: 't1', title: 'Task', type: 'code', agentKind: 'invalid' }],
      edges: [],
    };
    expect(graphExportSchema.safeParse(data).success).toBe(false);
  });
});

describe('workerRegisterSchema', () => {
  it('validates full registration', () => {
    const data = {
      workerId: 'w1',
      agentKinds: ['cc', 'cx'],
      capabilities: ['git', 'docker'],
      workspaces: [{ workspaceId: 'ws1', pathHash: 'abc123' }],
      maxConcurrency: 3,
      version: '0.1.0',
    };
    expect(workerRegisterSchema.safeParse(data).success).toBe(true);
  });

  it('rejects empty agent kinds', () => {
    const data = {
      workerId: 'w1',
      agentKinds: [],
      capabilities: [],
      workspaces: [],
      maxConcurrency: 1,
      version: '0.1.0',
    };
    expect(workerRegisterSchema.safeParse(data).success).toBe(false);
  });

  it('rejects concurrency > 10', () => {
    const data = {
      workerId: 'w1',
      agentKinds: ['cc'],
      capabilities: [],
      workspaces: [],
      maxConcurrency: 11,
      version: '0.1.0',
    };
    expect(workerRegisterSchema.safeParse(data).success).toBe(false);
  });
});

describe('taskAssignSchema', () => {
  it('validates full assignment', () => {
    const data = {
      graphId: 'g1',
      runId: 'r1',
      taskId: 't1',
      leaseId: 'l1',
      leaseExpiresAt: '2024-01-01T00:00:00Z',
      agentKind: 'cc',
      input: 'do stuff',
      timeoutMs: 60000,
    };
    expect(taskAssignSchema.safeParse(data).success).toBe(true);
  });

  it('rejects timeout < 1000ms', () => {
    const data = {
      graphId: 'g1', runId: 'r1', taskId: 't1', leaseId: 'l1',
      leaseExpiresAt: '2024-01-01T00:00:00Z', agentKind: 'cc',
      input: 'x', timeoutMs: 500,
    };
    expect(taskAssignSchema.safeParse(data).success).toBe(false);
  });
});

describe('taskCancelSchema', () => {
  it('validates cancel message', () => {
    const data = { taskId: 't1', leaseId: 'l1', reason: 'User canceled' };
    expect(taskCancelSchema.safeParse(data).success).toBe(true);
  });
});

describe('graphUpdateSchema', () => {
  it('validates update with multiple tasks', () => {
    const data = {
      graphId: 'g1',
      tasks: [
        { taskId: 't1', status: 'done' },
        { taskId: 't2', status: 'running', assignedWorkerId: 'w1' },
      ],
    };
    expect(graphUpdateSchema.safeParse(data).success).toBe(true);
  });

  it('rejects invalid status', () => {
    const data = {
      graphId: 'g1',
      tasks: [{ taskId: 't1', status: 'invalid_status' }],
    };
    expect(graphUpdateSchema.safeParse(data).success).toBe(false);
  });
});

describe('planOutputSchema — edge cases', () => {
  it('validates plan with all task types (except plan)', () => {
    const types = ['code', 'review', 'test', 'lint', 'docs', 'custom'];
    const tasks = types.map((t, i) => ({ id: `t${i}`, title: `Task ${i}`, type: t, input: 'x' }));
    const plan = { tasks, edges: [], assumptions: [], risks: [] };
    expect(planOutputSchema.safeParse(plan).success).toBe(true);
  });

  it('validates plan with estimated minutes', () => {
    const plan = {
      tasks: [{ id: 't1', title: 'A', type: 'code', input: 'x', estimatedMinutes: 15 }],
      edges: [],
      assumptions: ['y'],
      risks: ['z'],
    };
    const result = planOutputSchema.parse(plan);
    expect(result.tasks[0].estimatedMinutes).toBe(15);
  });

  it('validates plan with required capabilities', () => {
    const plan = {
      tasks: [{ id: 't1', title: 'A', type: 'code', input: 'x', requiredCapabilities: ['git', 'docker'] }],
      edges: [],
      assumptions: [],
      risks: [],
    };
    expect(planOutputSchema.safeParse(plan).success).toBe(true);
  });
});
