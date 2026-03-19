import { nanoid } from 'nanoid';
import type { Database } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

/**
 * Structured audit logging.
 * Every significant action gets recorded with full context.
 */
export async function audit(
  db: Database,
  params: {
    action: string;
    userId?: string;
    graphId?: string;
    runId?: string;
    taskId?: string;
    workerId?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    id: `audit-${nanoid(12)}`,
    action: params.action,
    userId: params.userId,
    graphId: params.graphId,
    runId: params.runId,
    taskId: params.taskId,
    workerId: params.workerId,
    payload: params.payload ?? {},
  });
}
