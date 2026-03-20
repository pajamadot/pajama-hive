import { z } from 'zod';

// ── Enums ──

export const graphStatusSchema = z.enum(['draft', 'running', 'paused', 'completed', 'failed']);
export const taskTypeSchema = z.enum(['plan', 'code', 'review', 'test', 'lint', 'docs', 'custom']);
export const taskStatusSchema = z.enum(['pending', 'ready', 'leased', 'running', 'done', 'failed', 'canceled']);
export const agentKindSchema = z.enum(['cc', 'cx', 'generic']);
export const runStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'canceled']);
export const workerStatusSchema = z.enum(['online', 'busy', 'offline']);

// ── WebSocket Message Envelope ──

export const wsMessageSchema = z.object({
  type: z.string(),
  requestId: z.string(),
  ts: z.string().datetime(),
  payload: z.unknown(),
});

// ── Worker → Server ──

export const workerRegisterSchema = z.object({
  workerId: z.string().min(1),
  agentKinds: z.array(agentKindSchema).min(1),
  capabilities: z.array(z.string()),
  workspaces: z.array(z.object({
    workspaceId: z.string().min(1),
    pathHash: z.string().min(1),
  })),
  maxConcurrency: z.number().int().min(1).max(10).default(1),
  version: z.string().min(1),
});

export const workerHeartbeatSchema = z.object({
  workerId: z.string().min(1),
});

export const taskPullSchema = z.object({
  workerId: z.string().min(1),
  idleSlots: z.number().int().min(1),
});

export const taskLogSchema = z.object({
  taskId: z.string().min(1),
  leaseId: z.string().min(1),
  stream: z.enum(['stdout', 'stderr']),
  chunk: z.string(),
});

export const taskResultSchema = z.object({
  taskId: z.string().min(1),
  leaseId: z.string().min(1),
  status: z.enum(['done', 'failed']),
  outputRef: z.string().optional(),
  summary: z.string().optional(),
  errorMessage: z.string().optional(),
  errorKind: z.enum(['retryable', 'nonretryable']).optional(),
});

// ── Server → Worker ──

export const taskAssignSchema = z.object({
  graphId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().min(1),
  leaseId: z.string().min(1),
  leaseExpiresAt: z.string().datetime(),
  agentKind: agentKindSchema,
  workspaceId: z.string().optional(),
  input: z.string(),
  timeoutMs: z.number().int().min(1000),
});

export const taskCancelSchema = z.object({
  taskId: z.string().min(1),
  leaseId: z.string().min(1),
  reason: z.string(),
});

// ── Server → UI ──

export const graphUpdateSchema = z.object({
  graphId: z.string().min(1),
  tasks: z.array(z.object({
    taskId: z.string().min(1),
    status: taskStatusSchema,
    assignedWorkerId: z.string().optional(),
    attempt: z.number().int().optional(),
  })),
});

export const workerStatusEventSchema = z.object({
  workerId: z.string().min(1),
  status: workerStatusSchema,
  currentTaskId: z.string().optional(),
});

// ── PlanOutput (from plan agent) ──

export const planOutputTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(['code', 'review', 'test', 'lint', 'docs', 'custom']),
  input: z.string(),
  requiredCapabilities: z.array(z.string()).default([]),
  estimatedMinutes: z.number().int().min(0).optional(),
});

export const planOutputSchema = z.object({
  tasks: z.array(planOutputTaskSchema).min(1),
  edges: z.array(z.tuple([z.string(), z.string()])),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
});

// ── REST API Request/Response Schemas ──

export const createGraphSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  type: taskTypeSchema,
  input: z.string().default(''),
  priority: z.number().int().min(0).max(1000).default(100),
  agentKind: agentKindSchema.default('cc'),
  requiredCapabilities: z.array(z.string()).default([]),
  timeoutMs: z.number().int().min(1000).default(900000),
  maxRetries: z.number().int().min(0).max(20).default(2),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
});

export const createEdgeSchema = z.object({
  fromTaskId: z.string().min(1),
  toTaskId: z.string().min(1),
});

// ── Graph Export/Import ──

export const graphExportTaskSchema = z.object({
  refId: z.string().min(1),
  title: z.string().min(1),
  type: taskTypeSchema,
  input: z.string().default(''),
  agentKind: agentKindSchema.default('cc'),
  priority: z.number().int().default(100),
  requiredCapabilities: z.array(z.string()).default([]),
  timeoutMs: z.number().int().default(900000),
  maxRetries: z.number().int().default(2),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
});

