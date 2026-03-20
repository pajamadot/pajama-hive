'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: string;
  mode: string;
  createdAt: string;
}

export default function AgentsPage() {
  const { getToken } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        // TODO: get workspace ID from context
        const data = await api.listAgents(token, 'default');
        setAgents(data.agents ?? []);
      } catch { /* workspace may not exist yet */ }
      setLoading(false);
    }
    load();
  }, [getToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Agents</h1>
            <p className="text-muted-foreground mt-1">Build and manage AI agents</p>
          </div>
          <Link href="/agents/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create Agent
          </Link>
        </div>

        {agents.length === 0 ? (
          <div className="text-center py-20 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No agents yet</h3>
            <p className="text-muted-foreground mb-4">Create your first AI agent to get started.</p>
            <Link href="/agents/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Create Agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <Link key={agent.id} href={`/agents/${agent.id}`}
                className="block p-4 border rounded-lg hover:border-blue-500 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium truncate">{agent.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    agent.status === 'published' ? 'bg-green-500/20 text-green-400' :
                    agent.status === 'draft' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {agent.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{agent.description || 'No description'}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{agent.mode}</span>
                  <span>·</span>
                  <span>{new Date(agent.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
