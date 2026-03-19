'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { api } from '@/lib/api';
import type { WsMessage, TaskType, GraphUpdatePayload, TaskLogPayload, WorkerStatusPayload } from '@pajamadot/hive-shared';
import type { Node, Edge } from '@xyflow/react';

export default function GraphEditorPage() {
  const params = useParams();
  const graphId = params.id as string;
  const { getToken } = useAuth();

  const { nodes, edges, workers, selectedNodeId, setNodes, setEdges, updateNodeStatus, setSelectedNode, updateWorkerStatus } = useGraphStore();
  const [logs, setLogs] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [graphName, setGraphName] = useState('');

  // Load token
  useEffect(() => {
    getToken().then(setToken);
  }, [getToken]);

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

      const flowNodes: Node<TaskNodeData>[] = tasksRes.tasks.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        type: 'task',
        position: { x: (t.positionX as number) ?? 0, y: (t.positionY as number) ?? 0 },
        data: {
          title: t.title as string,
          type: t.type as TaskType,
          status: t.status as TaskNodeData['status'],
          agentKind: t.agentKind as TaskNodeData['agentKind'],
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

      setNodes(flowNodes);
      setEdges(flowEdges);
    }

    load();
  }, [token, graphId, setNodes, setEdges]);

  // WebSocket for live updates
  const handleWsMessage = useCallback((message: WsMessage) => {
    switch (message.type) {
      case 'graph.update': {
        const payload = message.payload as GraphUpdatePayload;
        for (const t of payload.tasks) {
          updateNodeStatus(t.taskId, t.status, t.assignedWorkerId);
        }
        break;
      }
      case 'task.log': {
        const payload = message.payload as TaskLogPayload;
        setLogs((prev) => [...prev, payload.chunk]);
        break;
      }
      case 'worker.status': {
        const payload = message.payload as WorkerStatusPayload;
        updateWorkerStatus(payload.workerId, payload.status, payload.currentTaskId);
        break;
      }
    }
  }, [updateNodeStatus, updateWorkerStatus]);

  useWebSocket({
    url: `/v1/graphs/${graphId}/ws`,
    token,
    onMessage: handleWsMessage,
  });

  const handleNewNode = useCallback(async (type: TaskType, position: { x: number; y: number }) => {
    if (!token) return;
    const res = await api.createTask(token, graphId, {
      title: `New ${type} task`,
      type,
      positionX: position.x,
      positionY: position.y,
    });
    const t = res.task;
    const node: Node<TaskNodeData> = {
      id: t.id,
      type: 'task',
      position,
      data: {
        title: t.title,
        type: t.type,
        status: t.status,
        agentKind: t.agentKind,
        input: t.input ?? '',
        priority: t.priority,
      },
    };
    useGraphStore.getState().addNode(node);
  }, [token, graphId]);

  const handleNewEdge = useCallback(async (fromId: string, toId: string) => {
    if (!token) return;
    try {
      await api.createEdge(token, graphId, { fromTaskId: fromId, toTaskId: toId });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create edge');
    }
  }, [token, graphId]);

  const handleRunGraph = useCallback(async () => {
    if (!token) return;
    await api.createRun(token, graphId);
  }, [token, graphId]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-2 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
          Back
        </Link>
        <h1 className="text-lg font-semibold flex-1">{graphName || 'Graph'}</h1>
        <button
          onClick={handleRunGraph}
          className="px-4 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
        >
          Run
        </button>
        <UserButton />
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: node palette */}
        <NodeSidebar />

        {/* Center: DAG canvas */}
        <div className="flex-1 flex flex-col">
          <DagCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onNodeClick={(id) => setSelectedNode(id)}
            onNewNode={handleNewNode}
            onNewEdge={handleNewEdge}
          />

          {/* Bottom: terminal + workers */}
          <LogTerminal logs={logs} />
        </div>

        {/* Right sidebar: node detail */}
        {selectedNode && (
          <NodeDetail
            nodeId={selectedNode.id}
            data={selectedNode.data}
            onApprove={async (id) => {
              if (token) await api.approveTask(token, id);
            }}
            onCancel={async (id) => {
              if (token) await api.cancelTask(token, id);
            }}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Workers panel at bottom-left */}
      <WorkerList workers={workers} />
    </div>
  );
}
