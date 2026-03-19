/**
 * DAG utilities: cycle detection, topological sort, dependency resolution.
 */

export interface Edge {
  from: string;
  to: string;
}

/**
 * Detect cycles using Kahn's algorithm (BFS topological sort).
 * Returns null if no cycle, or the set of nodes involved in cycles.
 */
export function detectCycle(nodeIds: string[], edges: Edge[]): string[] | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length === nodeIds.length) return null;

  // Return nodes that are part of cycles
  const sortedSet = new Set(sorted);
  return nodeIds.filter((id) => !sortedSet.has(id));
}

/**
 * Topological sort. Throws if the graph has cycles.
 */
export function topologicalSort(nodeIds: string[], edges: Edge[]): string[] {
  const cycleNodes = detectCycle(nodeIds, edges);
  if (cycleNodes) {
    throw new Error(`Cycle detected involving nodes: ${cycleNodes.join(', ')}`);
  }

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

/**
 * Get all upstream dependencies for a given node.
 */
export function getUpstreamDeps(nodeId: string, edges: Edge[]): string[] {
  const deps: Set<string> = new Set();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.to === current && !deps.has(edge.from)) {
        deps.add(edge.from);
        queue.push(edge.from);
      }
    }
  }
  return [...deps];
}

/**
 * Find nodes that are ready (all upstream deps are done).
 */
export function findReadyNodes(
  nodeIds: string[],
  edges: Edge[],
  doneNodes: Set<string>,
  currentStatuses: Map<string, string>,
): string[] {
  return nodeIds.filter((id) => {
    const status = currentStatuses.get(id);
    if (status !== 'pending') return false;

    const upstreamEdges = edges.filter((e) => e.to === id);
    return upstreamEdges.every((e) => doneNodes.has(e.from));
  });
}
