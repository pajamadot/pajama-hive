import { describe, it, expect } from 'vitest';
import { scheduleAssignments } from '../lib/scheduler.js';

describe('scheduleAssignments — advanced', () => {
  it('prefers higher priority over order', () => {
    const tasks = [
      { id: 't1', priority: 10, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't2', priority: 1000, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't3', priority: 500, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
      { id: 'w2', agentKinds: ['cc' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(tasks, workers);
    const ids = assignments.map((a) => a.taskId);
    expect(ids[0]).toBe('t2');
    expect(ids[1]).toBe('t3');
  });

  it('handles mixed agent kinds correctly', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't2', priority: 100, agentKind: 'cx' as const, requiredCapabilities: [] },
      { id: 't3', priority: 100, agentKind: 'generic' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
      { id: 'w2', agentKinds: ['cx' as const], capabilities: [] },
      { id: 'w3', agentKinds: ['generic' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(3);
    expect(assignments.find((a) => a.taskId === 't1')?.workerId).toBe('w1');
    expect(assignments.find((a) => a.taskId === 't2')?.workerId).toBe('w2');
    expect(assignments.find((a) => a.taskId === 't3')?.workerId).toBe('w3');
  });

  it('partial capability match is rejected', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cc' as const, requiredCapabilities: ['git', 'docker', 'k8s'] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: ['git', 'docker'] }, // missing k8s
    ];
    expect(scheduleAssignments(tasks, workers)).toEqual([]);
  });

  it('empty capabilities always match', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
    ];
    expect(scheduleAssignments(tasks, workers)).toHaveLength(1);
  });

  it('scales to 50 tasks and 10 workers', () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({
      id: `t${i}`,
      priority: 50 - i, // decreasing priority
      agentKind: 'cc' as const,
      requiredCapabilities: [],
    }));
    const workers = Array.from({ length: 10 }, (_, i) => ({
      id: `w${i}`,
      agentKinds: ['cc' as const],
      capabilities: [],
    }));
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(10);
    // Top 10 priority tasks should be assigned
    const assignedTaskIds = assignments.map((a) => a.taskId);
    for (let i = 0; i < 10; i++) {
      expect(assignedTaskIds).toContain(`t${i}`);
    }
  });
});
