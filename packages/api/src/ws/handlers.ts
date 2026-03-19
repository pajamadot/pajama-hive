import type {
  WorkerRegisterPayload,
  WorkerHeartbeatPayload,
  TaskPullPayload,
  TaskLogPayload,
  TaskResultPayload,
  WsMessage,
} from '@pajamadot/hive-shared';

export type WsHandler = (ws: WebSocket, message: WsMessage) => Promise<void> | void;

export interface WsHandlerContext {
  onWorkerRegister: (ws: WebSocket, payload: WorkerRegisterPayload, requestId: string) => Promise<void>;
  onWorkerHeartbeat: (ws: WebSocket, payload: WorkerHeartbeatPayload) => Promise<void>;
  onTaskPull: (ws: WebSocket, payload: TaskPullPayload, requestId: string) => Promise<void>;
  onTaskLog: (ws: WebSocket, payload: TaskLogPayload) => Promise<void>;
  onTaskResult: (ws: WebSocket, payload: TaskResultPayload) => Promise<void>;
}

export function dispatchWsMessage(ctx: WsHandlerContext, ws: WebSocket, message: WsMessage): Promise<void> | void {
  switch (message.type) {
    case 'worker.register':
      return ctx.onWorkerRegister(ws, message.payload as WorkerRegisterPayload, message.requestId);
    case 'worker.heartbeat':
      return ctx.onWorkerHeartbeat(ws, message.payload as WorkerHeartbeatPayload);
    case 'task.pull':
      return ctx.onTaskPull(ws, message.payload as TaskPullPayload, message.requestId);
    case 'task.log':
      return ctx.onTaskLog(ws, message.payload as TaskLogPayload);
    case 'task.result':
      return ctx.onTaskResult(ws, message.payload as TaskResultPayload);
    default:
      // Unknown message type — ignore or log
      console.warn(`Unknown WS message type: ${message.type}`);
  }
}
