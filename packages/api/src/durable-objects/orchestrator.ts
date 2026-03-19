import { DurableObject } from 'cloudflare:workers';
import { eq, and, lt, inArray } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../db/schema.js';
import { findReadyNodes, type Edge } from '../lib/dag.js';
import { scheduleAssignments } from '../lib/scheduler.js';
import { createLease, isLeaseExpired } from '../lib/lease.js';
import { createWsMessage } from '../ws/protocol.js';
import type { AgentKind, TaskAssignPayload } from '@pajamadot/hive-shared';
import type { Env } from '../types/index.js';

const ALARM_INTERVAL_MS = 2000; // 2 seconds

/**
 * Orchestrator Durable Object — one per graph.
 * Runs periodic alarms to:
 * 1. Resolve dependencies and mark tasks as READY
 * 2. Match ready tasks to idle workers
 * 3. Issue leases and dispatch task assignments
 * 4. Reclaim expired leases
 */
export class Orchestrator extends DurableObject<Env> {
  private graphId: string | null = null;
  private runId: string | null = null;

  private getDb() {
    const sql = neon(this.env.HYPERDRIVE.connectionString);
    return drizzle(sql, { schema });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/start-run' && request.method === 'POST') {
      const { runId, graphId } = await request.json() as { runId: string; graphId: string };
      this.graphId = graphId;
      this.runId = runId;

      await this.ctx.storage.put('graphId', graphId);
      await this.ctx.storage.put('runId', runId);

      // Schedule first alarm
      await this.ctx.storage.setAlarm(Date.now() + 100);

      return new Response(JSON.stringify({ ok: true }));
    }

    if (url.pathname === '/stop') {
      this.graphId = null;
      this.runId = null;
      await this.ctx.storage.delete('graphId');
      await this.ctx.storage.delete('runId');
      return new Response(JSON.stringify({ ok: true }));
    }

    return new Response('Not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    // Restore state
    if (!this.graphId) {
      this.graphId = await this.ctx.storage.get('graphId') as string | null;
      this.runId = await this.ctx.storage.get('runId') as string | null;
    }

    if (!this.graphId || !this.runId) return;

    try {
      await this.tick();
    } catch (err) {
      console.error('Orchestrator tick error:', err);
    }

    // Schedule next alarm
    await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
  }

