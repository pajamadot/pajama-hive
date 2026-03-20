'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: number;
  createdAt: string;
}

export default function SettingsPage() {
  const { getToken } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState('run.completed,run.failed');
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getToken();
    const [keysRes, hooksRes] = await Promise.all([
      fetch(`${API_URL}/v1/api-keys`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/v1/webhooks`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (keysRes.ok) setApiKeys((await keysRes.json()).apiKeys);
    if (hooksRes.ok) setWebhooks((await hooksRes.json()).webhooks);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/api-keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKeyResult(data.rawKey);
      setNewKeyName('');
      load();
      toast.success('API key created');
    }
  };

  const revokeKey = async (keyId: string) => {
    const token = await getToken();
    await fetch(`${API_URL}/v1/api-keys/${keyId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
    toast.success('API key revoked');
  };

  const createWebhook = async () => {
    if (!newWebhookUrl.trim()) return;
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/webhooks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newWebhookUrl, events: newWebhookEvents.split(',').map((e) => e.trim()) }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewWebhookSecret(data.secret);
      setNewWebhookUrl('');
      load();
      toast.success('Webhook created');
    }
  };

  const deleteWebhook = async (id: string) => {
    const token = await getToken();
    await fetch(`${API_URL}/v1/webhooks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
    toast.success('Webhook deleted');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">Back</Link>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
        <UserButton />
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        {/* API Keys */}
        <section>
          <h2 className="text-lg font-semibold mb-4">API Keys</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Use API keys for CI/CD pipelines and CLI auth via HIVE_API_KEY env var.
          </p>

          <div className="flex gap-2 mb-4">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. CI Pipeline)"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
            />
            <button onClick={createKey} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">
              Create Key
            </button>
          </div>

          {newKeyResult && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg mb-4">
              <p className="text-sm text-green-400 font-medium mb-1">New API Key (copy now — shown only once):</p>
              <code className="text-xs font-mono bg-background px-2 py-1 rounded block break-all">{newKeyResult}</code>
              <button onClick={() => { navigator.clipboard.writeText(newKeyResult); toast.success('Copied!'); }} className="mt-2 text-xs text-green-400 hover:underline">Copy</button>
            </div>
          )}

          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
                <div>
                  <span className="text-sm font-medium">{key.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{key.prefix}...</span>
                </div>
                <button onClick={() => revokeKey(key.id)} className="text-xs text-red-400 hover:underline">Revoke</button>
              </div>
            ))}
            {apiKeys.length === 0 && <p className="text-sm text-muted-foreground">No API keys.</p>}
          </div>
        </section>

        {/* Webhooks */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Webhooks</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Receive HTTP POST notifications when runs complete or tasks finish.
          </p>

          <div className="space-y-2 mb-4">
            <input
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            />
            <input
              value={newWebhookEvents}
              onChange={(e) => setNewWebhookEvents(e.target.value)}
              placeholder="Events (comma-separated)"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            />
            <button onClick={createWebhook} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">
              Create Webhook
            </button>
          </div>

          {newWebhookSecret && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg mb-4">
              <p className="text-sm text-green-400 font-medium mb-1">Webhook Secret (copy now):</p>
              <code className="text-xs font-mono bg-background px-2 py-1 rounded block break-all">{newWebhookSecret}</code>
              <button onClick={() => { navigator.clipboard.writeText(newWebhookSecret); toast.success('Copied!'); }} className="mt-2 text-xs text-green-400 hover:underline">Copy</button>
            </div>
          )}

          <div className="space-y-2">
            {webhooks.map((hook) => (
              <div key={hook.id} className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
                <div>
                  <span className="text-sm font-mono">{hook.url}</span>
                  <div className="text-xs text-muted-foreground mt-1">
                    Events: {hook.events.join(', ')} · {hook.active ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <button onClick={() => deleteWebhook(hook.id)} className="text-xs text-red-400 hover:underline">Delete</button>
              </div>
            ))}
            {webhooks.length === 0 && <p className="text-sm text-muted-foreground">No webhooks.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
