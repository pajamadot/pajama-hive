'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isChatFlow: boolean;
  createdAt: string;
}

export default function WorkflowsPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const data = await api.listWorkflows(token, 'default');
        setWorkflows(data.workflows ?? []);
      } catch { /* workspace may not exist yet */ }
      setLoading(false);
    }
    load();
  }, [getToken]);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    const token = await getToken();
    if (!token) { setCreating(false); return; }
    try {
      try { await api.createWorkspace(token, { name: 'Default', slug: 'default' }); } catch { /* already exists */ }
      const data = await api.createWorkflow(token, { name: 'New Workflow', workspaceId: 'default' });
      const wfId = data.workflow?.id;
      if (wfId) router.push(`/workflows/${wfId}`);
    } catch { /* */ }
    setCreating(false);
  }

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
            <h1 className="text-3xl font-bold">Workflows</h1>
            <p className="text-muted-foreground mt-1">Visual workflow editor for AI pipelines</p>
          </div>
          <button onClick={handleCreate} disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {creating ? 'Creating...' : 'Create Workflow'}
          </button>
        </div>

        {workflows.length === 0 ? (
          <div className="text-center py-20 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No workflows yet</h3>
            <p className="text-muted-foreground mb-4">Create visual AI workflows with drag-and-drop nodes.</p>
            <button onClick={handleCreate} disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Workflow'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((wf) => (
              <Link key={wf.id} href={`/workflows/${wf.id}`}
                className="block p-4 border rounded-lg hover:border-blue-500 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium truncate">{wf.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    wf.status === 'published' ? 'bg-green-500/20 text-green-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {wf.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{wf.description || 'No description'}</p>
                <div className="mt-3 text-xs text-muted-foreground">
                  {wf.isChatFlow ? 'Chat Flow' : 'Workflow'} · {new Date(wf.createdAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
