/**
 * Plugin Tool Executor
 * Makes HTTP calls to plugin tools with configured auth.
 */

import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { plugins, pluginTools } from '../db/schema.js';

interface ToolExecutionResult {
  success: boolean;
  statusCode: number;
  data: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Execute a plugin tool: makes the actual HTTP request.
 */
export async function executePluginTool(
  db: Database,
  toolId: string,
  input: Record<string, unknown> = {},
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  // Resolve tool and plugin
  const [tool] = await db.select().from(pluginTools).where(eq(pluginTools.id, toolId));
  if (!tool) {
    return { success: false, statusCode: 0, data: null, error: 'Tool not found', durationMs: Date.now() - startTime };
  }

  const [plugin] = await db.select().from(plugins).where(eq(plugins.id, tool.pluginId));
  if (!plugin) {
    return { success: false, statusCode: 0, data: null, error: 'Plugin not found', durationMs: Date.now() - startTime };
  }

  if (!plugin.baseUrl) {
    return { success: false, statusCode: 0, data: null, error: 'Plugin has no base URL', durationMs: Date.now() - startTime };
  }

  // Build request
  const url = `${plugin.baseUrl.replace(/\/$/, '')}${tool.path}`;
  const method = tool.method ?? 'POST';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Apply auth
  const authConfig = plugin.authConfig as Record<string, string> | null;
  switch (plugin.authType) {
    case 'api_key':
      if (authConfig?.headerName && authConfig?.apiKey) {
        headers[authConfig.headerName] = authConfig.apiKey;
      }
      break;
    case 'bearer':
      if (authConfig?.token) {
        headers['Authorization'] = `Bearer ${authConfig.token}`;
      }
      break;
    case 'oauth2':
      if (authConfig?.accessToken) {
        headers['Authorization'] = `Bearer ${authConfig.accessToken}`;
      }
      break;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(input) : undefined,
    });

    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    return {
      success: res.ok,
      statusCode: res.status,
      data,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 0,
      data: null,
      error: err instanceof Error ? err.message : 'Request failed',
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Debug/test a plugin tool: executes it and returns full trace.
 */
export async function debugPluginTool(
  db: Database,
  toolId: string,
  input: Record<string, unknown> = {},
): Promise<ToolExecutionResult & { request: { url: string; method: string } }> {
  const [tool] = await db.select().from(pluginTools).where(eq(pluginTools.id, toolId));
  const [plugin] = tool
    ? await db.select().from(plugins).where(eq(plugins.id, tool.pluginId))
    : [null];

  const result = await executePluginTool(db, toolId, input);

  return {
    ...result,
    request: {
      url: plugin?.baseUrl ? `${plugin.baseUrl}${tool?.path ?? ''}` : 'unknown',
      method: tool?.method ?? 'POST',
    },
  };
}
