import { describe, it, expect } from 'vitest';
import { detectCycle, topologicalSort, getUpstreamDeps, findReadyNodes } from '../lib/dag.js';

describe('detectCycle', () => {
  it('returns null for an acyclic graph', () => {
    const nodes = ['a', 'b', 'c'];
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    expect(detectCycle(nodes, edges)).toBeNull();
  });

  it('returns null for a graph with no edges', () => {
    expect(detectCycle(['a', 'b', 'c'], [])).toBeNull();
  });

  it('returns null for a single node', () => {
    expect(detectCycle(['a'], [])).toBeNull();
  });

  it('detects a simple 2-node cycle', () => {
    const nodes = ['a', 'b'];
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }];
    const result = detectCycle(nodes, edges);
    expect(result).not.toBeNull();
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('detects a 3-node cycle', () => {
    const nodes = ['a', 'b', 'c'];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ];
    const result = detectCycle(nodes, edges);
    expect(result).toHaveLength(3);
  });

  it('detects cycles in a mixed graph (some nodes acyclic, some in a cycle)', () => {
    const nodes = ['a', 'b', 'c', 'd'];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'b' }, // cycle: b↔c
      { from: 'a', to: 'd' },
    ];
    const result = detectCycle(nodes, edges);
    expect(result).not.toBeNull();
    expect(result).toContain('b');
    expect(result).toContain('c');
    expect(result).not.toContain('a');
    expect(result).not.toContain('d');
  });

  it('handles diamond DAG (no cycle)', () => {
    const nodes = ['a', 'b', 'c', 'd'];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ];
    expect(detectCycle(nodes, edges)).toBeNull();
  });

  it('detects self-loop', () => {
    const nodes = ['a'];
    const edges = [{ from: 'a', to: 'a' }];
    const result = detectCycle(nodes, edges);
    expect(result).toEqual(['a']);
  });
});

describe('topologicalSort', () => {
  it('sorts a linear chain', () => {
    const nodes = ['a', 'b', 'c'];
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const sorted = topologicalSort(nodes, edges);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
  });

  it('sorts a diamond', () => {
    const nodes = ['a', 'b', 'c', 'd'];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ];
    const sorted = topologicalSort(nodes, edges);
    expect(sorted[0]).toBe('a');
    expect(sorted[sorted.length - 1]).toBe('d');
  });

  it('throws on cycle', () => {
    const nodes = ['a', 'b'];
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }];
    expect(() => topologicalSort(nodes, edges)).toThrow('Cycle detected');
  });

  it('handles disconnected nodes', () => {
    const nodes = ['a', 'b', 'c'];
    const edges = [{ from: 'a', to: 'b' }];
    const sorted = topologicalSort(nodes, edges);
    expect(sorted).toHaveLength(3);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
  });
});

describe('getUpstreamDeps', () => {
  it('returns direct parent', () => {
    const edges = [{ from: 'a', to: 'b' }];
    expect(getUpstreamDeps('b', edges)).toEqual(['a']);
  });

  it('returns transitive deps', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    const deps = getUpstreamDeps('c', edges);
    expect(deps).toContain('a');
    expect(deps).toContain('b');
  });

  it('returns empty for root node', () => {
    const edges = [{ from: 'a', to: 'b' }];
    expect(getUpstreamDeps('a', edges)).toEqual([]);
  });

  it('handles diamond dependencies', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ];
    const deps = getUpstreamDeps('d', edges);
    expect(deps).toContain('a');
    expect(deps).toContain('b');
    expect(deps).toContain('c');
    expect(deps).toHaveLength(3);
  });
});

describe('findReadyNodes', () => {
  it('finds root nodes with no deps', () => {
    const nodes = ['a', 'b'];
    const edges = [{ from: 'a', to: 'b' }];
    const done = new Set<string>();
    const statuses = new Map([['a', 'pending'], ['b', 'pending']]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual(['a']);
  });

  it('finds nodes whose deps are done', () => {
    const nodes = ['a', 'b', 'c'];
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const done = new Set(['a']);
    const statuses = new Map([['a', 'done'], ['b', 'pending'], ['c', 'pending']]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual(['b']);
  });

  it('does not return already-running nodes', () => {
    const nodes = ['a', 'b'];
    const edges = [{ from: 'a', to: 'b' }];
    const done = new Set(['a']);
    const statuses = new Map([['a', 'done'], ['b', 'running']]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual([]);
  });

  it('requires ALL deps done for multi-parent nodes', () => {
    const nodes = ['a', 'b', 'c'];
    const edges = [
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
    ];
    const done = new Set(['a']); // b is not done
    const statuses = new Map([['a', 'done'], ['b', 'running'], ['c', 'pending']]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual([]);
  });

  it('finds multiple ready nodes in parallel branches', () => {
    const nodes = ['a', 'b', 'c', 'd'];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ];
    const done = new Set(['a']);
    const statuses = new Map([['a', 'done'], ['b', 'pending'], ['c', 'pending'], ['d', 'pending']]);
    const ready = findReadyNodes(nodes, edges, done, statuses);
    expect(ready).toContain('b');
    expect(ready).toContain('c');
    expect(ready).not.toContain('d');
  });
});
