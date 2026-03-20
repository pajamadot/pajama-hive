'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

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

const NODE_TYPES = [
  { type: 'llm', label: 'LLM', color: 'bg-purple-500/20 border-purple-500' },
  { type: 'code', label: 'Code', color: 'bg-blue-500/20 border-blue-500' },
  { type: 'condition', label: 'Condition', color: 'bg-yellow-500/20 border-yellow-500' },
  { type: 'loop', label: 'Loop', color: 'bg-orange-500/20 border-orange-500' },
  { type: 'http_request', label: 'HTTP Request', color: 'bg-green-500/20 border-green-500' },
  { type: 'plugin', label: 'Plugin', color: 'bg-pink-500/20 border-pink-500' },
  { type: 'knowledge_retrieval', label: 'Knowledge', color: 'bg-cyan-500/20 border-cyan-500' },
  { type: 'message', label: 'Message', color: 'bg-indigo-500/20 border-indigo-500' },
  { type: 'variable', label: 'Variable', color: 'bg-teal-500/20 border-teal-500' },
  { type: 'text_processor', label: 'Text Processor', color: 'bg-emerald-500/20 border-emerald-500' },
  { type: 'database', label: 'Database', color: 'bg-amber-500/20 border-amber-500' },
  { type: 'sub_workflow', label: 'Sub-Workflow', color: 'bg-violet-500/20 border-violet-500' },
  { type: 'json_transform', label: 'JSON Transform', color: 'bg-lime-500/20 border-lime-500' },
  { type: 'batch', label: 'Batch', color: 'bg-rose-500/20 border-rose-500' },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

function nodeColor(type: string) {
  const found = NODE_TYPES.find((n) => n.type === type);
  if (found) return found.color;
  if (type === 'start') return 'bg-green-600/20 border-green-600';
  if (type === 'end') return 'bg-red-500/20 border-red-500';
  return 'bg-muted border-border';
}

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes] = useState<WfNode[]>([]);
  const [edges, setEdges] = useState<WfEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<WfNode | null>(null);
  const [showPalette, setShowPalette] = useState(false);

  const loadWorkflow = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const data = await api.getWorkflow(token, id);
      setWorkflow(data.workflow);
      setNodes(data.nodes ?? []);
      setEdges(data.edges ?? []);
    } catch { /* */ }
    setLoading(false);
  }, [getToken, id]);

  useEffect(() => { loadWorkflow(); }, [loadWorkflow]);

  async function addNode(nodeType: string) {
    const token = await getToken();
    if (!token) return;

    const label = NODE_TYPES.find((n) => n.type === nodeType)?.label ?? nodeType;
    const res = await fetch(`${API_URL}/v1/workflows/${id}/nodes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeType, label, positionX: 250 + Math.random() * 200, positionY: 100 + nodes.length * 80 }),
    });
    if (res.ok) {
      const data = await res.json();
      setNodes((prev) => [...prev, { ...data.node, config: null }]);
    }
    setShowPalette(false);
  }

  async function deleteNode(nodeId: string) {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/workflows/nodes/${nodeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId));
    if (selectedNode?.id === nodeId) setSelectedNode(null);
  }

  async function handlePublish() {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/workflows/${id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    loadWorkflow();
  }

  async function handleRun() {
    const token = await getToken();
    if (!token) return;
    await api.runWorkflow(token, id, {});
  }

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
          {workflow.isChatFlow && <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">Chat Flow</span>}
        </div>
        <div className="flex items-center gap-2">
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

      {/* Canvas + Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[length:20px_20px] overflow-auto">
          {/* Add node button */}
          <button onClick={() => setShowPalette(!showPalette)}
            className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            + Add Node
          </button>

          {/* Node palette */}
          {showPalette && (
            <div className="absolute top-14 left-4 z-20 bg-card border rounded-lg shadow-lg p-3 w-52 max-h-80 overflow-y-auto">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Node Types</div>
              {NODE_TYPES.map((nt) => (
                <button key={nt.type} onClick={() => addNode(nt.type)}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent/50 flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-sm border ${nt.color}`} />
                  {nt.label}
                </button>
              ))}
            </div>
          )}

          {/* Render edges as SVG lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minHeight: '800px', minWidth: '800px' }}>
            {edges.map((edge) => {
              const from = nodes.find((n) => n.id === edge.fromNodeId);
              const to = nodes.find((n) => n.id === edge.toNodeId);
              if (!from || !to) return null;
              const x1 = from.positionX + 80;
              const y1 = from.positionY + 30;
              const x2 = to.positionX + 80;
              const y2 = to.positionY;
              return (
                <path key={edge.id}
                  d={`M${x1},${y1} C${x1},${y1 + 40} ${x2},${y2 - 40} ${x2},${y2}`}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="2" fill="none" opacity="0.5"
                />
              );
            })}
          </svg>

          {/* Render nodes */}
          {nodes.map((node) => (
            <div
              key={node.id}
              onClick={() => setSelectedNode(node)}
              className={`absolute cursor-pointer border rounded-lg px-4 py-2 min-w-[160px] text-center transition-shadow hover:shadow-lg ${
                nodeColor(node.nodeType)
              } ${selectedNode?.id === node.id ? 'ring-2 ring-primary' : ''}`}
              style={{ left: node.positionX, top: node.positionY }}
            >
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">{node.nodeType}</div>
              <div className="text-sm font-medium">{node.label}</div>
            </div>
          ))}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              Click "+ Add Node" to start building your workflow
            </div>
          )}
        </div>

        {/* Node detail panel */}
        {selectedNode && (
          <div className="w-80 border-l bg-card p-4 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Node Config</h3>
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground text-sm">×</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
                <div className="text-sm capitalize">{selectedNode.nodeType.replace('_', ' ')}</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
                <input type="text" value={selectedNode.label}
                  onChange={(e) => setSelectedNode({ ...selectedNode, label: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm bg-background" />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Position</label>
                <div className="flex gap-2">
                  <input type="number" value={Math.round(selectedNode.positionX)}
                    onChange={(e) => setSelectedNode({ ...selectedNode, positionX: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border rounded text-sm bg-background" placeholder="X" />
                  <input type="number" value={Math.round(selectedNode.positionY)}
                    onChange={(e) => setSelectedNode({ ...selectedNode, positionY: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border rounded text-sm bg-background" placeholder="Y" />
                </div>
              </div>

              {selectedNode.nodeType === 'llm' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Model Prompt</label>
                  <textarea rows={4}
                    value={(selectedNode.config as Record<string, string>)?.prompt ?? ''}
                    onChange={(e) => setSelectedNode({ ...selectedNode, config: { ...selectedNode.config, prompt: e.target.value } })}
                    className="w-full px-2 py-1 border rounded text-sm bg-background font-mono resize-y"
                    placeholder="Enter prompt for this LLM node..." />
                </div>
              )}

              {selectedNode.nodeType === 'code' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Code</label>
                  <textarea rows={8}
                    value={(selectedNode.config as Record<string, string>)?.code ?? ''}
                    onChange={(e) => setSelectedNode({ ...selectedNode, config: { ...selectedNode.config, code: e.target.value } })}
                    className="w-full px-2 py-1 border rounded text-sm bg-background font-mono resize-y"
                    placeholder="// JavaScript code..." />
                </div>
              )}

              {selectedNode.nodeType === 'http_request' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
                    <input type="text"
                      value={(selectedNode.config as Record<string, string>)?.url ?? ''}
                      onChange={(e) => setSelectedNode({ ...selectedNode, config: { ...selectedNode.config, url: e.target.value } })}
                      className="w-full px-2 py-1 border rounded text-sm bg-background" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Method</label>
                    <select
                      value={(selectedNode.config as Record<string, string>)?.method ?? 'GET'}
                      onChange={(e) => setSelectedNode({ ...selectedNode, config: { ...selectedNode.config, method: e.target.value } })}
                      className="w-full px-2 py-1 border rounded text-sm bg-background">
                      <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
                    </select>
                  </div>
                </>
              )}

              {selectedNode.nodeType === 'condition' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Condition Expression</label>
                  <input type="text"
                    value={(selectedNode.config as Record<string, string>)?.expression ?? ''}
                    onChange={(e) => setSelectedNode({ ...selectedNode, config: { ...selectedNode.config, expression: e.target.value } })}
                    className="w-full px-2 py-1 border rounded text-sm bg-background font-mono"
                    placeholder="{{input.value}} > 10" />
                </div>
              )}

              <div className="pt-2 border-t flex gap-2">
                <button onClick={async () => {
                  const token = await getToken();
                  if (!token) return;
                  await fetch(`${API_URL}/v1/workflows/nodes/${selectedNode.id}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label: selectedNode.label, positionX: selectedNode.positionX, positionY: selectedNode.positionY, config: selectedNode.config }),
                  });
                }} className="flex-1 px-2 py-1 text-sm border rounded hover:bg-accent/50">Save</button>
                <button onClick={() => deleteNode(selectedNode.id)}
                  className="px-2 py-1 text-sm text-red-400 border border-red-500/30 rounded hover:bg-red-500/10">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
