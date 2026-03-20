import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { createUserDatabaseSchema, createUserTableSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { userDatabases, userTables, userTableRows } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List databases
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const result = await db.select().from(userDatabases)
    .where(and(eq(userDatabases.workspaceId, workspaceId), isNull(userDatabases.deletedAt)))
    .orderBy(desc(userDatabases.updatedAt));

  return c.json({ databases: result });
});

// Create database
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createUserDatabaseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(userDatabases).values({
    id, workspaceId, ...parsed.data, createdBy: userId, createdAt: now, updatedAt: now,
  });

  return c.json({ database: { id, workspaceId, ...parsed.data } }, 201);
});

// Delete database
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(userDatabases).set({ deletedAt: new Date() }).where(eq(userDatabases.id, id));
  return c.json({ ok: true });
});

// ── Tables ──

app.get('/:id/tables', async (c) => {
  const db = createDb(c.env);
  const dbId = c.req.param('id');

  const tables = await db.select().from(userTables)
    .where(eq(userTables.databaseId, dbId));

  return c.json({ tables });
});

app.post('/:id/tables', async (c) => {
  const db = createDb(c.env);
  const dbId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createUserTableSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(userTables).values({
    id, databaseId: dbId, ...parsed.data, createdAt: now, updatedAt: now,
  });

  return c.json({ table: { id, databaseId: dbId, ...parsed.data } }, 201);
});

app.delete('/tables/:tableId', async (c) => {
  const db = createDb(c.env);
  const tableId = c.req.param('tableId');
  await db.delete(userTableRows).where(eq(userTableRows.tableId, tableId));
  await db.delete(userTables).where(eq(userTables.id, tableId));
  return c.json({ ok: true });
});

// ── Rows ──

app.get('/tables/:tableId/rows', async (c) => {
  const db = createDb(c.env);
  const tableId = c.req.param('tableId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 500);

  const rows = await db.select().from(userTableRows)
    .where(eq(userTableRows.tableId, tableId))
    .orderBy(desc(userTableRows.createdAt))
    .limit(limit);

  return c.json({ rows });
});

app.post('/tables/:tableId/rows', async (c) => {
  const db = createDb(c.env);
  const tableId = c.req.param('tableId');
  const body = await c.req.json();

  const id = nanoid();
  const now = new Date();

  await db.insert(userTableRows).values({
    id, tableId, data: body.data ?? body, createdAt: now, updatedAt: now,
  });

  // Update row count
  const count = (await db.select().from(userTableRows).where(eq(userTableRows.tableId, tableId))).length;
  await db.update(userTables).set({ rowCount: count, updatedAt: now }).where(eq(userTables.id, tableId));

  return c.json({ row: { id, data: body.data ?? body } }, 201);
});

app.delete('/rows/:rowId', async (c) => {
  const db = createDb(c.env);
  const rowId = c.req.param('rowId');
  await db.delete(userTableRows).where(eq(userTableRows.id, rowId));
  return c.json({ ok: true });
});

export default app;
