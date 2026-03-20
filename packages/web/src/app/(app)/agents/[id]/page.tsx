'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  mode: string;
  createdAt: string;
}

interface AgentConfigData {
  systemPrompt: string | null;
  temperature: number | null;
  maxTokens: number | null;
  memoryEnabled: boolean;
  memoryWindowSize: number | null;
  openingMessage: string | null;
  suggestedReplies: string[] | null;
  knowledgeBaseIds: string[] | null;
  pluginIds: string[] | null;
  modelConfigId: string | null;
}

type Tab = 'persona' | 'skills' | 'knowledge' | 'workflows' | 'preview';

export default function AgentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [config, setConfig] = useState<AgentConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('persona');
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const data = await api.getAgent(token, id);
        setAgent(data.agent);
        setConfig(data.config ?? {
          systemPrompt: '', temperature: 0.7, maxTokens: null,
          memoryEnabled: true, memoryWindowSize: 20, openingMessage: null,
          suggestedReplies: null, knowledgeBaseIds: null, pluginIds: null, modelConfigId: null,
        });
      } catch { /* */ }
      setLoading(false);
    }
    load();
  }, [getToken, id]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    const token = await getToken();
    if (token) {
      await api.updateAgentConfig(token, id, config as unknown as Record<string, unknown>);
    }
    setSaving(false);
  }

  async function handlePublish() {
    const token = await getToken();
    if (!token) return;
    await api.publishAgent(token, id);
    const data = await api.getAgent(token, id);
    setAgent(data.agent);
  }

  async function handleTest() {
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResponse('');
    const token = await getToken();
    if (token) {
      try {
        // Create a temp conversation and send message
        const conv = await api.createConversation(token, { workspaceId: 'default', agentId: id, title: 'Test' });
        const result = await api.chat(token, { conversationId: conv.conversation.id, message: testMessage });
        setTestResponse(result.message?.content ?? 'No response');
      } catch (err) {
        setTestResponse(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
    setTesting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!agent) return <div className="p-8">Agent not found</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'persona', label: 'Persona' },
    { key: 'skills', label: 'Skills' },
    { key: 'knowledge', label: 'Knowledge' },
    { key: 'workflows', label: 'Workflows' },
    { key: 'preview', label: 'Preview' },
  ];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/agents" className="text-sm text-muted-foreground hover:text-foreground">← Agents</Link>
          <h1 className="text-lg font-semibold">{agent.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            agent.status === 'published' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
          }`}>{agent.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent/50 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handlePublish}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Publish
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b px-6 flex gap-0 shrink-0">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'persona' && config && (
          <div className="max-w-3xl space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">System Prompt</label>
              <textarea
                value={config.systemPrompt ?? ''}
                onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
                rows={12}
                className="w-full px-3 py-2 border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                placeholder="You are a helpful AI assistant..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Temperature</label>
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={config.temperature ?? 0.7}
                  onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <span className="text-xs text-muted-foreground">{config.temperature ?? 0.7}</span>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Max Tokens</label>
                <input
                  type="number"
                  value={config.maxTokens ?? ''}
                  onChange={(e) => setConfig({ ...config, maxTokens: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Default"
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Opening Message</label>
              <input
                type="text"
                value={config.openingMessage ?? ''}
                onChange={(e) => setConfig({ ...config, openingMessage: e.target.value || null })}
                placeholder="Hello! How can I help you today?"
                className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.memoryEnabled}
                  onChange={(e) => setConfig({ ...config, memoryEnabled: e.target.checked })}
                  className="rounded" />
                Enable conversation memory
              </label>
              {config.memoryEnabled && (
                <input
                  type="number" min="1" max="100"
                  value={config.memoryWindowSize ?? 20}
                  onChange={(e) => setConfig({ ...config, memoryWindowSize: parseInt(e.target.value) })}
                  className="w-20 px-2 py-1 border rounded text-sm bg-background"
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="max-w-3xl">
            <h3 className="text-lg font-medium mb-4">Plugins & Tools</h3>
            <p className="text-muted-foreground text-sm mb-4">Attach plugins to give your agent external capabilities.</p>
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <p>No plugins attached yet.</p>
              <Link href="/plugins" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">
                Browse plugins →
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="max-w-3xl">
            <h3 className="text-lg font-medium mb-4">Knowledge Bases</h3>
            <p className="text-muted-foreground text-sm mb-4">Attach knowledge bases for RAG-powered responses.</p>
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <p>No knowledge bases attached yet.</p>
              <Link href="/knowledge" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">
                Browse knowledge bases →
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'workflows' && (
          <div className="max-w-3xl">
            <h3 className="text-lg font-medium mb-4">Workflow</h3>
            <p className="text-muted-foreground text-sm mb-4">Attach a workflow for complex multi-step agent behavior.</p>
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <p>No workflow attached yet.</p>
              <Link href="/workflows" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">
                Browse workflows →
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="max-w-3xl">
            <h3 className="text-lg font-medium mb-4">Test Chat</h3>
            <div className="border rounded-lg">
              {testResponse && (
                <div className="p-4 border-b bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-1">Assistant</div>
                  <p className="text-sm whitespace-pre-wrap">{testResponse}</p>
                </div>
              )}
              <div className="p-4 flex gap-2">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                  placeholder="Test your agent..."
                  className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={testing}
                />
                <button onClick={handleTest} disabled={testing || !testMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {testing ? 'Testing...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
