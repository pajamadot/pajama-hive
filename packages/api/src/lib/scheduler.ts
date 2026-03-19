import type { AgentKind } from '@pajamadot/hive-shared';

interface ReadyTask {
  id: string;
  priority: number;
  agentKind: AgentKind;
  requiredCapabilities: string[];
}

interface IdleWorker {
  id: string;
  agentKinds: AgentKind[];
  capabilities: string[];
}

interface Assignment {
  taskId: string;
  workerId: string;
}

/**
 * FIFO + capability matching scheduler.
 * Tasks sorted by priority (descending), then matched to workers by capability.
 */
export function scheduleAssignments(
  readyTasks: ReadyTask[],
  idleWorkers: IdleWorker[],
): Assignment[] {
  // Sort tasks by priority descending
  const sorted = [...readyTasks].sort((a, b) => b.priority - a.priority);
  const assignments: Assignment[] = [];
  const assignedWorkers = new Set<string>();

  for (const task of sorted) {
    const worker = idleWorkers.find((w) => {
      if (assignedWorkers.has(w.id)) return false;
      // Check agent kind match
      if (!w.agentKinds.includes(task.agentKind)) return false;
      // Check capability match
      return task.requiredCapabilities.every((cap) => w.capabilities.includes(cap));
    });

    if (worker) {
      assignments.push({ taskId: task.id, workerId: worker.id });
      assignedWorkers.add(worker.id);
    }
  }

  return assignments;
}