  private async tick(): Promise<void> {
    const db = this.getDb();
    const graphId = this.graphId!;
    const runId = this.runId!;

    // 1. Load all tasks and edges for this graph
    const allTasks = await db.select().from(schema.tasks).where(eq(schema.tasks.graphId, graphId));
    const allEdges = await db.select().from(schema.edges).where(eq(schema.edges.graphId, graphId));

    const nodeIds = allTasks.map((t) => t.id);
    const edgeList: Edge[] = allEdges.map((e) => ({ from: e.fromTaskId, to: e.toTaskId }));
    const doneNodes = new Set(allTasks.filter((t) => t.status === 'done').map((t) => t.id));
    const statusMap = new Map(allTasks.map((t) => [t.id, t.status]));

    // 2. Check if all tasks are done → complete the run
    const allDone = allTasks.every((t) => t.status === 'done' || t.status === 'canceled');
    const anyFailed = allTasks.some((t) => t.status === 'failed');

    if (allDone || anyFailed) {
      const finalStatus = anyFailed ? 'failed' : 'completed';
      await db.update(schema.runs)
        .set({ status: finalStatus, completedAt: new Date() })
        .where(eq(schema.runs.id, runId));
      await db.update(schema.graphs)
        .set({ status: finalStatus, updatedAt: new Date() })
        .where(eq(schema.graphs.id, graphId));

      // Broadcast completion
      await this.broadcast('graph.update', { graphId, status: finalStatus });

      // Trigger retrospective via MetaObserver
      try {
        const metaId = this.env.META_OBSERVER.idFromName('global');
        const metaDo = this.env.META_OBSERVER.get(metaId);
        await metaDo.fetch(new Request('http://internal/run-completed', {
          method: 'POST',
          body: JSON.stringify({ runId, graphId }),
        }));
      } catch (err) {
        console.error('Failed to trigger retrospective:', err);
      }

      this.graphId = null;
      this.runId = null;
      await this.ctx.storage.delete('graphId');
      await this.ctx.storage.delete('runId');
      return;
    }

    // 3. Reclaim expired leases
    const now = new Date();
    const leasedTasks = allTasks.filter((t) => t.status === 'leased' || t.status === 'running');
    for (const task of leasedTasks) {
      if (task.leaseExpiresAt && isLeaseExpired(task.leaseExpiresAt)) {
        if (task.attempt < task.maxRetries) {
          await db.update(schema.tasks)
            .set({
              status: 'pending',
              leaseId: null,
              leaseExpiresAt: null,
              assignedWorkerId: null,
              attempt: task.attempt + 1,
              updatedAt: now,
            })
            .where(eq(schema.tasks.id, task.id));
        } else {
          await db.update(schema.tasks)
            .set({ status: 'failed', updatedAt: now })
            .where(eq(schema.tasks.id, task.id));
        }
      }
    }

    // 4. Find ready tasks (deps satisfied, status=pending)
    const readyNodeIds = findReadyNodes(nodeIds, edgeList, doneNodes, statusMap);

    if (readyNodeIds.length > 0) {
      // Mark them as ready
      await db.update(schema.tasks)
        .set({ status: 'ready', updatedAt: now })
        .where(inArray(schema.tasks.id, readyNodeIds));
    }

    // 5. Get idle workers from WsRoom
    const wsRoomId = this.env.WS_ROOM.idFromName('global');
    const wsRoom = this.env.WS_ROOM.get(wsRoomId);
    const idleRes = await wsRoom.fetch(new Request('http://internal/idle-workers'));
    const { workers: idleWorkers } = await idleRes.json() as {
      workers: { id: string; agentKinds: string[]; capabilities: string[] }[];
    };

    if (idleWorkers.length === 0) return;

    // 6. Get all ready tasks (including newly marked ones)
    const readyTasks = allTasks
      .filter((t) => readyNodeIds.includes(t.id) || t.status === 'ready')
      .map((t) => ({
        id: t.id,
        priority: t.priority,
        agentKind: t.agentKind as AgentKind,
        requiredCapabilities: t.requiredCapabilities ?? [],
      }));

    // 7. Schedule assignments
    const assignments = scheduleAssignments(
      readyTasks,
      idleWorkers.map((w) => ({
        id: w.id,
        agentKinds: w.agentKinds as AgentKind[],
        capabilities: w.capabilities,
      })),
    );

    // 8. Issue leases and dispatch
    for (const assignment of assignments) {
      const task = allTasks.find((t) => t.id === assignment.taskId);
      if (!task) continue;

      const lease = createLease(task.timeoutMs);

      await db.update(schema.tasks)
        .set({
          status: 'leased',
          assignedWorkerId: assignment.workerId,
          leaseId: lease.leaseId,
          leaseExpiresAt: lease.expiresAt,
          updatedAt: now,
        })
        .where(eq(schema.tasks.id, task.id));

      const payload: TaskAssignPayload = {
        graphId,
        runId,
        taskId: task.id,
        leaseId: lease.leaseId,
        leaseExpiresAt: lease.expiresAt.toISOString(),
        agentKind: task.agentKind as AgentKind,
        input: task.input ?? '',
        timeoutMs: task.timeoutMs,
      };

      const message = createWsMessage('task.assign', payload);
      await wsRoom.fetch(new Request('http://internal/send-to-worker', {
        method: 'POST',
        body: JSON.stringify({ workerId: assignment.workerId, message }),
      }));

      // Broadcast to UI
      await this.broadcast('graph.update', {
        graphId,
        tasks: [{ taskId: task.id, status: 'leased', assignedWorkerId: assignment.workerId }],
      });
    }
  }

  private async broadcast(type: string, payload: unknown): Promise<void> {
    const wsRoomId = this.env.WS_ROOM.idFromName('global');
    const wsRoom = this.env.WS_ROOM.get(wsRoomId);
    await wsRoom.fetch(new Request('http://internal/broadcast', {
      method: 'POST',
      body: createWsMessage(type, payload),
    }));
  }
}
