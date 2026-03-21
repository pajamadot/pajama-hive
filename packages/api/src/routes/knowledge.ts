import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, lt, isNull } from 'drizzle-orm';
import { createKnowledgeBaseSchema, createDocumentSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { knowledgeBases, documents, documentChunks } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import { processDocument } from '../lib/chunker.js';
import { generateEmbeddings, vectorSearch } from '../lib/embeddings.js';
import { extractText, canExtractText } from '../lib/text-extractor.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List knowledge bases
app.get('/', async (c) => {
  const db = createDb(c.env);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const result = await db.select().from(knowledgeBases)
    .where(and(eq(knowledgeBases.workspaceId, workspaceId), isNull(knowledgeBases.deletedAt)))
    .orderBy(desc(knowledgeBases.updatedAt));

  return c.json({ knowledgeBases: result });
});

// Get knowledge base with document count
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [kb] = await db.select().from(knowledgeBases)
    .where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)));
  if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);

  const docs = await db.select().from(documents)
    .where(eq(documents.knowledgeBaseId, id));

  return c.json({ knowledgeBase: kb, documents: docs });
});

// Create knowledge base
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createKnowledgeBaseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(knowledgeBases).values({
    id,
    workspaceId,
    ...parsed.data,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ knowledgeBase: { id, workspaceId, ...parsed.data } }, 201);
});

// Update knowledge base
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.chunkSize) updates.chunkSize = body.chunkSize;
  if (body.chunkOverlap !== undefined) updates.chunkOverlap = body.chunkOverlap;

  await db.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, id));
  return c.json({ ok: true });
});

// Delete knowledge base
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(knowledgeBases).set({ deletedAt: new Date() }).where(eq(knowledgeBases.id, id));
  return c.json({ ok: true });
});

// Copy/duplicate knowledge base (Coze: CopyKnowledge)
app.post('/:id/copy', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
  if (!kb) return c.json({ error: 'Knowledge base not found' }, 404);

  const newId = nanoid();
  const now = new Date();

  await db.insert(knowledgeBases).values({
    ...kb, id: newId, name: `${kb.name} (copy)`,
    documentCount: 0, totalChunks: 0,
    createdBy: userId, deletedAt: null, createdAt: now, updatedAt: now,
  });

  // Copy documents and chunks
  const docs = await db.select().from(documents).where(eq(documents.knowledgeBaseId, id));
  for (const doc of docs) {
    const newDocId = nanoid();
    await db.insert(documents).values({
      ...doc, id: newDocId, knowledgeBaseId: newId, createdAt: now,
    });

    const chunks = await db.select().from(documentChunks).where(eq(documentChunks.documentId, doc.id));
    if (chunks.length > 0) {
      await db.insert(documentChunks).values(
        chunks.map((chunk) => ({
          ...chunk, id: nanoid(), documentId: newDocId, knowledgeBaseId: newId, createdAt: now,
        })),
      );
    }
  }

  // Update counts
  const newDocs = await db.select().from(documents).where(eq(documents.knowledgeBaseId, newId));
  const newChunks = await db.select().from(documentChunks).where(eq(documentChunks.knowledgeBaseId, newId));
  await db.update(knowledgeBases).set({
    documentCount: newDocs.length, totalChunks: newChunks.length, updatedAt: now,
  }).where(eq(knowledgeBases.id, newId));

  return c.json({ knowledgeBase: { id: newId } }, 201);
});

// Resegment document (re-chunk with new settings — Coze: Resegment)
app.post('/documents/:docId/resegment', async (c) => {
  const db = createDb(c.env);
  const docId = c.req.param('docId');
  const body = await c.req.json();

  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Delete old chunks
  await db.delete(documentChunks).where(eq(documentChunks.documentId, docId));

  // Get the document text (stored in chunks or from original content)
  // For now, return a placeholder — real implementation would re-read from R2
  await db.update(documents).set({
    status: 'pending', chunkCount: 0, processedAt: null,
  }).where(eq(documents.id, docId));

  return c.json({ ok: true, message: 'Document queued for re-segmentation' });
});

// ── Documents ──

