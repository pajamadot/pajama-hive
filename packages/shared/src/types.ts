// ── Graph & Task Types ──

export type GraphStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed';

export type TaskType = 'plan' | 'code' | 'review' | 'test' | 'lint' | 'docs' | 'custom';

export type TaskStatus = 'pending' | 'ready' | 'leased' | 'running' | 'done' | 'failed' | 'canceled';

export type AgentKind = 'cc' | 'cx' | 'generic';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export type WorkerStatus = 'online' | 'busy' | 'offline';

// ── WebSocket Message Types ──

export type WsMessageType =
  // Worker → Server
  | 'worker.register'
  | 'worker.heartbeat'
  | 'task.pull'
  | 'task.log'
  | 'task.result'
  // Server → Worker
  | 'task.assign'
  | 'task.cancel'
  // Server → UI
  | 'graph.update'
  | 'worker.status'
  // Errors
  | 'error';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  requestId: string;
  ts: string;
  payload: T;
}

// ── Worker → Server Payloads ──

export interface WorkerRegisterPayload {
  workerId: string;
  agentKinds: AgentKind[];
  capabilities: string[];
  workspaces: { workspaceId: string; pathHash: string }[];
  maxConcurrency: number;
  version: string;
}

export interface WorkerHeartbeatPayload {
  workerId: string;
}

export interface TaskPullPayload {
  workerId: string;
  idleSlots: number;
}

export interface TaskLogPayload {
  taskId: string;
  leaseId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface TaskResultPayload {
  taskId: string;
  leaseId: string;
  status: 'done' | 'failed';
  outputRef?: string;
  summary?: string;
  errorMessage?: string;
  errorKind?: 'retryable' | 'nonretryable';
}

// ── Server → Worker Payloads ──

export interface TaskAssignPayload {
  graphId: string;
  runId: string;
  taskId: string;
  leaseId: string;
  leaseExpiresAt: string;
  agentKind: AgentKind;
  workspaceId?: string;
  input: string;
  timeoutMs: number;
}

export interface TaskCancelPayload {
  taskId: string;
  leaseId: string;
  reason: string;
}

// ── Server → UI Payloads ──

export interface GraphUpdatePayload {
  graphId: string;
  tasks: {
    taskId: string;
    status: TaskStatus;
    assignedWorkerId?: string;
    attempt?: number;
  }[];
}

export interface WorkerStatusPayload {
  workerId: string;
  status: WorkerStatus;
  currentTaskId?: string;
}

// ── Error Payload ──

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// ── PlanOutput (from plan agent) ──

export interface PlanOutputTask {
  id: string;
  title: string;
  type: Exclude<TaskType, 'plan'>;
  input: string;
  requiredCapabilities?: string[];
  estimatedMinutes?: number;
}

export interface PlanOutput {
  tasks: PlanOutputTask[];
  edges: [string, string][];
  assumptions: string[];
  risks: string[];
}

// ── Meta-Thinking & Observability Types ──

export type MetaEventKind =
  | 'observation'     // Something noticed about system behavior
  | 'reflection'      // Analysis of past performance
  | 'suggestion'      // Actionable improvement proposal
  | 'anomaly'         // Something unexpected detected
  | 'milestone'       // A significant achievement or state change
  | 'retrospective';  // Structured look-back at a completed run

export type MetaSeverity = 'info' | 'warning' | 'critical';

export type MetaDomain =
  | 'scheduling'      // Task scheduling efficiency
  | 'execution'       // Task execution quality
  | 'planning'        // Plan generation quality
  | 'reliability'     // System uptime, error rates
  | 'evolution'       // Self-improvement activity
  | 'architecture';   // Structural observations

export interface MetaEvent {
  id: string;
  kind: MetaEventKind;
  severity: MetaSeverity;
  domain: MetaDomain;
  title: string;
  body: string;
  evidence: Record<string, unknown>;  // Supporting data
  suggestions?: string[];             // Actionable next steps
  relatedGraphId?: string;
  relatedRunId?: string;
  relatedTaskIds?: string[];
  createdAt: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  scores: {
    scheduling: number;   // 0-100
    execution: number;
    reliability: number;
    planning: number;
    evolution: number;
  };
  activeWorkers: number;
  activeRuns: number;
  taskSuccessRate: number;      // last 24h
  avgTaskDurationMs: number;    // last 24h
  planAcceptanceRate: number;   // % of plans approved
  selfImprovePRsMerged: number; // total
  lastUpdated: string;
}

export interface RunRetrospective {
  runId: string;
  graphId: string;
  summary: string;
  duration: number;
  tasksTotal: number;
  tasksSucceeded: number;
  tasksFailed: number;
  tasksRetried: number;
  criticalPathTasks: string[];
  bottleneckTasks: { taskId: string; waitTimeMs: number }[];
  observations: string[];
  lessonsLearned: string[];
  suggestedImprovements: string[];
  createdAt: string;
}

// ════════════════════════════════════════════════════════════
// Phase 1: Core Platform Types
// ════════════════════════════════════════════════════════════

// ── 1.1 Workspace Types ──

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type WorkspacePlan = 'free' | 'pro' | 'enterprise';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  iconUrl?: string;
  plan: WorkspacePlan;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedBy?: string;
  joinedAt: string;
}

