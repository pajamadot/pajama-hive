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
import NodeConfigPanel from '@/components/workflow/NodeConfigPanel';

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
  { type: 'question_classifier', label: 'Classifier', color: '#7c3aed' },
  { type: 'document_extractor', label: 'Doc Extract', color: '#dc2626' },
  { type: 'parameter_extractor', label: 'Param Extract', color: '#b91c1c' },
  { type: 'list_operator', label: 'List Op', color: '#059669' },
  { type: 'human_input', label: 'Human Input', color: '#d97706' },
  { type: 'agent_call', label: 'Agent', color: '#4f46e5' },
  { type: 'sub_workflow', label: 'Sub-Workflow', color: '#7e22ce' },
  { type: 'trigger_webhook', label: 'Webhook', color: '#0d9488' },
  { type: 'trigger_schedule', label: 'Schedule', color: '#0891b2' },
];

function getNodeColor(nodeType: string) {
  if (nodeType === 'start') return '#22c55e';
  if (nodeType === 'end') return '#ef4444';
  return NODE_PALETTE.find((n) => n.type === nodeType)?.color ?? '#6b7280';
}

// Custom node component for React Flow
function WorkflowNodeComponent({ data }: { data: { label: string; nodeType: string; execStatus?: string } }) {
  const color = getNodeColor(data.nodeType);
  const statusBorder = data.execStatus === 'completed' ? '#22c55e'
    : data.execStatus === 'failed' ? '#ef4444'
    : data.execStatus === 'running' ? '#eab308' : color;
  const statusGlow = data.execStatus === 'completed' ? 'shadow-green-500/20 shadow-lg'
    : data.execStatus === 'failed' ? 'shadow-red-500/20 shadow-lg' : '';

  return (
    <div className={`rounded-lg border-2 px-4 py-2 min-w-[140px] text-center bg-card ${statusGlow}`}
      style={{ borderColor: statusBorder }}>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground">{data.nodeType.replace(/_/g, ' ')}</div>
      <div className="text-[13px] font-medium text-foreground">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      {data.nodeType === 'condition' && (
        <>
          <Handle type="source" position={Position.Right} id="true" className="!bg-green-500 !w-2.5 !h-2.5" style={{ top: '50%' }} />
          <Handle type="source" position={Position.Left} id="false" className="!bg-red-500 !w-2.5 !h-2.5" style={{ top: '50%' }} />
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
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, 'completed' | 'failed' | 'running'>>({});
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

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

  // Push to undo history
  function pushHistory() {
    const snapshot = { nodes: [...nodes], edges: [...edges] };
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), snapshot]);
    setHistoryIndex((prev) => prev + 1);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistoryIndex((i) => i - 1);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryIndex((i) => i + 1);
  }

  async function copyNode() {
    if (!selectedNodeId) return;
    setCopiedNodeId(selectedNodeId);
  }

  async function pasteNode() {
    if (!copiedNodeId) return;
    const source = backendNodes.find((n) => n.id === copiedNodeId);
    if (!source) return;
    const token = await getToken();
    if (!token) return;
    const label = source.nodeType === 'start' || source.nodeType === 'end' ? source.label : `${source.label} (copy)`;
    const res = await fetch(`${API_URL}/v1/workflows/${id}/nodes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeType: source.nodeType, label,
        positionX: source.positionX + 50, positionY: source.positionY + 50,
        config: source.config,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const newNode = data.node;
      setNodes((nds) => [...nds, {
        id: newNode.id, type: 'workflowNode',
        position: { x: newNode.positionX, y: newNode.positionY },
        data: { label: newNode.label, nodeType: newNode.nodeType, config: newNode.config },
      }]);
      setBackendNodes((prev) => [...prev, { ...newNode }]);
      pushHistory();
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'SELECT';

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId && !isInput) {
          e.preventDefault();
          pushHistory();
          deleteNode(selectedNodeId);
        }
      }
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setShowPalette(false);
      }
      // Undo: Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isInput) {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || e.key === 'y') && !isInput) {
        e.preventDefault();
        redo();
      }
      // Copy: Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isInput) {
        copyNode();
      }
      // Paste: Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !isInput) {
        pasteNode();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, historyIndex, copiedNodeId, nodes, edges]);

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
    if (running) return;
    setRunning(true);
    setRunResult(null);
    setNodeStatuses({});
    const token = await getToken();
    if (!token) { setRunning(false); return; }
    try {
      const result = await api.runWorkflow(token, id, {});
      setRunResult(result as Record<string, unknown>);

      // Fetch traces to show per-node status
      const runData = (result as { run?: { id?: string } }).run;
      if (runData?.id) {
        const traceRes = await fetch(`${API_URL}/v1/workflows/runs/${runData.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (traceRes.ok) {
          const traceData = await traceRes.json();
          const traces = (traceData.traces ?? []) as { nodeId: string; status: string }[];
          const statuses: Record<string, 'completed' | 'failed' | 'running'> = {};
          for (const t of traces) {
            statuses[t.nodeId] = t.status === 'completed' ? 'completed' : t.status === 'failed' ? 'failed' : 'running';
          }
          setNodeStatuses(statuses);
        }
      }
    } catch (err) {
      setRunResult({ error: err instanceof Error ? err.message : 'Run failed' });
    }
    setRunning(false);
  }

  // Update node visual status after run
  useEffect(() => {
    if (Object.keys(nodeStatuses).length === 0) return;
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: { ...n.data, execStatus: nodeStatuses[n.id] ?? undefined },
    })));
  }, [nodeStatuses, setNodes]);

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
        <div className="flex items-center gap-3">
          <Link href="/workflows" className="text-xs text-muted-foreground hover:text-foreground">←</Link>
          <h1 className="text-sm font-medium">{workflow.name}</h1>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            workflow.status === 'published' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
          }`}>{workflow.status}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)"
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-20">Undo</button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-20">Redo</button>
          <span className="text-border">|</span>
          <button onClick={() => setShowPalette(!showPalette)}
            className="px-2.5 py-1 text-xs border rounded hover:bg-accent/50">
            + Node
          </button>
          <button onClick={handleRun} disabled={running}
            className="px-2.5 py-1 text-xs border border-green-600/50 text-green-600 rounded hover:bg-green-600/5 disabled:opacity-30">
            {running ? '...' : 'Run'}
          </button>
          <button onClick={handlePublish}
            className="px-2.5 py-1 text-xs bg-foreground text-background rounded hover:opacity-90">
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

        {/* Test Run Result */}
        {runResult && (
          <div className="absolute bottom-2 left-2 right-2 z-10 bg-card border rounded-lg shadow-lg p-3 max-h-48 overflow-y-auto" style={{ marginRight: selectedNode ? '320px' : '0' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">Test Run Result</span>
              <button onClick={() => setRunResult(null)} className="text-xs text-muted-foreground hover:text-foreground">×</button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify(runResult, null, 2)}</pre>
          </div>
        )}

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onTest={async (nodeId, input) => {
              const token = await getToken();
              if (!token) return { error: 'Not authenticated' };
              const res = await fetch(`${API_URL}/v1/workflows/${id}/nodes/${nodeId}/test`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ input }),
              });
              return res.json();
            }}
            onSave={async (nodeId, updates) => {
              const token = await getToken();
              if (!token) return;
              await fetch(`${API_URL}/v1/workflows/nodes/${nodeId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
              });
              // Update local state
              setBackendNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, ...updates, config: updates.config ?? n.config } : n));
              if (updates.label) {
                setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label: updates.label! } } : n));
              }
            }}
            onDelete={deleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}
