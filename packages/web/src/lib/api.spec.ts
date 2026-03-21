/**
 * API Client Unit Tests
 * Tests the api helper functions and getWorkspaceId caching logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Reset module cache before each test
beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
});

describe('API client', () => {
  it('exports api object with all domain methods', async () => {
    const { api } = await import('./api');
    // Build
    expect(typeof api.listAgents).toBe('function');
    expect(typeof api.createAgent).toBe('function');
    expect(typeof api.listWorkflows).toBe('function');
    expect(typeof api.createWorkflow).toBe('function');
    expect(typeof api.listPlugins).toBe('function');
    expect(typeof api.listKnowledgeBases).toBe('function');
    expect(typeof api.listPrompts).toBe('function');
    // Test
    expect(typeof api.chat).toBe('function');
    expect(typeof api.chatStream).toBe('function');
    // Deploy
    expect(typeof api.listApps).toBe('function');
    expect(typeof api.browseMarketplace).toBe('function');
    // System
    expect(typeof api.getReplicationStatus).toBe('function');
    expect(typeof api.getWorkspaceId).toBe('function');
  });

  it('getWorkspaceId returns workspace from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workspaces: [{ id: 'ws_123' }] }),
    });

    const { getWorkspaceId } = await import('./api');
    const wsId = await getWorkspaceId('test-token');
    expect(wsId).toBe('ws_123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/workspaces'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('getWorkspaceId falls back to default on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const { getWorkspaceId } = await import('./api');
    const wsId = await getWorkspaceId('bad-token');
    expect(wsId).toBe('default');
  });
});
