'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, useCallback, useMemo, use } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface WfNode {
  id: string;
  nodeType: string;
  label: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown> | null;
}

interface WfEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  sourceHandle: string | null;
  label: string | null;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isChatFlow: boolean;
}

const NODE_PALETTE = [
  { type: 'llm', label: 'LLM', color: '#a855f7' },
  { type: 'code', label: 'Code', color: '#3b82f6' },
  { type: 'condition', label: 'Condition', color: '#eab308' },
  { type: 'loop', label: 'Loop', color: '#f97316' },
  { type: 'http_request', label: 'HTTP Request', color: '#22c55e' },
  { type: 'plugin', label: 'Plugin', color: '#ec4899' },
  { type: 'knowledge_retrieval', label: 'Knowledge', color: '#06b6d4' },
  { type: 'message', label: 'Message', color: '#6366f1' },
  { type: 'variable', label: 'Variable', color: '#14b8a6' },
  { type: 'text_processor', label: 'Text', color: '#10b981' },
  { type: 'database', label: 'Database', color: '#f59e0b' },
  { type: 'json_transform', label: 'JSON', color: '#84cc16' },
  { type: 'intent_detector', label: 'Intent', color: '#8b5cf6' },
  { type: 'qa', label: 'Q&A', color: '#0ea5e9' },
];

function getNodeColor(nodeType: string) {
  if (nodeType === 'start') return '#22c55e';
  if (nodeType === 'end') return '#ef4444';
  return NODE_PALETTE.find((n) => n.type === nodeType)?.color ?? '#6b7280';
}

// Custom node component for React Flow
function WorkflowNodeComponent({ data }: { data: { label: string; nodeType: string } }) {
  const color = getNodeColor(data.nodeType);
  return (
    <div className="rounded-lg border-2 px-4 py-2 min-w-[140px] text-center bg-card shadow-md"
      style={{ borderColor: color }}>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-3 !h-3" />
      <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color }}>{data.nodeType.replace('_', ' ')}</div>
      <div className="text-sm font-medium text-foreground">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-3 !h-3" />
      {data.nodeType === 'condition' && (
        <>
          <Handle type="source" position={Position.Right} id="true" className="!bg-green-500 !w-3 !h-3" style={{ top: '50%' }} />
          <Handle type="source" position={Position.Left} id="false" className="!bg-red-500 !w-3 !h-3" style={{ top: '50%' }} />
        </>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNodeComponent,
};

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [backendNodes, setBackendNodes] = useState<WfNode[]>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const loadWorkflow = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const data = await api.getWorkflow(token, id);
      setWorkflow(data.workflow);
      setBackendNodes(data.nodes ?? []);

      // Convert to React Flow format
      const rfNodes: Node[] = (data.nodes ?? []).map((n: WfNode) => ({
        id: n.id,
        type: 'workflowNode',
        position: { x: n.positionX, y: n.positionY },
        data: { label: n.label, nodeType: n.nodeType, config: n.config },
      }));

      const rfEdges: Edge[] = (data.edges ?? []).map((e: WfEdge) => ({
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        sourceHandle: e.sourceHandle ?? undefined,
        label: e.label ?? undefined,
        animated: true,
        style: { stroke: 'hsl(var(--muted-foreground))' },
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch { /* */ }
    setLoading(false);
  }, [getToken, id, setNodes, setEdges]);

  useEffect(() => { loadWorkflow(); }, [loadWorkflow]);

  const onConnect = useCallback(async (connection: Connection) => {
    const token = await getToken();
    if (!token || !connection.source || !connection.target) return;

    const res = await fetch(`${API_URL}/v1/workflows/${id}/edges`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromNodeId: connection.source,
        toNodeId: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setEdges((eds) => addEdge({
        ...connection,
        id: data.edge.id,
        animated: true,
        style: { stroke: 'hsl(var(--muted-foreground))' },
      }, eds));
    }
  }, [getToken, id, setEdges]);

  // Save node positions on drag end
  const onNodeDragStop = useCallback(async (_: unknown, node: Node) => {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/workflows/nodes/${node.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionX: node.position.x, positionY: node.position.y }),
    });
  }, [getToken]);

  async function addNode(nodeType: string) {
    const token = await getToken();
    if (!token) return;
    const label = NODE_PALETTE.find((n) => n.type === nodeType)?.label ?? nodeType;
    const res = await fetch(`${API_URL}/v1/workflows/${id}/nodes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeType, label, positionX: 250 + Math.random() * 200, positionY: 100 + nodes.length * 100 }),
    });
    if (res.ok) {
      const data = await res.json();
      setNodes((nds) => [...nds, {
        id: data.node.id,
        type: 'workflowNode',
        position: { x: data.node.positionX, y: data.node.positionY },
        data: { label: data.node.label, nodeType: data.node.nodeType, config: null },
      }]);
    }
    setShowPalette(false);
  }

  async function deleteNode(nodeId: string) {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/workflows/nodes/${nodeId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }

  async function handlePublish() {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/workflows/${id}/publish`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    loadWorkflow();
  }

  async function handleRun() {
    const token = await getToken();
    if (!token) return;
    await api.runWorkflow(token, id, {});
  }

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return backendNodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, backendNodes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!workflow) return <div className="p-8">Workflow not found</div>;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/workflows" className="text-sm text-muted-foreground hover:text-foreground">← Workflows</Link>
          <h1 className="text-lg font-semibold">{workflow.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            workflow.status === 'published' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
          }`}>{workflow.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPalette(!showPalette)}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent/50">
            + Add Node
          </button>
          <button onClick={handleRun}
            className="px-3 py-1.5 text-sm border border-green-600 text-green-400 rounded-md hover:bg-green-600/10">
            Test Run
          </button>
          <button onClick={handlePublish}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Publish
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Node palette dropdown */}
        {showPalette && (
          <div className="absolute top-2 left-2 z-20 bg-card border rounded-lg shadow-lg p-3 w-52 max-h-80 overflow-y-auto">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Add Node</div>
            {NODE_PALETTE.map((nt) => (
              <button key={nt.type} onClick={() => addNode(nt.type)}
                className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent/50 flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: nt.color }} />
                {nt.label}
              </button>
            ))}
          </div>
        )}

        {/* React Flow Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            className="bg-background"
          >
            <Background gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(n) => getNodeColor(n.data?.nodeType as string ?? 'default')}
              className="!bg-card !border-border"
            />
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selectedNode && (
          <div className="w-72 border-l bg-card p-4 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm">Node Config</h3>
              <button onClick={() => setSelectedNodeId(null)} className="text-muted-foreground hover:text-foreground">x</button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Type</div>
                <div className="capitalize">{selectedNode.nodeType.replace('_', ' ')}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Label</div>
                <div>{selectedNode.label}</div>
              </div>
              <div className="pt-2">
                <button onClick={() => deleteNode(selectedNode.id)}
                  className="w-full px-2 py-1.5 text-xs text-red-400 border border-red-500/30 rounded hover:bg-red-500/10">
                  Delete Node
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
