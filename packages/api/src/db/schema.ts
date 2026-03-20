import { pgTable, text, integer, timestamp, real, jsonb, uniqueIndex, index, boolean } from 'drizzle-orm/pg-core';

export const graphs = pgTable('graphs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: text('owner_id').notNull(),
  status: text('status').notNull().default('draft'),
  tags: text('tags').array(),
  isTemplate: integer('is_template').notNull().default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('graphs_owner_id_idx').on(t.ownerId),
  index('graphs_template_idx').on(t.isTemplate),
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
  startedAt: timestamp('started_at'),
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

// ── API Keys ──

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  prefix: text('prefix').notNull(), // first 8 chars for display
  scopes: text('scopes').array().notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('api_keys_user_idx').on(t.userId),
  index('api_keys_hash_idx').on(t.keyHash),
]);

// ── Webhooks ──

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  url: text('url').notNull(),
  events: text('events').array().notNull(), // run.completed, run.failed, task.completed, task.failed
  secret: text('secret').notNull(),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('webhooks_user_idx').on(t.userId),
]);

// ── Webhook Deliveries ──

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  statusCode: integer('status_code'),
  success: integer('success').notNull().default(0),
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('deliveries_webhook_idx').on(t.webhookId),
]);

// ── Graph Snapshots (pre-run state) ──

export const graphSnapshots = pgTable('graph_snapshots', {
  id: text('id').primaryKey(),
  graphId: text('graph_id').notNull().references(() => graphs.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  snapshotData: jsonb('snapshot_data').notNull(), // { tasks: [...], edges: [...] }
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('snapshots_graph_idx').on(t.graphId),
  index('snapshots_run_idx').on(t.runId),
]);

// ── Task Logs (persisted execution output) ──

export const taskLogs = pgTable('task_logs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  stream: text('stream').notNull().default('stdout'), // stdout | stderr
  chunk: text('chunk').notNull(),
  seq: integer('seq').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('task_logs_task_seq_idx').on(t.taskId, t.seq),
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

// ════════════════════════════════════════════════════════════
// Phase 1: Core Platform Tables
// ════════════════════════════════════════════════════════════

// ── 1.1 Workspaces & Members ──

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  ownerId: text('owner_id').notNull(),
  iconUrl: text('icon_url'),
  plan: text('plan').notNull().default('free'), // free, pro, enterprise
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('workspaces_slug_idx').on(t.slug),
  index('workspaces_owner_idx').on(t.ownerId),
]);

export const workspaceMembers = pgTable('workspace_members', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('member'), // owner, admin, member
  invitedBy: text('invited_by'),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('ws_members_unique_idx').on(t.workspaceId, t.userId),
  index('ws_members_user_idx').on(t.userId),
]);

export const userProfiles = pgTable('user_profiles', {
  id: text('id').primaryKey(), // same as Clerk user ID
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  defaultWorkspaceId: text('default_workspace_id'),
  preferences: jsonb('preferences'), // UI prefs, theme, etc.
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── 1.2 Model Management ──

export const modelProviders = pgTable('model_providers', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // display name
  provider: text('provider').notNull(), // openai, anthropic, google, ollama, volcengine, deepseek, qwen, custom
  baseUrl: text('base_url'), // API base URL (for custom/ollama)
  apiKeyEncrypted: text('api_key_encrypted'), // encrypted at rest
  isEnabled: boolean('is_enabled').notNull().default(true),
  config: jsonb('config'), // provider-specific config (org ID, project, etc.)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('model_providers_ws_idx').on(t.workspaceId),
]);

export const modelConfigs = pgTable('model_configs', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => modelProviders.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(), // e.g., gpt-4o, claude-sonnet-4-20250514
  displayName: text('display_name'),
  modelType: text('model_type').notNull().default('chat'), // chat, embedding, image, code
  maxTokens: integer('max_tokens'),
  contextWindow: integer('context_window'),
  isDefault: boolean('is_default').notNull().default(false),
  config: jsonb('config'), // temperature, top_p, etc. defaults
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('model_configs_provider_idx').on(t.providerId),
]);

// ── 1.3 Agents/Bots ──

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  status: text('status').notNull().default('draft'), // draft, published, archived
  mode: text('mode').notNull().default('single'), // single, workflow, multi-agent
  createdBy: text('created_by').notNull(),
  publishedAt: timestamp('published_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('agents_ws_idx').on(t.workspaceId),
  index('agents_status_idx').on(t.status),
  index('agents_creator_idx').on(t.createdBy),
]);

