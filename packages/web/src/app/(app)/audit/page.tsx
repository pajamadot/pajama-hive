'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface AuditEntry {
  id: string;
  graphId: string | null;
  runId: string | null;
  taskId: string | null;
  workerId: string | null;
  userId: string | null;
  action: string;
  payload: unknown;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  'task.completed': 'text-green-400',
  'task.failed': 'text-red-400',
  'evolution.created': 'text-purple-400',
  'task.assigned': 'text-blue-400',
  'worker.online': 'text-emerald-400',
  'worker.offline': 'text-gray-400',
};

export default function AuditPage() {
  const { getToken } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    const token = await getToken();
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '50');

    const res = await fetch(`${API_URL}/v1/audit?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (cursor) {
        setLogs((prev) => [...prev, ...data.auditLogs]);
      } else {
        setLogs(data.auditLogs);
      }
      setNextCursor(data.nextCursor);
    }
    setLoading(false);
  }, [getToken, actionFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    async function loadActions() {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/audit/actions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions);
      }
    }
    loadActions();
  }, [getToken]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">Back</Link>
          <h1 className="text-xl font-bold">Audit Log</h1>
        </div>
        <UserButton />
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-4">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setLogs([]); setLoading(true); }}
            className="px-3 py-2 bg-background border border-border rounded-md text-sm"
          >
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No audit logs found.</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[140px_150px_1fr_100px_100px] gap-2 px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
              <span>Time</span>
              <span>Action</span>
              <span>Details</span>
              <span>Graph</span>
              <span>Task</span>
            </div>
            {logs.map((entry) => (
              <div key={entry.id} className="grid grid-cols-[140px_150px_1fr_100px_100px] gap-2 px-3 py-2 text-sm border-b border-border/50 hover:bg-accent/30">
                <span className="text-xs text-muted-foreground font-mono">
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
                <span className={`text-xs font-medium ${actionColors[entry.action] ?? 'text-foreground'}`}>
                  {entry.action}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {entry.payload ? JSON.stringify(entry.payload).slice(0, 80) : '—'}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {entry.graphId?.slice(0, 8) ?? '—'}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {entry.taskId?.slice(0, 8) ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="text-center mt-4">
            <button
              onClick={() => load(nextCursor)}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent/50"
            >
              Load More
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
