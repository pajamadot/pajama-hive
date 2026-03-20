'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { DagCanvas } from '@/components/dag/DagCanvas';
import { NodeSidebar } from '@/components/dag/NodeSidebar';
import { NodeDetail } from '@/components/dag/NodeDetail';
import { LogTerminal } from '@/components/terminal/LogTerminal';
import { WorkerList } from '@/components/workers/WorkerList';
import { useGraphStore, type TaskNodeData } from '@/stores/graph-store';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getLayoutedElements } from '@/lib/layout';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useKeyboardShortcuts, ShortcutHelp } from '@/hooks/useKeyboardShortcuts';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { WsMessage, TaskType, GraphUpdatePayload, TaskLogPayload, WorkerStatusPayload } from '@pajamadot/hive-shared';
import type { Node, Edge } from '@xyflow/react';

export default function GraphEditorPage() {
  const params = useParams();
  const graphId = params.id as string;
  const { getToken } = useAuth();

  const store = useGraphStore();
  const [logs, setLogs] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [graphName, setGraphName] = useState('');
  const [graphStatus, setGraphStatus] = useState('draft');
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [showWorkers, setShowWorkers] = useState(false);
  const [showCriticalPath, setShowCriticalPath] = useState(false);

  useEffect(() => { getToken().then(setToken); }, [getToken]);

  // Load graph data
  useEffect(() => {
    if (!token) return;
    async function load() {
      const [graphRes, tasksRes, edgesRes] = await Promise.all([
        api.getGraph(token!, graphId),
        api.listTasks(token!, graphId),
        api.listEdges(token!, graphId),
      ]);

      setGraphName(graphRes.graph.name);
      setGraphStatus(graphRes.graph.status);

      const flowNodes: Node<TaskNodeData>[] = tasksRes.tasks.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        type: 'task',
        position: { x: (t.positionX as number) ?? 0, y: (t.positionY as number) ?? 0 },
        data: {
          title: t.title as string,
          type: t.type as TaskType,
          status: (t.status as TaskNodeData['status']),
          agentKind: (t.agentKind as TaskNodeData['agentKind']),
          input: (t.input as string) ?? '',
          outputSummary: t.outputSummary as string | undefined,
          assignedWorkerId: t.assignedWorkerId as string | undefined,
          priority: (t.priority as number) ?? 100,
        },
      }));

      const flowEdges: Edge[] = edgesRes.edges.map((e: Record<string, unknown>) => ({
        id: e.id as string,
        source: e.fromTaskId as string,
        target: e.toTaskId as string,
      }));

      // Auto-layout if nodes don't have positions
      const needsLayout = flowNodes.every((n) => n.position.x === 0 && n.position.y === 0);
      if (needsLayout && flowNodes.length > 0) {
        const { nodes: laid, edges: laidEdges } = getLayoutedElements(flowNodes, flowEdges);
        store.setNodes(laid);
        store.setEdges(laidEdges);
      } else {
        store.setNodes(flowNodes);
        store.setEdges(flowEdges);
      }
    }
    load();
  }, [token, graphId]);

  // WebSocket
  const handleWsMessage = useCallback((message: WsMessage) => {
    switch (message.type) {
      case 'graph.update': {
        const payload = message.payload as GraphUpdatePayload;
        for (const t of payload.tasks) {
          store.updateNodeStatus(t.taskId, t.status, t.assignedWorkerId);
          if (t.status === 'done') toast.success(`Task ${t.taskId.slice(0, 8)} completed`);
          else if (t.status === 'failed') toast.error(`Task ${t.taskId.slice(0, 8)} failed`);
        }
        const graphPayload = message.payload as { status?: string };
        if ('status' in graphPayload && graphPayload.status) {
          setGraphStatus(graphPayload.status);
          setCurrentRunId(null);
          if (graphPayload.status === 'completed') toast.success('Run completed');
          else if (graphPayload.status === 'failed') toast.error('Run failed');
        }
        break;
      }
      case 'task.log': {
        const payload = message.payload as TaskLogPayload;
        setLogs((prev) => [...prev.slice(-500), payload.chunk]);
        break;
      }
      case 'worker.status': {
        const payload = message.payload as WorkerStatusPayload;
        store.updateWorkerStatus(payload.workerId, payload.status, payload.currentTaskId);
        break;
      }
    }
  }, []);

  const { status: wsStatus } = useWebSocket({ url: `/v1/graphs/${graphId}/ws`, token, onMessage: handleWsMessage });

  const handleNewNode = useCallback(async (type: TaskType, position: { x: number; y: number }) => {
    if (!token) return;
    const res = await api.createTask(token, graphId, {
      title: `New ${type} task`,
      type,
      positionX: position.x,
      positionY: position.y,
    });
    const t = res.task;
    store.addNode({
      id: t.id,
      type: 'task',
      position,
      data: { title: t.title, type: t.type, status: t.status, agentKind: t.agentKind, input: t.input ?? '', priority: t.priority },
    });
  }, [token, graphId]);

  const handleNewEdge = useCallback(async (fromId: string, toId: string) => {
    if (!token) return;
    try {
      await api.createEdge(token, graphId, { fromTaskId: fromId, toTaskId: toId });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create edge — may cause a cycle');
    }
  }, [token, graphId]);

  // Debounced position save — avoids spamming API during drag
  const positionSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const handleNodeDragStop = useCallback((nodeId: string, position: { x: number; y: number }) => {
    if (!token) return;
    const existing = positionSaveTimers.current.get(nodeId);
    if (existing) clearTimeout(existing);
    positionSaveTimers.current.set(nodeId, setTimeout(async () => {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com'}/v1/tasks/${nodeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionX: position.x, positionY: position.y }),
      });
      positionSaveTimers.current.delete(nodeId);
    }, 500));
  }, [token]);

  const handleUpdateTask = useCallback(async (taskId: string, updates: Record<string, unknown>) => {
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com'}/v1/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const { task: updated } = await res.json();
      store.setNodes(store.nodes.map((n) =>
        n.id === taskId ? { ...n, data: { ...n.data, ...updates } } : n,
      ));
    }
  }, [token, store.nodes]);

  const handleRunGraph = useCallback(async () => {
    if (!token) return;
    const res = await api.createRun(token, graphId);
    setGraphStatus('running');
    setCurrentRunId(res.run?.id ?? null);
  }, [token, graphId]);

  const handleCancelRun = useCallback(async () => {
    if (!token || !currentRunId) return;
    await api.cancelRun(token, graphId, currentRunId);
    setGraphStatus('failed');
    setCurrentRunId(null);
    toast.info('Run canceled');
  }, [token, graphId, currentRunId]);

  const handleAutoLayout = useCallback(() => {
    const { nodes: laid, edges: laidEdges } = getLayoutedElements(store.nodes, store.edges);
    store.setNodes(laid);
    store.setEdges(laidEdges);
  }, [store.nodes, store.edges]);

  const handleDeleteSelected = useCallback(async () => {
    const id = store.selectedNodeId;
    if (!id || !token) return;
    const node = store.nodes.find((n) => n.id === id);
    if (!node || node.data.status === 'running' || node.data.status === 'leased') return;
    if (!confirm(`Delete task "${node.data.title}"?`)) return;
    await api.deleteTask(token, id);
    store.setNodes(store.nodes.filter((n) => n.id !== id));
    store.setEdges(store.edges.filter((e) => e.source !== id && e.target !== id));
    store.setSelectedNode(null);
  }, [store.selectedNodeId, store.nodes, store.edges, token]);

  const shortcutDefs = [
    { key: 'Enter', ctrl: true, description: 'Start a run', action: handleRunGraph },
    { key: 'l', ctrl: true, description: 'Auto layout', action: handleAutoLayout },
    { key: 'z', ctrl: true, description: 'Undo', action: () => store.undo() },
    { key: 'y', ctrl: true, description: 'Redo', action: () => store.redo() },
    { key: 'Delete', description: 'Delete selected node', action: handleDeleteSelected },
    { key: 'Backspace', description: 'Delete selected node', action: handleDeleteSelected },
    { key: 'Escape', description: 'Deselect node', action: () => store.setSelectedNode(null) },
  ];
  const { showHelp, setShowHelp } = useKeyboardShortcuts(shortcutDefs);

  const selectedNode = store.nodes.find((n) => n.id === store.selectedNodeId);
  const hasPlanTasks = store.nodes.some((n) => n.id.startsWith('plan-') && n.data.status === 'pending');

  const handleApprovePlans = useCallback(async () => {
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com'}/v1/graphs/${graphId}/plans/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    // Reload
    const tasksRes = await api.listTasks(token, graphId);
    store.setNodes(store.nodes.map((n) => {
      const updated = tasksRes.tasks.find((t: Record<string, unknown>) => t.id === n.id);
      return updated ? { ...n, data: { ...n.data, status: updated.status as TaskNodeData['status'] } } : n;
    }));
  }, [token, graphId, store.nodes]);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">Back</Link>
        <h1
          className="text-lg font-semibold cursor-pointer hover:text-primary"
          onClick={() => {
            const newName = prompt('Graph name:', graphName);
            if (newName && newName !== graphName && token) {
              fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com'}/v1/graphs/${graphId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
              }).then(() => setGraphName(newName));
            }
          }}
          title="Click to rename"
        >{graphName || 'Graph'}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          graphStatus === 'running' ? 'bg-yellow-500/20 text-yellow-400' :
          graphStatus === 'completed' ? 'bg-green-500/20 text-green-400' :
          graphStatus === 'failed' ? 'bg-red-500/20 text-red-400' :
          'bg-muted text-muted-foreground'
        }`}>{graphStatus}</span>
        {/* WS connection indicator */}
        <span className={`flex items-center gap-1.5 text-xs ${
          wsStatus === 'connected' ? 'text-green-400' :
          wsStatus === 'reconnecting' ? 'text-yellow-400' :
          wsStatus === 'connecting' ? 'text-blue-400' :
          'text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            wsStatus === 'connected' ? 'bg-green-400' :
            wsStatus === 'reconnecting' ? 'bg-yellow-400 animate-pulse' :
            wsStatus === 'connecting' ? 'bg-blue-400 animate-pulse' :
            'bg-red-400'
          }`} />
          {wsStatus === 'connected' ? 'Live' : wsStatus}
        </span>

        {/* Task summary */}
        <span className="text-xs text-muted-foreground">
          {store.nodes.length} tasks
          {store.nodes.filter((n) => n.data.status === 'done').length > 0 &&
            ` · ${store.nodes.filter((n) => n.data.status === 'done').length} done`}
          {store.nodes.filter((n) => n.data.status === 'failed').length > 0 &&
            ` · ${store.nodes.filter((n) => n.data.status === 'failed').length} failed`}
        </span>

        <div className="flex-1" />

        <button
          onClick={async () => {
            if (!token) return;
            const data = await api.exportGraph(token, graphId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${graphName || 'graph'}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Graph exported');
          }}
          className="px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent/50"
        >
          Export
        </button>
        <Link
          href={`/graph/${graphId}/runs`}
          className="px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent/50"
        >
          Run History
        </Link>

        {(graphStatus === 'completed' || graphStatus === 'failed') && (
          <button
            onClick={async () => {
              if (!token) return;
              await api.resetGraph(token, graphId);
              setGraphStatus('draft');
              // Reload tasks to show reset statuses
              const tasksRes = await api.listTasks(token, graphId);
              store.setNodes(store.nodes.map((n) => {
                const t = tasksRes.tasks.find((t: Record<string, unknown>) => t.id === n.id);
                return t ? { ...n, data: { ...n.data, status: (t.status as TaskNodeData['status']) } } : n;
              }));
              toast.success('Graph reset to draft');
            }}
            className="px-3 py-1.5 border border-blue-500 text-blue-400 rounded-md text-xs font-medium hover:bg-blue-500/10"
          >
            Reset &amp; Re-run
          </button>
        )}

        {hasPlanTasks && (
          <button
            onClick={handleApprovePlans}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700"
          >
            Approve Plan Tasks
          </button>
        )}

        <button
          onClick={() => setShowCriticalPath(!showCriticalPath)}
          className={`px-3 py-1.5 border rounded-md text-xs ${showCriticalPath ? 'border-orange-500 text-orange-400 bg-orange-500/10' : 'border-border hover:bg-accent/50'}`}
        >
          Critical Path
        </button>
        <button
          onClick={handleAutoLayout}
          className="px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent/50"
        >
          Auto Layout
        </button>
        <button
          onClick={() => setShowWorkers(!showWorkers)}
          className="px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent/50"
        >
          Workers ({store.workers.length})
        </button>
        {graphStatus === 'running' ? (
          <button
            onClick={handleCancelRun}
            className="px-4 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
          >
            Stop Run
          </button>
        ) : (
          <button
            onClick={handleRunGraph}
            className="px-4 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
          >
            Run
          </button>
        )}
        <ThemeToggle />
        <UserButton />
      </header>

      {showHelp && <ShortcutHelp shortcuts={shortcutDefs} onClose={() => setShowHelp(false)} />}

      <div className="flex-1 flex overflow-hidden">
        <NodeSidebar />

        <div className="flex-1 flex flex-col">
          <DagCanvas
            initialNodes={store.nodes}
            initialEdges={store.edges}
            onNodeClick={(id) => store.setSelectedNode(id)}
            onNewNode={handleNewNode}
            onNewEdge={handleNewEdge}
            onDeleteEdge={async (edgeId) => {
              if (token) await api.deleteEdge(token, edgeId);
            }}
            onNodeDragStop={handleNodeDragStop}
            showCriticalPath={showCriticalPath}
            highlightedNodeId={store.selectedNodeId}
          />
          <LogTerminal logs={logs} />
        </div>

        {selectedNode && (
          <NodeDetail
            nodeId={selectedNode.id}
            data={selectedNode.data}
            onApprove={async (id) => { if (token) await api.approveTask(token, id); }}
            onCancel={async (id) => { if (token) await api.cancelTask(token, id); }}
            onRetry={async (id) => {
              if (!token) return;
              await api.retryTask(token, id);
              store.updateNodeStatus(id, 'pending');
            }}
            onLoadLogs={async (id) => {
              if (!token) return { logs: [] };
              return api.getTaskLogs(token, id);
            }}
            onDelete={async (id) => {
              if (!token) return;
              await api.deleteTask(token, id);
              store.setNodes(store.nodes.filter((n) => n.id !== id));
              store.setEdges(store.edges.filter((e) => e.source !== id && e.target !== id));
              store.setSelectedNode(null);
              toast.success('Task deleted');
            }}
            onUpdate={handleUpdateTask}
            onClose={() => store.setSelectedNode(null)}
          />
        )}

        {showWorkers && !selectedNode && (
          <div className="w-64 border-l border-border bg-card overflow-y-auto">
            <WorkerList workers={store.workers} />
          </div>
        )}
      </div>
    </div>
  );
}
