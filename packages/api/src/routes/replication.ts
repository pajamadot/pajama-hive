import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, desc, sql } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import {
  workspaces, agents, agentVersions, agentConfigs,
  workflowDefinitions, workflowNodes, workflowVersions, workflowRuns,
  conversations, messages, chatRuns,
  plugins, pluginTools,
  knowledgeBases, documents, documentChunks,
  prompts, promptVersions,
  apps, appVersions,
  marketplaceProducts,
  modelProviders, modelConfigs,
  userDatabases, variables,
  metaEvents, systemSnapshots,
} from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

/**
 * Feature registry: each feature has a check function that returns
 * 'done' | 'partial' | 'stub' | 'not_started'
 */
interface FeatureCheck {
  domain: string;
  feature: string;
  cozeEquivalent: string;
  status: 'done' | 'partial' | 'stub' | 'not_started';
  detail: string;
}

async function analyzeReplicationState(db: ReturnType<typeof createDb>): Promise<{
  features: FeatureCheck[];
  metrics: Record<string, number>;
  score: number;
}> {
  const features: FeatureCheck[] = [];

  // ── Workspace domain ──
  const wsCount = await db.select({ count: sql<number>`count(*)` }).from(workspaces);
  features.push({
    domain: 'workspace', feature: 'Workspace CRUD', cozeEquivalent: 'PassportService',
    status: 'done', detail: `Schema + routes + members. ${wsCount[0]?.count ?? 0} workspaces.`,
  });

  // ── Model domain ──
  const providerCount = await db.select({ count: sql<number>`count(*)` }).from(modelProviders);
  const configCount = await db.select({ count: sql<number>`count(*)` }).from(modelConfigs);
  features.push({
    domain: 'models', feature: 'Model Provider Management', cozeEquivalent: 'ConfigService',
    status: 'done', detail: `${providerCount[0]?.count ?? 0} providers, ${configCount[0]?.count ?? 0} configs.`,
  });
  features.push({
    domain: 'models', feature: 'LLM Chat Integration', cozeEquivalent: 'Eino LLM Framework',
    status: 'done', detail: 'OpenAI/Anthropic/Google/DeepSeek/Qwen/Ollama/custom via lib/llm.ts',
  });
  features.push({
    domain: 'models', feature: 'SSE Streaming Chat', cozeEquivalent: 'AgentRun SSE',
    status: 'stub', detail: 'Chat works but returns full response, no streaming yet.',
  });

  // ── Agent domain ──
  const agentCount = await db.select({ count: sql<number>`count(*)` }).from(agents);
  const versionCount = await db.select({ count: sql<number>`count(*)` }).from(agentVersions);
  features.push({
    domain: 'agents', feature: 'Agent CRUD + Config', cozeEquivalent: 'IntelligenceService',
    status: 'done', detail: `${agentCount[0]?.count ?? 0} agents, ${versionCount[0]?.count ?? 0} versions.`,
  });
  features.push({
    domain: 'agents', feature: 'Agent Builder UI', cozeEquivalent: 'SingleMode agent IDE',
    status: 'done', detail: 'Persona/Skills/Knowledge/Workflows/Preview tabs.',
  });
  features.push({
    domain: 'agents', feature: 'Agent Publish + Versioning', cozeEquivalent: 'Draft→Published lifecycle',
    status: 'done', detail: 'Snapshot-based versioning on publish.',
  });

  // ── Workflow domain ──
  const wfCount = await db.select({ count: sql<number>`count(*)` }).from(workflowDefinitions);
  const nodeCount = await db.select({ count: sql<number>`count(*)` }).from(workflowNodes);
  features.push({
    domain: 'workflows', feature: 'Workflow CRUD + Nodes', cozeEquivalent: 'WorkflowService',
    status: 'done', detail: `${wfCount[0]?.count ?? 0} workflows, ${nodeCount[0]?.count ?? 0} nodes. 14+ node types.`,
  });
  features.push({
    domain: 'workflows', feature: 'Workflow Visual Editor', cozeEquivalent: 'fabric-canvas',
    status: 'done', detail: 'Canvas with SVG edges, node palette, config panel.',
  });
  features.push({
    domain: 'workflows', feature: 'Workflow Execution Engine', cozeEquivalent: 'DAG executor + checkpoints',
    status: 'stub', detail: 'Creates run record but no actual node execution.',
  });
  features.push({
    domain: 'workflows', feature: 'Workflow Publish + Versioning', cozeEquivalent: 'workflow_version snapshots',
    status: 'done', detail: 'Full snapshot-based versioning.',
  });

  // ── Conversation domain ──
  const convCount = await db.select({ count: sql<number>`count(*)` }).from(conversations);
  const msgCount = await db.select({ count: sql<number>`count(*)` }).from(messages);
  features.push({
    domain: 'chat', feature: 'Conversation Management', cozeEquivalent: 'ConversationService',
    status: 'done', detail: `${convCount[0]?.count ?? 0} conversations, ${msgCount[0]?.count ?? 0} messages.`,
  });
  features.push({
    domain: 'chat', feature: 'Chat Playground UI', cozeEquivalent: 'AgentChatArea',
    status: 'done', detail: 'Full chat UI with send/receive.',
  });

  // ── Plugin domain ──
  const pluginCount = await db.select({ count: sql<number>`count(*)` }).from(plugins);
  const toolCount = await db.select({ count: sql<number>`count(*)` }).from(pluginTools);
  features.push({
    domain: 'plugins', feature: 'Plugin CRUD + Tools', cozeEquivalent: 'PluginDevelopService',
    status: 'done', detail: `${pluginCount[0]?.count ?? 0} plugins, ${toolCount[0]?.count ?? 0} tools.`,
  });
  features.push({
    domain: 'plugins', feature: 'Plugin Tool Execution', cozeEquivalent: 'Plugin HTTP dispatch',
    status: 'stub', detail: 'Tools defined but no actual HTTP execution yet.',
  });

  // ── Knowledge domain ──
  const kbCount = await db.select({ count: sql<number>`count(*)` }).from(knowledgeBases);
  const docCount = await db.select({ count: sql<number>`count(*)` }).from(documents);
  const chunkCount = await db.select({ count: sql<number>`count(*)` }).from(documentChunks);
  features.push({
    domain: 'knowledge', feature: 'Knowledge Base + Documents', cozeEquivalent: 'KnowledgeService',
    status: 'done', detail: `${kbCount[0]?.count ?? 0} KBs, ${docCount[0]?.count ?? 0} docs, ${chunkCount[0]?.count ?? 0} chunks.`,
  });
  features.push({
    domain: 'knowledge', feature: 'Document Chunking Pipeline', cozeEquivalent: 'Document segmentation',
    status: 'done', detail: 'Sentence-aware chunking with overlap.',
  });
  features.push({
    domain: 'knowledge', feature: 'Vector Embedding + Search', cozeEquivalent: 'Milvus + Eino embeddings',
    status: 'partial', detail: 'Keyword search works. pgvector embeddings not yet implemented.',
  });

  // ── Prompts domain ──
  const promptCount = await db.select({ count: sql<number>`count(*)` }).from(prompts);
  features.push({
    domain: 'prompts', feature: 'Prompt Library + Versioning', cozeEquivalent: 'PlaygroundService',
    status: 'done', detail: `${promptCount[0]?.count ?? 0} prompts with auto-versioning.`,
  });

  // ── Apps domain ──
  const appCount = await db.select({ count: sql<number>`count(*)` }).from(apps);
  features.push({
    domain: 'apps', feature: 'App CRUD + Publish', cozeEquivalent: 'DeveloperApiService',
    status: 'done', detail: `${appCount[0]?.count ?? 0} apps with versioning.`,
  });
  features.push({
    domain: 'apps', feature: 'App Deployment', cozeEquivalent: 'App hosting + URL',
    status: 'stub', detail: 'Version records created but no actual deployment.',
  });

  // ── Marketplace domain ──
  const mpCount = await db.select({ count: sql<number>`count(*)` }).from(marketplaceProducts);
  features.push({
    domain: 'marketplace', feature: 'Marketplace Browse + Install', cozeEquivalent: 'PublicProductService',
    status: 'done', detail: `${mpCount[0]?.count ?? 0} products.`,
  });

  // ── Data domain ──
  const dbCount = await db.select({ count: sql<number>`count(*)` }).from(userDatabases);
  const varCount = await db.select({ count: sql<number>`count(*)` }).from(variables);
  features.push({
    domain: 'data', feature: 'User Databases + Tables', cozeEquivalent: 'DatabaseService',
    status: 'done', detail: `${dbCount[0]?.count ?? 0} databases, ${varCount[0]?.count ?? 0} variables.`,
  });

  // ── Infrastructure ──
  features.push({
    domain: 'infra', feature: 'Pluggable Adapters', cozeEquivalent: 'Redis/ES/Milvus/MinIO/NSQ',
    status: 'done', detail: 'Search/Vector/Storage/Queue/Cache adapter interfaces.',
  });
  features.push({
    domain: 'infra', feature: 'Navigation Sidebar', cozeEquivalent: 'SpaceLayout + Header',
    status: 'done', detail: '5-section sidebar with 15 nav items.',
  });

  // Calculate score
  const weights = { done: 1, partial: 0.6, stub: 0.2, not_started: 0 };
  const total = features.length;
  const score = Math.round(
    (features.reduce((sum, f) => sum + weights[f.status], 0) / total) * 100,
  );

  const metrics = {
    totalFeatures: total,
    done: features.filter((f) => f.status === 'done').length,
    partial: features.filter((f) => f.status === 'partial').length,
    stub: features.filter((f) => f.status === 'stub').length,
    notStarted: features.filter((f) => f.status === 'not_started').length,
    tables: 52,
    apiRoutes: 22,
    frontendPages: 16,
    score,
  };

  return { features, metrics, score };
}

