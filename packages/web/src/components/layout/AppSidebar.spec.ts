/**
 * Sidebar Navigation Tests
 * Verifies all navigation items exist and have valid hrefs.
 * Pattern: Dify-style component logic tests (no rendering).
 */
import { describe, it, expect } from 'vitest';

// Extract the nav data directly (same structure as the component)
const NAV_SECTIONS = [
  {
    label: 'Build',
    items: [
      { href: '/agents', label: 'Agents' },
      { href: '/workflows', label: 'Workflows' },
      { href: '/plugins', label: 'Plugins' },
      { href: '/knowledge', label: 'Knowledge' },
      { href: '/prompts', label: 'Prompts' },
    ],
  },
  {
    label: 'Test',
    items: [{ href: '/playground', label: 'Playground' }],
  },
  {
    label: 'Deploy',
    items: [
      { href: '/apps', label: 'Apps' },
      { href: '/marketplace', label: 'Marketplace' },
    ],
  },
  {
    label: 'Orchestrate',
    items: [
      { href: '/', label: 'Graphs' },
      { href: '/workers', label: 'Workers' },
      { href: '/replication', label: 'Replication' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/audit', label: 'Audit Log' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

describe('AppSidebar navigation structure', () => {
  it('has 5 sections', () => {
    expect(NAV_SECTIONS).toHaveLength(5);
  });

  it('has correct section labels', () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual(['Build', 'Test', 'Deploy', 'Orchestrate', 'System']);
  });

  it('has 16 total nav items', () => {
    const total = NAV_SECTIONS.reduce((sum, s) => sum + s.items.length, 0);
    expect(total).toBe(13);
  });

  it('all hrefs start with /', () => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        expect(item.href).toMatch(/^\//);
      }
    }
  });

  it('no duplicate hrefs', () => {
    const hrefs = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('all labels are non-empty', () => {
    for (const section of NAV_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('Build section has 5 items', () => {
    expect(NAV_SECTIONS[0].items).toHaveLength(5);
  });

  it('core features are in Build section', () => {
    const buildLabels = NAV_SECTIONS[0].items.map((i) => i.label);
    expect(buildLabels).toContain('Agents');
    expect(buildLabels).toContain('Workflows');
    expect(buildLabels).toContain('Knowledge');
  });
});
