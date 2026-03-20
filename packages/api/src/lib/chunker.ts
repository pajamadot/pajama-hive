/**
 * Document Chunking Pipeline
 * Splits documents into overlapping chunks for RAG.
 */

import { nanoid } from 'nanoid';

interface ChunkResult {
  id: string;
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  tokenCount: number;
}

/**
 * Estimate token count (rough: ~4 chars per token for English text)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences (basic sentence boundary detection)
 */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/**
 * Chunk text with overlap using sentence-aware splitting.
 * Tries to split at sentence boundaries to avoid cutting mid-thought.
 */
export function chunkText(
  text: string,
  chunkSize = 500,
  chunkOverlap = 50,
  documentId?: string,
): ChunkResult[] {
  const sentences = splitSentences(text);
  const chunks: ChunkResult[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    if (currentTokens + sentenceTokens > chunkSize && currentChunk.length > 0) {
      // Emit current chunk
      const content = currentChunk.join(' ');
      chunks.push({
        id: nanoid(),
        content,
        chunkIndex,
        metadata: { documentId, sentenceCount: currentChunk.length },
        tokenCount: estimateTokens(content),
      });
      chunkIndex++;

      // Keep overlap: take the last N tokens worth of sentences
      const overlapSentences: string[] = [];
      let overlapTokens = 0;
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const st = estimateTokens(currentChunk[i]);
        if (overlapTokens + st > chunkOverlap) break;
        overlapSentences.unshift(currentChunk[i]);
        overlapTokens += st;
      }
      currentChunk = overlapSentences;
      currentTokens = overlapTokens;
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Emit final chunk
  if (currentChunk.length > 0) {
    const content = currentChunk.join(' ');
    chunks.push({
      id: nanoid(),
      content,
      chunkIndex,
      metadata: { documentId, sentenceCount: currentChunk.length },
      tokenCount: estimateTokens(content),
    });
  }

  return chunks;
}

/**
 * Process a document: chunk it and prepare for embedding.
 * Called when a document is created/uploaded.
 */
export function processDocument(
  content: string,
  documentId: string,
  chunkSize: number,
  chunkOverlap: number,
): ChunkResult[] {
  // Clean up the text
  const cleaned = content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) return [];

  return chunkText(cleaned, chunkSize, chunkOverlap, documentId);
}

export type { ChunkResult };
