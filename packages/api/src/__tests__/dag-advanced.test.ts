import { describe, it, expect } from 'vitest';
import { detectCycle, topologicalSort, findReadyNodes, getUpstreamDeps } from '../lib/dag.js';

describe('detectCycle — advanced cases', () => {
  it('handles large acyclic graph (100 nodes, linear)', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => `n${i}`);
    const edges = nodes.slice(0, -1).map((id, i) => ({ from: id, to: `n${i + 1}` }));
    expect(detectCycle(nodes, edges)).toBeNull();
  });

  it('handles wide parallel graph (50 independent nodes)', () => {
    const nodes = Array.from({ length: 52 }, (_, i) => `n${i}`);
    const edges = [
      ...Array.from({ length: 50 }, (_, i) => ({ from: 'n0', to: `n${i + 1}` })),
      ...Array.from({ length: 50 }, (_, i) => ({ from: `n${i + 1}`, to: 'n51' })),
    ];
    expect(detectCycle(nodes, edges)).toBeNull();
  });

  it('detects indirect cycle through 5 nodes', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'e' },
      { from: 'e', to: 'b' }, // cycle: b→c→d→e→b
    ];
    const result = detectCycle(nodes, edges);
    expect(result).not.toBeNull();
    expect(result).toContain('b');
    expect(result).toContain('e');
    expect(result).not.toContain('a');
  });

  it('handles multiple disjoint cycles', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'];
    const edges = [
      { from: 'a', to: 'b' }, { from: 'b', to: 'a' }, // cycle 1
      { from: 'c', to: 'd' }, { from: 'd', to: 'c' }, // cycle 2
      { from: 'e', to: 'f' }, // no cycle
    ];
    const result = detectCycle(nodes, edges);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
    expect(result).not.toContain('e');
    expect(result).not.toContain('f');
  });
});

describe('topologicalSort — advanced', () => {
  it('handles wide fan-out then fan-in', () => {
    const nodes = ['root', 'a', 'b', 'c', 'sink'];
    const edges = [
      { from: 'root', to: 'a' },
      { from: 'root', to: 'b' },
      { from: 'root', to: 'c' },
      { from: 'a', to: 'sink' },
      { from: 'b', to: 'sink' },
      { from: 'c', to: 'sink' },
    ];
    const sorted = topologicalSort(nodes, edges);
    expect(sorted[0]).toBe('root');
    expect(sorted[sorted.length - 1]).toBe('sink');
  });
});

describe('findReadyNodes — edge cases', () => {
  it('returns empty when all tasks are done', () => {
    const nodes = ['a', 'b'];
    const edges = [{ from: 'a', to: 'b' }];
    const done = new Set(['a', 'b']);
    const statuses = new Map([['a', 'done'], ['b', 'done']]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual([]);
  });

  it('returns all independent nodes as ready', () => {
    const nodes = ['a', 'b', 'c'];
    const edges: { from: string; to: string }[] = [];
    const done = new Set<string>();
    const statuses = new Map([['a', 'pending'], ['b', 'pending'], ['c', 'pending']]);
    expect(findReadyNodes(nodes, edges, done, statuses)).toEqual(['a', 'b', 'c']);
  });
});

describe('getUpstreamDeps — edge cases', () => {
  it('handles no edges', () => {
    expect(getUpstreamDeps('a', [])).toEqual([]);
  });

  it('handles deep chain', () => {
    const edges = Array.from({ length: 10 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
    const deps = getUpstreamDeps('n10', edges);
    expect(deps).toHaveLength(10);
    expect(deps).toContain('n0');
    expect(deps).toContain('n9');
  });
});
