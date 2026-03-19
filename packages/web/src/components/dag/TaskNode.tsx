'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TaskNodeData } from '@/stores/graph-store';

const statusColors: Record<string, string> = {
  pending: 'border-gray-500 bg-gray-500/10',
  ready: 'border-blue-500 bg-blue-500/10',
  leased: 'border-cyan-500 bg-cyan-500/10',
  running: 'border-yellow-500 bg-yellow-500/10 animate-pulse',
  done: 'border-green-500 bg-green-500/10',
  failed: 'border-red-500 bg-red-500/10',
  canceled: 'border-gray-400 bg-gray-400/10 opacity-50',
};

const typeIcons: Record<string, string> = {
  plan: 'P',
  code: 'C',
  review: 'R',
  test: 'T',
  lint: 'L',
  docs: 'D',
  custom: '*',
};

function TaskNodeComponent({ data, selected }: NodeProps & { data: TaskNodeData }) {
  const colorClass = statusColors[data.status] ?? statusColors.pending;
  const icon = typeIcons[data.type] ?? '*';

  return (
    <div className={`
      min-w-[160px] rounded-lg border-2 p-3 shadow-md transition-all
      ${colorClass}
      ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
    `}>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-3 !h-3" />

      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{data.title}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <span>{data.status}</span>
            {data.assignedWorkerId && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span className="truncate">{data.assignedWorkerId}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-3 !h-3" />
    </div>
  );
}

export const TaskNode = memo(TaskNodeComponent);
