'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Plugin {
  id: string;
  name: string;
  description: string | null;
  pluginType: string;
  status: string;
  createdAt: string;
}

export default function PluginsPage() {
  const { getToken } = useAuth();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const data = await api.listPlugins(token, 'default');
        setPlugins(data.plugins ?? []);
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
            <h1 className="text-3xl font-bold">Plugins</h1>
            <p className="text-muted-foreground mt-1">Create and manage API plugins for your agents</p>
          </div>
        </div>

        {plugins.length === 0 ? (
          <div className="text-center py-20 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No plugins yet</h3>
            <p className="text-muted-foreground">Register API plugins to extend agent capabilities.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plugins.map((plugin) => (
              <Link key={plugin.id} href={`/plugins/${plugin.id}`}
                className="block p-4 border rounded-lg hover:border-blue-500 transition-colors">
                <h3 className="font-medium">{plugin.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{plugin.description || 'No description'}</p>
                <div className="mt-3 text-xs text-muted-foreground">
                  {plugin.pluginType} · {plugin.status}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
