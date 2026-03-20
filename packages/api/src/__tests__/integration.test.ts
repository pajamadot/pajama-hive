import { describe, it, expect } from 'vitest';
import { detectCycle, findReadyNodes, topologicalSort } from '../lib/dag.js';
import { scheduleAssignments } from '../lib/scheduler.js';
import { validatePlanOutput } from '../lib/plan-validator.js';
import { createLease, isLeaseExpired, isLeaseValid } from '../lib/lease.js';

/**
 * Integration-style tests that simulate real orchestration scenarios.
 */

describe('full DAG execution simulation', () => {
  // Simulates a complete graph: code → test → review → deploy
  const nodes = ['code', 'lint', 'test', 'review', 'deploy'];
  const edges = [
    { from: 'code', to: 'lint' },
    { from: 'code', to: 'test' },
    { from: 'lint', to: 'review' },
    { from: 'test', to: 'review' },
    { from: 'review', to: 'deploy' },
  ];

  it('has no cycles', () => {
    expect(detectCycle(nodes, edges)).toBeNull();
  });

  it('topological sort puts code first and deploy last', () => {
    const sorted = topologicalSort(nodes, edges);
    expect(sorted[0]).toBe('code');
    expect(sorted[sorted.length - 1]).toBe('deploy');
    expect(sorted.indexOf('code')).toBeLessThan(sorted.indexOf('lint'));
    expect(sorted.indexOf('code')).toBeLessThan(sorted.indexOf('test'));
    expect(sorted.indexOf('lint')).toBeLessThan(sorted.indexOf('review'));
    expect(sorted.indexOf('test')).toBeLessThan(sorted.indexOf('review'));
    expect(sorted.indexOf('review')).toBeLessThan(sorted.indexOf('deploy'));
  });

  it('step 1: only code is ready initially', () => {
    const done = new Set<string>();
    const statuses = new Map(nodes.map((n) => [n, 'pending']));
    const ready = findReadyNodes(nodes, edges, done, statuses);
    expect(ready).toEqual(['code']);
  });

  it('step 2: after code completes, lint and test are ready in parallel', () => {
    const done = new Set(['code']);
    const statuses = new Map<string, string>([
      ['code', 'done'], ['lint', 'pending'], ['test', 'pending'],
      ['review', 'pending'], ['deploy', 'pending'],
    ]);
    const ready = findReadyNodes(nodes, edges, done, statuses);
    expect(ready).toContain('lint');
    expect(ready).toContain('test');
    expect(ready).not.toContain('review');
  });

  it('step 3: after lint+test, review is ready', () => {
    const done = new Set(['code', 'lint', 'test']);
    const statuses = new Map<string, string>([
      ['code', 'done'], ['lint', 'done'], ['test', 'done'],
      ['review', 'pending'], ['deploy', 'pending'],
    ]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual(['review']);
  });

  it('step 4: after review, deploy is ready', () => {
    const done = new Set(['code', 'lint', 'test', 'review']);
    const statuses = new Map<string, string>([
      ['code', 'done'], ['lint', 'done'], ['test', 'done'],
      ['review', 'done'], ['deploy', 'pending'],
    ]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual(['deploy']);
  });

  it('schedules parallel tasks to separate workers', () => {
    const readyTasks = [
      { id: 'lint', priority: 100, agentKind: 'generic' as const, requiredCapabilities: [] },
      { id: 'test', priority: 100, agentKind: 'generic' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['generic' as const], capabilities: [] },
      { id: 'w2', agentKinds: ['generic' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(readyTasks, workers);
    expect(assignments).toHaveLength(2);
    expect(new Set(assignments.map((a) => a.workerId))).toEqual(new Set(['w1', 'w2']));
  });
});

describe('plan injection scenario', () => {
  it('validates a multi-step refactoring plan', () => {
    const existingNodes = ['task-1', 'task-2'];
    const existingEdges = [{ from: 'task-1', to: 'task-2' }];

    const plan = {
      tasks: [
        { id: 'refactor-1', title: 'Extract helper', type: 'code', input: 'extract shared util' },
        { id: 'refactor-2', title: 'Update callers', type: 'code', input: 'update imports' },
        { id: 'test-all', title: 'Run tests', type: 'test', input: 'npm test' },
      ],
      edges: [
        ['task-2', 'refactor-1'],     // after existing task-2
        ['refactor-1', 'refactor-2'],
        ['refactor-2', 'test-all'],
      ],
      assumptions: ['Existing tests cover the refactored code'],
      risks: ['May break existing imports'],
    };

    const result = validatePlanOutput(plan, existingNodes, existingEdges);
    expect(result.ok).toBe(true);
  });

  it('rejects plan that would create cycle with existing graph', () => {
    const existingNodes = ['a', 'b'];
    const existingEdges = [{ from: 'a', to: 'b' }];

    const plan = {
      tasks: [
        { id: 'new-1', title: 'New task', type: 'code', input: 'x' },
      ],
      edges: [
        ['b', 'new-1'],
        ['new-1', 'a'], // cycle: a → b → new-1 → a
      ],
      assumptions: [],
      risks: [],
    };

    const result = validatePlanOutput(plan, existingNodes, existingEdges);
    expect(result.ok).toBe(false);
  });
});

describe('lease lifecycle', () => {
  it('create → use → expire flow', () => {
    const lease = createLease(100); // 100ms
    expect(isLeaseValid(lease.leaseId, lease.leaseId)).toBe(true);
    expect(isLeaseExpired(lease.expiresAt)).toBe(false);

    // After expiry
    const expiredLease = createLease(-1); // already expired
    expect(isLeaseExpired(expiredLease.expiresAt)).toBe(true);
  });
});
