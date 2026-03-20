/**
 * MetaObserver — the self-reflection engine.
 *
 * Watches system behavior across scheduling, execution, planning, and reliability
 * domains. Generates observations, detects anomalies, produces retrospectives,
 * and suggests improvements.
 *
 * This is the "thinking about thinking" layer — it doesn't execute tasks,
 * it reasons about how well the system is executing them.
 */

import { nanoid } from 'nanoid';
import { eq, desc, gte, lte, sql, and, count, like } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema.js';
import type { MetaEventKind, MetaSeverity, MetaDomain } from '@pajamadot/hive-shared';

interface EmitEventParams {
  kind: MetaEventKind;
  severity: MetaSeverity;
  domain: MetaDomain;
  title: string;
  body: string;
  evidence?: Record<string, unknown>;
  suggestions?: string[];
  relatedGraphId?: string;
  relatedRunId?: string;
  relatedTaskIds?: string[];
}

export class MetaObserver {
  constructor(private db: Database) {}

  // ── Event Emission ──

  async emit(params: EmitEventParams): Promise<string> {
    const id = `meta-${nanoid(12)}`;
    await this.db.insert(schema.metaEvents).values({
      id,
      kind: params.kind,
      severity: params.severity,
      domain: params.domain,
      title: params.title,
      body: params.body,
      evidence: params.evidence ?? {},
      suggestions: params.suggestions,
      relatedGraphId: params.relatedGraphId,
      relatedRunId: params.relatedRunId,
      relatedTaskIds: params.relatedTaskIds,
    });
    return id;
  }

  // ── Run Retrospective ──

  async generateRetrospective(runId: string, graphId: string): Promise<string> {
    const tasks = await this.db.select().from(schema.tasks).where(eq(schema.tasks.graphId, graphId));
    const edges = await this.db.select().from(schema.edges).where(eq(schema.edges.graphId, graphId));
    const run = await this.db.select().from(schema.runs).where(eq(schema.runs.id, runId));

    if (!run[0]) throw new Error(`Run ${runId} not found`);

    const startedAt = run[0].startedAt?.getTime() ?? Date.now();
    const completedAt = run[0].completedAt?.getTime() ?? Date.now();
    const durationMs = completedAt - startedAt;

    const succeeded = tasks.filter((t) => t.status === 'done');
    const failed = tasks.filter((t) => t.status === 'failed');
    const retried = tasks.filter((t) => t.attempt > 0);

    // Find critical path — longest chain of dependencies
    const criticalPath = this.findCriticalPath(tasks, edges);

    // Find bottlenecks — tasks that waited longest in ready state
    const bottlenecks = tasks
      .filter((t) => t.status === 'done' && t.updatedAt && t.createdAt)
      .map((t) => ({
        taskId: t.id,
        waitTimeMs: (t.updatedAt?.getTime() ?? 0) - (t.createdAt?.getTime() ?? 0),
      }))
      .sort((a, b) => b.waitTimeMs - a.waitTimeMs)
      .slice(0, 5);

    // Generate observations
    const observations: string[] = [];
    const lessonsLearned: string[] = [];
    const suggestions: string[] = [];

    const successRate = tasks.length > 0 ? succeeded.length / tasks.length : 0;

    if (successRate < 0.5) {
      observations.push(`High failure rate: ${(successRate * 100).toFixed(0)}% success`);
      lessonsLearned.push('Consider reviewing task inputs and agent configurations for failed tasks');
    }
    if (successRate === 1) {
      observations.push('Perfect execution — all tasks succeeded');
    }

    if (retried.length > 0) {
      observations.push(`${retried.length} task(s) required retries`);
      const retryReasons = retried.map((t) => `${t.id}: ${t.attempt} attempts`);
      lessonsLearned.push(`Retried tasks: ${retryReasons.join(', ')}`);
    }

    if (durationMs > 600_000) {
      observations.push(`Run took ${(durationMs / 60000).toFixed(1)} minutes`);
      if (bottlenecks.length > 0) {
        suggestions.push(`Bottleneck tasks could be parallelized: ${bottlenecks.map((b) => b.taskId).join(', ')}`);
      }
    }

    const maxDependencyDepth = criticalPath.length;
    if (maxDependencyDepth > 5) {
      observations.push(`Deep dependency chain (${maxDependencyDepth} levels)`);
      suggestions.push('Consider breaking long dependency chains into parallel branches');
    }

    const summary = [
      `Run ${runId} completed in ${(durationMs / 1000).toFixed(0)}s.`,
      `${succeeded.length}/${tasks.length} tasks succeeded.`,
      failed.length > 0 ? `${failed.length} failed.` : '',
      retried.length > 0 ? `${retried.length} retried.` : '',
    ].filter(Boolean).join(' ');

    const retroId = `retro-${nanoid(12)}`;
    await this.db.insert(schema.runRetrospectives).values({
      id: retroId,
      runId,
      graphId,
      summary,
      durationMs,
      tasksTotal: tasks.length,
      tasksSucceeded: succeeded.length,
      tasksFailed: failed.length,
      tasksRetried: retried.length,
      criticalPathTasks: criticalPath,
      bottleneckTasks: bottlenecks,
      observations,
      lessonsLearned,
      suggestedImprovements: suggestions,
    });

    // Also emit as a meta event
    await this.emit({
      kind: 'retrospective',
      severity: failed.length > 0 ? 'warning' : 'info',
      domain: 'execution',
      title: `Run retrospective: ${summary}`,
      body: [...observations, ...lessonsLearned, ...suggestions].join('\n'),
      evidence: { runId, graphId, durationMs, successRate, retriedCount: retried.length },
      suggestions,
      relatedGraphId: graphId,
      relatedRunId: runId,
    });

    return retroId;
  }