export const agentVersions = pgTable('agent_versions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  changelog: text('changelog'),
  snapshot: jsonb('snapshot').notNull(), // full agent config at publish time
  publishedBy: text('published_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('agent_versions_agent_idx').on(t.agentId),
  uniqueIndex('agent_versions_unique_idx').on(t.agentId, t.version),
]);

export const agentConfigs = pgTable('agent_configs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  modelConfigId: text('model_config_id'), // references modelConfigs.id
  systemPrompt: text('system_prompt'),
  temperature: real('temperature').default(0.7),
  maxTokens: integer('max_tokens'),
  topP: real('top_p'),
  tools: jsonb('tools'), // array of tool references
  knowledgeBaseIds: text('knowledge_base_ids').array(),
  pluginIds: text('plugin_ids').array(),
  workflowId: text('workflow_id'), // if mode = workflow
  memoryEnabled: boolean('memory_enabled').notNull().default(true),
  memoryWindowSize: integer('memory_window_size').default(20),
  openingMessage: text('opening_message'),
  suggestedReplies: text('suggested_replies').array(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('agent_configs_agent_idx').on(t.agentId),
]);

// ── 1.4 Enhanced Workflow Engine ──

export const workflowDefinitions = pgTable('workflow_definitions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'), // draft, published, archived
  isChatFlow: boolean('is_chat_flow').notNull().default(false),
  createdBy: text('created_by').notNull(),
  publishedAt: timestamp('published_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('wf_defs_ws_idx').on(t.workspaceId),
  index('wf_defs_status_idx').on(t.status),
]);

export const workflowNodes = pgTable('workflow_nodes', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
  nodeType: text('node_type').notNull(), // start, end, llm, code, condition, loop, variable, http_request, plugin, knowledge_retrieval, message, sub_workflow, database, image_gen, text_processor, intent_detector, variable_assigner, batch
  label: text('label').notNull(),
  positionX: real('position_x').notNull().default(0),
  positionY: real('position_y').notNull().default(0),
  config: jsonb('config'), // node-type-specific config
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('wf_nodes_workflow_idx').on(t.workflowId),
]);

export const workflowEdges = pgTable('workflow_edges', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
  fromNodeId: text('from_node_id').notNull().references(() => workflowNodes.id, { onDelete: 'cascade' }),
  toNodeId: text('to_node_id').notNull().references(() => workflowNodes.id, { onDelete: 'cascade' }),
  sourceHandle: text('source_handle'), // for condition nodes with multiple outputs
  label: text('label'),
  condition: jsonb('condition'), // edge condition config for conditional branching
}, (t) => [
  index('wf_edges_workflow_idx').on(t.workflowId),
  uniqueIndex('wf_edges_unique_idx').on(t.workflowId, t.fromNodeId, t.toNodeId, t.sourceHandle),
]);

export const workflowVersions = pgTable('workflow_versions', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(), // full workflow state: nodes, edges, config
  changelog: text('changelog'),
  publishedBy: text('published_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('wf_versions_workflow_idx').on(t.workflowId),
  uniqueIndex('wf_versions_unique_idx').on(t.workflowId, t.version),
]);

export const workflowRuns = pgTable('workflow_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
  versionId: text('version_id'),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed, canceled
  triggerType: text('trigger_type').notNull().default('manual'), // manual, api, agent, scheduled
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('wf_runs_workflow_idx').on(t.workflowId),
  index('wf_runs_status_idx').on(t.status),
]);

export const workflowTraces = pgTable('workflow_traces', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  nodeType: text('node_type').notNull(),
  status: text('status').notNull(), // pending, running, completed, failed, skipped
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  durationMs: integer('duration_ms'),
  tokenUsage: jsonb('token_usage'), // { prompt, completion, total }
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('wf_traces_run_idx').on(t.runId),
  index('wf_traces_node_idx').on(t.nodeId),
]);

// ── 1.5 Conversations & Chat ──

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  userId: text('user_id').notNull(),
  title: text('title'),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('conversations_ws_idx').on(t.workspaceId),
  index('conversations_agent_idx').on(t.agentId),
  index('conversations_user_idx').on(t.userId),
]);

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user, assistant, system, tool
  contentType: text('content_type').notNull().default('text'), // text, image, file, json
  content: text('content').notNull(),
  metadata: jsonb('metadata'), // tool calls, citations, file refs
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('messages_conversation_idx').on(t.conversationId, t.createdAt),
]);

