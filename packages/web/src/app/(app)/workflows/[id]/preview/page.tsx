'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface WfNode {
  id: string;
  nodeType: string;
  label: string;
  positionX: number;
  positionY: number;
}

interface WfEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export default function WorkflowPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const [nodes, setNodes] = useState<WfNode[]>([]);
  const [edges, setEdges] = useState<WfEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const data = await api.getWorkflow(token, id);
        setNodes(data.nodes ?? []);
        setEdges(data.edges ?? []);
      } catch { /* */ }
      setLoading(false);
    }
    load();
  }, [getToken, id]);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    const token = await getToken();
    if (token) {
      try {
        let parsedInput = {};
        try { parsedInput = input ? JSON.parse(input) : {}; } catch { parsedInput = { message: input }; }
        const data = await api.runWorkflow(token, id, parsedInput);
        setResult(data);
      } catch (err) {
        setResult({ error: err instanceof Error ? err.message : 'Run failed' });
      }
    }
    setRunning(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/workflows/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Editor</Link>
          <h1 className="text-lg font-semibold">Workflow Preview</h1>
          <span className="text-xs text-muted-foreground">{nodes.length} nodes · {edges.length} edges</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Read-only canvas */}
        <div className="flex-1 relative bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[length:20px_20px] overflow-auto p-8">
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minHeight: '600px', minWidth: '600px' }}>
            {edges.map((edge) => {
              const from = nodes.find((n) => n.id === edge.fromNodeId);
              const to = nodes.find((n) => n.id === edge.toNodeId);
              if (!from || !to) return null;
              return (
                <path key={edge.id}
                  d={`M${from.positionX + 80},${from.positionY + 30} C${from.positionX + 80},${from.positionY + 60} ${to.positionX + 80},${to.positionY - 20} ${to.positionX + 80},${to.positionY}`}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="2" fill="none" opacity="0.4"
                />
              );
            })}
          </svg>
          {nodes.map((node) => (
            <div key={node.id}
              className="absolute border rounded-lg px-4 py-2 min-w-[140px] text-center bg-card/80 border-border"
              style={{ left: node.positionX, top: node.positionY }}>
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">{node.nodeType}</div>
              <div className="text-sm font-medium">{node.label}</div>
            </div>
          ))}
        </div>

        {/* Test panel */}
        <div className="w-80 border-l bg-card p-4 flex flex-col shrink-0">
          <h3 className="font-medium mb-3">Test Run</h3>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder='{"message": "Hello"}'
            className="w-full px-3 py-2 border rounded-lg bg-background text-sm font-mono resize-y mb-3"
          />
          <button onClick={handleRun} disabled={running}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 mb-4">
            {running ? 'Running...' : 'Run Workflow'}
          </button>

          {result != null && (
            <div className="flex-1 overflow-y-auto">
              <div className="text-xs text-muted-foreground mb-1">Result</div>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
