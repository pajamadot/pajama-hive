import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { tasks, graphs, auditLogs } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();
app.use('/*', clerkAuth);

/**
 * Create a self-improvement task.
 * This creates a special "self-improve" graph with a single task
 * that instructs an agent to analyze and improve the system.
 */
app.post('/self-improve', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json() as {
    goal: string;
    targetArea?: string;  // 'scheduling' | 'ui' | 'api' | 'cli' | 'docs' | 'tests'
    scope?: string;       // 'minor' | 'moderate' | 'major'
  };

  if (!body.goal) {
    return c.json({ error: 'Goal is required' }, 400);
  }

  // Create a dedicated graph for this improvement
  const graphId = `evolve-${nanoid(8)}`;
  await db.insert(graphs).values({
    id: graphId,
    name: `Self-Improve: ${body.goal.slice(0, 60)}`,
    description: `Auto-generated self-improvement graph. Target: ${body.targetArea ?? 'general'}. Scope: ${body.scope ?? 'minor'}.`,
    ownerId: userId,
    status: 'draft',
  });

  // Create the improvement task with detailed instructions
  const taskId = `evolve-task-${nanoid(8)}`;
  const input = buildSelfImprovePrompt(body.goal, body.targetArea, body.scope);

  await db.insert(tasks).values({
    id: taskId,
    graphId,
    title: `Self-Improve: ${body.goal.slice(0, 80)}`,
    type: 'code',
    status: 'pending',
    input,
    agentKind: 'cc',
    requiredCapabilities: ['git', 'write_fs'],
    priority: 50, // Lower priority than user tasks
    timeoutMs: 1_800_000, // 30 min
    maxRetries: 1,
    attempt: 0,
    positionX: 0,
    positionY: 0,
    version: 1,
  });

  // Audit log
  await db.insert(auditLogs).values({
    id: nanoid(12),
    graphId,
    taskId,
    userId,
    action: 'evolution.created',
    payload: { goal: body.goal, targetArea: body.targetArea, scope: body.scope },
  });

  return c.json({
    graph: { id: graphId },
    task: { id: taskId },
    status: 'created',
    message: 'Self-improvement task created. Start a run to execute it.',
  }, 201);
});

/**
 * List self-improvement graphs and their status.
 */
app.get('/self-improve', async (c) => {
  const db = createDb(c.env);
  const result = await db.select()
    .from(graphs)
    .where(eq(graphs.name, graphs.name)) // TODO: filter by name pattern
    .orderBy(desc(graphs.createdAt));

  const evolveGraphs = result.filter((g) => g.id.startsWith('evolve-'));

  return c.json({ graphs: evolveGraphs });
});

function buildSelfImprovePrompt(goal: string, targetArea?: string, scope?: string): string {
  return `You are a self-improving AI system. Your task is to improve the Pajama Hive codebase.

## Repository
- GitHub: PajamaDot/pajama-hive
- Structure: Turborepo monorepo with packages/api (CF Workers), packages/web (Next.js), packages/shared, crates/hive-cli (Rust)

## Goal
${goal}

## Target Area
${targetArea ?? 'General improvement — analyze the codebase and find the highest-impact improvement'}

## Scope
${scope ?? 'minor'} — ${scope === 'major' ? 'Large refactors are acceptable' : scope === 'moderate' ? 'Moderate changes across a few files' : 'Small, focused changes (1-3 files)'}

## Instructions
1. Clone the repository: git clone https://github.com/PajamaDot/pajama-hive.git
2. Create a new branch: git checkout -b self-improve/${nanoid(6)}
3. Analyze the relevant code
4. Make your improvements
5. Commit with a clear message explaining what you changed and why
6. Push the branch: git push origin HEAD
7. Create a PR using: gh pr create --title "self-improve: <description>" --body "<detailed explanation>"

## Constraints
- Do NOT modify secrets or credentials
- Do NOT delete existing functionality without replacement
- Do NOT make breaking API changes
- Include clear commit messages
- Keep changes focused on the stated goal
- Add comments only where the logic is non-obvious

## Output
After completing, output a JSON summary:
{
  "branch": "<branch-name>",
  "pr_url": "<github-pr-url>",
  "files_changed": ["<file1>", "<file2>"],
  "summary": "<what you changed and why>"
}`;
}

export default app;
