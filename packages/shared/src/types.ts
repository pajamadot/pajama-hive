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
