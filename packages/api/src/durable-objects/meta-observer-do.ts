import { DurableObject } from 'cloudflare:workers';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as dbSchema from '../db/schema.js';
import { MetaObserver } from '../lib/meta-observer.js';
import type { Env } from '../types/index.js';

const HEALTH_CHECK_INTERVAL_MS = 60_000;   // 1 minute
const ANOMALY_CHECK_INTERVAL_MS = 30_000;  // 30 seconds

/**
 * MetaObserverDO — the system's self-awareness engine.
 *
 * Runs periodic alarms to:
 * 1. Capture system health snapshots
 * 2. Detect anomalies (stuck tasks, ghost workers)
 * 3. Generate retrospectives when runs complete
 * 4. Analyze plan quality
 */
export class MetaObserverDO extends DurableObject<Env> {
  private getDb() {
    const sql = neon(this.env.HYPERDRIVE.connectionString);
    return drizzle(sql, { schema: dbSchema });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/start' && request.method === 'POST') {
      // Start the periodic observation cycle
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      return Response.json({ ok: true, message: 'MetaObserver started' });
    }

    if (url.pathname === '/run-completed' && request.method === 'POST') {
      const { runId, graphId } = await request.json() as { runId: string; graphId: string };
      const db = this.getDb();
      const observer = new MetaObserver(db);
      const retroId = await observer.generateRetrospective(runId, graphId);
      return Response.json({ ok: true, retrospectiveId: retroId });
    }

    if (url.pathname === '/analyze-plan' && request.method === 'POST') {
      const { graphId } = await request.json() as { graphId: string };
      const db = this.getDb();
      const observer = new MetaObserver(db);
      await observer.analyzePlanQuality(graphId);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/health-snapshot' && request.method === 'POST') {
      const db = this.getDb();
      const observer = new MetaObserver(db);
      const snapshotId = await observer.captureHealthSnapshot();
      return Response.json({ ok: true, snapshotId });
    }

    return new Response('Not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    try {
      const db = this.getDb();
      const observer = new MetaObserver(db);

      // Run anomaly detection
      await observer.detectAnomalies();

      // Capture health snapshot every minute
      const lastSnapshot = await this.ctx.storage.get<number>('lastSnapshotAt') ?? 0;
      if (Date.now() - lastSnapshot > HEALTH_CHECK_INTERVAL_MS) {
        await observer.captureHealthSnapshot();
        await this.ctx.storage.put('lastSnapshotAt', Date.now());
      }
    } catch (err) {
      console.error('MetaObserver alarm error:', err);
    }

    // Schedule next alarm
    await this.ctx.storage.setAlarm(Date.now() + ANOMALY_CHECK_INTERVAL_MS);
  }
}
