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
  const mode = body.mode ?? 'auto'; // 'vector', 'keyword', 'auto'

  // Get KB workspace for embedding provider resolution
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  const workspaceId = kb?.workspaceId ?? 'default';

  // Try vector search first (if mode is 'vector' or 'auto')
  if (mode !== 'keyword') {
    try {
      const vecResults = await vectorSearch(db, workspaceId, kbId, query, limit, kb?.embeddingModelId);
      if (vecResults.length > 0) {
        return c.json({ results: vecResults, total: vecResults.length, mode: 'vector' });
      }
    } catch { /* vector search failed — fall through to keyword */ }
  }

  // Keyword fallback
  const allChunks = await db.select().from(documentChunks)
    .where(eq(documentChunks.knowledgeBaseId, kbId));

  const queryTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
  const scored = allChunks.map((chunk) => {
    const lower = chunk.content.toLowerCase();
    const matchCount = queryTerms.filter((term: string) => lower.includes(term)).length;
    return { ...chunk, score: matchCount / Math.max(queryTerms.length, 1) };
  }).filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return c.json({ results: scored, total: scored.length, mode: 'keyword' });
});

export default app;
