'use client';

interface GanttTask {
  id: string;
  title: string;
  type: string;
  status: string;
  agentKind: string;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
}

interface GanttViewProps {
  tasks: GanttTask[];
  runStartedAt: string;
}

const statusColors: Record<string, string> = {
  done: '#22c55e',
  failed: '#ef4444',
  running: '#eab308',
  canceled: '#6b7280',
  pending: '#3b82f6',
  ready: '#3b82f6',
  leased: '#06b6d4',
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function GanttView({ tasks, runStartedAt }: GanttViewProps) {
  const runStart = new Date(runStartedAt).getTime();

  // Find the time range
  const times = tasks
    .filter((t) => t.startedAt)
    .map((t) => ({
      start: new Date(t.startedAt!).getTime() - runStart,
      end: new Date(t.updatedAt).getTime() - runStart,
    }));

  const maxTime = Math.max(...times.map((t) => t.end), 1000);

  // Sort tasks by start time
  const sorted = [...tasks]
    .filter((t) => t.startedAt)
    .sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());

  const notStarted = tasks.filter((t) => !t.startedAt);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
        <span>0s</span>
        <span>{formatMs(maxTime)}</span>
      </div>

      {sorted.map((task) => {
        const start = new Date(task.startedAt!).getTime() - runStart;
        const end = new Date(task.updatedAt).getTime() - runStart;
        const leftPct = (start / maxTime) * 100;
        const widthPct = Math.max(((end - start) / maxTime) * 100, 1);

        return (
          <div key={task.id} className="flex items-center gap-2 h-7">
            <div className="w-32 text-xs truncate text-muted-foreground shrink-0" title={task.title}>
              {task.title}
            </div>
            <div className="flex-1 relative h-5 bg-muted/30 rounded overflow-hidden">
              <div
                className="absolute h-full rounded transition-all"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: statusColors[task.status] ?? '#6b7280',
                  minWidth: '4px',
                }}
                title={`${task.title}: ${formatMs(end - start)}`}
              />
            </div>
            <div className="w-14 text-xs text-muted-foreground text-right shrink-0">
              {task.durationMs != null ? formatMs(task.durationMs) : '—'}
            </div>
          </div>
        );
      })}

      {notStarted.length > 0 && (
        <div className="text-xs text-muted-foreground mt-2 px-1">
          {notStarted.length} task(s) not started
        </div>
      )}
    </div>
  );
}