export const chatRuns = pgTable('chat_runs', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  agentId: text('agent_id'),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed, canceled
  modelConfigId: text('model_config_id'),
  usage: jsonb('usage'), // { promptTokens, completionTokens, totalTokens }
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('chat_runs_conversation_idx').on(t.conversationId),
]);

export const runSteps = pgTable('run_steps', {
  id: text('id').primaryKey(),
  chatRunId: text('chat_run_id').notNull().references(() => chatRuns.id, { onDelete: 'cascade' }),
  stepType: text('step_type').notNull(), // message_creation, tool_calls, retrieval
  status: text('status').notNull().default('pending'),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (t) => [
  index('run_steps_run_idx').on(t.chatRunId),
]);

// ════════════════════════════════════════════════════════════
// Phase 2: Resources & Integrations Tables
// ════════════════════════════════════════════════════════════

// ── 2.1 Plugin System ──

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  pluginType: text('plugin_type').notNull().default('api'), // api, webhook, workflow
  status: text('status').notNull().default('draft'), // draft, published, archived
  authType: text('auth_type').default('none'), // none, api_key, oauth2, bearer
  authConfig: jsonb('auth_config'), // OAuth client_id, scopes, etc.
  baseUrl: text('base_url'),
  openapiSpec: jsonb('openapi_spec'), // imported OpenAPI 3.0 spec
  createdBy: text('created_by').notNull(),
  publishedAt: timestamp('published_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('plugins_ws_idx').on(t.workspaceId),
  index('plugins_status_idx').on(t.status),
]);

export const pluginTools = pgTable('plugin_tools', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  method: text('method').notNull().default('POST'), // GET, POST, PUT, DELETE
  path: text('path').notNull(), // relative to plugin baseUrl
  inputSchema: jsonb('input_schema'), // JSON Schema for parameters
  outputSchema: jsonb('output_schema'), // JSON Schema for response
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('plugin_tools_plugin_idx').on(t.pluginId),
]);

export const pluginVersions = pgTable('plugin_versions', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  publishedBy: text('published_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('plugin_versions_plugin_idx').on(t.pluginId),
]);

// ── 2.2 Knowledge Base (RAG) ──

export const knowledgeBases = pgTable('knowledge_bases', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  embeddingModelId: text('embedding_model_id'), // references modelConfigs.id
  chunkSize: integer('chunk_size').notNull().default(500),
  chunkOverlap: integer('chunk_overlap').notNull().default(50),
  documentCount: integer('document_count').notNull().default(0),
  totalChunks: integer('total_chunks').notNull().default(0),
  status: text('status').notNull().default('active'), // active, processing, error
  createdBy: text('created_by').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('kb_ws_idx').on(t.workspaceId),
]);

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  knowledgeBaseId: text('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull().default('file'), // file, url, text, api
  sourceUrl: text('source_url'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  storageKey: text('storage_key'), // R2 object key
  chunkCount: integer('chunk_count').notNull().default(0),
  status: text('status').notNull().default('pending'), // pending, processing, completed, error
  error: text('error'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('documents_kb_idx').on(t.knowledgeBaseId),
  index('documents_status_idx').on(t.status),
]);

export const documentChunks = pgTable('document_chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  knowledgeBaseId: text('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  metadata: jsonb('metadata'), // page number, section title, etc.
  // embedding stored as jsonb array (for pgvector, would use vector type)
  embedding: jsonb('embedding'),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('chunks_document_idx').on(t.documentId),
  index('chunks_kb_idx').on(t.knowledgeBaseId),
]);

// ── 2.3 User Databases (Structured Data) ──

export const userDatabases = pgTable('user_databases', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('user_dbs_ws_idx').on(t.workspaceId),
]);

export const userTables = pgTable('user_tables', {
  id: text('id').primaryKey(),
  databaseId: text('database_id').notNull().references(() => userDatabases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  schema: jsonb('schema').notNull(), // column definitions: [{ name, type, required }]
  rowCount: integer('row_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('user_tables_db_idx').on(t.databaseId),
]);

export const userTableRows = pgTable('user_table_rows', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => userTables.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(), // row data matching table schema
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('user_rows_table_idx').on(t.tableId),
]);

// ── 2.4 Variables & Memory ──

export const variables = pgTable('variables', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  valueType: text('value_type').notNull().default('string'), // string, number, boolean, json, array
  defaultValue: text('default_value'),
  scope: text('scope').notNull().default('workspace'), // workspace, agent, conversation, workflow
  scopeId: text('scope_id'), // the specific agent/conversation/workflow ID
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('variables_ws_idx').on(t.workspaceId),
  index('variables_scope_idx').on(t.scope, t.scopeId),
]);

