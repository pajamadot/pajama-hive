import {
  wsMessageSchema,
  workerRegisterSchema,
  workerHeartbeatSchema,
  taskPullSchema,
  taskLogSchema,
  taskResultSchema,
} from '@pajamadot/hive-shared';
import type { WsMessage } from '@pajamadot/hive-shared';

const inboundValidators: Record<string, (payload: unknown) => boolean> = {
  'worker.register': (p) => workerRegisterSchema.safeParse(p).success,
  'worker.heartbeat': (p) => workerHeartbeatSchema.safeParse(p).success,
  'task.pull': (p) => taskPullSchema.safeParse(p).success,
  'task.log': (p) => taskLogSchema.safeParse(p).success,
  'task.result': (p) => taskResultSchema.safeParse(p).success,
};

export function parseWsMessage(raw: string): { ok: true; message: WsMessage } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }

  const envelope = wsMessageSchema.safeParse(parsed);
  if (!envelope.success) {
    return { ok: false, error: `Invalid message envelope: ${envelope.error.message}` };
  }

  const msg = envelope.data as WsMessage;

  const validator = inboundValidators[msg.type];
  if (validator && !validator(msg.payload)) {
    return { ok: false, error: `Invalid payload for message type: ${msg.type}` };
  }

  return { ok: true, message: msg };
}

export function createWsMessage<T>(type: string, payload: T, requestId?: string): string {
  const msg: WsMessage<T> = {
    type: type as WsMessage['type'],
    requestId: requestId ?? crypto.randomUUID(),
    ts: new Date().toISOString(),
    payload,
  };
  return JSON.stringify(msg);
}
