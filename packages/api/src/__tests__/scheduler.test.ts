import { describe, it, expect } from 'vitest';
import { scheduleAssignments } from '../lib/scheduler.js';

describe('scheduleAssignments', () => {
  it('assigns highest priority task first', () => {
    const tasks = [
      { id: 't1', priority: 50, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't2', priority: 200, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't3', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toEqual({ taskId: 't2', workerId: 'w1' });
  });

  it('matches workers by agent kind', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cx' as const, requiredCapabilities: [] },
      { id: 't2', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toEqual({ taskId: 't2', workerId: 'w1' });
  });

  it('matches workers by capability', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cc' as const, requiredCapabilities: ['git', 'docker'] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: ['git'] },        // missing docker
      { id: 'w2', agentKinds: ['cc' as const], capabilities: ['git', 'docker'] }, // matches
    ];
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toEqual({ taskId: 't1', workerId: 'w2' });
  });

  it('assigns one worker per task (no double-booking)', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't2', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(1); // only 1 worker for 2 tasks
  });

  it('returns empty when no workers match', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cx' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
    ];
    expect(scheduleAssignments(tasks, workers)).toEqual([]);
  });

  it('returns empty when no tasks', () => {
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
    ];
    expect(scheduleAssignments([], workers)).toEqual([]);
  });

  it('returns empty when no workers', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    expect(scheduleAssignments(tasks, [])).toEqual([]);
  });

  it('handles multi-kind workers', () => {
    const tasks = [
      { id: 't1', priority: 100, agentKind: 'cx' as const, requiredCapabilities: [] },
      { id: 't2', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const, 'cx' as const], capabilities: [] },
      { id: 'w2', agentKinds: ['cc' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(2);
  });

  it('assigns multiple workers to multiple tasks', () => {
    const tasks = [
      { id: 't1', priority: 200, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't2', priority: 100, agentKind: 'cc' as const, requiredCapabilities: [] },
      { id: 't3', priority: 50, agentKind: 'cc' as const, requiredCapabilities: [] },
    ];
    const workers = [
      { id: 'w1', agentKinds: ['cc' as const], capabilities: [] },
      { id: 'w2', agentKinds: ['cc' as const], capabilities: [] },
    ];
    const assignments = scheduleAssignments(tasks, workers);
    expect(assignments).toHaveLength(2);
    // Highest priority tasks get assigned first
    const assignedTaskIds = assignments.map((a) => a.taskId);
    expect(assignedTaskIds).toContain('t1');
    expect(assignedTaskIds).toContain('t2');
    expect(assignedTaskIds).not.toContain('t3');
  });
});
