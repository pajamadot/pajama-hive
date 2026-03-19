'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface SystemHealth {
  overall: string;
  scores: { scheduling: number; execution: number; reliability: number; planning: number; evolution: number };
  activeWorkers: number;
  activeRuns: number;
  taskSuccessRate: number;
  avgTaskDurationMs: number;
  lastUpdated: string;
}

interface MetaEvent {
  id: string;
  kind: string;
  severity: string;
  domain: string;
  title: string;
  body: string;
  suggestions: string[] | null;
  resolved: string;
  createdAt: string;
}

interface Retrospective {
  id: string;
  runId: string;
  graphId: string;
  summary: string;
  durationMs: number;
  tasksTotal: number;
  tasksSucceeded: number;
  tasksFailed: number;
  observations: string[] | null;
  lessonsLearned: string[] | null;
  suggestedImprovements: string[] | null;
  createdAt: string;
}

const severityColors: Record<string, string> = {
  info: 'bg-blue-500/20 text-blue-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  critical: 'bg-red-500/20 text-red-400',
};

const kindIcons: Record<string, string> = {
  observation: 'O',
  reflection: 'R',
  suggestion: 'S',
  anomaly: '!',
  milestone: 'M',
  retrospective: 'T',
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{score}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function MetaDashboardPage() {
  const { getToken } = useAuth();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [events, setEvents] = useState<MetaEvent[]>([]);
  const [retrospectives, setRetrospectives] = useState<Retrospective[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    const [healthRes, eventsRes, retroRes] = await Promise.all([
      fetch(`${API_URL}/v1/meta/health`, { headers }),
      fetch(`${API_URL}/v1/meta/events?limit=20`, { headers }),
      fetch(`${API_URL}/v1/meta/retrospectives?limit=10`, { headers }),
    ]);

    if (healthRes.ok) setHealth((await healthRes.json()).health);
    if (eventsRes.ok) setEvents((await eventsRes.json()).events);
    if (retroRes.ok) setRetrospectives((await retroRes.json()).retrospectives);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleStartObserver = async () => {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/meta/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchData();
  };

  const handleResolveEvent = async (eventId: string) => {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/meta/events/${eventId}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution: 'true' }),
    });
    fetchData();
  };

  const overallColor = health?.overall === 'healthy' ? 'text-green-400'
    : health?.overall === 'degraded' ? 'text-yellow-400'
    : 'text-red-400';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">Back</Link>
          <h1 className="text-xl font-bold">Meta Observatory</h1>
          <span className="text-xs text-muted-foreground">System self-awareness & monitoring</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleStartObserver} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs">
            Start Observer
          </button>
          <UserButton />
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>
      ) : (
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Health Overview */}
          <section>
            <h2 className="text-lg font-semibold mb-4">System Health</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Overall status */}
              <div className="border border-border rounded-lg p-6 text-center">
                <div className={`text-4xl font-bold ${overallColor}`}>
                  {health?.overall?.toUpperCase() ?? 'UNKNOWN'}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {health?.activeWorkers ?? 0} workers | {health?.activeRuns ?? 0} active runs
                </div>
                <div className="text-sm text-muted-foreground">
                  {((health?.taskSuccessRate ?? 0) * 100).toFixed(0)}% success rate (24h)
                </div>
              </div>

              {/* Score breakdown */}
              <div className="border border-border rounded-lg p-6 space-y-3 col-span-2">
                <ScoreBar label="Scheduling" score={health?.scores.scheduling ?? 0} />
                <ScoreBar label="Execution" score={health?.scores.execution ?? 0} />
                <ScoreBar label="Reliability" score={health?.scores.reliability ?? 0} />
                <ScoreBar label="Planning" score={health?.scores.planning ?? 0} />
                <ScoreBar label="Evolution" score={health?.scores.evolution ?? 0} />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Meta Events */}
            <section>
              <h2 className="text-lg font-semibold mb-4">
                Observations & Anomalies
                <span className="text-xs text-muted-foreground ml-2">
                  ({events.filter((e) => e.resolved === 'false').length} unresolved)
                </span>
              </h2>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No events yet. Start the observer to begin monitoring.</p>
                ) : events.map((event) => (
                  <div key={event.id} className={`border border-border rounded-lg p-3 ${event.resolved !== 'false' ? 'opacity-50' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                        {kindIcons[event.kind] ?? '?'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${severityColors[event.severity] ?? ''}`}>
                            {event.severity}
                          </span>
                          <span className="text-xs text-muted-foreground">{event.domain}</span>
                        </div>
                        <p className="text-sm font-medium mt-1">{event.title}</p>
                        {event.suggestions && event.suggestions.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {event.suggestions.map((s, i) => (
                              <p key={i} className="text-xs text-muted-foreground">- {s}</p>
                            ))}
                          </div>
                        )}
                      </div>
                      {event.resolved === 'false' && (
                        <button
                          onClick={() => handleResolveEvent(event.id)}
                          className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Retrospectives */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Run Retrospectives</h2>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {retrospectives.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No retrospectives yet. Complete a run to generate one.</p>
                ) : retrospectives.map((retro) => (
                  <div key={retro.id} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{retro.summary}</span>
                      <span className="text-xs text-muted-foreground">
                        {(retro.durationMs / 1000).toFixed(0)}s
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                      <span className="text-green-400">{retro.tasksSucceeded} passed</span>
                      {retro.tasksFailed > 0 && <span className="text-red-400">{retro.tasksFailed} failed</span>}
                      <span>{retro.tasksTotal} total</span>
                    </div>
                    {retro.observations && retro.observations.length > 0 && (
                      <div className="text-xs space-y-0.5 mt-2 border-t border-border pt-2">
                        {retro.observations.map((o, i) => (
                          <p key={i} className="text-muted-foreground">{o}</p>
                        ))}
                      </div>
                    )}
                    {retro.suggestedImprovements && retro.suggestedImprovements.length > 0 && (
                      <div className="text-xs space-y-0.5 mt-2 border-t border-border pt-2">
                        <p className="font-medium text-primary">Suggestions:</p>
                        {retro.suggestedImprovements.map((s, i) => (
                          <p key={i} className="text-muted-foreground">- {s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
