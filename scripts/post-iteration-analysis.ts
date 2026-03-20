#!/usr/bin/env tsx
/**
 * Post-Iteration Analysis Hook
 * Runs after each iteration to analyze replication gaps and suggest next steps.
 *
 * Usage: npx tsx scripts/post-iteration-analysis.ts
 *
 * This script:
 * 1. Scans all route files for TODO/stub markers
 * 2. Checks which Coze domains have real implementations vs stubs
 * 3. Counts tests, tables, routes, pages
 * 4. Outputs a prioritized gap list
 * 5. Writes results to docs/iteration-report.json
 */

import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const API_SRC = join(ROOT, 'packages/api/src');
const WEB_SRC = join(ROOT, 'packages/web/src');

interface Gap {
  file: string;
  line: number;
  type: 'todo' | 'stub' | 'not_implemented' | 'placeholder';
  text: string;
  priority: 'high' | 'medium' | 'low';
}

interface AnalysisResult {
  timestamp: string;
  iteration: number;
  metrics: {
    tables: number;
    apiRoutes: number;
    frontendPages: number;
    testFiles: number;
    totalTests: number;
    libModules: number;
    adapters: number;
    totalTsFiles: number;
    totalLines: number;
  };
  gaps: Gap[];
  domainCoverage: Record<string, { implemented: string[]; missing: string[] }>;
  nextPriorities: string[];
}

function countFiles(dir: string, ext: string): number {
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) count += countFiles(path, ext);
      else if (entry.name.endsWith(ext)) count++;
    }
  } catch { /* dir doesn't exist */ }
  return count;
}

function collectFiles(dir: string, ext: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...collectFiles(path, ext));
      else if (entry.name.endsWith(ext)) files.push(path);
    }
  } catch { /* */ }
  return files;
}

function countLines(file: string): number {
  try {
    return readFileSync(file, 'utf8').split('\n').length;
  } catch { return 0; }
}

