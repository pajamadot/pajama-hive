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
