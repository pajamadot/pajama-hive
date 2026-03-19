import { Hono } from 'hono';
import { eq, desc, gte, and } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { metaEvents, runRetrospectives, systemSnapshots } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// ── Meta Events ──

// List meta events (with filters)
app.get('/events', async (c) => {
  const db = createDb(c.env);
  const kind = c.req.query('kind');
  const severity = c.req.query('severity');
  const domain = c.req.query('domain');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);

  const conditions = [];
  if (kind) conditions.push(eq(metaEvents.kind, kind));
  if (severity) conditions.push(eq(metaEvents.severity, severity));
  if (domain) conditions.push(eq(metaEvents.domain, domain));

  const result = conditions.length > 0
    ? await db.select().from(metaEvents).where(and(...conditions)).orderBy(desc(metaEvents.createdAt)).limit(limit)
    : await db.select().from(metaEvents).orderBy(desc(metaEvents.createdAt)).limit(limit);

  return c.json({ events: result });
});

// Resolve a meta event
app.post('/events/:eventId/resolve', async (c) => {
  const db = createDb(c.env);
  const eventId = c.req.param('eventId');
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({})) as { resolution?: string };

  const [updated] = await db.update(metaEvents)
    .set({
      resolved: body.resolution ?? 'true',
      resolvedBy: userId,
    })
    .where(eq(metaEvents.id, eventId))
    .returning();

  if (!updated) return c.json({ error: 'Event not found' }, 404);
  return c.json({ event: updated });
});

// ── Retrospectives ──

// List retrospectives
app.get('/retrospectives', async (c) => {
  const db = createDb(c.env);
  const graphId = c.req.query('graphId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);

  const result = graphId
    ? await db.select().from(runRetrospectives).where(eq(runRetrospectives.graphId, graphId)).orderBy(desc(runRetrospectives.createdAt)).limit(limit)
    : await db.select().from(runRetrospectives).orderBy(desc(runRetrospectives.createdAt)).limit(limit);

  return c.json({ retrospectives: result });
});

// Get specific retrospective
app.get('/retrospectives/:retroId', async (c) => {
  const db = createDb(c.env);
  const retroId = c.req.param('retroId');
  const [retro] = await db.select().from(runRetrospectives).where(eq(runRetrospectives.id, retroId));
  if (!retro) return c.json({ error: 'Retrospective not found' }, 404);
  return c.json({ retrospective: retro });
});

// ── System Health ──

// Get latest health snapshot
app.get('/health', async (c) => {
  const db = createDb(c.env);
  const [latest] = await db.select().from(systemSnapshots).orderBy(desc(systemSnapshots.createdAt)).limit(1);

  if (!latest) {
    return c.json({
      health: {
        overall: 'healthy',
        scores: { scheduling: 100, execution: 100, reliability: 100, planning: 100, evolution: 0 },
        activeWorkers: 0,
        activeRuns: 0,
        taskSuccessRate: 1,
        avgTaskDurationMs: 0,
        planAcceptanceRate: 0,
        selfImprovePRsMerged: 0,
        lastUpdated: new Date().toISOString(),
      },
    });
  }

  return c.json({
    health: {
      overall: latest.overallHealth,
      scores: {
        scheduling: latest.scoreScheduling,
        execution: latest.scoreExecution,
        reliability: latest.scoreReliability,
        planning: latest.scorePlanning,
        evolution: latest.scoreEvolution,
      },
      activeWorkers: latest.activeWorkers,
      activeRuns: latest.activeRuns,
      taskSuccessRate: latest.taskSuccessRate,
      avgTaskDurationMs: latest.avgTaskDurationMs,
      planAcceptanceRate: latest.planAcceptanceRate,
      selfImprovePRsMerged: latest.selfImprovePrsMerged,
      lastUpdated: latest.createdAt.toISOString(),
    },
  });
});

// Get health history
app.get('/health/history', async (c) => {
  const db = createDb(c.env);
  const hours = parseInt(c.req.query('hours') ?? '24');
  const since = new Date(Date.now() - hours * 3_600_000);

  const result = await db.select()
    .from(systemSnapshots)
    .where(gte(systemSnapshots.createdAt, since))
    .orderBy(desc(systemSnapshots.createdAt));

  return c.json({ snapshots: result });
});

// ── Manual triggers ──

// Trigger health snapshot
app.post('/health/snapshot', async (c) => {
  const metaId = c.env.META_OBSERVER.idFromName('global');
  const metaDo = c.env.META_OBSERVER.get(metaId);
  const res = await metaDo.fetch(new Request('http://internal/health-snapshot', { method: 'POST' }));
  return c.json(await res.json());
});

// Start the meta observer
app.post('/start', async (c) => {
  const metaId = c.env.META_OBSERVER.idFromName('global');
  const metaDo = c.env.META_OBSERVER.get(metaId);
  const res = await metaDo.fetch(new Request('http://internal/start', { method: 'POST' }));
  return c.json(await res.json());
});

export default app;
