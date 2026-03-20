'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Graph {
  id: string;
  name: string;
  description: string | null;
  status: string;
  tags: string[] | null;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

export default function DashboardPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadGraphs = useCallback(async () => {
    const token = await getToken();
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`${API_URL}/v1/graphs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setGraphs(data.graphs);
    }
    setLoading(false);
  }, [getToken, search, statusFilter]);

  useEffect(() => { loadGraphs(); }, [loadGraphs]);

  useEffect(() => {
    async function loadStats() {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/graphs/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    }
    loadStats();
  }, [getToken]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/graphs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: createName, description: createDesc || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/graph/${data.graph.id}`);
    }
    setCreating(false);
  };

  const handleDelete = async (e: React.MouseEvent, graphId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this graph?')) return;
    const token = await getToken();
    await fetch(`${API_URL}/v1/graphs/${graphId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadGraphs();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Graphs</h2>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const token = await getToken();
                const res = await fetch(`${API_URL}/v1/graphs/seed-test`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  const data = await res.json();
                  router.push(`/graph/${data.graph.id}`);
                }
              }}
              className="px-4 py-2 border border-amber-600 text-amber-400 rounded-md text-sm font-medium hover:bg-amber-600/10"
            >
              Seed Test Graph
            </button>
            <label className="px-4 py-2 border border-border rounded-md text-sm font-medium cursor-pointer hover:bg-accent/50">
              Import
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  try {
                    const data = JSON.parse(text);
                    const token = await getToken();
                    const res = await fetch(`${API_URL}/v1/graphs/import`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify(data),
                    });
                    if (res.ok) {
                      const result = await res.json();
                      router.push(`/graph/${result.graph.id}`);
                    }
                  } catch { /* invalid json */ }
                  e.target.value = '';
                }}
              />
            </label>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              New Graph
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{stats.totalGraphs}</div>
              <div className="text-xs text-muted-foreground">Graphs</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-400">{stats.runningGraphs}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{stats.completedTasks}</div>
              <div className="text-xs text-muted-foreground">Tasks Done</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{stats.totalRuns}</div>
              <div className="text-xs text-muted-foreground">Total Runs</div>
            </div>
          </div>
        )}

        {/* Search and filter */}
        <div className="flex gap-2 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search graphs..."
            className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-md text-sm"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">New Graph</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">Name</label>
                  <input
                    autoFocus
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    placeholder="My workflow"
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Description (optional)</label>
                  <textarea
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="What this graph does..."
                    rows={2}
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm hover:bg-accent/50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createName.trim()}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border rounded-lg p-4 animate-pulse">
                <div className="h-5 w-48 bg-muted rounded mb-2" />
                <div className="h-4 w-72 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : graphs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">No graphs yet</p>
            <p className="text-sm mt-1">Create a new graph to get started</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {graphs.map((graph) => (
              <Link
                key={graph.id}
                href={`/graph/${graph.id}`}
                className="block border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{graph.name}</h3>
                    {graph.description && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{graph.description}</p>
                    )}
                    {graph.tags && graph.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {graph.tags.map((tag) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      graph.status === 'running' ? 'bg-yellow-500/20 text-yellow-400' :
                      graph.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      graph.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {graph.status}
                    </span>
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const token = await getToken();
                        const res = await fetch(`${API_URL}/v1/graphs/${graph.id}/duplicate`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: '{}',
                        });
                        if (res.ok) loadGraphs();
                      }}
                      className="text-xs text-muted-foreground hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, graph.id)}
                      className="text-xs text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
