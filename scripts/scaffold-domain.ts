#!/usr/bin/env tsx
/**
 * Domain Scaffolder CLI for Pajama Hive
 * Usage: pnpm scaffold domain <name>
 *
 * Creates:
 * - packages/api/src/routes/<name>.ts — Hono router with CRUD stubs
 * - packages/api/src/__tests__/<name>.test.ts — Test skeleton
 * - packages/web/src/app/<name>/page.tsx — Page stub
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const domainName = process.argv[2];

if (!domainName) {
  console.error('Usage: pnpm scaffold domain <name>');
  console.error('Example: pnpm scaffold domain knowledge');
  process.exit(1);
}

const pascal = domainName.charAt(0).toUpperCase() + domainName.slice(1);
const rootDir = join(__dirname, '..');

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// 1. API Route
const routeContent = `import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, lt, isNull } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// List ${domainName}s
app.get('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

  // TODO: implement list query with pagination
  return c.json({ ${domainName}s: [], nextCursor: null });
});

// Get single ${domainName}
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  // TODO: implement get by ID with ownership check
  return c.json({ error: 'Not implemented' }, 501);
});

// Create ${domainName}
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();

  // TODO: validate with Zod schema, insert into DB
  return c.json({ error: 'Not implemented' }, 501);
});

// Update ${domainName}
app.patch('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  // TODO: validate, check ownership, update
  return c.json({ error: 'Not implemented' }, 501);
});

// Delete ${domainName}
app.delete('/:id', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const id = c.req.param('id');

  // TODO: check ownership, soft delete
  return c.json({ error: 'Not implemented' }, 501);
});

export default app;
`;

const routePath = join(rootDir, 'packages/api/src/routes', `${domainName}.ts`);

// 2. Test Skeleton
const testContent = `import { describe, it, expect } from 'vitest';

describe('${pascal} API', () => {
  it('should list ${domainName}s', async () => {
    // TODO: test GET /v1/${domainName}s
    expect(true).toBe(true);
  });

  it('should create a ${domainName}', async () => {
    // TODO: test POST /v1/${domainName}s
    expect(true).toBe(true);
  });

  it('should get a single ${domainName}', async () => {
    // TODO: test GET /v1/${domainName}s/:id
    expect(true).toBe(true);
  });

  it('should update a ${domainName}', async () => {
    // TODO: test PATCH /v1/${domainName}s/:id
    expect(true).toBe(true);
  });

  it('should delete a ${domainName}', async () => {
    // TODO: test DELETE /v1/${domainName}s/:id
    expect(true).toBe(true);
  });

  it('should enforce ownership', async () => {
    // TODO: test that non-owners get 403
    expect(true).toBe(true);
  });
});
`;

const testPath = join(rootDir, 'packages/api/src/__tests__', `${domainName}.test.ts`);

// 3. Frontend Page
const pageContent = \`'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

export default function \${pascal}Page() {
  const { getToken } = useAuth();
  const [items, setItems] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(\\\`\\\${API_URL}/v1/${domainName}s\\\`, {
        headers: { Authorization: \\\`Bearer \\\${token}\\\` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.${domainName}s ?? []);
      }
      setLoading(false);
    }
    load();
  }, [getToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Dashboard</Link>
            <h1 className="text-3xl font-bold mt-2">\${pascal}s</h1>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create \${pascal}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No ${domainName}s yet. Create your first one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* TODO: render ${domainName} cards */}
          </div>
        )}
      </div>
    </div>
  );
}
\`;

const pagePath = join(rootDir, 'packages/web/src/app', domainName, 'page.tsx');

// Write files
ensureDir(join(rootDir, 'packages/api/src/routes'));
ensureDir(join(rootDir, 'packages/api/src/__tests__'));
ensureDir(join(rootDir, 'packages/web/src/app', domainName));

if (existsSync(routePath)) {
  console.warn(\`⚠ Route already exists: \${routePath}\`);
} else {
  writeFileSync(routePath, routeContent);
  console.log(\`✓ Created route: packages/api/src/routes/\${domainName}.ts\`);
}

if (existsSync(testPath)) {
  console.warn(\`⚠ Test already exists: \${testPath}\`);
} else {
  writeFileSync(testPath, testContent);
  console.log(\`✓ Created test: packages/api/src/__tests__/\${domainName}.test.ts\`);
}

if (existsSync(pagePath)) {
  console.warn(\`⚠ Page already exists: \${pagePath}\`);
} else {
  writeFileSync(pagePath, pageContent);
  console.log(\`✓ Created page: packages/web/src/app/\${domainName}/page.tsx\`);
}

console.log(\`\\nDon't forget to:\\n  1. Register route in packages/api/src/index.ts\\n  2. Add table to packages/api/src/db/schema.ts\\n  3. Add Zod schemas to packages/shared/src/schemas.ts\`);
`;

writeFileSync(routePath, routeContent);
writeFileSync(testPath, testContent);
ensureDir(join(pagePath, '..'));
writeFileSync(pagePath, pageContent);
