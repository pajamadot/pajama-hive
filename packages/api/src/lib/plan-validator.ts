import { planOutputSchema } from '@pajamadot/hive-shared';
import { detectCycle, type Edge } from './dag.js';

export interface ValidatedPlan {
  tasks: { id: string; title: string; type: string; input: string; requiredCapabilities: string[]; estimatedMinutes?: number }[];
  edges: [string, string][];
  assumptions: string[];
  risks: string[];
}

/**
 * Validate a PlanOutput from an agent:
 * 1. Schema validation (Zod)
 * 2. Internal consistency (edges reference valid task IDs)
 * 3. No cycles within the plan
 * 4. No cycles when merged into existing graph
 */
export function validatePlanOutput(
  raw: unknown,
  existingNodeIds: string[] = [],
  existingEdges: Edge[] = [],
): { ok: true; plan: ValidatedPlan } | { ok: false; error: string } {
  // 1. Schema validation
  const parsed = planOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `Schema validation failed: ${parsed.error.message}` };
  }

  const plan = parsed.data;

  // 2. Check edge references
  const planTaskIds = new Set(plan.tasks.map((t) => t.id));
  for (const [from, to] of plan.edges) {
    const fromValid = planTaskIds.has(from) || existingNodeIds.includes(from);
    const toValid = planTaskIds.has(to) || existingNodeIds.includes(to);
    if (!fromValid) return { ok: false, error: `Edge references unknown source task: ${from}` };
    if (!toValid) return { ok: false, error: `Edge references unknown target task: ${to}` };
  }

  // 3. Check for cycles in plan alone
  const planEdges: Edge[] = plan.edges.map(([from, to]) => ({ from, to }));
  const internalCycle = detectCycle([...planTaskIds], planEdges.filter(
    (e) => planTaskIds.has(e.from) && planTaskIds.has(e.to),
  ));
  if (internalCycle) {
    return { ok: false, error: `Plan contains cycle involving: ${internalCycle.join(', ')}` };
  }

  // 4. Check for cycles when merged with existing graph
  const allNodeIds = [...existingNodeIds, ...planTaskIds];
  const allEdges = [...existingEdges, ...planEdges];
  const mergedCycle = detectCycle(allNodeIds, allEdges);
  if (mergedCycle) {
    return { ok: false, error: `Merging plan would create cycle involving: ${mergedCycle.join(', ')}` };
  }

  return { ok: true, plan };
}
