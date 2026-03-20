import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { createPromptSchema, updatePromptSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { prompts, promptVersions } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { chatCompletion } from '../lib/llm.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List prompts
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const result = await db.select().from(prompts)
    .where(and(eq(prompts.workspaceId, workspaceId), isNull(prompts.deletedAt)))
    .orderBy(desc(prompts.updatedAt));

  return c.json({ prompts: result });
});

// Get prompt with versions
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [prompt] = await db.select().from(prompts)
    .where(and(eq(prompts.id, id), isNull(prompts.deletedAt)));
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404);

  const versions = await db.select().from(promptVersions)
    .where(eq(promptVersions.promptId, id))
    .orderBy(desc(promptVersions.version));

  return c.json({ prompt, versions });
});

// Create prompt
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createPromptSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(prompts).values({
    id, workspaceId, ...parsed.data, createdBy: userId, createdAt: now, updatedAt: now,
  });

  // Create initial version
  await db.insert(promptVersions).values({
    id: nanoid(), promptId: id, version: 1, content: parsed.data.content,
    changelog: 'Initial version', createdBy: userId, createdAt: now,
  });

  return c.json({ prompt: { id, workspaceId, ...parsed.data } }, 201);
});

// Update prompt
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updatePromptSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const now = new Date();
  await db.update(prompts).set({ ...parsed.data, updatedAt: now }).where(eq(prompts.id, id));

  // If content changed, create new version
  if (parsed.data.content) {
    const existing = await db.select().from(promptVersions)
      .where(eq(promptVersions.promptId, id))
      .orderBy(desc(promptVersions.version))
      .limit(1);

    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

    await db.insert(promptVersions).values({
      id: nanoid(), promptId: id, version: nextVersion,
      content: parsed.data.content, changelog: body.changelog ?? null,
      createdBy: userId, createdAt: now,
    });
  }

  return c.json({ ok: true });
});

// Delete prompt
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(prompts).set({ deletedAt: new Date() }).where(eq(prompts.id, id));
  return c.json({ ok: true });
});

// Render prompt template with variables
app.post('/:id/render', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const vars = (body.variables ?? body) as Record<string, string>;

  const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404);

  let rendered = prompt.content;
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  // Report any unresolved variables
  const unresolved = [...rendered.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

  return c.json({ rendered, unresolved });
});

// Test prompt with model — renders template then calls LLM
app.post('/:id/test', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const vars = (body.variables ?? {}) as Record<string, string>;
  const userMessage = body.message ?? body.input ?? 'Hello';

  const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
  if (!prompt) return c.json({ error: 'Prompt not found' }, 404);

  // Render template
  let rendered = prompt.content;
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  // Call LLM
  try {
    const result = await chatCompletion(db, prompt.workspaceId, [
      { role: 'system', content: rendered },
      { role: 'user', content: userMessage },
    ]);

    return c.json({
      rendered,
      response: result.content,
      usage: result.usage,
      model: result.model,
    });
  } catch (err) {
    return c.json({
      rendered,
      error: err instanceof Error ? err.message : 'LLM call failed',
    });
  }
});

export default app;
