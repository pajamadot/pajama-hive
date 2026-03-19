import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import graphsRouter from './routes/graphs.js';
import tasksRouter from './routes/tasks.js';
import runsRouter from './routes/runs.js';
import workersRouter from './routes/workers.js';
import auditRouter from './routes/audit.js';
import type { Env } from './types/index.js';

export { WsRoom } from './durable-objects/ws-room.js';
export { Orchestrator } from './durable-objects/orchestrator.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string; claims: Record<string, unknown> } };

const app = new Hono<HonoEnv>();

// Middleware
app.use('/*', cors({
  origin: ['https://hive.pajamadot.com', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use('/*', logger());

// Health check
app.get('/', (c) => c.json({
  name: 'pajama-hive-api',
  version: '0.1.0',
  status: 'ok',
}));

// REST API routes
app.route('/v1/graphs', graphsRouter);
app.route('/v1', tasksRouter);
app.route('/v1', runsRouter);
app.route('/v1/workers', workersRouter);
app.route('/v1/audit', auditRouter);

// WebSocket upgrade endpoint — delegates to WsRoom Durable Object
app.get('/v1/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  // Route to the global WsRoom DO
  const roomId = c.env.WS_ROOM.idFromName('global');
  const room = c.env.WS_ROOM.get(roomId);

  const url = new URL(c.req.url);
  url.pathname = '/ws';

  return room.fetch(new Request(url.toString(), {
    headers: c.req.raw.headers,
  }));
});

// Graph-specific WebSocket (for UI clients watching a specific graph)
app.get('/v1/graphs/:graphId/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  const graphId = c.req.param('graphId');
  const roomId = c.env.WS_ROOM.idFromName(graphId);
  const room = c.env.WS_ROOM.get(roomId);

  const url = new URL(c.req.url);
  url.pathname = '/ws';
  url.searchParams.set('role', 'ui');

  return room.fetch(new Request(url.toString(), {
    headers: c.req.raw.headers,
  }));
});

export default app;
