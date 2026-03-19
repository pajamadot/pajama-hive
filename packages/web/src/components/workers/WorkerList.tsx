'use client';

import type { ConnectedWorker } from '@/stores/graph-store';

interface WorkerListProps {
  workers: ConnectedWorker[];
}

const statusIndicator: Record<string, string> = {
  online: 'bg-green-500',
  busy: 'bg-yellow-500',
  offline: 'bg-gray-500',
};

export function WorkerList({ workers }: WorkerListProps) {
  return (
    <div className="border-t border-border p-4">
      <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
        Workers ({workers.length})
      </h3>
      {workers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workers connected</p>
      ) : (
        <div className="space-y-2">
          {workers.map((worker) => (
            <div key={worker.id} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${statusIndicator[worker.status] ?? statusIndicator.offline}`} />
              <span className="font-mono text-xs truncate flex-1">{worker.id}</span>
              <span className="text-xs text-muted-foreground">{worker.agentKinds.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
