'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface Worker {
  id: string;
  userId: string;
  name: string | null;
  agentKinds: string[] | null;
  capabilities: string[] | null;
  maxConcurrency: number;
  status: string;
  lastHeartbeatAt: string | null;
  version: string | null;
  createdAt: string;
}

const statusStyle: Record<string, string> = {
  online: 'bg-green-500/20 text-green-400',
  busy: 'bg-yellow-500/20 text-yellow-400',
  offline: 'bg-muted text-muted-foreground',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

export default function WorkersPage() {
  const { getToken } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/workers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setWorkers(data.workers);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const online = workers.filter((w) => w.status === 'online' || w.status === 'busy');
  const busy = workers.filter((w) => w.status === 'busy');
  const offline = workers.filter((w) => w.status === 'offline');
  const totalCap = workers.reduce((a, w) => a + w.maxConcurrency, 0);
  const utilization = totalCap > 0 ? Math.round((busy.length / totalCap) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">Back</Link>
          <h1 className="text-xl font-bold">Workers</h1>
        </div>
        <UserButton />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-3xl font-bold text-green-400">{online.length}</div>
            <div className="text-sm text-muted-foreground">Online / Busy</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-3xl font-bold text-muted-foreground">{offline.length}</div>
            <div className="text-sm text-muted-foreground">Offline</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-3xl font-bold">{totalCap}</div>
            <div className="text-sm text-muted-foreground">Total Capacity</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className={`text-3xl font-bold ${utilization > 80 ? 'text-red-400' : utilization > 50 ? 'text-yellow-400' : 'text-green-400'}`}>{utilization}%</div>
            <div className="text-sm text-muted-foreground">Utilization</div>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : workers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">No workers registered</p>
            <p className="text-sm mt-1">Connect a worker using: hive connect</p>
          </div>
        ) : (
          <div className="space-y-2">
            {workers.map((w) => (
              <div key={w.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  w.status === 'online' ? 'bg-green-400' :
                  w.status === 'busy' ? 'bg-yellow-400 animate-pulse' :
                  'bg-muted-foreground'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{w.id.slice(0, 12)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[w.status] ?? statusStyle.offline}`}>
                      {w.status}
                    </span>
                    {w.version && <span className="text-xs text-muted-foreground">v{w.version}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Agents: {w.agentKinds?.join(', ') ?? '—'}</span>
                    {w.capabilities && w.capabilities.length > 0 && (
                      <span>Caps: {w.capabilities.join(', ')}</span>
                    )}
                    <span>Concurrency: {w.maxConcurrency}</span>
                    <span>Heartbeat: {timeAgo(w.lastHeartbeatAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
