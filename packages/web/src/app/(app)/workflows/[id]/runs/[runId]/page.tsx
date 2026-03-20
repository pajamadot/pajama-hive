'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface Trace {
  id: string;
  nodeId: string;
  nodeType: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Run {
  id: string;
  workflowId: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  running: 'bg-yellow-500/20 text-yellow-400',
  pending: 'bg-gray-500/20 text-gray-400',
  skipped: 'bg-gray-500/20 text-gray-400',
};

export default function WorkflowTraceViewer({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = use(params);
  const { getToken } = useAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/v1/workflows/runs/${runId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRun(data.run);
        setTraces(data.traces ?? []);
      }
      setLoading(false);
    }
    load();
  }, [getToken, runId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!run) return <div className="p-8">Run not found</div>;

  const totalDuration = traces.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const totalTokens = traces.reduce((sum, t) => sum + (t.tokenUsage?.total ?? 0), 0);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/workflows/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Workflow</Link>
          <h1 className="text-lg font-semibold">Run Trace</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[run.status] ?? ''}`}>{run.status}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {traces.length} nodes | {totalDuration}ms | {totalTokens} tokens
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Trace timeline */}
        <div className="flex-1 overflow-y-auto p-4">
          {traces.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No traces recorded for this run.</div>
          ) : (
            <div className="space-y-1">
              {traces.map((trace, i) => (
                <div
                  key={trace.id}
                  onClick={() => setSelectedTrace(trace)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    selectedTrace?.id === trace.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent/50'
                  }`}
                >
                  {/* Step number */}
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                    {i + 1}
                  </div>

                  {/* Node type + label */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium capitalize">{trace.nodeType.replace('_', ' ')}</div>
                    {trace.error && <div className="text-xs text-red-400 truncate">{trace.error}</div>}
                  </div>

                  {/* Status */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[trace.status] ?? ''}`}>
                    {trace.status}
                  </span>

                  {/* Duration */}
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {trace.durationMs != null ? `${trace.durationMs}ms` : '-'}
                  </span>

                  {/* Tokens */}
                  {trace.tokenUsage && (
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {trace.tokenUsage.total} tok
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedTrace && (
          <div className="w-96 border-l bg-card p-4 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm">Trace Detail</h3>
              <button onClick={() => setSelectedTrace(null)} className="text-muted-foreground hover:text-foreground">x</button>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Node Type</div>
                <div className="capitalize">{selectedTrace.nodeType.replace('_', ' ')}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[selectedTrace.status] ?? ''}`}>
                  {selectedTrace.status}
                </span>
              </div>
              {selectedTrace.durationMs != null && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Duration</div>
                  <div>{selectedTrace.durationMs}ms</div>
                </div>
              )}
              {selectedTrace.tokenUsage && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Token Usage</div>
                  <div>Prompt: {selectedTrace.tokenUsage.prompt} | Completion: {selectedTrace.tokenUsage.completion} | Total: {selectedTrace.tokenUsage.total}</div>
                </div>
              )}
              {selectedTrace.error && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Error</div>
                  <pre className="text-xs text-red-400 bg-red-500/10 p-2 rounded">{selectedTrace.error}</pre>
                </div>
              )}
              {selectedTrace.input != null && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Input</div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
                    {JSON.stringify(selectedTrace.input, null, 2)}
                  </pre>
                </div>
              )}
              {selectedTrace.output != null && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Output</div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
                    {typeof selectedTrace.output === 'string'
                      ? selectedTrace.output
                      : JSON.stringify(selectedTrace.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
