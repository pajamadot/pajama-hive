import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { webhooks } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

// List webhooks for current user
app.get('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const result = await db.select({
    id: webhooks.id,
    url: webhooks.url,
    events: webhooks.events,
    active: webhooks.active,
    createdAt: webhooks.createdAt,
  }).from(webhooks).where(eq(webhooks.userId, userId));
  return c.json({ webhooks: result });
});

// Create webhook
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json() as {
    url: string;
    events: string[];
  };

  if (!body.url || !body.events?.length) {
    return c.json({ error: 'URL and events are required' }, 400);
  }

  const id = nanoid(12);
  const secret = `whsec_${nanoid(24)}`;

  await db.insert(webhooks).values({
    id,
    userId,
    url: body.url,
    events: body.events,
    secret,
  });

  return c.json({
    webhook: { id, url: body.url, events: body.events },
    secret, // Only returned once!
  }, 201);
});

// Delete webhook
app.delete('/:webhookId', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const webhookId = c.req.param('webhookId');

  await db.delete(webhooks).where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));
  return c.json({ ok: true });
});

// Toggle webhook active/inactive
app.patch('/:webhookId', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const webhookId = c.req.param('webhookId');
  const body = await c.req.json() as { active: boolean };

  const [updated] = await db.update(webhooks)
    .set({ active: body.active ? 1 : 0 })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: 'Webhook not found' }, 404);
  return c.json({ webhook: updated });
});

export default app;

/**
 * Fire webhooks for an event. Call this from orchestrator/run completion.
 */
export async function fireWebhooks(
  db: ReturnType<typeof createDb>,
  userId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const hooks = await db.select().from(webhooks)
    .where(and(eq(webhooks.userId, userId), eq(webhooks.active, 1)));

  for (const hook of hooks) {
    if (!hook.events.includes(event) && !hook.events.includes('*')) continue;

    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

    // HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(hook.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const signature = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');

    // Best-effort delivery
    fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hive-Signature': signature,
        'X-Hive-Event': event,
      },
      body,
    }).catch(() => {});
  }
}
