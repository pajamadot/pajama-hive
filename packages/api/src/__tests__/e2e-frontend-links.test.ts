/**
 * Frontend Link Integrity Tests
 *
 * Verifies every internal link in the frontend has a corresponding page.
 * Catches dead links before deployment.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const WEB_APP = join(__dirname, '../../../web/src/app/(app)');

function collectPages(dir: string, prefix = ''): string[] {
  const pages: string[] = [];
  if (!existsSync(dir)) return pages;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const name = entry.name.startsWith('(') ? '' : entry.name;
      pages.push(...collectPages(join(dir, entry.name), name ? `${prefix}/${name}` : prefix));
    } else if (entry.name === 'page.tsx') {
      pages.push(prefix || '/');
    }
  }
  return pages;
}

function collectLinks(dir: string): { file: string; href: string }[] {
  const links: { file: string; href: string }[] = [];
  if (!existsSync(dir)) return links;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      links.push(...collectLinks(path));
    } else if (entry.name.endsWith('.tsx')) {
      const content = readFileSync(path, 'utf8');
      const hrefRegex = /href="(\/[^"]*?)"/g;
      let match;
      while ((match = hrefRegex.exec(content)) !== null) {
        const href = match[1];
        // Skip dynamic routes and external links
        if (!href.includes('[') && !href.includes('http')) {
          links.push({ file: path.replace(/\\/g, '/'), href });
        }
      }
    }
  }
  return links;
}

describe('Frontend link integrity', () => {
  const pages = collectPages(WEB_APP);
  const links = collectLinks(WEB_APP);

  it('has at least 10 pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it('all static href links point to existing pages', () => {
    const pageSet = new Set(pages);
    const deadLinks: { file: string; href: string }[] = [];

    for (const link of links) {
      // Normalize: /agents → /agents (check if page exists)
      const normalized = link.href.replace(/\/$/, '') || '/';
      if (!pageSet.has(normalized)) {
        deadLinks.push(link);
      }
    }

    if (deadLinks.length > 0) {
      const details = deadLinks.map((l) => `  ${l.href} (in ${l.file.split('/').slice(-3).join('/')})`).join('\n');
      expect.fail(`Dead links found:\n${details}`);
    }
  });

  it('no href links to /new or /create without a page', () => {
    const pageSet = new Set(pages);
    for (const link of links) {
      if (link.href.endsWith('/new') || link.href.endsWith('/create')) {
        expect(pageSet.has(link.href), `Dead link: ${link.href} in ${link.file}`).toBe(true);
      }
    }
  });
});
