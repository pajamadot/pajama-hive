/**
 * Workspace resolution helper.
 * Resolves 'default' workspace ID to the user's actual first workspace.
 * Auto-creates a workspace if the user has none.
 */

import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { workspaces, workspaceMembers } from '../db/schema.js';

export async function resolveWorkspaceId(db: Database, userId: string, requestedId: string): Promise<string> {
  // If a real workspace ID was provided, use it
  if (requestedId && requestedId !== 'default') {
    return requestedId;
  }

  // Find user's first workspace
  const memberships = await db.select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));

  if (memberships.length > 0) {
    return memberships[0].workspaceId;
  }

  // Auto-create default workspace
  const wsId = nanoid();
  const now = new Date();
  await db.insert(workspaces).values({
    id: wsId, name: 'My Workspace', slug: `ws-${wsId.slice(0, 8)}`,
    ownerId: userId, createdAt: now, updatedAt: now,
  });
  await db.insert(workspaceMembers).values({
    id: nanoid(), workspaceId: wsId, userId, role: 'owner', joinedAt: now,
  });

  return wsId;
}