  // ── System Health Snapshot ──

  async captureHealthSnapshot(): Promise<string> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);

    // Active workers
    const onlineWorkers = await this.db.select({ cnt: count() })
      .from(schema.workers)
      .where(eq(schema.workers.status, 'online'));

    // Active runs
    const activeRuns = await this.db.select({ cnt: count() })
      .from(schema.runs)
      .where(eq(schema.runs.status, 'running'));

    // Task success rate (last 24h)
    const recentTasks = await this.db.select()
      .from(schema.tasks)
      .where(gte(schema.tasks.updatedAt, dayAgo));

    const completedRecent = recentTasks.filter((t) => t.status === 'done' || t.status === 'failed');
    const succeededRecent = completedRecent.filter((t) => t.status === 'done');
    const successRate = completedRecent.length > 0 ? succeededRecent.length / completedRecent.length : 1;

    // Avg task duration (approximation from created → updated for completed tasks)
    const durations = succeededRecent
      .filter((t) => t.createdAt && t.updatedAt)
      .map((t) => (t.updatedAt!.getTime() - t.createdAt!.getTime()));
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Recent meta events for scoring
    const recentEvents = await this.db.select()
      .from(schema.metaEvents)
      .where(gte(schema.metaEvents.createdAt, dayAgo));

    const anomalies = recentEvents.filter((e) => e.kind === 'anomaly');
    const criticals = recentEvents.filter((e) => e.severity === 'critical');

    // Compute plan acceptance rate from actual data
    const allPlanTasks = await this.db.select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(like(schema.tasks.id, 'plan-%'));

    const totalPlanTasks = allPlanTasks.length;
    const approvedPlanTasks = allPlanTasks.filter((t) =>
      t.status !== 'pending' && t.status !== 'canceled',
    ).length;
    const planAcceptanceRate = totalPlanTasks > 0 ? approvedPlanTasks / totalPlanTasks : 1;

    // Compute evolution score from evolve graph completions
    const evolveGraphs = await this.db.select({ status: schema.graphs.status })
      .from(schema.graphs)
      .where(like(schema.graphs.id, 'evolve-%'));

    const totalEvolve = evolveGraphs.length;
    const completedEvolve = evolveGraphs.filter((g) => g.status === 'completed').length;
    const evolveSuccessRate = totalEvolve > 0 ? completedEvolve / totalEvolve : 0;

    // Compute health scores (0-100)
    const scoreScheduling = Math.max(0, 100 - anomalies.filter((e) => e.domain === 'scheduling').length * 20);
    const scoreExecution = Math.round(successRate * 100);
    const scoreReliability = Math.max(0, 100 - criticals.length * 25);
    const scorePlanning = Math.round(planAcceptanceRate * 100);
    const scoreEvolution = totalEvolve > 0 ? Math.round(evolveSuccessRate * 100) : 50;

    const overall = criticals.length > 0 ? 'critical' as const
      : (scoreExecution < 50 || scoreReliability < 50) ? 'degraded' as const
      : 'healthy' as const;

    const snapshotId = `snap-${nanoid(12)}`;
    await this.db.insert(schema.systemSnapshots).values({
      id: snapshotId,
      overallHealth: overall,
      scoreScheduling,
      scoreExecution,
      scoreReliability,
      scorePlanning,
      scoreEvolution,
      activeWorkers: onlineWorkers[0]?.cnt ?? 0,
      activeRuns: activeRuns[0]?.cnt ?? 0,
      taskSuccessRate: successRate,
      avgTaskDurationMs: avgDuration,
      planAcceptanceRate,
      selfImprovePrsMerged: completedEvolve,
    });

    // Emit observations about health changes
    if (overall !== 'healthy') {
      await this.emit({
        kind: 'observation',
        severity: overall === 'critical' ? 'critical' : 'warning',
        domain: 'reliability',
        title: `System health: ${overall}`,
        body: `Scores — scheduling:${scoreScheduling} execution:${scoreExecution} reliability:${scoreReliability}`,
        evidence: { scoreScheduling, scoreExecution, scoreReliability, scorePlanning, scoreEvolution },
        suggestions: overall === 'critical'
          ? ['Check worker connectivity', 'Review recent failed tasks', 'Verify database health']
          : ['Monitor task failure patterns', 'Review retry rates'],
      });
    }

    return snapshotId;
  }

  // ── Anomaly Detection ──

  async detectAnomalies(): Promise<void> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3_600_000);

    // Check for stuck tasks (running but not updated in the last hour)
    const stuckTasks = await this.db.select()
      .from(schema.tasks)
      .where(and(
        eq(schema.tasks.status, 'running'),
        lte(schema.tasks.updatedAt, hourAgo),
      ));

    // Actually we want tasks that are running but their lease expired
    const expiredLeaseTasks = stuckTasks.filter((t) =>
      t.leaseExpiresAt && t.leaseExpiresAt.getTime() < now.getTime(),
    );

    if (expiredLeaseTasks.length > 0) {
      await this.emit({
        kind: 'anomaly',
        severity: 'warning',
        domain: 'scheduling',
        title: `${expiredLeaseTasks.length} task(s) with expired leases still marked as running`,
        body: 'These tasks may have lost their worker connection. The orchestrator should reclaim them.',
        evidence: { taskIds: expiredLeaseTasks.map((t) => t.id) },
        suggestions: ['Check worker connectivity', 'Verify orchestrator alarm is running'],
        relatedTaskIds: expiredLeaseTasks.map((t) => t.id),
      });
    }

    // Check for workers that haven't heartbeated recently
    const staleWorkers = await this.db.select()
      .from(schema.workers)
      .where(and(
        eq(schema.workers.status, 'online'),
      ));

    const ghostWorkers = staleWorkers.filter((w) =>
      w.lastHeartbeatAt && (now.getTime() - w.lastHeartbeatAt.getTime()) > 120_000,
    );

    if (ghostWorkers.length > 0) {
      await this.emit({
        kind: 'anomaly',
        severity: 'warning',
        domain: 'reliability',
        title: `${ghostWorkers.length} worker(s) marked online but haven't heartbeated in 2+ minutes`,
        body: `Workers: ${ghostWorkers.map((w) => w.id).join(', ')}`,
        evidence: { workerIds: ghostWorkers.map((w) => w.id) },
        suggestions: ['Mark stale workers as offline', 'Check network connectivity'],
      });
    }
  }

  // ── Planning Quality Analysis ──

  async analyzePlanQuality(graphId: string): Promise<void> {
    const tasks = await this.db.select().from(schema.tasks).where(eq(schema.tasks.graphId, graphId));
    const edges = await this.db.select().from(schema.edges).where(eq(schema.edges.graphId, graphId));

    // Check for common planning issues
    const isolated = tasks.filter((t) => {
      const hasIncoming = edges.some((e) => e.toTaskId === t.id);
      const hasOutgoing = edges.some((e) => e.fromTaskId === t.id);
      return !hasIncoming && !hasOutgoing && tasks.length > 1;
    });

    if (isolated.length > 0) {
      await this.emit({
        kind: 'observation',
        severity: 'info',
        domain: 'planning',
        title: `${isolated.length} isolated task(s) in graph ${graphId}`,
        body: 'Tasks with no dependencies or dependents may indicate a disconnected plan.',
        evidence: { isolatedTasks: isolated.map((t) => t.id) },
        suggestions: ['Review if these tasks should be connected to the DAG'],
        relatedGraphId: graphId,
        relatedTaskIds: isolated.map((t) => t.id),
      });
    }

    // Check for overly sequential plans
    const maxParallelism = this.calculateMaxParallelism(tasks, edges);
    if (tasks.length > 4 && maxParallelism <= 1) {
      await this.emit({
        kind: 'suggestion',
        severity: 'info',
        domain: 'planning',
        title: 'Fully sequential plan detected',
        body: `Graph ${graphId} has ${tasks.length} tasks but max parallelism of ${maxParallelism}. Consider parallelizing independent tasks.`,
        evidence: { taskCount: tasks.length, maxParallelism },
        suggestions: ['Identify tasks that don\'t truly depend on each other', 'Break sequential chains into parallel branches'],
        relatedGraphId: graphId,
      });
    }
  }

  // ── Helpers ──

  private findCriticalPath(
    tasks: { id: string; status: string }[],
    edges: { fromTaskId: string; toTaskId: string }[],
  ): string[] {
    // Simple longest-path BFS
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();

    for (const t of tasks) {
      adj.set(t.id, []);
      inDeg.set(t.id, 0);
    }
    for (const e of edges) {
      adj.get(e.fromTaskId)?.push(e.toTaskId);
      inDeg.set(e.toTaskId, (inDeg.get(e.toTaskId) ?? 0) + 1);
    }

    // Find roots
    const roots = tasks.filter((t) => (inDeg.get(t.id) ?? 0) === 0).map((t) => t.id);

    let longestPath: string[] = [];

    function dfs(node: string, path: string[]) {
      const newPath = [...path, node];
      const neighbors = adj.get(node) ?? [];
      if (neighbors.length === 0) {
        if (newPath.length > longestPath.length) {
          longestPath = newPath;
        }
        return;
      }
      for (const n of neighbors) {
        dfs(n, newPath);
      }
    }

    for (const root of roots) {
      dfs(root, []);
    }

    return longestPath;
  }

  private calculateMaxParallelism(
    tasks: { id: string }[],
    edges: { fromTaskId: string; toTaskId: string }[],
  ): number {
    // Count nodes at each level of the DAG
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const t of tasks) {
      inDeg.set(t.id, 0);
      adj.set(t.id, []);
    }
    for (const e of edges) {
      adj.get(e.fromTaskId)?.push(e.toTaskId);
      inDeg.set(e.toTaskId, (inDeg.get(e.toTaskId) ?? 0) + 1);
    }

    let maxWidth = 0;
    let queue = tasks.filter((t) => (inDeg.get(t.id) ?? 0) === 0).map((t) => t.id);

    while (queue.length > 0) {
      maxWidth = Math.max(maxWidth, queue.length);
      const nextQueue: string[] = [];
      for (const node of queue) {
        for (const neighbor of adj.get(node) ?? []) {
          const newDeg = (inDeg.get(neighbor) ?? 1) - 1;
          inDeg.set(neighbor, newDeg);
          if (newDeg === 0) nextQueue.push(neighbor);
        }
      }
      queue = nextQueue;
    }

    return maxWidth;
  }
}
