#!/usr/bin/env tsx
/**
 * Coze Studio Parity Diff Engine
 *
 * Systematically extracts EVERY feature from the Coze Studio source code
 * and diffs it against our Hive implementation.
 *
 * Extraction sources:
 * 1. Go router (api.go) → every HTTP endpoint
 * 2. MySQL schema (schema.sql) → every table
 * 3. Frontend routes (routes/index.tsx) → every page
 * 4. Thrift IDL files → every service definition
 *
 * Comparison targets:
 * 1. Hive routes (packages/api/src/routes/) → our endpoints
 * 2. Hive schema (packages/api/src/db/schema.ts) → our tables
 * 3. Hive pages (packages/web/src/app/) → our pages
 *
 * Output: precise gap list with actionable items
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const COZE_ROOT = join(ROOT, 'reference/coze-studio');

// ════════════════════════════════════════
// 1. Extract Coze Endpoints from Go Router
// ════════════════════════════════════════

function extractCozeEndpoints(): { method: string; path: string; handler: string }[] {
  const routerFile = join(COZE_ROOT, 'backend/api/router/coze/api.go');
  if (!existsSync(routerFile)) return [];

  const content = readFileSync(routerFile, 'utf8');
  const endpoints: { method: string; path: string; handler: string }[] = [];

  // Parse the Go router — extract all .GET, .POST, .PUT, .DELETE, .PATCH lines
  const lines = content.split('\n');
  const groupStack: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Track group hierarchy
    const groupMatch = trimmed.match(/(\w+)\s*:?=\s*\w+\.Group\("([^"]+)"/);
    if (groupMatch) {
      // Simplified: track current path prefix from the last group
    }

    // Extract endpoint registrations
    const endpointMatch = trimmed.match(/\w+\.(GET|POST|PUT|DELETE|PATCH)\("([^"]+)",\s*append\(\w+,\s*coze\.(\w+)\)/);
    if (endpointMatch) {
      endpoints.push({
        method: endpointMatch[1],
        path: endpointMatch[2],
        handler: endpointMatch[3],
      });
    }
  }

  return endpoints;
}

// Build full paths by re-parsing the nested groups
function extractCozeEndpointsFull(): { method: string; path: string; handler: string }[] {
  const routerFile = join(COZE_ROOT, 'backend/api/router/coze/api.go');
  if (!existsSync(routerFile)) return [];

  const content = readFileSync(routerFile, 'utf8');
  const endpoints: { method: string; path: string; handler: string }[] = [];

  // Regex to find all route registrations with their full path
  // Pattern: _varname.METHOD("/path", append(..., coze.Handler)...)
  const routeRegex = /(_\w+)\.(GET|POST|PUT|DELETE|PATCH)\("([^"]+)",\s*append\([^,]+,\s*coze\.(\w+)\)/g;

  // Build variable-to-path map from Group definitions
  const varPathMap: Record<string, string> = { root: '' };
  const groupRegex = /(_\w+)\s*:?=\s*(_?\w+)\.Group\("([^"]+)"/g;
  let match;

  while ((match = groupRegex.exec(content)) !== null) {
    const varName = match[1];
    const parent = match[2];
    const segment = match[3];
    const parentPath = varPathMap[parent] ?? '';
    varPathMap[varName] = parentPath + segment;
  }

  // Extract endpoints with full paths
  while ((match = routeRegex.exec(content)) !== null) {
    const varName = match[1];
    const method = match[2];
    const pathSuffix = match[3];
    const handler = match[4];

    const basePath = varPathMap[varName] ?? '';
    const fullPath = basePath + pathSuffix;

    endpoints.push({ method, path: fullPath, handler });
  }

  return endpoints;
}

// ════════════════════════════════════════
// 2. Extract Coze Tables from MySQL Schema
// ════════════════════════════════════════

function extractCozeTables(): string[] {
  const schemaFile = join(COZE_ROOT, 'docker/volumes/mysql/schema.sql');
  if (!existsSync(schemaFile)) return [];

  const content = readFileSync(schemaFile, 'utf8');
  const tables: string[] = [];
  const regex = /CREATE TABLE IF NOT EXISTS `(\w+)`/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tables.push(match[1]);
  }
  return tables.sort();
}

// ════════════════════════════════════════
// 3. Extract Hive Endpoints from Route Files
// ════════════════════════════════════════

function extractHiveEndpoints(): { method: string; path: string; file: string }[] {
  const routesDir = join(ROOT, 'packages/api/src/routes');
  const indexFile = join(ROOT, 'packages/api/src/index.ts');
  const endpoints: { method: string; path: string; file: string }[] = [];

  // Get route prefix map from index.ts
  const indexContent = readFileSync(indexFile, 'utf8');
  const routeMap: Record<string, string> = {};
  const routeRegex = /app\.route\('([^']+)',\s*(\w+)Router\)/g;
  let match;
  while ((match = routeRegex.exec(indexContent)) !== null) {
    routeMap[match[2]] = match[1];
  }

  // Parse each route file
  if (!existsSync(routesDir)) return endpoints;

  for (const file of readdirSync(routesDir)) {
    if (!file.endsWith('.ts')) continue;
    const content = readFileSync(join(routesDir, file), 'utf8');
    const routeName = file.replace('.ts', '');
    const prefix = routeMap[routeName] ?? `/v1/${routeName}`;

    // Extract app.get/post/put/delete/patch patterns
    const epRegex = /app\.(get|post|put|delete|patch)\('([^']+)'/g;
    let epMatch;
    while ((epMatch = epRegex.exec(content)) !== null) {
      const method = epMatch[1].toUpperCase();
      const path = prefix + (epMatch[2] === '/' ? '' : epMatch[2]);
      endpoints.push({ method, path, file: routeName });
    }
  }

  return endpoints;
}

// ════════════════════════════════════════
// 4. Extract Hive Tables from Drizzle Schema
// ════════════════════════════════════════

function extractHiveTables(): string[] {
  const schemaFile = join(ROOT, 'packages/api/src/db/schema.ts');
  if (!existsSync(schemaFile)) return [];

  const content = readFileSync(schemaFile, 'utf8');
  const tables: string[] = [];
  const regex = /pgTable\('(\w+)'/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tables.push(match[1]);
  }
  return tables.sort();
}

// ════════════════════════════════════════
// 5. Extract Coze Frontend Routes
// ════════════════════════════════════════

function extractCozeRoutes(): string[] {
  const routesFile = join(COZE_ROOT, 'frontend/apps/coze-studio/src/routes/index.tsx');
  if (!existsSync(routesFile)) return [];

  const content = readFileSync(routesFile, 'utf8');
  const routes: string[] = [];
  const regex = /path:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    routes.push(match[1]);
  }
  return routes;
}

// ════════════════════════════════════════
// 6. Extract Hive Frontend Pages
// ════════════════════════════════════════

function extractHivePages(): string[] {
  const appDir = join(ROOT, 'packages/web/src/app');
  const pages: string[] = [];

  function walk(dir: string, prefix: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const name = entry.name.replace(/^\(|\)$/g, ''); // strip route groups
        walk(join(dir, entry.name), entry.name.startsWith('(') ? prefix : `${prefix}/${name}`);
      } else if (entry.name === 'page.tsx') {
        pages.push(prefix || '/');
      }
    }
  }
  walk(appDir, '');
  return pages.sort();
}

// ════════════════════════════════════════
// 7. Diff & Analysis
// ════════════════════════════════════════

interface ParityReport {
  timestamp: string;
  coze: {
    endpoints: number;
    tables: number;
    routes: number;
  };
  hive: {
    endpoints: number;
    tables: number;
    pages: number;
  };
  endpointMapping: {
    cozeEndpoint: string;
    hiveEquivalent: string | null;
    status: 'mapped' | 'missing' | 'extra';
  }[];
  tableDiff: {
    cozeOnly: string[];
    hiveOnly: string[];
    both: string[];
  };
  missingEndpointsByDomain: Record<string, string[]>;
  actionItems: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    cozeReference: string;
  }[];
  score: number;
}

function computeParityReport(): ParityReport {
  const cozeEndpoints = extractCozeEndpointsFull();
  const cozeTables = extractCozeTables();
  const cozeRoutes = extractCozeRoutes();
  const hiveEndpoints = extractHiveEndpoints();
  const hiveTables = extractHiveTables();
  const hivePages = extractHivePages();

  // ── Endpoint Mapping ──
  // Group Coze endpoints by domain
  const cozeDomains: Record<string, typeof cozeEndpoints> = {};
  for (const ep of cozeEndpoints) {
    const parts = ep.path.split('/').filter(Boolean);
    const domain = parts[1] ?? parts[0] ?? 'root'; // /api/conversation → conversation
    if (!cozeDomains[domain]) cozeDomains[domain] = [];
    cozeDomains[domain].push(ep);
  }

  // Map Coze endpoints to Hive equivalents
  const endpointMapping = cozeEndpoints.map((cozeEp) => {
    // Try to find a matching Hive endpoint
    const hiveMatch = hiveEndpoints.find((h) => {
      // Normalize and compare
      const cozePath = cozeEp.path.toLowerCase().replace(/_/g, '');
      const hivePath = h.path.toLowerCase().replace(/_/g, '').replace(/:[^/]+/g, ':id');
      return (
        h.method === cozeEp.method &&
        (hivePath.includes(cozePath.split('/').pop()!) || cozePath.includes(hivePath.split('/').pop()!))
      );
    });

    return {
      cozeEndpoint: `${cozeEp.method} ${cozeEp.path}`,
      hiveEquivalent: hiveMatch ? `${hiveMatch.method} ${hiveMatch.path}` : null,
      status: hiveMatch ? 'mapped' as const : 'missing' as const,
    };
  });

  // ── Table Diff ──
  // Normalize names for comparison (Coze uses snake_case MySQL, Hive uses snake_case PG)
  const cozeTableSet = new Set(cozeTables.map((t) => t.toLowerCase()));
  const hiveTableSet = new Set(hiveTables.map((t) => t.toLowerCase()));

  const tableDiff = {
    cozeOnly: cozeTables.filter((t) => !hiveTableSet.has(t.toLowerCase())),
    hiveOnly: hiveTables.filter((t) => !cozeTableSet.has(t.toLowerCase())),
    both: cozeTables.filter((t) => hiveTableSet.has(t.toLowerCase())),
  };

  // ── Missing by domain ──
  const missingByDomain: Record<string, string[]> = {};
  for (const ep of endpointMapping) {
    if (ep.status !== 'missing') continue;
    const parts = ep.cozeEndpoint.split('/').filter(Boolean);
    const domain = parts[1] ?? 'root';
    if (!missingByDomain[domain]) missingByDomain[domain] = [];
    missingByDomain[domain].push(ep.cozeEndpoint);
  }

  // ── Action Items ──
  const actionItems: ParityReport['actionItems'] = [];

  // Critical: Core API endpoints missing
  for (const [domain, missing] of Object.entries(missingByDomain)) {
    if (missing.length > 3) {
      actionItems.push({
        priority: 'high',
        category: `api/${domain}`,
        description: `${missing.length} Coze ${domain} endpoints not mapped in Hive`,
        cozeReference: missing.slice(0, 5).join(', '),
      });
    } else {
      for (const ep of missing) {
        actionItems.push({
          priority: 'medium',
          category: `api/${domain}`,
          description: `Missing endpoint: ${ep}`,
          cozeReference: ep,
        });
      }
    }
  }

  // Tables missing
  for (const table of tableDiff.cozeOnly) {
    actionItems.push({
      priority: 'low',
      category: 'schema',
      description: `Coze table '${table}' has no Hive equivalent`,
      cozeReference: `docker/volumes/mysql/schema.sql → ${table}`,
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // ── Score ──
  const mappedEndpoints = endpointMapping.filter((e) => e.status === 'mapped').length;
  const totalCozeEndpoints = cozeEndpoints.length;
  const endpointScore = totalCozeEndpoints > 0 ? (mappedEndpoints / totalCozeEndpoints) * 100 : 0;

  const mappedTables = tableDiff.both.length;
  const totalCozeTables = cozeTables.length;
  const tableScore = totalCozeTables > 0 ? (mappedTables / totalCozeTables) * 100 : 0;

  const score = Math.round((endpointScore * 0.7 + tableScore * 0.3));

  return {
    timestamp: new Date().toISOString(),
    coze: { endpoints: totalCozeEndpoints, tables: totalCozeTables, routes: cozeRoutes.length },
    hive: { endpoints: hiveEndpoints.length, tables: hiveTables.length, pages: hivePages.length },
    endpointMapping,
    tableDiff,
    missingEndpointsByDomain: missingByDomain,
    actionItems,
    score,
  };
}

// ════════════════════════════════════════
// Main
// ════════════════════════════════════════

const report = computeParityReport();

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║     COZE STUDIO PARITY DIFF ENGINE              ║');
console.log('╚══════════════════════════════════════════════════╝\n');

console.log('SOURCE METRICS:');
console.log(`  Coze endpoints:  ${report.coze.endpoints}`);
console.log(`  Coze tables:     ${report.coze.tables}`);
console.log(`  Coze routes:     ${report.coze.routes}`);
console.log(`  Hive endpoints:  ${report.hive.endpoints}`);
console.log(`  Hive tables:     ${report.hive.tables}`);
console.log(`  Hive pages:      ${report.hive.pages}\n`);

const mapped = report.endpointMapping.filter((e) => e.status === 'mapped').length;
const missing = report.endpointMapping.filter((e) => e.status === 'missing').length;
console.log('ENDPOINT PARITY:');
console.log(`  Mapped:  ${mapped}/${report.coze.endpoints} (${Math.round(mapped / report.coze.endpoints * 100)}%)`);
console.log(`  Missing: ${missing}\n`);

console.log('TABLE PARITY:');
console.log(`  Shared:    ${report.tableDiff.both.length}`);
console.log(`  Coze only: ${report.tableDiff.cozeOnly.length} → ${report.tableDiff.cozeOnly.join(', ')}`);
console.log(`  Hive only: ${report.tableDiff.hiveOnly.length}\n`);

console.log('MISSING ENDPOINTS BY DOMAIN:');
for (const [domain, eps] of Object.entries(report.missingEndpointsByDomain)) {
  console.log(`  ${domain}: ${eps.length} missing`);
  for (const ep of eps.slice(0, 5)) {
    console.log(`    → ${ep}`);
  }
  if (eps.length > 5) console.log(`    ... and ${eps.length - 5} more`);
}

console.log(`\nACTION ITEMS: ${report.actionItems.length}`);
for (const item of report.actionItems.slice(0, 15)) {
  const icon = item.priority === 'critical' ? '🔴' : item.priority === 'high' ? '🟡' : item.priority === 'medium' ? '🔵' : '⚪';
  console.log(`  ${icon} [${item.priority}] ${item.category}: ${item.description}`);
}
if (report.actionItems.length > 15) {
  console.log(`  ... and ${report.actionItems.length - 15} more`);
}

console.log(`\n═══ PARITY SCORE: ${report.score}% ═══\n`);

// Write detailed report
const reportPath = join(ROOT, 'docs/coze-parity-diff.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Detailed report: docs/coze-parity-diff.json`);
