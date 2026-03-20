import { DurableObject } from 'cloudflare:workers';
import { parseWsMessage, createWsMessage } from '../ws/protocol.js';
import { dispatchWsMessage, type WsHandlerContext } from '../ws/handlers.js';
import type {
  WorkerRegisterPayload,
  WorkerHeartbeatPayload,
  TaskPullPayload,
  TaskLogPayload,
  TaskResultPayload,
} from '@pajamadot/hive-shared';
import type { Env } from '../types/index.js';

interface ConnectedWorker {
  workerId: string;
  ws: WebSocket;
  agentKinds: string[];
  capabilities: string[];
  idle: boolean;
}

/**
 * WsRoom Durable Object — Hibernatable WebSocket room.
 * One per graph (for scoped broadcasting) or a global room for worker coordination.
 */
export class WsRoom extends DurableObject<Env> {
  private workers = new Map<string, ConnectedWorker>();
  private uiClients = new Set<WebSocket>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const role = url.searchParams.get('role') ?? 'ui'; // 'worker' or 'ui'

      this.ctx.acceptWebSocket(server, [role]);

      if (role === 'ui') {
        this.uiClients.add(server);
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    // Internal API: broadcast a message to all UI clients
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.text();
      for (const ws of this.uiClients) {
        try { ws.send(body); } catch { this.uiClients.delete(ws); }
      }
      return new Response('ok');
    }

    // Internal API: send task assignment to a specific worker
    if (url.pathname === '/send-to-worker' && request.method === 'POST') {
      const { workerId, message, taskId, graphId } = await request.json() as { workerId: string; message: string; taskId?: string; graphId?: string };
      // Store task→graph mapping for result routing
      if (taskId && graphId) {
        await this.ctx.storage.put(`task:${taskId}`, { graphId });
      }
      const worker = this.workers.get(workerId);
      if (worker) {
        try { worker.ws.send(message); } catch { this.workers.delete(workerId); }
      }
      return new Response('ok');
    }

    // Internal API: get idle workers
    if (url.pathname === '/idle-workers') {
      const idle = [...this.workers.values()]
        .filter((w) => w.idle)
        .map((w) => ({ id: w.workerId, agentKinds: w.agentKinds, capabilities: w.capabilities }));
      return Response.json({ workers: idle });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    const parsed = parseWsMessage(message);
    if (!parsed.ok) {
      ws.send(createWsMessage('error', { code: 'PARSE_ERROR', message: parsed.error }));
      return;
    }

    const handlers: WsHandlerContext = {
      onWorkerRegister: async (_ws, payload: WorkerRegisterPayload, requestId) => {
        this.workers.set(payload.workerId, {
          workerId: payload.workerId,
          ws: _ws,
          agentKinds: payload.agentKinds,
          capabilities: payload.capabilities,
          idle: true,
        });

        // Persist worker registration
        await this.ctx.storage.put(`worker:${payload.workerId}`, {
          agentKinds: payload.agentKinds,
          capabilities: payload.capabilities,
          maxConcurrency: payload.maxConcurrency,
          version: payload.version,
        });

        _ws.send(createWsMessage('worker.registered', { workerId: payload.workerId }, requestId));

        // Broadcast worker status to UI
        this.broadcastToUi('worker.status', {
          workerId: payload.workerId,
          status: 'online',
        });
      },

      onWorkerHeartbeat: async (_ws, payload: WorkerHeartbeatPayload) => {
        const worker = this.workers.get(payload.workerId);
        if (worker) {
          worker.ws = _ws; // Update WS reference in case of reconnect
        }
      },

      onTaskPull: async (_ws, payload: TaskPullPayload, requestId) => {
        const worker = this.workers.get(payload.workerId);
        if (worker) {
          worker.idle = true;
        }
        // The orchestrator will handle actual assignment via alarm
      },

      onTaskLog: async (_ws, payload: TaskLogPayload) => {
        // Forward log to UI clients
        this.broadcastToUi('task.log', payload);
      },

      onTaskResult: async (_ws, payload: TaskResultPayload) => {
        const workerEntry = [...this.workers.entries()].find(([, w]) => w.ws === _ws);
        if (workerEntry) {
          workerEntry[1].idle = true;
        }

        // Forward result to UI
        this.broadcastToUi('task.result', payload);

        // Forward to Orchestrator DO via internal fetch to update DB + trigger deps
        try {
          // Determine which graph this task belongs to by checking storage
          const taskMeta = await this.ctx.storage.get<{ graphId: string }>(`task:${payload.taskId}`);
          if (taskMeta?.graphId) {
            const orchestratorId = this.env.ORCHESTRATOR.idFromName(taskMeta.graphId);
            const orchestrator = this.env.ORCHESTRATOR.get(orchestratorId);
            await orchestrator.fetch(new Request('http://internal/task-result', {
              method: 'POST',
              body: JSON.stringify(payload),
            }));
          }
        } catch (err) {
          console.error('Failed to forward result to orchestrator:', err);
        }
      },
    };

    await dispatchWsMessage(handlers, ws, parsed.message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // Remove worker if it was connected
    for (const [id, worker] of this.workers) {
      if (worker.ws === ws) {
        this.workers.delete(id);
        this.broadcastToUi('worker.status', { workerId: id, status: 'offline' });
        break;
      }
    }
    this.uiClients.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.webSocketClose(ws, 1011, 'WebSocket error');
  }

  private broadcastToUi(type: string, payload: unknown): void {
    const msg = createWsMessage(type, payload);
    for (const ws of this.uiClients) {
      try { ws.send(msg); } catch { this.uiClients.delete(ws); }
    }
  }
}
