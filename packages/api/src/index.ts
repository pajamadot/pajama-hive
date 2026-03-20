import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import graphsRouter from './routes/graphs.js';
import tasksRouter from './routes/tasks.js';
import runsRouter from './routes/runs.js';
import workersRouter from './routes/workers.js';
import auditRouter from './routes/audit.js';
import metaRouter from './routes/meta.js';
import plansRouter from './routes/plans.js';
import evolutionRouter from './routes/evolution.js';
import apiKeysRouter from './routes/api-keys.js';
import webhooksRouter from './routes/webhooks.js';
import { standardRateLimit } from './lib/rate-limiter.js';
import { maxPayloadSize, requestId, securityHeaders, responseTime } from './lib/validation.js';
import type { Env } from './types/index.js';

export { WsRoom } from './durable-objects/ws-room.js';
export { Orchestrator } from './durable-objects/orchestrator.js';
export { MetaObserverDO } from './durable-objects/meta-observer-do.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string; claims: Record<string, unknown> } };

const app = new Hono<HonoEnv>();

// Global middleware stack
app.use('/*', requestId());
app.use('/*', responseTime());
app.use('/*', securityHeaders());
app.use('/*', cors({
  origin: ['https://hive.pajamadot.com', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
}));
app.use('/*', logger());
app.use('/*', maxPayloadSize(2_097_152)); // 2MB max
app.use('/v1/*', standardRateLimit);

// Health check
app.get('/', (c) => c.json({
  name: 'pajama-hive-api',
  version: '0.3.0',
  status: 'ok',
  iteration: 50,
  uptime: Date.now(),
  features: ['dag-orchestrator', 'meta-observer', 'webhooks', 'api-keys', 'gep-bridge'],
}));

// REST API routes
app.route('/v1/graphs', graphsRouter);
app.route('/v1', tasksRouter);
app.route('/v1', runsRouter);
app.route('/v1/workers', workersRouter);
app.route('/v1/audit', auditRouter);
app.route('/v1/meta', metaRouter);
app.route('/v1', plansRouter);
app.route('/v1', evolutionRouter);
app.route('/v1/api-keys', apiKeysRouter);
app.route('/v1/webhooks', webhooksRouter);

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