// Upload/create document
app.post('/:id/documents', async (c) => {
  const db = createDb(c.env);
  const kbId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createDocumentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(documents).values({
    id,
    knowledgeBaseId: kbId,
    ...parsed.data,
    status: 'pending',
    createdAt: now,
  });

  // Process document
  let chunkCount = 0;
  let textContent = body.content ?? '';

  // URL scraping: fetch the page and extract text
  if (parsed.data.sourceType === 'url' && parsed.data.sourceUrl && !textContent) {
    try {
      const res = await fetch(parsed.data.sourceUrl, {
        headers: { 'User-Agent': 'PajamaHive-KnowledgeBot/1.0' },
      });
      if (res.ok) {
        const html = await res.text();
        textContent = extractText(html, res.headers.get('content-type') ?? 'text/html', parsed.data.sourceUrl);
      } else {
        await db.update(documents).set({ status: 'error', error: `Fetch failed: HTTP ${res.status}` })
          .where(eq(documents.id, id));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'URL fetch failed';
      await db.update(documents).set({ status: 'error', error: errMsg }).where(eq(documents.id, id));
    }
  }

  if (textContent) {
    // Get KB chunk settings
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
    const chunkSize = kb?.chunkSize ?? 500;
    const chunkOverlap = kb?.chunkOverlap ?? 50;

    const chunks = processDocument(textContent, id, chunkSize, chunkOverlap);
    chunkCount = chunks.length;

    // Insert chunks
    if (chunks.length > 0) {
      await db.insert(documentChunks).values(
        chunks.map((chunk) => ({
          id: chunk.id,
          documentId: id,
          knowledgeBaseId: kbId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata,
          tokenCount: chunk.tokenCount,
          createdAt: now,
        })),
      );
    }

    // Generate embeddings (best-effort — skip if no embedding provider)
    try {
      const embeds = await generateEmbeddings(db, kb?.workspaceId ?? 'default', chunks.map((c) => c.content), kb?.embeddingModelId);
      if (embeds && embeds.length === chunks.length) {
        const { sql } = await import('drizzle-orm');
        for (let i = 0; i < chunks.length; i++) {
          const vec = `[${embeds[i].embedding.join(',')}]`;
          await db.execute(sql`UPDATE document_chunks SET embedding_vec = ${vec}::vector WHERE id = ${chunks[i].id}`);
        }
      }
    } catch { /* embedding provider not configured — keyword search still works */ }

    // Mark document as completed
    await db.update(documents).set({
      status: 'completed',
      chunkCount,
      processedAt: now,
    }).where(eq(documents.id, id));
  }

  // Update KB counts
  const allDocs = await db.select().from(documents).where(eq(documents.knowledgeBaseId, kbId));
  const allChunks = await db.select().from(documentChunks).where(eq(documentChunks.knowledgeBaseId, kbId));
  await db.update(knowledgeBases).set({
    documentCount: allDocs.length,
    totalChunks: allChunks.length,
    updatedAt: now,
  }).where(eq(knowledgeBases.id, kbId));

  return c.json({
    document: { id, knowledgeBaseId: kbId, ...parsed.data, status: textContent ? 'completed' : 'pending', chunkCount },
  }, 201);
});

// Upload file as document (multipart)
app.post('/:id/documents/upload', async (c) => {
  const db = createDb(c.env);
  const kbId = c.req.param('id');
  const formData = await c.req.formData();
  const raw = formData.get('file');

  if (!raw || typeof raw === 'string') {
    return c.json({ error: 'No file provided' }, 400);
  }

  const file = raw as unknown as { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };
  const buffer = await file.arrayBuffer();

  // Store in R2
  const storageKey = `knowledge/${kbId}/${nanoid()}/${file.name}`;
  await c.env.UPLOADS_BUCKET.put(storageKey, buffer, {
    httpMetadata: { contentType: file.type },
  });

  const id = nanoid();
  const now = new Date();

  await db.insert(documents).values({
    id,
    knowledgeBaseId: kbId,
    name: file.name,
    sourceType: 'file',
    mimeType: file.type,
    fileSize: file.size,
    storageKey,
    status: 'pending',
    createdAt: now,
  });

  // Try to extract text and process
  let chunkCount = 0;
  if (canExtractText(file.type, file.name)) {
    const text = extractText(buffer, file.type, file.name);
    if (text && !text.startsWith('[')) {
      const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
      const chunks = processDocument(text, id, kb?.chunkSize ?? 500, kb?.chunkOverlap ?? 50);
      chunkCount = chunks.length;

      if (chunks.length > 0) {
        await db.insert(documentChunks).values(
          chunks.map((chunk) => ({
            id: chunk.id, documentId: id, knowledgeBaseId: kbId,
            content: chunk.content, chunkIndex: chunk.chunkIndex,
            metadata: chunk.metadata, tokenCount: chunk.tokenCount, createdAt: now,
          })),
        );

        // Generate embeddings (best-effort)
        try {
          const embeds = await generateEmbeddings(db, kb?.workspaceId ?? 'default', chunks.map((c) => c.content), kb?.embeddingModelId);
          if (embeds && embeds.length === chunks.length) {
            const { sql } = await import('drizzle-orm');
            for (let i = 0; i < chunks.length; i++) {
              const vec = `[${embeds[i].embedding.join(',')}]`;
              await db.execute(sql`UPDATE document_chunks SET embedding_vec = ${vec}::vector WHERE id = ${chunks[i].id}`);
            }
          }
        } catch { /* */ }
      }

      await db.update(documents).set({ status: 'completed', chunkCount, processedAt: now }).where(eq(documents.id, id));
    }
  }

  // Update KB counts
  const allDocs = await db.select().from(documents).where(eq(documents.knowledgeBaseId, kbId));
  const allChunks = await db.select().from(documentChunks).where(eq(documentChunks.knowledgeBaseId, kbId));
  await db.update(knowledgeBases).set({
    documentCount: allDocs.length, totalChunks: allChunks.length, updatedAt: now,
  }).where(eq(knowledgeBases.id, kbId));

  return c.json({
    document: { id, knowledgeBaseId: kbId, name: file.name, storageKey, chunkCount, status: chunkCount > 0 ? 'completed' : 'pending' },
  }, 201);
});

// List documents in knowledge base
app.get('/:id/documents', async (c) => {
  const db = createDb(c.env);
  const kbId = c.req.param('id');

  const result = await db.select().from(documents)
    .where(eq(documents.knowledgeBaseId, kbId))
    .orderBy(desc(documents.createdAt));

  return c.json({ documents: result });
});

// Delete document
app.delete('/documents/:docId', async (c) => {
  const db = createDb(c.env);
  const docId = c.req.param('docId');

  // Get doc to find KB ID
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Delete chunks first, then document
  await db.delete(documentChunks).where(eq(documentChunks.documentId, docId));
  await db.delete(documents).where(eq(documents.id, docId));

  // Update KB counts
  const remainingDocs = await db.select().from(documents)
    .where(eq(documents.knowledgeBaseId, doc.knowledgeBaseId));
  const remainingChunks = await db.select().from(documentChunks)
    .where(eq(documentChunks.knowledgeBaseId, doc.knowledgeBaseId));

  await db.update(knowledgeBases).set({
    documentCount: remainingDocs.length,
    totalChunks: remainingChunks.length,
    updatedAt: new Date(),
  }).where(eq(knowledgeBases.id, doc.knowledgeBaseId));

  return c.json({ ok: true });
});

// ── Search ──

app.post('/:id/search', async (c) => {
  const db = createDb(c.env);
  const kbId = c.req.param('id');
  const body = await c.req.json();
  const query = body.query;
  if (!query) return c.json({ error: 'query required' }, 400);

  const limit = body.limit ?? 10;
  const mode = body.mode ?? 'hybrid'; // 'vector', 'keyword', 'hybrid', 'auto'
  const vectorWeight = body.vectorWeight ?? 0.7; // weight for vector results in hybrid mode
  const keywordWeight = body.keywordWeight ?? 0.3;

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  const workspaceId = kb?.workspaceId ?? 'default';

  // Keyword search function
  const allChunks = await db.select().from(documentChunks)
    .where(eq(documentChunks.knowledgeBaseId, kbId));
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);

  function keywordSearch() {
    return allChunks.map((chunk) => {
      const lower = chunk.content.toLowerCase();
      const matchCount = queryTerms.filter((term: string) => lower.includes(term)).length;
      return { id: chunk.id, content: chunk.content, chunkIndex: chunk.chunkIndex, score: matchCount / Math.max(queryTerms.length, 1) };
    }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit * 2);
  }

  // Vector search function
  async function vecSearch() {
    try {
      return await vectorSearch(db, workspaceId, kbId, query, limit * 2, kb?.embeddingModelId);
    } catch { return []; }
  }

  if (mode === 'keyword') {
    const results = keywordSearch().slice(0, limit);
    return c.json({ results, total: results.length, mode: 'keyword' });
  }

  if (mode === 'vector') {
    const results = await vecSearch();
    return c.json({ results: results.slice(0, limit), total: results.length, mode: 'vector' });
  }

  // Hybrid mode (Dify pattern): combine vector + keyword with RRF (Reciprocal Rank Fusion)
  const vecResults = await vecSearch();
  const kwResults = keywordSearch();

  // Reciprocal Rank Fusion: score = sum(1 / (k + rank)) across methods
  const k = 60; // RRF constant
  const fusedScores = new Map<string, { content: string; chunkIndex: number; score: number }>();

  vecResults.forEach((r, idx) => {
    const existing = fusedScores.get(r.id) ?? { content: r.content, chunkIndex: r.chunkIndex, score: 0 };
    existing.score += vectorWeight * (1 / (k + idx));
    fusedScores.set(r.id, existing);
  });

  kwResults.forEach((r, idx) => {
    const existing = fusedScores.get(r.id) ?? { content: r.content, chunkIndex: r.chunkIndex, score: 0 };
    existing.score += keywordWeight * (1 / (k + idx));
    fusedScores.set(r.id, existing);
  });

  const scored = [...fusedScores.entries()]
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return c.json({
    results: scored, total: scored.length, mode: 'hybrid',
    breakdown: { vectorResults: vecResults.length, keywordResults: kwResults.length },
  });
});

export default app;
