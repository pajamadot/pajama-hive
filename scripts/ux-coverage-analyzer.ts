#!/usr/bin/env tsx
/**
 * UX Coverage Analyzer
 *
 * Automatically detects gaps between what the frontend exposes and what tests cover.
 *
 * Methodology:
 * 1. EXTRACT: Scan every page.tsx for all user-facing actions (buttons, forms, links, API calls)
 * 2. EXTRACT: Scan every API route for all endpoints
 * 3. EXTRACT: Scan all test files for what's already covered
 * 4. DIFF: Find actions in the UI that have no corresponding test
 * 5. REPORT: Prioritized list of untested UX flows
 *
 * This is a static analysis tool — no browser needed.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const WEB_APP = join(ROOT, 'packages/web/src/app/(app)');
const WEB_COMPONENTS = join(ROOT, 'packages/web/src/components');
const API_ROUTES = join(ROOT, 'packages/api/src/routes');
const API_TESTS = join(ROOT, 'packages/api/src/__tests__');
const WEB_TESTS_GLOB = join(ROOT, 'packages/web/src');
const SMOKE_TEST = join(ROOT, 'scripts/e2e-smoke-test.ts');
const TAB_TEST = join(ROOT, 'scripts/feature-tab-tests.ts');

// ═══════════════════════════════════════
// 1. Extract UI Actions from Pages
// ═══════════════════════════════════════

interface UIAction {
  page: string;
  type: 'button' | 'form' | 'link' | 'api_call' | 'state_change';
  description: string;
  apiEndpoint?: string;
}

function collectFiles(dir: string, ext: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path, ext));
    else if (entry.name.endsWith(ext)) files.push(path);
  }
  return files;
}

function extractUIActions(): UIAction[] {
  const actions: UIAction[] = [];
  const pages = collectFiles(WEB_APP, '.tsx');

  for (const file of pages) {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(ROOT, '').replace(/\\/g, '/');
    const pageName = relPath.replace('/packages/web/src/app/(app)/', '').replace('/page.tsx', '') || '/';

    // Extract onClick handlers
    const onClickRegex = /onClick=\{[^}]*?(?:handle|async|set|await|fetch|api\.)([^}]{0,100})/g;
    let match;
    while ((match = onClickRegex.exec(content)) !== null) {
      const snippet = match[1].trim().slice(0, 80);
      actions.push({ page: pageName, type: 'button', description: `onClick: ${snippet}` });
    }

    // Extract form submissions
    const formRegex = /onSubmit|handleSubmit|handleCreate|handleSave|handlePublish|handleDelete|handleRun|handleTest|handleAdd|handleSend/g;
    while ((match = formRegex.exec(content)) !== null) {
      actions.push({ page: pageName, type: 'form', description: match[0] });
    }

    // Extract API calls (fetch or api.xxx)
    const apiCallRegex = /(?:fetch\(`?\$\{API_URL\}([^`'"]+)|api\.(\w+)\()/g;
    while ((match = apiCallRegex.exec(content)) !== null) {
      const endpoint = match[1] || match[2];
      actions.push({ page: pageName, type: 'api_call', description: endpoint, apiEndpoint: endpoint });
    }

    // Extract Link hrefs (navigation)
    const linkRegex = /href=\{?[`"']([^`"']+)/g;
    while ((match = linkRegex.exec(content)) !== null) {
      if (match[1].startsWith('/') && !match[1].includes('${')) {
        actions.push({ page: pageName, type: 'link', description: `navigate: ${match[1]}` });
      }
    }

    // Extract state changes (useState setters called in handlers)
    const stateRegex = /set(\w+)\(/g;
    const stateChanges = new Set<string>();
    while ((match = stateRegex.exec(content)) !== null) {
      stateChanges.add(match[1]);
    }
    if (stateChanges.size > 0) {
      actions.push({
        page: pageName, type: 'state_change',
        description: `state: ${[...stateChanges].slice(0, 8).join(', ')}`,
      });
    }
  }

  return actions;
}

// ═══════════════════════════════════════
// 2. Extract API Endpoints
// ═══════════════════════════════════════

interface APIEndpoint {
  method: string;
  path: string;
  file: string;
}

function extractAPIEndpoints(): APIEndpoint[] {
  const endpoints: APIEndpoint[] = [];
  const routeFiles = collectFiles(API_ROUTES, '.ts');

  for (const file of routeFiles) {
    const content = readFileSync(file, 'utf8');
    const fileName = file.replace(ROOT, '').replace(/\\/g, '/');
    const regex = /app\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      endpoints.push({ method: match[1].toUpperCase(), path: match[2], file: fileName });
    }
  }

  return endpoints;
}

// ═══════════════════════════════════════
// 3. Extract Test Coverage
// ═══════════════════════════════════════

interface TestCoverage {
  file: string;
  testedEndpoints: string[];
  testedActions: string[];
}

function extractTestCoverage(): { endpoints: Set<string>; actions: Set<string> } {
  const endpoints = new Set<string>();
  const actions = new Set<string>();

  // Scan API tests
  const apiTests = collectFiles(API_TESTS, '.test.ts');
  for (const file of apiTests) {
    const content = readFileSync(file, 'utf8').toLowerCase();

    // Extract tested endpoint patterns
    const endpointRegex = /(?:\/v1\/\w+|\/api\/\w+)/g;
    let match;
    while ((match = endpointRegex.exec(content)) !== null) {
      endpoints.add(match[0]);
    }

    // Extract tested action names
    const actionRegex = /(?:it|test)\s*\(\s*['"]([^'"]+)['"]/g;
    while ((match = actionRegex.exec(content)) !== null) {
      actions.add(match[1].toLowerCase());
    }
  }

  // Scan web tests
  const webTests = collectFiles(WEB_TESTS_GLOB, '.spec.ts');
  for (const file of webTests) {
    const content = readFileSync(file, 'utf8').toLowerCase();
    const actionRegex = /(?:it|test)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = actionRegex.exec(content)) !== null) {
      actions.add(match[1].toLowerCase());
    }
  }

  // Scan smoke test
  for (const testFile of [SMOKE_TEST, TAB_TEST]) {
    if (existsSync(testFile)) {
      const content = readFileSync(testFile, 'utf8').toLowerCase();
      const endpointRegex = /(?:\/v1\/\w+|\/api\/\w+)/g;
      let match;
      while ((match = endpointRegex.exec(content)) !== null) {
        endpoints.add(match[0]);
      }
    }
  }

  return { endpoints, actions };
}

// ═══════════════════════════════════════
// 4. Diff: Find Untested UX Flows
// ═══════════════════════════════════════

interface UXGap {
  page: string;
  action: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
}

function findUXGaps(uiActions: UIAction[], coverage: { endpoints: Set<string>; actions: Set<string> }): UXGap[] {
  const gaps: UXGap[] = [];

  // Group actions by page
  const byPage = new Map<string, UIAction[]>();
  for (const action of uiActions) {
    const list = byPage.get(action.page) ?? [];
    list.push(action);
    byPage.set(action.page, list);
  }

  for (const [page, pageActions] of byPage) {
    // Check API calls — are the endpoints tested?
    const apiCalls = pageActions.filter((a) => a.type === 'api_call');
    for (const call of apiCalls) {
      const endpoint = call.apiEndpoint ?? '';
      const isTested = [...coverage.endpoints].some((e) => endpoint.includes(e.replace('/v1/', '')) || e.includes(endpoint.split('.')[0]));
      if (!isTested && endpoint.length > 3) {
        gaps.push({
          page, action: call.description, type: 'api_call',
          priority: 'high',
          reason: `API call api.${endpoint} on page ${page} has no matching test`,
        });
      }
    }

    // Check form handlers — are they tested?
    const handlers = pageActions.filter((a) => a.type === 'form');
    for (const handler of handlers) {
      const handlerName = handler.description.toLowerCase();
      const isTested = [...coverage.actions].some((a) =>
        a.includes(handlerName.replace('handle', '').toLowerCase()) ||
        handlerName.includes(a.split(' ').pop() ?? '')
      );
      if (!isTested) {
        gaps.push({
          page, action: handler.description, type: 'form',
          priority: 'medium',
          reason: `Handler ${handler.description} on page ${page} has no matching test`,
        });
      }
    }

    // Check buttons — are critical actions tested?
    const buttons = pageActions.filter((a) => a.type === 'button');
    const criticalPatterns = ['delete', 'publish', 'create', 'save', 'run', 'send', 'submit'];
    for (const button of buttons) {
      const desc = button.description.toLowerCase();
      const isCritical = criticalPatterns.some((p) => desc.includes(p));
      if (isCritical) {
        const isTested = [...coverage.actions].some((a) =>
          criticalPatterns.some((p) => a.includes(p) && a.includes(page.split('/')[0]))
        );
        if (!isTested) {
          gaps.push({
            page, action: button.description, type: 'button',
            priority: 'high',
            reason: `Critical button action on ${page} may not be tested`,
          });
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return gaps.filter((g) => {
    const key = `${g.page}:${g.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ═══════════════════════════════════════
// 5. Check for Missing Pages
// ═══════════════════════════════════════

function findMissingPages(): string[] {
  const missing: string[] = [];
  const pages = collectFiles(WEB_APP, 'page.tsx').map((f) =>
    f.replace(WEB_APP, '').replace(/\\/g, '/').replace('/page.tsx', '') || '/'
  );

  // Expected pages (from sidebar + detail pages)
  const expected = [
    '/', '/agents', '/workflows', '/plugins', '/knowledge', '/prompts',
    '/playground', '/apps', '/marketplace', '/workers', '/evolution',
    '/meta', '/replication', '/audit', '/settings',
    // Detail pages
    '/agents/[id]', '/workflows/[id]', '/knowledge/[id]',
    '/settings/models', '/workflows/[id]/preview',
    '/workflows/[id]/runs/[runId]',
  ];

  for (const exp of expected) {
    const normalized = exp.replace(/\[(\w+)\]/g, '[$1]');
    const found = pages.some((p) => {
      const pNorm = p.replace(/\[\.\.\.[\w-]+\]/g, '[id]');
      return pNorm === normalized || pNorm.includes(normalized.split('/').pop()!);
    });
    if (!found) missing.push(exp);
  }

  return missing;
}

// ═══════════════════════════════════════
// 6. Check API Endpoints Without Tests
// ═══════════════════════════════════════

function findUntestedEndpoints(apiEndpoints: APIEndpoint[], coverage: { endpoints: Set<string> }): APIEndpoint[] {
  return apiEndpoints.filter((ep) => {
    const pathParts = ep.path.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] ?? '';
    return ![...coverage.endpoints].some((tested) =>
      tested.includes(lastPart) || ep.path.includes(tested.replace('/v1/', ''))
    );
  });
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║       UX COVERAGE ANALYZER — Automatic Gap Detection    ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Step 1: Extract
console.log('Scanning...');
const uiActions = extractUIActions();
const apiEndpoints = extractAPIEndpoints();
const coverage = extractTestCoverage();

console.log(`  UI actions found: ${uiActions.length}`);
console.log(`  API endpoints found: ${apiEndpoints.length}`);
console.log(`  Tested endpoints: ${coverage.endpoints.size}`);
console.log(`  Tested actions: ${coverage.actions.size}\n`);

// Step 2: Analyze
const uxGaps = findUXGaps(uiActions, coverage);
const missingPages = findMissingPages();
const untestedEndpoints = findUntestedEndpoints(apiEndpoints, coverage);

// Step 3: Report

// Pages
console.log('═══ MISSING PAGES ═══');
if (missingPages.length === 0) {
  console.log('  All expected pages exist ✓\n');
} else {
  for (const p of missingPages) console.log(`  ✗ ${p}`);
  console.log('');
}

// UX Gaps by page
console.log('═══ UX GAPS (untested user actions) ═══');
const gapsByPage = new Map<string, UXGap[]>();
for (const gap of uxGaps) {
  const list = gapsByPage.get(gap.page) ?? [];
  list.push(gap);
  gapsByPage.set(gap.page, list);
}

if (uxGaps.length === 0) {
  console.log('  No untested UX actions found ✓\n');
} else {
  const critical = uxGaps.filter((g) => g.priority === 'critical');
  const high = uxGaps.filter((g) => g.priority === 'high');
  const medium = uxGaps.filter((g) => g.priority === 'medium');

  console.log(`  Critical: ${critical.length}  High: ${high.length}  Medium: ${medium.length}\n`);

  for (const [page, gaps] of [...gapsByPage].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  /${page} (${gaps.length} gaps):`);
    for (const gap of gaps.slice(0, 5)) {
      const icon = gap.priority === 'critical' ? '🔴' : gap.priority === 'high' ? '🟡' : '🔵';
      console.log(`    ${icon} [${gap.type}] ${gap.action.slice(0, 60)}`);
    }
    if (gaps.length > 5) console.log(`    ... +${gaps.length - 5} more`);
    console.log('');
  }
}

// Untested endpoints
console.log('═══ API ENDPOINTS WITHOUT TESTS ═══');
if (untestedEndpoints.length === 0) {
  console.log('  All endpoints tested ✓\n');
} else {
  console.log(`  ${untestedEndpoints.length} untested:\n`);
  const byFile = new Map<string, APIEndpoint[]>();
  for (const ep of untestedEndpoints) {
    const list = byFile.get(ep.file) ?? [];
    list.push(ep);
    byFile.set(ep.file, list);
  }
  for (const [file, eps] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${file.split('/').pop()} (${eps.length}):`);
    for (const ep of eps.slice(0, 5)) {
      console.log(`    ${ep.method} ${ep.path}`);
    }
    if (eps.length > 5) console.log(`    ... +${eps.length - 5} more`);
  }
  console.log('');
}

// Summary
const totalActions = uiActions.length;
const totalGaps = uxGaps.length;
const coveragePercent = totalActions > 0 ? Math.round(((totalActions - totalGaps) / totalActions) * 100) : 100;

console.log('═══════════════════════════════════════════════');
console.log(`UX COVERAGE: ${coveragePercent}% (${totalActions - totalGaps}/${totalActions} actions covered)`);
console.log(`Pages: ${missingPages.length === 0 ? 'ALL PRESENT ✓' : `${missingPages.length} missing`}`);
console.log(`UX Gaps: ${totalGaps}`);
console.log(`Untested Endpoints: ${untestedEndpoints.length}`);
console.log('═══════════════════════════════════════════════');
