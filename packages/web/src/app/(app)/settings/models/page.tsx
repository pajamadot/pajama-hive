'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', defaultModels: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] },
  { id: 'google', name: 'Google Gemini', defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
  { id: 'deepseek', name: 'DeepSeek', defaultModels: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'qwen', name: 'Qwen', defaultModels: ['qwen-turbo', 'qwen-plus'] },
  { id: 'ollama', name: 'Ollama (Local)', defaultModels: ['llama3', 'mistral', 'codellama'] },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', defaultModels: [] },
];

interface Provider {
  id: string;
  name: string;
  provider: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  isEnabled: boolean;
}

export default function ModelSettingsPage() {
  const { getToken } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addProvider, setAddProvider] = useState('openai');
  const [addName, setAddName] = useState('');
  const [addApiKey, setAddApiKey] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('');
  const [addModel, setAddModel] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadProviders() {
    const token = await getToken();
    if (!token) return;
    try {
      const data = await api.listModelProviders(token, 'default');
      setProviders(data.providers ?? []);
    } catch { /* */ }
    setLoading(false);
  }

  useEffect(() => { loadProviders(); }, [getToken]);

  async function handleAdd() {
    if (!addApiKey.trim() && addProvider !== 'ollama') return;
    setSaving(true);
    const token = await getToken();
    if (token) {
      const provInfo = PROVIDERS.find((p) => p.id === addProvider);
      const name = addName || provInfo?.name || addProvider;

      // Create provider
      const res = await fetch(`${API_URL}/v1/models/providers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          provider: addProvider,
          apiKey: addApiKey || undefined,
          baseUrl: addBaseUrl || undefined,
          workspaceId: 'default',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const providerId = data.provider.id;

        // Create default model config
        const modelId = addModel || provInfo?.defaultModels[0] || 'default';
        await fetch(`${API_URL}/v1/models/configs`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId,
            modelId,
            displayName: modelId,
            modelType: 'chat',
            isDefault: true,
          }),
        });

        // If OpenAI, also create embedding config
        if (addProvider === 'openai') {
          await fetch(`${API_URL}/v1/models/configs`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId,
              modelId: 'text-embedding-3-small',
              displayName: 'Embeddings (small)',
              modelType: 'embedding',
              isDefault: false,
            }),
          });
        }
      }

      setShowAdd(false);
      setAddApiKey('');
      setAddBaseUrl('');
      setAddName('');
      setAddModel('');
      await loadProviders();
    }
    setSaving(false);
  }

  async function handleDelete(providerId: string) {
    if (!confirm('Delete this model provider?')) return;
    const token = await getToken();
    if (token) {
      await fetch(`${API_URL}/v1/models/providers/${providerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadProviders();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const selectedProviderInfo = PROVIDERS.find((p) => p.id === addProvider);

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">← Settings</Link>
            <h1 className="text-2xl font-bold mt-2">Model Providers</h1>
            <p className="text-muted-foreground mt-1">Configure LLM providers for chat, embeddings, and workflows.</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Add Provider
          </button>
        </div>

        {/* Provider list */}
        {providers.length === 0 && !showAdd ? (
          <div className="text-center py-16 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No model providers configured</h3>
            <p className="text-muted-foreground mb-4">Add an API key to enable chat and agent capabilities.</p>
            <button onClick={() => setShowAdd(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Add Your First Provider
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((prov) => (
              <div key={prov.id} className="border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{prov.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {prov.provider} · {prov.hasApiKey ? 'API key set' : 'No API key'}
                    {prov.baseUrl && ` · ${prov.baseUrl}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${prov.isEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                  <button onClick={() => handleDelete(prov.id)}
                    className="text-xs text-red-400 hover:text-red-300 ml-2">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add provider form */}
        {showAdd && (
          <div className="mt-6 border rounded-lg p-6">
            <h3 className="font-medium mb-4">Add Model Provider</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Provider</label>
                <select value={addProvider} onChange={(e) => {
                  setAddProvider(e.target.value);
                  const info = PROVIDERS.find((p) => p.id === e.target.value);
                  setAddModel(info?.defaultModels[0] ?? '');
                  setAddBaseUrl(e.target.value === 'ollama' ? 'http://localhost:11434/v1' : '');
                }}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm">
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
                  placeholder={selectedProviderInfo?.name ?? 'Provider name'}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input type="password" value={addApiKey} onChange={(e) => setAddApiKey(e.target.value)}
                  placeholder={addProvider === 'ollama' ? 'Not required for Ollama' : 'sk-...'}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm font-mono" />
              </div>

              {(addProvider === 'ollama' || addProvider === 'custom') && (
                <div>
                  <label className="block text-sm font-medium mb-1">Base URL</label>
                  <input type="text" value={addBaseUrl} onChange={(e) => setAddBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className="w-full px-3 py-2 border rounded-lg bg-background text-sm" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Default Model</label>
                {selectedProviderInfo && selectedProviderInfo.defaultModels.length > 0 ? (
                  <select value={addModel} onChange={(e) => setAddModel(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-background text-sm">
                    {selectedProviderInfo.defaultModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={addModel} onChange={(e) => setAddModel(e.target.value)}
                    placeholder="model-name"
                    className="w-full px-3 py-2 border rounded-lg bg-background text-sm" />
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handleAdd} disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Add Provider'}
                </button>
                <button onClick={() => setShowAdd(false)}
                  className="px-4 py-2 border text-sm rounded-lg hover:bg-accent/50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
