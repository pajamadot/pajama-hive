/**
 * Pajama Hive SDK — Typed API client for all platform operations.
 *
 * Used by:
 * - CLI (@pajamadot/hive)
 * - MCP Server
 * - Frontend (can replace raw fetch calls)
 * - External integrations
 *
 * Every UI action has an SDK method. Every SDK method maps to one API call.
 */

export interface HiveSDKConfig {
  baseUrl?: string;
  token: string;
}

export class HiveSDK {
  private baseUrl: string;
  private token: string;

  constructor(config: HiveSDKConfig) {
    this.baseUrl = config.baseUrl ?? 'https://hive-api.pajamadot.com';
    this.token = config.token;
  }

  private async req<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new Error(err.error ?? `API error ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  // ═══ Workspaces ═══
  async listWorkspaces() { return this.req<{ workspaces: unknown[] }>('GET', '/v1/workspaces'); }
  async createWorkspace(name: string, slug: string) { return this.req('POST', '/v1/workspaces', { name, slug }); }
  async getWorkspace(id: string) { return this.req('GET', `/v1/workspaces/${id}`); }

  // ═══ Agents ═══
  async listAgents(workspaceId: string) { return this.req<{ agents: unknown[] }>('GET', `/v1/agents?workspaceId=${workspaceId}`); }
  async createAgent(name: string, workspaceId: string, mode = 'single') { return this.req('POST', '/v1/agents', { name, workspaceId, mode }); }
  async getAgent(id: string) { return this.req('GET', `/v1/agents/${id}`); }
  async updateAgent(id: string, data: Record<string, unknown>) { return this.req('PATCH', `/v1/agents/${id}`, data); }
  async configureAgent(id: string, config: Record<string, unknown>) { return this.req('PUT', `/v1/agents/${id}/config`, config); }
  async publishAgent(id: string) { return this.req('POST', `/v1/agents/${id}/publish`, {}); }
  async duplicateAgent(id: string) { return this.req('POST', `/v1/agents/${id}/duplicate`, {}); }
  async deleteAgent(id: string) { return this.req('DELETE', `/v1/agents/${id}`); }
  async invokeAgent(id: string, message: string, context?: { role: string; content: string }[]) {
    return this.req('POST', `/v1/agents/${id}/invoke`, { message, context });
  }

  // ═══ Workflows ═══
  async listWorkflows(workspaceId: string) { return this.req<{ workflows: unknown[] }>('GET', `/v1/workflows?workspaceId=${workspaceId}`); }
  async createWorkflow(name: string, workspaceId: string) { return this.req('POST', '/v1/workflows', { name, workspaceId }); }
  async getWorkflow(id: string) { return this.req('GET', `/v1/workflows/${id}`); }
  async addNode(workflowId: string, nodeType: string, label: string, config?: Record<string, unknown>) {
    return this.req('POST', `/v1/workflows/${workflowId}/nodes`, { nodeType, label, config });
  }
  async updateNode(nodeId: string, updates: Record<string, unknown>) { return this.req('PATCH', `/v1/workflows/nodes/${nodeId}`, updates); }
  async deleteNode(nodeId: string) { return this.req('DELETE', `/v1/workflows/nodes/${nodeId}`); }
  async addEdge(workflowId: string, fromNodeId: string, toNodeId: string, sourceHandle?: string) {
    return this.req('POST', `/v1/workflows/${workflowId}/edges`, { fromNodeId, toNodeId, sourceHandle });
  }
  async testNode(workflowId: string, nodeId: string, input: unknown) {
    return this.req('POST', `/v1/workflows/${workflowId}/nodes/${nodeId}/test`, { input });
  }
  async publishWorkflow(id: string) { return this.req('POST', `/v1/workflows/${id}/publish`, {}); }
  async runWorkflow(id: string, input?: Record<string, unknown>) { return this.req('POST', `/v1/workflows/${id}/run`, { input }); }
  async listWorkflowRuns(id: string) { return this.req('GET', `/v1/workflows/${id}/runs`); }
  async getWorkflowRun(runId: string) { return this.req('GET', `/v1/workflows/runs/${runId}`); }

  // ═══ Conversations & Chat ═══
  async listConversations(workspaceId: string) { return this.req('GET', `/v1/conversations?workspaceId=${workspaceId}`); }
  async createConversation(workspaceId: string, opts?: { agentId?: string; title?: string }) {
    return this.req('POST', '/v1/conversations', { workspaceId, ...opts });
  }
  async getConversation(id: string) { return this.req('GET', `/v1/conversations/${id}`); }
  async sendMessage(conversationId: string, content: string) {
    return this.req('POST', `/v1/conversations/${conversationId}/messages`, { content });
  }
  async getMessages(conversationId: string) { return this.req('GET', `/v1/conversations/${conversationId}/messages`); }
  async chat(conversationId: string, message: string) {
    return this.req('POST', '/v1/conversations/chat', { conversationId, message });
  }
  async chatStream(conversationId: string, message: string): Promise<ReadableStream> {
    const res = await fetch(`${this.baseUrl}/v1/conversations/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ conversationId, message }),
    });
    return res.body!;
  }

  // ═══ Knowledge Bases ═══
  async listKnowledgeBases(workspaceId: string) { return this.req('GET', `/v1/knowledge?workspaceId=${workspaceId}`); }
  async createKnowledgeBase(name: string, workspaceId: string, opts?: { chunkSize?: number; chunkOverlap?: number }) {
    return this.req('POST', '/v1/knowledge', { name, workspaceId, ...opts });
  }
  async getKnowledgeBase(id: string) { return this.req('GET', `/v1/knowledge/${id}`); }
  async uploadDocument(kbId: string, name: string, content: string) {
    return this.req('POST', `/v1/knowledge/${kbId}/documents`, { name, sourceType: 'text', content });
  }
  async uploadDocumentUrl(kbId: string, name: string, url: string) {
    return this.req('POST', `/v1/knowledge/${kbId}/documents`, { name, sourceType: 'url', sourceUrl: url });
  }
  async searchKnowledge(kbId: string, query: string, opts?: { mode?: string; limit?: number }) {
    return this.req('POST', `/v1/knowledge/${kbId}/search`, { query, ...opts });
  }
  async copyKnowledgeBase(id: string) { return this.req('POST', `/v1/knowledge/${id}/copy`); }

  // ═══ Plugins ═══
  async listPlugins(workspaceId: string) { return this.req('GET', `/v1/plugins?workspaceId=${workspaceId}`); }
  async createPlugin(name: string, workspaceId: string, opts?: { pluginType?: string; baseUrl?: string }) {
    return this.req('POST', '/v1/plugins', { name, workspaceId, ...opts });
  }
  async createTool(pluginId: string, name: string, path: string, method = 'POST') {
    return this.req('POST', `/v1/plugins/${pluginId}/tools`, { name, path, method });
  }
  async executeTool(toolId: string, input: Record<string, unknown>) {
    return this.req('POST', `/v1/plugins/tools/${toolId}/execute`, { input });
  }
  async importOpenAPI(pluginId: string, spec: Record<string, unknown>) {
    return this.req('POST', `/v1/plugins/${pluginId}/import-openapi`, { spec });
  }

  // ═══ Prompts ═══
  async listPrompts(workspaceId: string) { return this.req('GET', `/v1/prompts?workspaceId=${workspaceId}`); }
  async createPrompt(name: string, content: string, workspaceId: string) {
    return this.req('POST', '/v1/prompts', { name, content, workspaceId });
  }
  async renderPrompt(id: string, variables: Record<string, string>) {
    return this.req('POST', `/v1/prompts/${id}/render`, { variables });
  }
  async testPrompt(id: string, message: string, variables?: Record<string, string>) {
    return this.req('POST', `/v1/prompts/${id}/test`, { message, variables });
  }

  // ═══ Apps ═══
  async listApps(workspaceId: string) { return this.req('GET', `/v1/apps?workspaceId=${workspaceId}`); }
  async createApp(name: string, workspaceId: string, opts?: { appType?: string; agentId?: string }) {
    return this.req('POST', '/v1/apps', { name, workspaceId, ...opts });
  }
  async publishApp(id: string) { return this.req('POST', `/v1/apps/${id}/publish`); }
  async getEmbedCode(id: string) { return this.req('GET', `/v1/apps/${id}/embed`); }

  // ═══ Variables ═══
  async listVariables(workspaceId: string) { return this.req('GET', `/v1/variables?workspaceId=${workspaceId}`); }
  async createVariable(name: string, workspaceId: string, opts?: { valueType?: string; scope?: string }) {
    return this.req('POST', '/v1/variables', { name, workspaceId, ...opts });
  }
  async setVariable(id: string, value: string) { return this.req('PUT', `/v1/variables/${id}/value`, { value }); }
  async getVariable(id: string) { return this.req('GET', `/v1/variables/${id}/value`); }

  // ═══ Databases ═══
  async listDatabases(workspaceId: string) { return this.req('GET', `/v1/databases?workspaceId=${workspaceId}`); }
  async createDatabase(name: string, workspaceId: string) { return this.req('POST', '/v1/databases', { name, workspaceId }); }
  async createTable(dbId: string, name: string, schema: { name: string; type: string }[]) {
    return this.req('POST', `/v1/databases/${dbId}/tables`, { name, schema });
  }
  async insertRow(tableId: string, data: Record<string, unknown>) {
    return this.req('POST', `/v1/databases/tables/${tableId}/rows`, { data });
  }
  async queryTable(tableId: string, query: string) {
    return this.req('POST', `/v1/databases/tables/${tableId}/query`, { query });
  }

  // ═══ Models ═══
  async listModelProviders(workspaceId: string) { return this.req('GET', `/v1/models/providers?workspaceId=${workspaceId}`); }
  async addModelProvider(name: string, provider: string, workspaceId: string, apiKey?: string) {
    return this.req('POST', '/v1/models/providers', { name, provider, workspaceId, apiKey });
  }
  async testModelProvider(id: string) { return this.req('POST', `/v1/models/providers/${id}/test`); }
  async getModelUsage(workspaceId: string, days = 7) { return this.req('GET', `/v1/models/usage?workspaceId=${workspaceId}&days=${days}`); }

  // ═══ Marketplace ═══
  async browseMarketplace(opts?: { type?: string; search?: string }) {
    const params = new URLSearchParams();
    if (opts?.type) params.set('type', opts.type);
    if (opts?.search) params.set('search', opts.search);
    return this.req('GET', `/v1/marketplace?${params}`);
  }
  async publishToMarketplace(resourceType: string, resourceId: string, name: string, workspaceId: string) {
    return this.req('POST', '/v1/marketplace', { resourceType, resourceId, name, workspaceId });
  }
  async installFromMarketplace(productId: string, workspaceId: string) {
    return this.req('POST', `/v1/marketplace/${productId}/install`, { workspaceId });
  }

  // ═══ System ═══
  async getReplicationStatus() { return this.req('GET', '/v1/replication/status'); }
  async getReplicationGaps() { return this.req('GET', '/v1/replication/gaps'); }
  async takeSnapshot() { return this.req('POST', '/v1/replication/snapshot'); }
}