export const variableValues = pgTable('variable_values', {
  id: text('id').primaryKey(),
  variableId: text('variable_id').notNull().references(() => variables.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  conversationId: text('conversation_id'),
  value: text('value'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('var_values_variable_idx').on(t.variableId),
  index('var_values_user_idx').on(t.userId),
]);

export const agentMemories = pgTable('agent_memories', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('agent_mem_agent_user_idx').on(t.agentId, t.userId),
  uniqueIndex('agent_mem_unique_idx').on(t.agentId, t.userId, t.key),
]);

// ── 2.5 Prompt Library ──

export const prompts = pgTable('prompts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  content: text('content').notNull(), // the prompt template
  templateVars: text('template_vars').array(), // variable names used in template
  category: text('category'), // system, user, assistant, few-shot
  isPublic: boolean('is_public').notNull().default(false),
  createdBy: text('created_by').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('prompts_ws_idx').on(t.workspaceId),
]);

export const promptVersions = pgTable('prompt_versions', {
  id: text('id').primaryKey(),
  promptId: text('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  changelog: text('changelog'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('prompt_versions_prompt_idx').on(t.promptId),
  uniqueIndex('prompt_versions_unique_idx').on(t.promptId, t.version),
]);

// ════════════════════════════════════════════════════════════
// Phase 3: Publishing & API Tables
// ════════════════════════════════════════════════════════════

// ── 3.1 Apps ──

export const apps = pgTable('apps', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  appType: text('app_type').notNull().default('chat'), // chat, workflow, custom
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  workflowId: text('workflow_id').references(() => workflowDefinitions.id, { onDelete: 'set null' }),
  config: jsonb('config'), // UI config, theme, allowed features
  status: text('status').notNull().default('draft'), // draft, published, archived
  createdBy: text('created_by').notNull(),
  publishedAt: timestamp('published_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('apps_ws_idx').on(t.workspaceId),
  index('apps_status_idx').on(t.status),
]);

export const appVersions = pgTable('app_versions', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  changelog: text('changelog'),
  publishedBy: text('published_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('app_versions_app_idx').on(t.appId),
]);

export const appDeployments = pgTable('app_deployments', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  versionId: text('version_id').notNull().references(() => appVersions.id),
  environment: text('environment').notNull().default('production'), // production, staging
  url: text('url'),
  status: text('status').notNull().default('active'), // active, inactive
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('app_deployments_app_idx').on(t.appId),
]);

// ── 3.3 Marketplace ──

export const marketplaceProducts = pgTable('marketplace_products', {
  id: text('id').primaryKey(),
  resourceType: text('resource_type').notNull(), // agent, plugin, workflow, prompt
  resourceId: text('resource_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  category: text('category'),
  tags: text('tags').array(),
  installCount: integer('install_count').notNull().default(0),
  rating: real('rating'),
  ratingCount: integer('rating_count').notNull().default(0),
  publishedBy: text('published_by').notNull(),
  status: text('status').notNull().default('pending'), // pending, approved, rejected
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('mp_products_type_idx').on(t.resourceType),
  index('mp_products_category_idx').on(t.category),
  index('mp_products_status_idx').on(t.status),
]);

export const marketplaceInstalls = pgTable('marketplace_installs', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => marketplaceProducts.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  installedBy: text('installed_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('mp_installs_unique_idx').on(t.productId, t.workspaceId),
  index('mp_installs_ws_idx').on(t.workspaceId),
]);

// ── 3.4 Resource References ──

export const resources = pgTable('resources', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  resourceType: text('resource_type').notNull(), // agent, plugin, workflow, knowledge_base, prompt, database, app
  resourceId: text('resource_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('resources_ws_idx').on(t.workspaceId),
  index('resources_type_idx').on(t.resourceType),
  uniqueIndex('resources_unique_idx').on(t.workspaceId, t.resourceType, t.resourceId),
]);

// ── Marketplace Reviews ──

export const marketplaceReviews = pgTable('marketplace_reviews', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => marketplaceProducts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('mp_reviews_product_idx').on(t.productId),
  uniqueIndex('mp_reviews_unique_idx').on(t.productId, t.userId),
]);
