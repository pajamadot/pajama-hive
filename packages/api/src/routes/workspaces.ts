import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, lt, isNull, inArray } from 'drizzle-orm';
import { createWorkspaceSchema, updateWorkspaceSchema, inviteMemberSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { workspaces, workspaceMembers } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List workspaces for current user (auto-creates default workspace if none exist)
app.get('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');

  // Get all workspaces where user is a member
  let memberships = await db.select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));

  // Auto-create default workspace for new users
  if (memberships.length === 0) {
    const wsId = nanoid();
    const now = new Date();
    try {
      await db.insert(workspaces).values({
        id: wsId, name: 'My Workspace', slug: `ws-${wsId.slice(0, 8)}`,
        ownerId: userId, createdAt: now, updatedAt: now,
      });
      await db.insert(workspaceMembers).values({
        id: nanoid(), workspaceId: wsId, userId, role: 'owner', joinedAt: now,
      });
      memberships = [{ id: '', workspaceId: wsId, userId, role: 'owner', invitedBy: null, joinedAt: now }];
    } catch { /* race condition — another request created it */ }
  }

  if (memberships.length === 0) return c.json({ workspaces: [] });

  const wsIds = memberships.map((m) => m.workspaceId);
  const result = await db.select().from(workspaces)
    .where(and(
      isNull(workspaces.deletedAt),
      inArray(workspaces.id, wsIds),
    ))
    .orderBy(desc(workspaces.updatedAt));

  return c.json({ workspaces: result });
});

// Create workspace
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = nanoid();
  const ws = { id, ...parsed.data, ownerId: userId, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(workspaces).values(ws);

  // Add creator as owner member
  await db.insert(workspaceMembers).values({
    id: nanoid(),
    workspaceId: id,
    userId,
    role: 'owner',
    joinedAt: new Date(),
  });

  return c.json({ workspace: ws }, 201);
});

// Get workspace
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [ws] = await db.select().from(workspaces).where(and(eq(workspaces.id, id), isNull(workspaces.deletedAt)));
  if (!ws) return c.json({ error: 'Workspace not found' }, 404);

  // Verify membership
  const [member] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)));
  if (!member) return c.json({ error: 'Forbidden' }, 403);

  return c.json({ workspace: ws });
});

// Update workspace
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateWorkspaceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // Verify admin/owner
  const [member] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)));
  if (!member || member.role === 'member') return c.json({ error: 'Forbidden' }, 403);

  await db.update(workspaces).set({ ...parsed.data, updatedAt: new Date() }).where(eq(workspaces.id, id));
  return c.json({ ok: true });
});

// Delete workspace (soft)
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!ws) return c.json({ error: 'Workspace not found' }, 404);
  if (ws.ownerId !== userId) return c.json({ error: 'Only owner can delete' }, 403);

  await db.update(workspaces).set({ deletedAt: new Date() }).where(eq(workspaces.id, id));
  return c.json({ ok: true });
});

// ── Members ──

// List members
app.get('/:id/members', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  // Verify membership
  const [self] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)));
  if (!self) return c.json({ error: 'Forbidden' }, 403);

  const members = await db.select().from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, id));

  return c.json({ members });
});

// Invite member
app.post('/:id/members', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // Verify admin/owner
  const [self] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)));
  if (!self || self.role === 'member') return c.json({ error: 'Forbidden' }, 403);

  await db.insert(workspaceMembers).values({
    id: nanoid(),
    workspaceId: id,
    userId: parsed.data.userId,
    role: parsed.data.role,
    invitedBy: userId,
    joinedAt: new Date(),
  });

  return c.json({ ok: true }, 201);
});

// Remove member
app.delete('/:id/members/:memberId', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const memberId = c.req.param('memberId');

  // Verify admin/owner
  const [self] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)));
  if (!self || self.role === 'member') return c.json({ error: 'Forbidden' }, 403);

  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, memberId));
  return c.json({ ok: true });
});

export default app;