export interface UserProfile {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  defaultWorkspaceId?: string;
  preferences?: Record<string, unknown>;
}

// ── 1.2 Model Types ──

export type ModelProviderType = 'openai' | 'anthropic' | 'google' | 'volcengine' | 'deepseek' | 'qwen' | 'ollama' | 'custom';
export type ModelType = 'chat' | 'embedding' | 'image' | 'code';

export interface ModelProvider {
  id: string;
  workspaceId: string;
  name: string;
  provider: ModelProviderType;
  baseUrl?: string;
  isEnabled: boolean;
  config?: Record<string, unknown>;
  createdAt: string;
}

export interface ModelConfig {
  id: string;
  providerId: string;
  modelId: string;
  displayName?: string;
  modelType: ModelType;
  maxTokens?: number;
  contextWindow?: number;
  isDefault: boolean;
  config?: Record<string, unknown>;
}

// ── 1.3 Agent Types ──

export type AgentStatus = 'draft' | 'published' | 'archived';
export type AgentMode = 'single' | 'workflow' | 'multi-agent';

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  iconUrl?: string;
  status: AgentStatus;
  mode: AgentMode;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentVersion {
  id: string;
  agentId: string;
  version: number;
  changelog?: string;
  snapshot: Record<string, unknown>;
  publishedBy: string;
  createdAt: string;
}

export interface AgentConfig {
  id: string;
  agentId: string;
  modelConfigId?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  knowledgeBaseIds?: string[];
  pluginIds?: string[];
  workflowId?: string;
  memoryEnabled: boolean;
  memoryWindowSize?: number;
  openingMessage?: string;
  suggestedReplies?: string[];
}

// ── 1.4 Workflow Types ──

export type WorkflowNodeType =
  | 'start' | 'end' | 'llm' | 'code' | 'condition' | 'loop'
  | 'variable' | 'http_request' | 'plugin' | 'knowledge_retrieval'
  | 'message' | 'sub_workflow' | 'database' | 'image_gen'
  | 'text_processor' | 'intent_detector' | 'variable_assigner'
  | 'batch' | 'selector' | 'json_transform' | 'qa' | 'emitter' | 'receiver';

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
export type WorkflowTriggerType = 'manual' | 'api' | 'agent' | 'scheduled';

