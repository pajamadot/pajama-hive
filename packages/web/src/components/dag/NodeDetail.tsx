'use client';

import type { TaskNodeData } from '@/stores/graph-store';

interface NodeDetailProps {
  nodeId: string;
  data: TaskNodeData;
  onApprove?: (taskId: string) => void;
  onCancel?: (taskId: string) => void;
  onClose: () => void;
}

export function NodeDetail({ nodeId, data, onApprove, onCancel, onClose }: NodeDetailProps) {
  return (
    <div className="w-80 border-l border-border bg-card p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{data.title}</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-lg"
        >
          x
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground uppercase">Type</label>
          <p className="text-sm font-medium">{data.type}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase">Status</label>
          <p className="text-sm font-medium">{data.status}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase">Agent</label>
          <p className="text-sm font-medium">{data.agentKind}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase">Priority</label>
          <p className="text-sm font-medium">{data.priority}</p>
        </div>

        {data.assignedWorkerId && (
          <div>
            <label className="text-xs text-muted-foreground uppercase">Worker</label>
            <p className="text-sm font-mono">{data.assignedWorkerId}</p>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground uppercase">Input</label>
          <pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {data.input || '(empty)'}
          </pre>
        </div>

        {data.outputSummary && (
          <div>
            <label className="text-xs text-muted-foreground uppercase">Output</label>
            <pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {data.outputSummary}
            </pre>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {(data.status === 'pending' || data.status === 'ready') && (
            <button
              onClick={() => onApprove?.(nodeId)}
              className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              Approve
            </button>
          )}
          {data.status !== 'done' && data.status !== 'failed' && data.status !== 'canceled' && (
            <button
              onClick={() => onCancel?.(nodeId)}
              className="flex-1 px-3 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
