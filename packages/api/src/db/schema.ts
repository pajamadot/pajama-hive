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
