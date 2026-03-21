'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface App {
  id: string;
  name: string;
  description: string | null;
  appType: string;
  status: string;
  createdAt: string;
}

export default function AppsPage() {
  const { getToken } = useAuth();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const wsId = await api.getWorkspaceId(token);
        const data = await api.listApps(token, wsId);
        setApps(data.apps ?? []);
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
            <h1 className="text-3xl font-bold">Apps</h1>
            <p className="text-muted-foreground mt-1">Build and deploy standalone applications</p>
          </div>
        </div>

        {apps.length === 0 ? (
          <div className="text-center py-20 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No apps yet</h3>
            <p className="text-muted-foreground">Create apps from your agents and workflows.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <Link key={app.id} href={`/apps/${app.id}`}
                className="block p-4 border rounded-lg hover:border-blue-500 transition-colors">
                <h3 className="font-medium">{app.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{app.description || 'No description'}</p>
                <div className="mt-3 text-xs text-muted-foreground">
                  {app.appType} · {app.status}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
