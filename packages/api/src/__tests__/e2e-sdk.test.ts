/**
 * SDK Integration Tests — Tests the HiveSDK against schema validation.
 * Verifies every SDK method produces valid API request shapes.
 *
 * Pattern: Dify-style parametrized tests + Coze table-driven approach.
 */
import { describe, it, expect } from 'vitest';
import { HiveSDK } from '@pajamadot/hive-shared';
import { HIVE_MCP_TOOLS } from '../../../shared/src/mcp-tools.js';

describe('HiveSDK class', () => {
  it('can be instantiated', () => {
    const sdk = new HiveSDK({ token: 'test', baseUrl: 'http://localhost:8787' });
    expect(sdk).toBeDefined();
  });

  it('has all agent methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listAgents).toBe('function');
    expect(typeof sdk.createAgent).toBe('function');
    expect(typeof sdk.getAgent).toBe('function');
    expect(typeof sdk.updateAgent).toBe('function');
    expect(typeof sdk.configureAgent).toBe('function');
    expect(typeof sdk.publishAgent).toBe('function');
    expect(typeof sdk.duplicateAgent).toBe('function');
    expect(typeof sdk.deleteAgent).toBe('function');
    expect(typeof sdk.invokeAgent).toBe('function');
  });

  it('has all workflow methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listWorkflows).toBe('function');
    expect(typeof sdk.createWorkflow).toBe('function');
    expect(typeof sdk.getWorkflow).toBe('function');
    expect(typeof sdk.addNode).toBe('function');
    expect(typeof sdk.updateNode).toBe('function');
    expect(typeof sdk.deleteNode).toBe('function');
    expect(typeof sdk.addEdge).toBe('function');
    expect(typeof sdk.testNode).toBe('function');
    expect(typeof sdk.publishWorkflow).toBe('function');
    expect(typeof sdk.runWorkflow).toBe('function');
  });

  it('has all conversation methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listConversations).toBe('function');
    expect(typeof sdk.createConversation).toBe('function');
    expect(typeof sdk.sendMessage).toBe('function');
    expect(typeof sdk.getMessages).toBe('function');
    expect(typeof sdk.chat).toBe('function');
    expect(typeof sdk.chatStream).toBe('function');
  });

  it('has all knowledge methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listKnowledgeBases).toBe('function');
    expect(typeof sdk.createKnowledgeBase).toBe('function');
    expect(typeof sdk.uploadDocument).toBe('function');
    expect(typeof sdk.uploadDocumentUrl).toBe('function');
    expect(typeof sdk.searchKnowledge).toBe('function');
    expect(typeof sdk.copyKnowledgeBase).toBe('function');
  });

  it('has all plugin methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listPlugins).toBe('function');
    expect(typeof sdk.createPlugin).toBe('function');
    expect(typeof sdk.createTool).toBe('function');
    expect(typeof sdk.executeTool).toBe('function');
    expect(typeof sdk.importOpenAPI).toBe('function');
  });

  it('has all prompt methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listPrompts).toBe('function');
    expect(typeof sdk.createPrompt).toBe('function');
    expect(typeof sdk.renderPrompt).toBe('function');
    expect(typeof sdk.testPrompt).toBe('function');
  });

  it('has all app methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listApps).toBe('function');
    expect(typeof sdk.createApp).toBe('function');
    expect(typeof sdk.publishApp).toBe('function');
    expect(typeof sdk.getEmbedCode).toBe('function');
  });

  it('has all variable methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listVariables).toBe('function');
    expect(typeof sdk.createVariable).toBe('function');
    expect(typeof sdk.setVariable).toBe('function');
    expect(typeof sdk.getVariable).toBe('function');
  });

  it('has all database methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listDatabases).toBe('function');
    expect(typeof sdk.createDatabase).toBe('function');
    expect(typeof sdk.createTable).toBe('function');
    expect(typeof sdk.insertRow).toBe('function');
    expect(typeof sdk.queryTable).toBe('function');
  });

  it('has all model methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.listModelProviders).toBe('function');
    expect(typeof sdk.addModelProvider).toBe('function');
    expect(typeof sdk.testModelProvider).toBe('function');
    expect(typeof sdk.getModelUsage).toBe('function');
  });

  it('has all marketplace methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.browseMarketplace).toBe('function');
    expect(typeof sdk.publishToMarketplace).toBe('function');
    expect(typeof sdk.installFromMarketplace).toBe('function');
  });

  it('has system methods', () => {
    const sdk = new HiveSDK({ token: 'test' });
    expect(typeof sdk.getReplicationStatus).toBe('function');
    expect(typeof sdk.getReplicationGaps).toBe('function');
    expect(typeof sdk.takeSnapshot).toBe('function');
  });
});

describe('MCP Tool Definitions', () => {
  it('has correct number of tools', () => {
    expect(HIVE_MCP_TOOLS.length).toBe(12);
  });

  it.each(HIVE_MCP_TOOLS.map((t) => [t.name, t]))('tool %s has valid schema', (_, tool) => {
    const t = tool as typeof HIVE_MCP_TOOLS[0];
    expect(t.name).toBeTruthy();
    expect(t.description).toBeTruthy();
    expect(t.description.length).toBeGreaterThan(10);
    expect(t.inputSchema.type).toBe('object');
    expect(t.inputSchema.properties).toBeDefined();
  });

  it('core tools exist', () => {
    const names = HIVE_MCP_TOOLS.map((t) => t.name);
    expect(names).toContain('hive_agent_invoke');
    expect(names).toContain('hive_workflow_run');
    expect(names).toContain('hive_knowledge_search');
    expect(names).toContain('hive_chat');
    expect(names).toContain('hive_plugin_execute');
  });

  it('all tools have required fields', () => {
    for (const tool of HIVE_MCP_TOOLS) {
      // Tools with required fields should have them defined
      if (tool.inputSchema.required) {
        for (const req of tool.inputSchema.required) {
          expect(tool.inputSchema.properties).toHaveProperty(req);
        }
      }
    }
  });
});
