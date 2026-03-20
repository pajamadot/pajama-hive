'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface Feature {
  domain: string;
  feature: string;
  cozeEquivalent: string;
  status: 'done' | 'partial' | 'stub' | 'not_started';
  detail: string;
}

interface ReplicationState {
  features: Feature[];
  metrics: Record<string, number>;
  score: number;
}

const statusColors: Record<string, string> = {
  done: 'bg-green-500/20 text-green-400',
  partial: 'bg-yellow-500/20 text-yellow-400',
  stub: 'bg-orange-500/20 text-orange-400',
  not_started: 'bg-red-500/20 text-red-400',
};

export default function ReplicationPage() {
  const { getToken } = useAuth();
  const [state, setState] = useState<ReplicationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotting, setSnapshotting] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/v1/replication/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setState(await res.json());
      setLoading(false);
    }
    load();
  }, [getToken]);

  async function takeSnapshot() {
    setSnapshotting(true);
    const token = await getToken();
    if (token) {
      await fetch(`${API_URL}/v1/replication/snapshot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setSnapshotting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!state) return <div className="p-8">Failed to load replication state</div>;

  const domains = [...new Set(state.features.map((f) => f.domain))];

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Coze Replication Tracker</h1>
            <p className="text-muted-foreground mt-1">Self-evolving progress tracking for 1:1 Coze Studio feature parity</p>
          </div>
          <button onClick={takeSnapshot} disabled={snapshotting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {snapshotting ? 'Saving...' : 'Take Snapshot'}
          </button>
        </div>

        {/* Score */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="border rounded-lg p-4 text-center">
            <div className="text-4xl font-bold text-primary">{state.score}%</div>
            <div className="text-xs text-muted-foreground mt-1">Parity Score</div>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{state.metrics.done}</div>
            <div className="text-xs text-muted-foreground mt-1">Done</div>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{state.metrics.partial}</div>
            <div className="text-xs text-muted-foreground mt-1">Partial</div>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{state.metrics.stub}</div>
            <div className="text-xs text-muted-foreground mt-1">Stub</div>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{state.metrics.notStarted}</div>
            <div className="text-xs text-muted-foreground mt-1">Not Started</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="h-4 bg-muted rounded-full overflow-hidden flex">
            <div className="bg-green-500 h-full" style={{ width: `${(state.metrics.done / state.metrics.totalFeatures) * 100}%` }} />
            <div className="bg-yellow-500 h-full" style={{ width: `${(state.metrics.partial / state.metrics.totalFeatures) * 100}%` }} />
            <div className="bg-orange-500 h-full" style={{ width: `${(state.metrics.stub / state.metrics.totalFeatures) * 100}%` }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {state.metrics.tables} tables · {state.metrics.apiRoutes} API routes · {state.metrics.frontendPages} pages
          </div>
        </div>

        {/* Features by domain */}
        {domains.map((domain) => {
          const domainFeatures = state.features.filter((f) => f.domain === domain);
          const doneCount = domainFeatures.filter((f) => f.status === 'done').length;
          return (
            <div key={domain} className="mb-6">
              <h2 className="text-lg font-semibold mb-2 capitalize flex items-center gap-2">
                {domain}
                <span className="text-xs text-muted-foreground font-normal">
                  {doneCount}/{domainFeatures.length} done
                </span>
              </h2>
              <div className="space-y-1">
                {domainFeatures.map((f) => (
                  <div key={f.feature} className="flex items-center gap-3 py-1.5 px-3 rounded hover:bg-accent/30">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[f.status]}`}>
                      {f.status.replace('_', ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{f.feature}</span>
                      <span className="text-xs text-muted-foreground ml-2">→ {f.cozeEquivalent}</span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate max-w-xs">{f.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
