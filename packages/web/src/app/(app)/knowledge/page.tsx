'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  totalChunks: number;
  status: string;
  createdAt: string;
}

export default function KnowledgePage() {
  const { getToken } = useAuth();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const data = await api.listKnowledgeBases(token, 'default');
        setKbs(data.knowledgeBases ?? []);
      } catch { /* */ }
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
            <h1 className="text-3xl font-bold">Knowledge Bases</h1>
            <p className="text-muted-foreground mt-1">Manage RAG knowledge bases for your agents</p>
          </div>
        </div>

        {kbs.length === 0 ? (
          <div className="text-center py-20 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No knowledge bases yet</h3>
            <p className="text-muted-foreground">Upload documents to create a searchable knowledge base.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kbs.map((kb) => (
              <Link key={kb.id} href={`/knowledge/${kb.id}`}
                className="block p-4 border rounded-lg hover:border-blue-500 transition-colors">
                <h3 className="font-medium">{kb.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{kb.description || 'No description'}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{kb.documentCount} docs</span>
                  <span>{kb.totalChunks} chunks</span>
                  <span className={kb.status === 'active' ? 'text-green-400' : 'text-yellow-400'}>{kb.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
