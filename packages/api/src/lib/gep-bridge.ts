/**
 * GEP Bridge — converts Evolver GEP candidates into Hive DAG tasks.
 *
 * Reads assets/gep/candidates.jsonl and genes.json from the repo,
 * and creates evolution graphs with appropriate tasks.
 */

import { nanoid } from 'nanoid';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema.js';

interface GepCandidate {
  type: string;
  id: string;
  title: string;
  source: string;
  created_at: string;
  signals: string[];
  tags: string[];
  shape: {
    title: string;
    input: string;
    output: string;
    invariants: string;
    params: string;
    failure_points: string;
    evidence: string;
  };
}

interface GepGene {
  type: string;
  id: string;
  category: string;
  signals_match: string[];
  preconditions: string[];
  strategy: string[];
  constraints: { max_files: number; forbidden_paths: string[] };
  validation: string[];
}

/**
 * Convert GEP candidates into Hive evolution tasks.
 * Each unique candidate becomes a task in a new or existing evolution graph.
 */
export async function ingestGepCandidates(
  db: Database,
  candidates: GepCandidate[],
  genes: GepGene[],
  ownerId: string,
): Promise<{ graphId: string; taskIds: string[] }> {
  // Deduplicate by candidate ID
  const unique = new Map<string, GepCandidate>();
  for (const c of candidates) {
    unique.set(c.id, c);
  }

  if (unique.size === 0) {
    throw new Error('No candidates to ingest');
  }

  // Create an evolution graph
  const graphId = `gep-${nanoid(8)}`;
  await db.insert(schema.graphs).values({
    id: graphId,
    name: `GEP Evolution: ${[...unique.values()][0].title.slice(0, 50)}`,
    description: `Auto-generated from ${unique.size} GEP candidate(s). Signals: ${[...unique.values()].flatMap((c) => c.signals).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`,
    ownerId,
    status: 'draft',
  });

  const taskIds: string[] = [];

  for (const candidate of unique.values()) {
    // Find matching gene for strategy context
    const matchingGene = genes.find((g) =>
      g.signals_match.some((s) => candidate.signals.includes(s)),
    );

    const taskId = `gep-task-${nanoid(8)}`;
    const strategy = matchingGene
      ? matchingGene.strategy.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : 'Analyze signals and apply targeted fix.';

    const input = [
      `## GEP Evolution Task`,
      ``,
      `**Candidate:** ${candidate.title}`,
      `**Signals:** ${candidate.signals.join(', ')}`,
      `**Category:** ${matchingGene?.category ?? 'innovate'}`,
      ``,
      `### Context`,
      `- Input: ${candidate.shape.input}`,
      `- Expected Output: ${candidate.shape.output}`,
      `- Invariants: ${candidate.shape.invariants}`,
      `- Evidence: ${candidate.shape.evidence}`,
      ``,
      `### Strategy`,
      strategy,
      ``,
      `### Constraints`,
      matchingGene ? `- Max files: ${matchingGene.constraints.max_files}` : '- Max files: 12',
      matchingGene ? `- Forbidden paths: ${matchingGene.constraints.forbidden_paths.join(', ')}` : '- Forbidden paths: .git, node_modules',
      ``,
      `### Validation`,
      matchingGene ? matchingGene.validation.join('\n') : 'Run: pnpm typecheck',
      ``,
      `### Failure Points`,
      candidate.shape.failure_points,
    ].join('\n');

    await db.insert(schema.tasks).values({
      id: taskId,
      graphId,
      title: candidate.title,
      type: matchingGene?.category === 'repair' ? 'code' : matchingGene?.category === 'optimize' ? 'code' : 'code',
      status: 'pending',
      input,
      agentKind: 'cc',
      requiredCapabilities: ['git', 'write_fs'],
      priority: matchingGene?.category === 'repair' ? 200 : 100,
      timeoutMs: 900_000,
      maxRetries: 1,
      attempt: 0,
      positionX: taskIds.length * 220,
      positionY: 0,
      version: 1,
    });

    taskIds.push(taskId);
  }

  // Audit
  await db.insert(schema.auditLogs).values({
    id: `audit-${nanoid(12)}`,
    graphId,
    userId: ownerId,
    action: 'gep.ingested',
    payload: {
      candidateCount: unique.size,
      candidateIds: [...unique.keys()],
      geneIds: genes.map((g) => g.id),
    },
  });

  return { graphId, taskIds };
}
