'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  content: string;
  createdAt: string;
}

export default function PromptsPage() {
  const { getToken } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const data = await api.listPrompts(token, 'default');
        setPrompts(data.prompts ?? []);
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
            <h1 className="text-3xl font-bold">Prompt Library</h1>
            <p className="text-muted-foreground mt-1">Versioned prompt templates for your agents</p>
          </div>
        </div>

        {prompts.length === 0 ? (
          <div className="text-center py-20 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No prompts yet</h3>
            <p className="text-muted-foreground">Create reusable prompt templates with version history.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prompts.map((prompt) => (
              <Link key={prompt.id} href={`/prompts/${prompt.id}`}
                className="block p-4 border rounded-lg hover:border-blue-500 transition-colors">
                <h3 className="font-medium">{prompt.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{prompt.description || 'No description'}</p>
                <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded max-h-20 overflow-hidden">
                  {prompt.content.slice(0, 200)}
                </pre>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
