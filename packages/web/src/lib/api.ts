const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Graphs
  listGraphs: (token: string) => apiFetch('/v1/graphs', token),
  createGraph: (token: string, data: { name: string; description?: string }) =>
    apiFetch('/v1/graphs', token, { method: 'POST', body: JSON.stringify(data) }),
  getGraph: (token: string, graphId: string) => apiFetch(`/v1/graphs/${graphId}`, token),
  duplicateGraph: (token: string, graphId: string, name?: string) =>
    apiFetch(`/v1/graphs/${graphId}/duplicate`, token, { method: 'POST', body: JSON.stringify({ name }) }),
  saveAsTemplate: (token: string, graphId: string) =>
    apiFetch(`/v1/graphs/${graphId}/save-template`, token, { method: 'POST' }),
  resetGraph: (token: string, graphId: string) =>
    apiFetch(`/v1/graphs/${graphId}/reset`, token, { method: 'POST' }),
  listTemplates: (token: string) => apiFetch('/v1/graphs/templates/list', token),
  exportGraph: (token: string, graphId: string) => apiFetch(`/v1/graphs/${graphId}/export`, token),
  importGraph: (token: string, data: unknown) =>
    apiFetch('/v1/graphs/import', token, { method: 'POST', body: JSON.stringify(data) }),

  // Tasks
  listTasks: (token: string, graphId: string) => apiFetch(`/v1/graphs/${graphId}/tasks`, token),
  createTask: (token: string, graphId: string, data: Record<string, unknown>) =>
    apiFetch(`/v1/graphs/${graphId}/tasks`, token, { method: 'POST', body: JSON.stringify(data) }),
  approveTask: (token: string, taskId: string) =>
    apiFetch(`/v1/tasks/${taskId}/approve`, token, { method: 'POST' }),
  cancelTask: (token: string, taskId: string) =>
    apiFetch(`/v1/tasks/${taskId}/cancel`, token, { method: 'POST' }),
  retryTask: (token: string, taskId: string) =>
    apiFetch(`/v1/tasks/${taskId}/retry`, token, { method: 'POST' }),
  deleteTask: (token: string, taskId: string) =>
    apiFetch(`/v1/tasks/${taskId}`, token, { method: 'DELETE' }),

  // Edges
  listEdges: (token: string, graphId: string) => apiFetch(`/v1/graphs/${graphId}/edges`, token),
  createEdge: (token: string, graphId: string, data: { fromTaskId: string; toTaskId: string }) =>
    apiFetch(`/v1/graphs/${graphId}/edges`, token, { method: 'POST', body: JSON.stringify(data) }),

  deleteEdge: (token: string, edgeId: string) =>
    apiFetch(`/v1/edges/${edgeId}`, token, { method: 'DELETE' }),

  // Runs
  createRun: (token: string, graphId: string) =>
    apiFetch(`/v1/graphs/${graphId}/runs`, token, { method: 'POST' }),
  listRuns: (token: string, graphId: string) =>
    apiFetch(`/v1/graphs/${graphId}/runs`, token),
  cancelRun: (token: string, graphId: string, runId: string) =>
    apiFetch(`/v1/graphs/${graphId}/runs/${runId}/cancel`, token, { method: 'POST' }),
  getRunDetail: (token: string, runId: string) =>
    apiFetch(`/v1/runs/${runId}/detail`, token),

  // Task Logs
  getTaskLogs: (token: string, taskId: string, after = 0) =>
    apiFetch(`/v1/tasks/${taskId}/logs?after=${after}`, token),

  // Seed
  seedTestGraph: (token: string) =>
    apiFetch('/v1/graphs/seed-test', token, { method: 'POST' }),

  // Workers
  listWorkers: (token: string) => apiFetch('/v1/workers', token),

  // ── Workspaces ──
  listWorkspaces: (token: string) => apiFetch('/v1/workspaces', token),
  createWorkspace: (token: string, data: { name: string; slug: string; description?: string }) =>
    apiFetch('/v1/workspaces', token, { method: 'POST', body: JSON.stringify(data) }),
  getWorkspace: (token: string, id: string) => apiFetch(`/v1/workspaces/${id}`, token),
  listMembers: (token: string, wsId: string) => apiFetch(`/v1/workspaces/${wsId}/members`, token),

  // ── Models ──
  listModelProviders: (token: string, wsId: string) => apiFetch(`/v1/models/providers?workspaceId=${wsId}`, token),
  createModelProvider: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/models/providers', token, { method: 'POST', body: JSON.stringify(data) }),
  listModelConfigs: (token: string, providerId: string) =>
    apiFetch(`/v1/models/configs?providerId=${providerId}`, token),

  // ── Agents ──
  listAgents: (token: string, wsId: string) => apiFetch(`/v1/agents?workspaceId=${wsId}`, token),
  getAgent: (token: string, id: string) => apiFetch(`/v1/agents/${id}`, token),
  createAgent: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/agents', token, { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (token: string, id: string, data: Record<string, unknown>) =>
    apiFetch(`/v1/agents/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) }),
  updateAgentConfig: (token: string, id: string, data: Record<string, unknown>) =>
    apiFetch(`/v1/agents/${id}/config`, token, { method: 'PUT', body: JSON.stringify(data) }),
  publishAgent: (token: string, id: string) =>
    apiFetch(`/v1/agents/${id}/publish`, token, { method: 'POST' }),
  duplicateAgent: (token: string, id: string) =>
    apiFetch(`/v1/agents/${id}/duplicate`, token, { method: 'POST' }),
  deleteAgent: (token: string, id: string) =>
    apiFetch(`/v1/agents/${id}`, token, { method: 'DELETE' }),

  // ── Workflows ──
  listWorkflows: (token: string, wsId: string) => apiFetch(`/v1/workflows?workspaceId=${wsId}`, token),
  getWorkflow: (token: string, id: string) => apiFetch(`/v1/workflows/${id}`, token),
  createWorkflow: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/workflows', token, { method: 'POST', body: JSON.stringify(data) }),
  runWorkflow: (token: string, id: string, data?: Record<string, unknown>) =>
    apiFetch(`/v1/workflows/${id}/run`, token, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  listWorkflowRuns: (token: string, id: string) => apiFetch(`/v1/workflows/${id}/runs`, token),

  // ── Conversations & Chat ──
  listConversations: (token: string, wsId: string) =>
    apiFetch(`/v1/conversations?workspaceId=${wsId}`, token),
  createConversation: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/conversations', token, { method: 'POST', body: JSON.stringify(data) }),
  getConversation: (token: string, id: string) => apiFetch(`/v1/conversations/${id}`, token),
  listMessages: (token: string, convId: string) => apiFetch(`/v1/conversations/${convId}/messages`, token),
  sendMessage: (token: string, convId: string, content: string) =>
    apiFetch(`/v1/conversations/${convId}/messages`, token, {
      method: 'POST', body: JSON.stringify({ content }),
    }),
  chat: (token: string, data: { conversationId: string; message: string }) =>
    apiFetch('/v1/conversations/chat', token, { method: 'POST', body: JSON.stringify(data) }),

  // ── Plugins ──
  listPlugins: (token: string, wsId: string) => apiFetch(`/v1/plugins?workspaceId=${wsId}`, token),
  getPlugin: (token: string, id: string) => apiFetch(`/v1/plugins/${id}`, token),
  createPlugin: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/plugins', token, { method: 'POST', body: JSON.stringify(data) }),

  // ── Knowledge ──
  listKnowledgeBases: (token: string, wsId: string) => apiFetch(`/v1/knowledge?workspaceId=${wsId}`, token),
  getKnowledgeBase: (token: string, id: string) => apiFetch(`/v1/knowledge/${id}`, token),
  createKnowledgeBase: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/knowledge', token, { method: 'POST', body: JSON.stringify(data) }),

  // ── Databases ──
  listDatabases: (token: string, wsId: string) => apiFetch(`/v1/databases?workspaceId=${wsId}`, token),

  // ── Prompts ──
  listPrompts: (token: string, wsId: string) => apiFetch(`/v1/prompts?workspaceId=${wsId}`, token),
  createPrompt: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/prompts', token, { method: 'POST', body: JSON.stringify(data) }),

  // ── Apps ──
  listApps: (token: string, wsId: string) => apiFetch(`/v1/apps?workspaceId=${wsId}`, token),
  createApp: (token: string, data: Record<string, unknown>) =>
    apiFetch('/v1/apps', token, { method: 'POST', body: JSON.stringify(data) }),

  // ── Marketplace ──
  browseMarketplace: (token: string, params?: string) =>
    apiFetch(`/v1/marketplace${params ? `?${params}` : ''}`, token),
  installFromMarketplace: (token: string, productId: string, wsId: string) =>
    apiFetch(`/v1/marketplace/${productId}/install`, token, {
      method: 'POST', body: JSON.stringify({ workspaceId: wsId }),
    }),

  // ── Replication Tracker ──
  getReplicationStatus: (token: string) => apiFetch('/v1/replication/status', token),
  takeReplicationSnapshot: (token: string) =>
    apiFetch('/v1/replication/snapshot', token, { method: 'POST' }),
  getReplicationGaps: (token: string) => apiFetch('/v1/replication/gaps', token),
  getReplicationHistory: (token: string) => apiFetch('/v1/replication/history', token),

  // ── Plugin Execution ──
  executePluginTool: (token: string, toolId: string, input: Record<string, unknown>) =>
    apiFetch(`/v1/plugins/tools/${toolId}/execute`, token, {
      method: 'POST', body: JSON.stringify({ input }),
    }),
  debugPluginTool: (token: string, toolId: string, input: Record<string, unknown>) =>
    apiFetch(`/v1/plugins/tools/${toolId}/debug`, token, {
      method: 'POST', body: JSON.stringify({ input }),
    }),

  // ── Streaming Chat ──
  chatStream: (token: string, data: { conversationId: string; message: string }) =>
    fetch(`${API_URL}/v1/conversations/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
};
