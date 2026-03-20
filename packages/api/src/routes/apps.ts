import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { createAppSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { apps, appVersions, appDeployments } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List apps
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const result = await db.select().from(apps)
    .where(and(eq(apps.workspaceId, workspaceId), isNull(apps.deletedAt)))
    .orderBy(desc(apps.updatedAt));

  return c.json({ apps: result });
});

// Get app
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [a] = await db.select().from(apps)
    .where(and(eq(apps.id, id), isNull(apps.deletedAt)));
  if (!a) return c.json({ error: 'App not found' }, 404);

  return c.json({ app: a });
});

// Create app
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createAppSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(apps).values({
    id, workspaceId, ...parsed.data, createdBy: userId, createdAt: now, updatedAt: now,
  });

  return c.json({ app: { id, workspaceId, ...parsed.data } }, 201);
});

// Update app
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.config) updates.config = body.config;

  await db.update(apps).set(updates).where(eq(apps.id, id));
  return c.json({ ok: true });
});

// Delete app
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(apps).set({ deletedAt: new Date() }).where(eq(apps.id, id));
  return c.json({ ok: true });
});

// Publish app
app.post('/:id/publish', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [a] = await db.select().from(apps).where(eq(apps.id, id));
  if (!a) return c.json({ error: 'App not found' }, 404);

  const existing = await db.select().from(appVersions)
    .where(eq(appVersions.appId, id))
    .orderBy(desc(appVersions.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
  const now = new Date();

  const versionId = nanoid();
  await db.insert(appVersions).values({
    id: versionId, appId: id, version: nextVersion,
    snapshot: a, publishedBy: userId, createdAt: now,
  });

  await db.update(apps).set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(eq(apps.id, id));

  // Create deployment record
  await db.insert(appDeployments).values({
    id: nanoid(),
    appId: id,
    versionId,
    environment: 'production',
    url: `https://hive.pajamadot.com/embed/${id}`,
    status: 'active',
    createdAt: now,
  });

  return c.json({ version: nextVersion, versionId, url: `https://hive.pajamadot.com/embed/${id}` });
});

// Get deployment info
app.get('/:id/deployment', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const deployments = await db.select().from(appDeployments)
    .where(eq(appDeployments.appId, id))
    .orderBy(desc(appDeployments.createdAt));

  return c.json({ deployments });
});

// Get embeddable widget code
app.get('/:id/embed', async (c) => {
  const id = c.req.param('id');

  const embedCode = `<!-- Pajama Hive Chat Widget -->
<div id="hive-chat-widget"></div>
<script>
  (function() {
    var s = document.createElement('script');
    s.src = 'https://hive.pajamadot.com/widget.js';
    s.async = true;
    s.dataset.appId = '${id}';
    s.dataset.theme = 'dark';
    document.head.appendChild(s);
  })();
</script>`;

  return c.json({ appId: id, embedCode, url: `https://hive.pajamadot.com/embed/${id}` });
});

export default app;
