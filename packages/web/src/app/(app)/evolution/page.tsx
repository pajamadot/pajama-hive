'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface EvolveGraph {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
}

const targetAreas = ['scheduling', 'ui', 'api', 'cli', 'docs', 'tests', 'performance', 'security'];
const scopes = [
  { value: 'minor', label: 'Minor — 1-3 files, small focused change' },
  { value: 'moderate', label: 'Moderate — several files, feature addition' },
  { value: 'major', label: 'Major — large refactor or new system' },
];

export default function EvolutionPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [graphs, setGraphs] = useState<EvolveGraph[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [goal, setGoal] = useState('');
  const [targetArea, setTargetArea] = useState('');
  const [scope, setScope] = useState('minor');
  const [creating, setCreating] = useState(false);

  const loadGraphs = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/v1/self-improve`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setGraphs(data.graphs);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { loadGraphs(); }, [loadGraphs]);

  const handleCreate = async () => {
    if (!goal.trim()) return;
    setCreating(true);
    const token = await getToken();
    if (!token) return;

    const res = await fetch(`${API_URL}/v1/self-improve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, targetArea: targetArea || undefined, scope }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/graph/${data.graph.id}`);
    } else {
      alert('Failed to create improvement task');
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">Back</Link>
          <h1 className="text-xl font-bold">Evolution Lab</h1>
          <span className="text-xs text-muted-foreground">Self-improving codebase</span>
        </div>
        <UserButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero banner */}
        <div className="border border-border rounded-lg p-6 mb-8 bg-gradient-to-r from-primary/5 to-transparent">
          <h2 className="text-2xl font-semibold mb-2">Teach the hive to improve itself</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Create self-improvement tasks that analyze the Pajama Hive codebase and submit PRs.
            Each improvement is tracked as a DAG, executed by agents, and reviewed by humans.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
          >
            New Improvement
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="border border-border rounded-lg p-6 mb-6 bg-card">
            <h3 className="text-lg font-semibold mb-4">Create Self-Improvement Task</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Goal</label>
                <textarea
                  autoFocus
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g., Add comprehensive error handling to all API routes with structured error responses"
                  rows={3}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Target Area</label>
                  <select
                    value={targetArea}
                    onChange={(e) => setTargetArea(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                  >
                    <option value="">General (auto-detect)</option>
                    {targetAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Scope</label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                  >
                    {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent/50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !goal.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create & Open'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Evolution stats */}
        {graphs.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{graphs.length}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{graphs.filter((g) => g.status === 'completed').length}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-400">{graphs.filter((g) => g.status === 'running').length}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-400">{graphs.filter((g) => g.status === 'failed').length}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
        )}

        {/* List */}
        <h3 className="text-lg font-semibold mb-4">Improvement History</h3>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : graphs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No self-improvements yet.</p>
            <p className="text-sm mt-1">Create one to start evolving the system.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {graphs.map((g) => (
              <Link
                key={g.id}
                href={`/graph/${g.id}`}
                className="block border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{g.name}</p>
                    {g.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      g.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      g.status === 'running' ? 'bg-yellow-500/20 text-yellow-400' :
                      g.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-muted text-muted-foreground'
                    }`}>{g.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(g.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
