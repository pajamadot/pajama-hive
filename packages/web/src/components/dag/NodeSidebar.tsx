'use client';

import type { TaskType } from '@pajamadot/hive-shared';

interface NodeTypeConfig {
  type: TaskType;
  label: string;
  icon: string;
  description: string;
}

const nodeTypes: NodeTypeConfig[] = [
  { type: 'plan', label: 'Plan', icon: 'P', description: 'Generate a task plan' },
  { type: 'code', label: 'Code', icon: 'C', description: 'Write or modify code' },
  { type: 'review', label: 'Review', icon: 'R', description: 'Review code changes' },
  { type: 'test', label: 'Test', icon: 'T', description: 'Run tests' },
  { type: 'lint', label: 'Lint', icon: 'L', description: 'Run linters/formatters' },
  { type: 'docs', label: 'Docs', icon: 'D', description: 'Write documentation' },
  { type: 'custom', label: 'Custom', icon: '*', description: 'Custom command' },
];

export function NodeSidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: TaskType) => {
    event.dataTransfer.setData('application/hive-node-type', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 border-r border-border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Task Types
      </h3>
      {nodeTypes.map((nt) => (
        <div
          key={nt.type}
          draggable
          onDragStart={(e) => onDragStart(e, nt.type)}
          className="flex items-center gap-3 p-2 rounded-md border border-border cursor-grab hover:bg-accent/50 transition-colors active:cursor-grabbing"
        >
          <span className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-sm font-bold">
            {nt.icon}
          </span>
          <div>
            <div className="text-sm font-medium">{nt.label}</div>
            <div className="text-xs text-muted-foreground">{nt.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