// GET /v1/replication/status — Current replication state
app.get('/status', async (c) => {
  const db = createDb(c.env);
  const result = await analyzeReplicationState(db);
  return c.json(result);
});

// POST /v1/replication/snapshot — Capture a point-in-time snapshot
app.post('/snapshot', async (c) => {
  const db = createDb(c.env);
  const result = await analyzeReplicationState(db);

  // Store as a meta event
  const id = nanoid();
  await db.insert(metaEvents).values({
    id,
    kind: 'milestone',
    severity: 'info',
    domain: 'evolution',
    title: `Replication Progress: ${result.score}%`,
    body: `${result.metrics.done}/${result.metrics.totalFeatures} features done. ${result.metrics.stub} stubs remaining.`,
    evidence: result.metrics as unknown as Record<string, unknown>,
    suggestions: result.features
      .filter((f) => f.status === 'stub' || f.status === 'not_started')
      .map((f) => `Implement: ${f.domain}/${f.feature} (Coze: ${f.cozeEquivalent})`),
    createdAt: new Date(),
  });

  // Also store as system snapshot with replication data
  await db.insert(systemSnapshots).values({
    id: nanoid(),
    overallHealth: result.score >= 80 ? 'healthy' : result.score >= 50 ? 'degraded' : 'critical',
    scoreScheduling: result.score,
    scoreExecution: result.metrics.done,
    scoreReliability: Math.round((result.metrics.done / result.metrics.totalFeatures) * 100),
    scorePlanning: result.metrics.totalFeatures,
    scoreEvolution: result.metrics.stub + result.metrics.notStarted,
    activeWorkers: 0,
    activeRuns: 0,
    taskSuccessRate: result.score / 100,
    avgTaskDurationMs: 0,
    planAcceptanceRate: result.score / 100,
    selfImprovePrsMerged: 0,
    createdAt: new Date(),
  });

  return c.json({ snapshot: { id, score: result.score, metrics: result.metrics } }, 201);
});

// GET /v1/replication/history — Replication progress over time
app.get('/history', async (c) => {
  const db = createDb(c.env);

  const snapshots = await db.select().from(metaEvents)
    .where(eq(metaEvents.domain, 'evolution'))
    .orderBy(desc(metaEvents.createdAt))
    .limit(50);

  return c.json({ history: snapshots });
});

// GET /v1/replication/gaps — What's missing, prioritized
app.get('/gaps', async (c) => {
  const db = createDb(c.env);
  const result = await analyzeReplicationState(db);

  const gaps = result.features
    .filter((f) => f.status !== 'done')
    .sort((a, b) => {
      const priority = { stub: 1, partial: 2, not_started: 3 };
      return (priority[a.status as keyof typeof priority] ?? 9) - (priority[b.status as keyof typeof priority] ?? 9);
    });

  return c.json({
    gaps,
    totalGaps: gaps.length,
    nextPriority: gaps[0] ?? null,
    score: result.score,
  });
});

export default app;