export const graphExportSchema = z.object({
  version: z.literal('1.0'),
  graph: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  tasks: z.array(graphExportTaskSchema).min(1),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});

// ── Batch Operations ──

export const batchTaskActionSchema = z.object({
  action: z.enum(['approve', 'cancel', 'retry']),
  taskIds: z.array(z.string().min(1)).min(1),
});

// ── API Key ──

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).default(['*']),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// ── Webhook ──

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
});

// ── Meta-Thinking Schemas ──

export const metaEventKindSchema = z.enum([
  'observation', 'reflection', 'suggestion', 'anomaly', 'milestone', 'retrospective',
]);
export const metaSeveritySchema = z.enum(['info', 'warning', 'critical']);
export const metaDomainSchema = z.enum([
  'scheduling', 'execution', 'planning', 'reliability', 'evolution', 'architecture',
]);

export const metaEventSchema = z.object({
  id: z.string().min(1),
  kind: metaEventKindSchema,
  severity: metaSeveritySchema,
  domain: metaDomainSchema,
  title: z.string().min(1),
  body: z.string(),
  evidence: z.record(z.unknown()),
  suggestions: z.array(z.string()).optional(),
  relatedGraphId: z.string().optional(),
  relatedRunId: z.string().optional(),
  relatedTaskIds: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
});

export const runRetrospectiveSchema = z.object({
  runId: z.string().min(1),
  graphId: z.string().min(1),
  summary: z.string(),
  duration: z.number(),
  tasksTotal: z.number().int(),
  tasksSucceeded: z.number().int(),
  tasksFailed: z.number().int(),
  tasksRetried: z.number().int(),
  criticalPathTasks: z.array(z.string()),
  bottleneckTasks: z.array(z.object({
    taskId: z.string(),
    waitTimeMs: z.number(),
  })),
  observations: z.array(z.string()),
  lessonsLearned: z.array(z.string()),
  suggestedImprovements: z.array(z.string()),
  createdAt: z.string().datetime(),
});

// ════════════════════════════════════════════════════════════
// Phase 1: Core Platform Schemas
// ════════════════════════════════════════════════════════════

// ── Workspace Enums ──

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export const workspacePlanSchema = z.enum(['free', 'pro', 'enterprise']);

// ── Model Enums ──

export const modelProviderTypeSchema = z.enum([
  'openai', 'anthropic', 'google', 'volcengine', 'deepseek', 'qwen', 'ollama', 'custom',
]);
export const modelTypeSchema = z.enum(['chat', 'embedding', 'image', 'code']);

// ── Agent Enums ──

export const agentStatusSchema = z.enum(['draft', 'published', 'archived']);
export const agentModeSchema = z.enum(['single', 'workflow', 'multi-agent']);

// ── Workflow Enums ──

export const workflowNodeTypeSchema = z.enum([
  'start', 'end', 'llm', 'code', 'condition', 'loop', 'variable',
  'http_request', 'plugin', 'knowledge_retrieval', 'message',
  'sub_workflow', 'database', 'image_gen', 'text_processor',
  'intent_detector', 'variable_assigner', 'batch', 'selector',
  'json_transform', 'qa', 'emitter', 'receiver',
]);

export const workflowRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'canceled']);
export const workflowTriggerTypeSchema = z.enum(['manual', 'api', 'agent', 'scheduled']);

// ── Chat Enums ──

export const messageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export const messageContentTypeSchema = z.enum(['text', 'image', 'file', 'json']);
export const chatRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'canceled']);

// ── 1.1 Workspace Schemas ──

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
});

export const inviteMemberSchema = z.object({
  userId: z.string().min(1),
  role: workspaceRoleSchema.default('member'),
});

// ── 1.2 Model Schemas ──

export const createModelProviderSchema = z.object({
  name: z.string().min(1).max(100),
  provider: modelProviderTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
});

export const createModelConfigSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  displayName: z.string().max(100).optional(),
  modelType: modelTypeSchema.default('chat'),
  maxTokens: z.number().int().min(1).optional(),
  contextWindow: z.number().int().min(1).optional(),
  isDefault: z.boolean().default(false),
  config: z.record(z.unknown()).optional(),
});