export interface WorkflowDefinition {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: string;
  isChatFlow: boolean;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  workflowId: string;
  nodeType: WorkflowNodeType;
  label: string;
  positionX: number;
  positionY: number;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  workflowId: string;
  fromNodeId: string;
  toNodeId: string;
  sourceHandle?: string;
  label?: string;
  condition?: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  versionId?: string;
  status: WorkflowRunStatus;
  triggerType: WorkflowTriggerType;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface WorkflowTrace {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  startedAt?: string;
  completedAt?: string;
}

// ── 1.5 Conversation & Chat Types ──

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageContentType = 'text' | 'image' | 'file' | 'json';
export type ChatRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export interface Conversation {
  id: string;
  workspaceId: string;
  agentId?: string;
  userId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  contentType: MessageContentType;
  content: string;
  metadata?: Record<string, unknown>;
  tokenCount?: number;
  createdAt: string;
}

export interface ChatRun {
  id: string;
  conversationId: string;
  agentId?: string;
  status: ChatRunStatus;
  modelConfigId?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ════════════════════════════════════════════════════════════
// Phase 2: Resources & Integrations Types
// ════════════════════════════════════════════════════════════

// ── 2.1 Plugin Types ──

export type PluginType = 'api' | 'webhook' | 'workflow';
export type PluginAuthType = 'none' | 'api_key' | 'oauth2' | 'bearer';
export type PluginStatus = 'draft' | 'published' | 'archived';

export interface Plugin {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  iconUrl?: string;
  pluginType: PluginType;
  status: PluginStatus;
  authType: PluginAuthType;
  baseUrl?: string;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginTool {
  id: string;
  pluginId: string;
  name: string;
  description?: string;
  method: string;
  path: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isEnabled: boolean;
}

// ── 2.2 Knowledge Base Types ──

export interface KnowledgeBase {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  embeddingModelId?: string;
  chunkSize: number;
  chunkOverlap: number;
  documentCount: number;
  totalChunks: number;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface Document {
  id: string;
  knowledgeBaseId: string;
  name: string;
  sourceType: string;
  sourceUrl?: string;
  mimeType?: string;
  fileSize?: number;
  chunkCount: number;
  status: string;
  error?: string;
  createdAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
  tokenCount?: number;
}

// ── 2.3 User Database Types ──

export interface UserDatabase {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

export interface UserTable {
  id: string;
  databaseId: string;
  name: string;
  schema: { name: string; type: string; required: boolean }[];
  rowCount: number;
}

// ── 2.4 Variable Types ──

export type VariableScope = 'workspace' | 'agent' | 'conversation' | 'workflow';
export type VariableValueType = 'string' | 'number' | 'boolean' | 'json' | 'array';

export interface Variable {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  valueType: VariableValueType;
  defaultValue?: string;
  scope: VariableScope;
  scopeId?: string;
}

// ── 2.5 Prompt Types ──

export interface Prompt {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  content: string;
  templateVars?: string[];
  category?: string;
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  content: string;
  changelog?: string;
  createdBy: string;
  createdAt: string;
}

// ════════════════════════════════════════════════════════════
// Phase 3: Publishing & API Types
// ════════════════════════════════════════════════════════════

export type AppType = 'chat' | 'advanced-chat' | 'agent-chat' | 'workflow' | 'completion' | 'custom';

// ── Message Feedback ──

export type FeedbackRating = 'thumbs_up' | 'thumbs_down';

export interface MessageFeedback {
  id: string;
  messageId: string;
  userId: string;
  rating: FeedbackRating;
  comment?: string;
  createdAt: string;
}

// ── Agent Connectors ──

export type ConnectorType = 'web' | 'api' | 'embed' | 'slack' | 'discord' | 'telegram';

export interface AgentConnector {
  id: string;
  agentId: string;
  connectorType: ConnectorType;
  name: string;
  url?: string;
  config?: Record<string, unknown>;
  status: string;
  createdAt: string;
}

export interface App {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  iconUrl?: string;
  appType: AppType;
  agentId?: string;
  workflowId?: string;
  config?: Record<string, unknown>;
  status: string;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
}

export interface MarketplaceProduct {
  id: string;
  resourceType: string;
  resourceId: string;
  workspaceId: string;
  name: string;
  description?: string;
  iconUrl?: string;
  category?: string;
  tags?: string[];
  installCount: number;
  rating?: number;
  ratingCount: number;
  publishedBy: string;
  status: string;
  createdAt: string;
}

// ── Resource Type (unified) ──

export type ResourceType = 'agent' | 'plugin' | 'workflow' | 'knowledge_base' | 'prompt' | 'database' | 'app';
