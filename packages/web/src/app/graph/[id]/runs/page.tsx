'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { api } from '@/lib/api';

interface RunTask {
  id: string;
  title: string;
  type: string;
  status: string;
  agentKind: string;
  assignedWorkerId?: string;
  attempt: number;
  outputSummary?: string;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
}

interface Retrospective {
  id: string;
  summary: string;
  durationMs: number;
  tasksTotal: number;
  tasksSucceeded: number;
  tasksFailed: number;
  tasksRetried: number;
  criticalPathTasks: string[];
  observations: string[];
  lessonsLearned: string[];
  suggestedImprovements: string[];
}

interface Run {
  id: string;
  graphId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface RunDetail {
  run: Run;
  tasks: RunTask[];
  retrospective: Retrospective | null;
}

const statusColors: Record<string, string> = {
  running: 'bg-yellow-500/20 text-yellow-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  pending: 'bg-muted text-muted-foreground',
  done: 'bg-green-500/20 text-green-400',
  ready: 'bg-blue-500/20 text-blue-400',
  leased: 'bg-purple-500/20 text-purple-400',
  canceled: 'bg-muted text-muted-foreground line-through',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function RunHistoryPage() {
  const params = useParams();
  const graphId = params.id as string;
  const { getToken } = useAuth();

  const [runs, setRuns] = useState<Run[]>([]);
  const [graphName, setGraphName] = useState('');
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      const [graphRes, runsRes] = await Promise.all([
        api.getGraph(token, graphId),
        api.listRuns(token, graphId),
      ]);
      setGraphName(graphRes.graph.name);
      setRuns(runsRes.runs);
      setLoading(false);
    }
    load();
  }, [getToken, graphId]);

  const loadRunDetail = useCallback(async (runId: string) => {
    const token = await getToken();
    if (!token) return;
    const detail = await api.getRunDetail(token, runId);
    setSelectedRun(detail);
  }, [getToken]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading runs...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
        <Link href={`/graph/${graphId}`} className="text-muted-foreground hover:text-foreground text-sm">
          Back to Graph
        </Link>
        <h1 className="text-lg font-semibold">{graphName || 'Graph'}</h1>
        <span className="text-xs text-muted-foreground">Run History</span>
        <div className="flex-1" />
        <UserButton />
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Run list */}
        <div className="w-80 border-r border-border overflow-y-auto">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Runs ({runs.length})
            </h2>
          </div>
          {runs.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No runs yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => loadRunDetail(run.id)}
                  className={`w-full text-left p-3 hover:bg-accent/50 transition-colors ${
                    selectedRun?.run.id === run.id ? 'bg-accent/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[run.status] ?? statusColors.pending}`}>
                      {run.status}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{run.id.slice(0, 8)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatTime(run.startedAt)}
                  </div>
                  {run.startedAt && run.completedAt && (
                    <div className="text-xs text-muted-foreground">
                      Duration: {formatDuration(new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime())}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Run detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedRun ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a run to view details
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Run header */}
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold font-mono">{selectedRun.run.id}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[selectedRun.run.status] ?? statusColors.pending}`}>
                  {selectedRun.run.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Started</div>
                  <div className="mt-1">{formatTime(selectedRun.run.startedAt)}</div>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Completed</div>
                  <div className="mt-1">{formatTime(selectedRun.run.completedAt)}</div>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">Duration</div>
                  <div className="mt-1">
                    {selectedRun.run.startedAt && selectedRun.run.completedAt
                      ? formatDuration(new Date(selectedRun.run.completedAt).getTime() - new Date(selectedRun.run.startedAt).getTime())
                      : selectedRun.run.startedAt
                        ? formatDuration(Date.now() - new Date(selectedRun.run.startedAt).getTime())
                        : '—'}
                  </div>
                </div>
              </div>

              {/* Task breakdown */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Tasks ({selectedRun.tasks.length})
                </h3>
                <div className="space-y-1">
                  {selectedRun.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusColors[task.status] ?? statusColors.pending}`}>
                        {task.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{task.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {task.type} · {task.agentKind}
                          {task.durationMs != null && ` · ${formatDuration(task.durationMs)}`}
                          {task.attempt > 0 && ` · ${task.attempt + 1} attempts`}
                          {task.assignedWorkerId && ` · ${task.assignedWorkerId.slice(0, 8)}`}
                        </div>
                      </div>
                      {task.outputSummary && (
                        <div className="text-xs text-muted-foreground max-w-xs truncate">
                          {task.outputSummary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Task status summary bar */}
              {selectedRun.tasks.length > 0 && (
                <div>
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                    {(() => {
                      const total = selectedRun.tasks.length;
                      const done = selectedRun.tasks.filter((t) => t.status === 'done').length;
                      const failed = selectedRun.tasks.filter((t) => t.status === 'failed').length;
                      const running = selectedRun.tasks.filter((t) => t.status === 'running' || t.status === 'leased').length;
                      const pending = total - done - failed - running;
                      return (
                        <>
                          {done > 0 && <div className="bg-green-500" style={{ width: `${(done / total) * 100}%` }} />}
                          {running > 0 && <div className="bg-yellow-500" style={{ width: `${(running / total) * 100}%` }} />}
                          {failed > 0 && <div className="bg-red-500" style={{ width: `${(failed / total) * 100}%` }} />}
                          {pending > 0 && <div className="bg-muted" style={{ width: `${(pending / total) * 100}%` }} />}
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{selectedRun.tasks.filter((t) => t.status === 'done').length} done</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />{selectedRun.tasks.filter((t) => t.status === 'running' || t.status === 'leased').length} running</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{selectedRun.tasks.filter((t) => t.status === 'failed').length} failed</span>
                  </div>
                </div>
              )}

              {/* Retrospective */}
              {selectedRun.retrospective && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-card px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Retrospective</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    <p className="text-sm">{selectedRun.retrospective.summary}</p>

                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div className="bg-background rounded-lg p-2">
                        <div className="text-lg font-bold">{selectedRun.retrospective.tasksTotal}</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                      <div className="bg-background rounded-lg p-2">
                        <div className="text-lg font-bold text-green-400">{selectedRun.retrospective.tasksSucceeded}</div>
                        <div className="text-xs text-muted-foreground">Succeeded</div>
                      </div>
                      <div className="bg-background rounded-lg p-2">
                        <div className="text-lg font-bold text-red-400">{selectedRun.retrospective.tasksFailed}</div>
                        <div className="text-xs text-muted-foreground">Failed</div>
                      </div>
                      <div className="bg-background rounded-lg p-2">
                        <div className="text-lg font-bold text-yellow-400">{selectedRun.retrospective.tasksRetried}</div>
                        <div className="text-xs text-muted-foreground">Retried</div>
                      </div>
                    </div>

                    {selectedRun.retrospective.observations.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Observations</h4>
                        <ul className="space-y-1">
                          {selectedRun.retrospective.observations.map((obs, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                              <span className="text-blue-400 shrink-0">*</span>
                              {obs}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedRun.retrospective.lessonsLearned.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Lessons Learned</h4>
                        <ul className="space-y-1">
                          {selectedRun.retrospective.lessonsLearned.map((lesson, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                              <span className="text-amber-400 shrink-0">*</span>
                              {lesson}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedRun.retrospective.suggestedImprovements.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Suggested Improvements</h4>
                        <ul className="space-y-1">
                          {selectedRun.retrospective.suggestedImprovements.map((sug, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                              <span className="text-green-400 shrink-0">*</span>
                              {sug}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedRun.retrospective.criticalPathTasks.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Critical Path</h4>
                        <div className="flex items-center gap-1 flex-wrap">
                          {selectedRun.retrospective.criticalPathTasks.map((taskId, i) => (
                            <span key={taskId} className="flex items-center gap-1">
                              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{taskId.slice(0, 8)}</span>
                              {i < selectedRun.retrospective!.criticalPathTasks.length - 1 && (
                                <span className="text-muted-foreground">-&gt;</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