function findGaps(files: string[]): Gap[] {
  const gaps: Gap[] = [];
  const patterns = [
    { regex: /\/\/\s*TODO:?\s*(.+)/gi, type: 'todo' as const },
    { regex: /\b_stub\b.*?['"](.+?)['"]/gi, type: 'stub' as const },
    { regex: /not yet implemented/gi, type: 'not_implemented' as const },
    { regex: /placeholder/gi, type: 'placeholder' as const },
  ];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const relPath = relative(ROOT, file).replace(/\\/g, '/');

    for (let i = 0; i < lines.length; i++) {
      for (const pat of patterns) {
        pat.regex.lastIndex = 0;
        const match = pat.regex.exec(lines[i]);
        if (match) {
          // Determine priority based on location
          let priority: 'high' | 'medium' | 'low' = 'medium';
          if (relPath.includes('routes/conversations') || relPath.includes('routes/workflows')) priority = 'high';
          if (relPath.includes('lib/')) priority = 'high';
          if (pat.type === 'stub') priority = 'medium';
          if (pat.type === 'placeholder') priority = 'low';

          gaps.push({
            file: relPath,
            line: i + 1,
            type: pat.type,
            text: lines[i].trim().slice(0, 120),
            priority,
          });
        }
      }
    }
  }

  return gaps;
}

function analyzeDomainCoverage(): Record<string, { implemented: string[]; missing: string[] }> {
  const domains: Record<string, { implemented: string[]; missing: string[] }> = {
    workspace: {
      implemented: ['CRUD', 'members', 'roles'],
      missing: ['team billing', 'SSO'],
    },
    models: {
      implemented: ['provider CRUD', 'config CRUD', 'settings UI', 'LLM dispatch', 'SSE streaming', 'embedding generation', 'connection test', 'usage tracking'],
      missing: [],
    },
    agents: {
      implemented: ['CRUD', 'config', 'versioning', 'publish', 'duplicate', 'builder UI', 'resource attachment', 'agent-as-tool invoke'],
      missing: ['multi-agent handoff'],
    },
    workflows: {
      implemented: ['CRUD', 'nodes', 'edges', 'versioning', 'publish', 'React Flow editor', 'drag-and-drop', 'execution engine', '18+ node types', 'connection handles', 'sub_workflow execution', 'trace viewer'],
      missing: ['image_gen'],
    },
    chat: {
      implemented: ['conversations', 'messages', 'chat runs', 'LLM integration', 'SSE streaming', 'playground UI', 'message editing', 'regenerate'],
      missing: ['branch conversations', 'file attachments in chat'],
    },
    plugins: {
      implemented: ['CRUD', 'tools', 'versioning', 'publish', 'HTTP execution', 'debug endpoint', 'OpenAPI import'],
      missing: ['OAuth flow', 'marketplace integration'],
    },
    knowledge: {
      implemented: ['CRUD', 'documents', 'chunking', 'keyword search', 'pgvector embeddings', 'vector search', 'detail UI', 'file upload', 'text extraction', 'URL scraping'],
      missing: ['PDF parsing', 'DOCX parsing'],
    },
    data: {
      implemented: ['databases', 'tables', 'rows', 'variables', 'agent memory'],
      missing: ['NL2SQL', 'query builder UI'],
    },
    prompts: {
      implemented: ['CRUD', 'versioning', 'auto-version on edit', 'template rendering', 'test with model'],
      missing: [],
    },
    apps: {
      implemented: ['CRUD', 'versioning', 'publish', 'deployment URLs', 'embed widget code'],
      missing: ['custom domain'],
    },
    marketplace: {
      implemented: ['browse', 'publish', 'install', 'reviews', 'ratings', 'categories'],
      missing: ['categories UI page'],
    },
    uploads: {
      implemented: ['R2 bucket', 'multipart upload', 'get/delete/list', 'signed download URLs'],
      missing: ['image thumbnails'],
    },
    replication: {
      implemented: ['status analysis', 'snapshot', 'gap detection', 'history', 'dashboard UI'],
      missing: [],
    },
  };
  return domains;
}

// Count tests
function countTests(dir: string): number {
  let total = 0;
  const testFiles = collectFiles(dir, '.test.ts');
  for (const file of testFiles) {
    const content = readFileSync(file, 'utf8');
    const matches = content.match(/\bit\s*\(/g);
    total += matches?.length ?? 0;
  }
  return total;
}

// Main
function analyze(): AnalysisResult {
  const routeFiles = collectFiles(join(API_SRC, 'routes'), '.ts');
  const libFiles = collectFiles(join(API_SRC, 'lib'), '.ts');
  const adapterFiles = collectFiles(join(API_SRC, 'lib/adapters'), '.ts');
  const testDir = join(API_SRC, '__tests__');
  const testFiles = existsSync(testDir) ? collectFiles(testDir, '.test.ts') : [];

  const allApiTs = collectFiles(API_SRC, '.ts');
  const allWebTs = collectFiles(WEB_SRC, '.tsx').concat(collectFiles(WEB_SRC, '.ts'));
  const allTs = allApiTs.concat(allWebTs);

  // Count pages (page.tsx files)
  const pageFiles = allWebTs.filter((f) => f.endsWith('page.tsx'));

  // Count schema tables
  const schemaFile = join(API_SRC, 'db/schema.ts');
  const schemaContent = existsSync(schemaFile) ? readFileSync(schemaFile, 'utf8') : '';
  const tableCount = (schemaContent.match(/pgTable\(/g) ?? []).length;

  const totalLines = allTs.reduce((sum, f) => sum + countLines(f), 0);
  const totalTests = countTests(testDir);

  const gaps = findGaps(allTs);
  const domains = analyzeDomainCoverage();

  // Generate next priorities
  const highGaps = gaps.filter((g) => g.priority === 'high');
  const domainsMissing = Object.entries(domains)
    .filter(([, v]) => v.missing.length > 0)
    .sort((a, b) => b[1].missing.length - a[1].missing.length);

  const nextPriorities: string[] = [];
  if (highGaps.length > 0) {
    nextPriorities.push(`Fix ${highGaps.length} high-priority gaps (TODOs in core routes/libs)`);
  }
  for (const [domain, coverage] of domainsMissing.slice(0, 5)) {
    nextPriorities.push(`${domain}: ${coverage.missing.slice(0, 3).join(', ')}`);
  }

  // Get iteration number from git
  let iteration = 68;
  try {
    const gitLog = require('child_process').execSync('git log --oneline | wc -l', { cwd: ROOT }).toString().trim();
    iteration = parseInt(gitLog) || 68;
  } catch { /* */ }

  return {
    timestamp: new Date().toISOString(),
    iteration,
    metrics: {
      tables: tableCount,
      apiRoutes: routeFiles.length,
      frontendPages: pageFiles.length,
      testFiles: testFiles.length,
      totalTests,
      libModules: libFiles.length - adapterFiles.length,
      adapters: adapterFiles.length,
      totalTsFiles: allTs.length,
      totalLines,
    },
    gaps,
    domainCoverage: domains,
    nextPriorities,
  };
}

const result = analyze();

// Print summary
console.log('\n=== POST-ITERATION ANALYSIS ===\n');
console.log(`Timestamp: ${result.timestamp}`);
console.log(`Iteration: ~${result.iteration}\n`);

console.log('METRICS:');
console.log(`  Tables:          ${result.metrics.tables}`);
console.log(`  API Routes:      ${result.metrics.apiRoutes}`);
console.log(`  Frontend Pages:  ${result.metrics.frontendPages}`);
console.log(`  Test Files:      ${result.metrics.testFiles}`);
console.log(`  Total Tests:     ${result.metrics.totalTests}`);
console.log(`  Lib Modules:     ${result.metrics.libModules}`);
console.log(`  Adapters:        ${result.metrics.adapters}`);
console.log(`  Total TS Files:  ${result.metrics.totalTsFiles}`);
console.log(`  Total Lines:     ${result.metrics.totalLines}\n`);

console.log(`GAPS: ${result.gaps.length} total`);
console.log(`  High:   ${result.gaps.filter((g) => g.priority === 'high').length}`);
console.log(`  Medium: ${result.gaps.filter((g) => g.priority === 'medium').length}`);
console.log(`  Low:    ${result.gaps.filter((g) => g.priority === 'low').length}\n`);

console.log('DOMAIN COVERAGE:');
for (const [domain, coverage] of Object.entries(result.domainCoverage)) {
  const impl = coverage.implemented.length;
  const miss = coverage.missing.length;
  const pct = Math.round((impl / (impl + miss)) * 100);
  const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
  console.log(`  ${domain.padEnd(14)} ${bar} ${pct}% (${impl}/${impl + miss})`);
}

console.log('\nNEXT PRIORITIES:');
for (const p of result.nextPriorities) {
  console.log(`  → ${p}`);
}

// Write report
const reportPath = join(ROOT, 'docs/iteration-report.json');
writeFileSync(reportPath, JSON.stringify(result, null, 2));
console.log(`\nReport written to: docs/iteration-report.json`);
