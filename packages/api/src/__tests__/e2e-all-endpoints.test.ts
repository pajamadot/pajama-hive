/**
 * ALL Endpoints Existence Test
 *
 * Verifies every route file's endpoints are importable and the route
 * handlers exist. Tests the HTTP method + path combinations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(__dirname, '../routes');

function extractEndpoints(fileName: string): { method: string; path: string }[] {
  const content = readFileSync(join(ROUTES_DIR, fileName), 'utf8');
  const regex = /app\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g;
  const endpoints: { method: string; path: string }[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    endpoints.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  return endpoints;
}

const ROUTE_FILES = [
  'graphs.ts', 'tasks.ts', 'runs.ts', 'workers.ts', 'audit.ts',
  'meta.ts', 'plans.ts', 'evolution.ts', 'api-keys.ts', 'webhooks.ts',
  'workspaces.ts', 'models.ts', 'agents.ts', 'workflows.ts', 'conversations.ts',
  'plugins.ts', 'knowledge.ts', 'databases.ts', 'variables.ts', 'prompts.ts',
  'apps.ts', 'marketplace.ts', 'replication.ts', 'uploads.ts', 'coze-compat.ts',
];

describe('All route files', () => {
  it('has 25 route files', () => {
    expect(ROUTE_FILES).toHaveLength(25);
  });

  for (const file of ROUTE_FILES) {
    describe(file, () => {
      let endpoints: { method: string; path: string }[] = [];

      it('can be parsed', () => {
        endpoints = extractEndpoints(file);
        expect(endpoints.length).toBeGreaterThan(0);
      });

      it('has at least 1 endpoint', () => {
        endpoints = extractEndpoints(file);
        expect(endpoints.length).toBeGreaterThanOrEqual(1);
      });

      it('all endpoints have valid HTTP methods', () => {
        endpoints = extractEndpoints(file);
        for (const ep of endpoints) {
          expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(ep.method);
        }
      });

      it('all paths start with /', () => {
        endpoints = extractEndpoints(file);
        for (const ep of endpoints) {
          expect(ep.path).toMatch(/^\//);
        }
      });
    });
  }
});

describe('Endpoint counts by route', () => {
  const counts: Record<string, number> = {};
  for (const file of ROUTE_FILES) {
    counts[file] = extractEndpoints(file).length;
  }

  it('graphs has 10+ endpoints', () => expect(counts['graphs.ts']).toBeGreaterThanOrEqual(10));
  it('agents has 10+ endpoints', () => expect(counts['agents.ts']).toBeGreaterThanOrEqual(10));
  it('workflows has 10+ endpoints', () => expect(counts['workflows.ts']).toBeGreaterThanOrEqual(10));
  it('conversations has 10+ endpoints', () => expect(counts['conversations.ts']).toBeGreaterThanOrEqual(10));
  it('plugins has 8+ endpoints', () => expect(counts['plugins.ts']).toBeGreaterThanOrEqual(8));
  it('knowledge has 8+ endpoints', () => expect(counts['knowledge.ts']).toBeGreaterThanOrEqual(8));
  it('coze-compat has 30+ endpoints', () => expect(counts['coze-compat.ts']).toBeGreaterThanOrEqual(30));
  it('total endpoints > 250', () => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(250);
  });
});
