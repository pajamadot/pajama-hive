import { pgTable, text, integer, timestamp, real, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const graphs = pgTable('graphs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: text('owner_id').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('graphs_owner_id_idx').on(t.ownerId),
]);

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  graphId: text('graph_id').notNull().references(() => graphs.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(100),
  input: text('input').default(''),
  outputRef: text('output_ref'),
  outputSummary: text('output_summary'),
  timeoutMs: integer('timeout_ms').notNull().default(900000),
  maxRetries: integer('max_retries').notNull().default(2),
  attempt: integer('attempt').notNull().default(0),
  requiredCapabilities: text('required_capabilities').array(),
  agentKind: text('agent_kind').notNull().default('cc'),
  assignedWorkerId: text('assigned_worker_id'),
  leaseId: text('lease_id'),
  leaseExpiresAt: timestamp('lease_expires_at'),
  positionX: real('position_x').notNull().default(0),
  positionY: real('position_y').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
}, (t) => [
  index('tasks_graph_status_idx').on(t.graphId, t.status),
  index('tasks_lease_expires_idx').on(t.leaseExpiresAt),
]);

export const edges = pgTable('edges', {
  id: text('id').primaryKey(),
  graphId: text('graph_id').notNull().references(() => graphs.id, { onDelete: 'cascade' }),
  fromTaskId: text('from_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  toTaskId: text('to_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('edges_unique_idx').on(t.graphId, t.fromTaskId, t.toTaskId),
  index('edges_graph_idx').on(t.graphId),
  index('edges_from_idx').on(t.fromTaskId),
  index('edges_to_idx').on(t.toTaskId),
]);

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  graphId: text('graph_id').notNull().references(() => graphs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('runs_graph_idx').on(t.graphId),
]);

export const workers = pgTable('workers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name'),
  agentKinds: text('agent_kinds').array(),
  capabilities: text('capabilities').array(),
  maxConcurrency: integer('max_concurrency').notNull().default(1),
  status: text('status').notNull().default('offline'),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  version: text('version'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('workers_status_heartbeat_idx').on(t.status, t.lastHeartbeatAt),
]);

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  graphId: text('graph_id'),
  runId: text('run_id'),
  taskId: text('task_id'),
  workerId: text('worker_id'),
  userId: text('user_id'),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('audit_graph_created_idx').on(t.graphId, t.createdAt),
  index('audit_task_idx').on(t.taskId),
  index('audit_worker_idx').on(t.workerId),
]);

// ── Meta-Thinking Tables ──

export const metaEvents = pgTable('meta_events', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),        // observation, reflection, suggestion, anomaly, milestone, retrospective
  severity: text('severity').notNull(), // info, warning, critical
  domain: text('domain').notNull(),     // scheduling, execution, planning, reliability, evolution, architecture
  title: text('title').notNull(),
  body: text('body').notNull(),
  evidence: jsonb('evidence'),
  suggestions: text('suggestions').array(),
  relatedGraphId: text('related_graph_id'),
  relatedRunId: text('related_run_id'),
  relatedTaskIds: text('related_task_ids').array(),
  resolved: text('resolved').default('false'), // 'true' | 'false' | 'wontfix'
  resolvedBy: text('resolved_by'),             // user or system
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('meta_events_kind_idx').on(t.kind, t.createdAt),
  index('meta_events_severity_idx').on(t.severity, t.createdAt),
  index('meta_events_domain_idx').on(t.domain),
  index('meta_events_graph_idx').on(t.relatedGraphId),
]);

export const runRetrospectives = pgTable('run_retrospectives', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  graphId: text('graph_id').notNull().references(() => graphs.id),
  summary: text('summary').notNull(),
  durationMs: integer('duration_ms').notNull(),
  tasksTotal: integer('tasks_total').notNull(),
  tasksSucceeded: integer('tasks_succeeded').notNull(),
  tasksFailed: integer('tasks_failed').notNull(),
  tasksRetried: integer('tasks_retried').notNull(),
  criticalPathTasks: text('critical_path_tasks').array(),
  bottleneckTasks: jsonb('bottleneck_tasks'),    // {taskId, waitTimeMs}[]
  observations: text('observations').array(),
  lessonsLearned: text('lessons_learned').array(),
  suggestedImprovements: text('suggested_improvements').array(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('retro_run_idx').on(t.runId),
  index('retro_graph_idx').on(t.graphId),
]);

export const systemSnapshots = pgTable('system_snapshots', {
  id: text('id').primaryKey(),
  overallHealth: text('overall_health').notNull(),  // healthy, degraded, critical
  scoreScheduling: integer('score_scheduling').notNull(),
  scoreExecution: integer('score_execution').notNull(),
  scoreReliability: integer('score_reliability').notNull(),
  scorePlanning: integer('score_planning').notNull(),
  scoreEvolution: integer('score_evolution').notNull(),
  activeWorkers: integer('active_workers').notNull(),
  activeRuns: integer('active_runs').notNull(),
  taskSuccessRate: real('task_success_rate').notNull(),
  avgTaskDurationMs: real('avg_task_duration_ms').notNull(),
  planAcceptanceRate: real('plan_acceptance_rate').notNull(),
  selfImprovePrsMerged: integer('self_improve_prs_merged').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('snapshot_created_idx').on(t.createdAt),
]);
