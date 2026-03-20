import { describe, it, expect } from 'vitest';
import { validatePlanOutput } from '../lib/plan-validator.js';

const validPlan = {
  tasks: [
    { id: 't1', title: 'Write code', type: 'code', input: 'implement feature X', requiredCapabilities: [] },
    { id: 't2', title: 'Run tests', type: 'test', input: 'npm test', requiredCapabilities: [] },
  ],
  edges: [['t1', 't2']],
  assumptions: ['Feature X spec is complete'],
  risks: ['May break existing tests'],
};

describe('validatePlanOutput', () => {
  it('validates a correct plan', () => {
    const result = validatePlanOutput(validPlan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.tasks).toHaveLength(2);
      expect(result.plan.edges).toHaveLength(1);
    }
  });

  it('rejects empty tasks', () => {
    const result = validatePlanOutput({ ...validPlan, tasks: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = validatePlanOutput({ tasks: [{ id: 't1' }], edges: [], assumptions: [], risks: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid task type', () => {
    const plan = {
      ...validPlan,
      tasks: [{ id: 't1', title: 'Do stuff', type: 'invalid_type', input: 'x', requiredCapabilities: [] }],
      edges: [],
    };
    const result = validatePlanOutput(plan);
    expect(result.ok).toBe(false);
  });

  it('rejects edges referencing unknown tasks', () => {
    const plan = {
      ...validPlan,
      edges: [['t1', 'nonexistent']],
    };
    const result = validatePlanOutput(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('nonexistent');
    }
  });

  it('rejects internal cycles', () => {
    const plan = {
      tasks: [
        { id: 'a', title: 'A', type: 'code', input: 'x' },
        { id: 'b', title: 'B', type: 'code', input: 'y' },
      ],
      edges: [['a', 'b'], ['b', 'a']],
      assumptions: [],
      risks: [],
    };
    const result = validatePlanOutput(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('cycle');
    }
  });

  it('allows edges to existing graph nodes', () => {
    const plan = {
      tasks: [
        { id: 'new1', title: 'New task', type: 'code', input: 'x' },
      ],
      edges: [['existing-task', 'new1']],
      assumptions: [],
      risks: [],
    };
    const result = validatePlanOutput(plan, ['existing-task'], []);
    expect(result.ok).toBe(true);
  });

  it('rejects cycle when merging with existing graph', () => {
    const existingNodes = ['e1', 'e2'];
    const existingEdges = [{ from: 'e1', to: 'e2' }];

    const plan = {
      tasks: [
        { id: 'p1', title: 'Plan task', type: 'code', input: 'x' },
      ],
      edges: [['e2', 'p1'], ['p1', 'e1']], // creates cycle: e1 → e2 → p1 → e1
      assumptions: [],
      risks: [],
    };
    const result = validatePlanOutput(plan, existingNodes, existingEdges);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('cycle');
    }
  });

  it('rejects non-object input', () => {
    expect(validatePlanOutput(null).ok).toBe(false);
    expect(validatePlanOutput('string').ok).toBe(false);
    expect(validatePlanOutput(42).ok).toBe(false);
  });
});
