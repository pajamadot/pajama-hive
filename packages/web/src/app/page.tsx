'use client';

import { useAuth, UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Graph {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

export default function DashboardPage() {
  const { getToken } = useAuth();
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/graphs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGraphs(data.graphs);
      }
      setLoading(false);
    }
    load();
  }, [getToken]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Pajama Hive</h1>
        <UserButton />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Graphs</h2>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
            New Graph
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : graphs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">No graphs yet</p>
            <p className="text-sm mt-1">Create a new graph to get started</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {graphs.map((graph) => (
              <Link
                key={graph.id}
                href={`/graph/${graph.id}`}
                className="block border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{graph.name}</h3>
                    {graph.description && (
                      <p className="text-sm text-muted-foreground mt-1">{graph.description}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    graph.status === 'running' ? 'bg-yellow-500/20 text-yellow-400' :
                    graph.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    graph.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {graph.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
