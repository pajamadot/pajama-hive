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