// ── 1.3 Agent Schemas ──

export const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  mode: agentModeSchema.default('single'),
  iconUrl: z.string().url().optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  iconUrl: z.string().url().optional(),
});

export const agentConfigSchema = z.object({
  modelConfigId: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).optional(),
  topP: z.number().min(0).max(1).optional(),
  knowledgeBaseIds: z.array(z.string()).optional(),
  pluginIds: z.array(z.string()).optional(),
  workflowId: z.string().optional(),
  memoryEnabled: z.boolean().optional(),
  memoryWindowSize: z.number().int().min(1).max(100).optional(),
  openingMessage: z.string().optional(),
  suggestedReplies: z.array(z.string()).optional(),
});

// ── 1.4 Workflow Schemas ──

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  isChatFlow: z.boolean().default(false),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

export const createWorkflowNodeSchema = z.object({
  nodeType: workflowNodeTypeSchema,
  label: z.string().min(1).max(100),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  config: z.record(z.unknown()).optional(),
});

export const createWorkflowEdgeSchema = z.object({
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
  condition: z.record(z.unknown()).optional(),
});

export const runWorkflowSchema = z.object({
  input: z.record(z.unknown()).optional(),
  versionId: z.string().optional(),
});

// ── 1.5 Conversation & Chat Schemas ──

export const createConversationSchema = z.object({
  agentId: z.string().optional(),
  title: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
  contentType: messageContentTypeSchema.default('text'),
  metadata: z.record(z.unknown()).optional(),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1),
  stream: z.boolean().default(true),
});

// ════════════════════════════════════════════════════════════
// Phase 2: Resources & Integrations Schemas
// ════════════════════════════════════════════════════════════

// ── 2.1 Plugin Schemas ──

export const pluginTypeSchema = z.enum(['api', 'webhook', 'workflow']);
export const pluginAuthTypeSchema = z.enum(['none', 'api_key', 'oauth2', 'bearer']);
export const pluginStatusSchema = z.enum(['draft', 'published', 'archived']);

export const createPluginSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  pluginType: pluginTypeSchema.default('api'),
  authType: pluginAuthTypeSchema.default('none'),
  baseUrl: z.string().url().optional(),
  openapiSpec: z.record(z.unknown()).optional(),
});

export const createPluginToolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST'),
  path: z.string().min(1),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
});

// ── 2.2 Knowledge Base Schemas ──

export const createKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  embeddingModelId: z.string().optional(),
  chunkSize: z.number().int().min(100).max(4000).default(500),
  chunkOverlap: z.number().int().min(0).max(500).default(50),
});

export const createDocumentSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum(['file', 'url', 'text', 'api']).default('file'),
  sourceUrl: z.string().url().optional(),
  content: z.string().optional(), // for text sourceType
});

// ── 2.3 Database Schemas ──

export const createUserDatabaseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

export const createUserTableSchema = z.object({
  name: z.string().min(1).max(100),
  schema: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'date', 'json']),
    required: z.boolean().default(false),
  })).min(1),
});

// ── 2.4 Variable Schemas ──

export const variableScopeSchema = z.enum(['workspace', 'agent', 'conversation', 'workflow']);
export const variableTypeSchema = z.enum(['string', 'number', 'boolean', 'json', 'array']);

export const createVariableSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  valueType: variableTypeSchema.default('string'),
  defaultValue: z.string().optional(),
  scope: variableScopeSchema.default('workspace'),
  scopeId: z.string().optional(),
});

// ── 2.5 Prompt Schemas ──

export const createPromptSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  content: z.string().min(1),
  category: z.string().optional(),
  templateVars: z.array(z.string()).optional(),
  isPublic: z.boolean().default(false),
});

export const updatePromptSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  content: z.string().min(1).optional(),
  category: z.string().optional(),
  isPublic: z.boolean().optional(),
});

// ════════════════════════════════════════════════════════════
// Phase 3: Publishing & API Schemas
// ════════════════════════════════════════════════════════════

export const appTypeSchema = z.enum(['chat', 'workflow', 'custom']);

export const createAppSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  appType: appTypeSchema.default('chat'),
  agentId: z.string().optional(),
  workflowId: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

export const publishToMarketplaceSchema = z.object({
  resourceType: z.enum(['agent', 'plugin', 'workflow', 'prompt']),
  resourceId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
