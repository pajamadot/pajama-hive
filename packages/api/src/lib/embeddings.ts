/**
 * Embedding Generation
 * Calls embedding models to generate vectors for knowledge base chunks.
 */

import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { modelProviders, modelConfigs } from '../db/schema.js';

interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

interface EmbeddingProvider {
  provider: string;
  baseUrl: string | null;
  apiKey: string;
  modelId: string;
}

/**
 * Resolve the embedding model for a workspace.
 * Looks for a model config with modelType = 'embedding'.
 */
async function resolveEmbeddingProvider(db: Database, workspaceId: string, modelConfigId?: string | null): Promise<EmbeddingProvider | null> {
  if (modelConfigId) {
    const [mc] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, modelConfigId));
    if (mc) {
      const [prov] = await db.select().from(modelProviders).where(eq(modelProviders.id, mc.providerId));
      if (prov?.apiKeyEncrypted) {
        return { provider: prov.provider, baseUrl: prov.baseUrl, apiKey: prov.apiKeyEncrypted, modelId: mc.modelId };
      }
    }
  }

  // Find any embedding model in the workspace
  const providers = await db.select().from(modelProviders).where(eq(modelProviders.workspaceId, workspaceId));
  for (const prov of providers) {
    if (!prov.isEnabled || !prov.apiKeyEncrypted) continue;
    const configs = await db.select().from(modelConfigs).where(eq(modelConfigs.providerId, prov.id));
    const embConfig = configs.find((c) => c.modelType === 'embedding');
    if (embConfig) {
      return { provider: prov.provider, baseUrl: prov.baseUrl, apiKey: prov.apiKeyEncrypted, modelId: embConfig.modelId };
    }
  }

  // Fallback: use any provider with text-embedding-3-small or similar
  for (const prov of providers) {
    if (!prov.isEnabled || !prov.apiKeyEncrypted) continue;
    if (prov.provider === 'openai') {
      return { provider: 'openai', baseUrl: prov.baseUrl, apiKey: prov.apiKeyEncrypted, modelId: 'text-embedding-3-small' };
    }
  }

  return null;
}

/**
 * Generate embeddings via OpenAI-compatible API.
 */
async function embedOpenAI(config: EmbeddingProvider, texts: string[]): Promise<EmbeddingResult[]> {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelId,
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    data: { embedding: number[]; index: number }[];
    usage: { prompt_tokens: number; total_tokens: number };
  };

  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => ({
      embedding: d.embedding,
      tokenCount: Math.ceil(texts[d.index].length / 4),
    }));
}

/**
 * Generate embeddings for a batch of texts.
 * Returns null if no embedding provider is configured.
 */
export async function generateEmbeddings(
  db: Database,
  workspaceId: string,
  texts: string[],
  modelConfigId?: string | null,
): Promise<EmbeddingResult[] | null> {
  const provider = await resolveEmbeddingProvider(db, workspaceId, modelConfigId);
  if (!provider) return null;

  // Batch in chunks of 100 (OpenAI limit is 2048)
  const batchSize = 100;
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    switch (provider.provider) {
      case 'openai':
      case 'deepseek':
      case 'custom':
      case 'volcengine':
        results.push(...await embedOpenAI(provider, batch));
        break;
      default:
        // For other providers, use OpenAI-compatible format
        results.push(...await embedOpenAI(provider, batch));
    }
  }

  return results;
}

/**
 * Perform vector similarity search on document_chunks.
 * Uses pgvector's cosine distance operator.
 */
export async function vectorSearch(
  db: Database,
  workspaceId: string,
  knowledgeBaseId: string,
  query: string,
  topK = 5,
  modelConfigId?: string | null,
): Promise<{ id: string; content: string; score: number; chunkIndex: number }[]> {
  // Generate query embedding
  const embeddings = await generateEmbeddings(db, workspaceId, [query], modelConfigId);
  if (!embeddings || embeddings.length === 0) return [];

  const queryVec = `[${embeddings[0].embedding.join(',')}]`;

  // Use raw SQL for pgvector similarity search
  // Drizzle doesn't have native pgvector support, so we use sql template
  const { sql } = await import('drizzle-orm');
  const results = await db.execute(
    sql`SELECT id, content, chunk_index,
        1 - (embedding_vec <=> ${queryVec}::vector) AS score
      FROM document_chunks
      WHERE knowledge_base_id = ${knowledgeBaseId}
        AND embedding_vec IS NOT NULL
      ORDER BY embedding_vec <=> ${queryVec}::vector
      LIMIT ${topK}`,
  );

  return (results as unknown as { id: string; content: string; chunk_index: number; score: number }[]).map((r) => ({
    id: r.id,
    content: r.content,
    score: r.score,
    chunkIndex: r.chunk_index,
  }));
}
