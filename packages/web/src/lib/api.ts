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

  // Tasks
  listTasks: (token: string, graphId: string) => apiFetch(`/v1/graphs/${graphId}/tasks`, token),
  createTask: (token: string, graphId: string, data: Record<string, unknown>) =>
    apiFetch(`/v1/graphs/${graphId}/tasks`, token, { method: 'POST', body: JSON.stringify(data) }),
  approveTask: (token: string, taskId: string) =>
    apiFetch(`/v1/tasks/${taskId}/approve`, token, { method: 'POST' }),
  cancelTask: (token: string, taskId: string) =>
    apiFetch(`/v1/tasks/${taskId}/cancel`, token, { method: 'POST' }),

  // Edges
  listEdges: (token: string, graphId: string) => apiFetch(`/v1/graphs/${graphId}/edges`, token),
  createEdge: (token: string, graphId: string, data: { fromTaskId: string; toTaskId: string }) =>
    apiFetch(`/v1/graphs/${graphId}/edges`, token, { method: 'POST', body: JSON.stringify(data) }),

  // Runs
  createRun: (token: string, graphId: string) =>
    apiFetch(`/v1/graphs/${graphId}/runs`, token, { method: 'POST' }),
  listRuns: (token: string, graphId: string) =>
    apiFetch(`/v1/graphs/${graphId}/runs`, token),
  getRunDetail: (token: string, runId: string) =>
    apiFetch(`/v1/runs/${runId}/detail`, token),

  // Workers
  listWorkers: (token: string) => apiFetch('/v1/workers', token),
};
