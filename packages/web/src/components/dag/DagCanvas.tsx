'use client';

import { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TaskNode } from './TaskNode';
import type { TaskNodeData } from '@/stores/graph-store';
import type { TaskType } from '@pajamadot/hive-shared';

const nodeTypes = {
  task: TaskNode,
};

interface DagCanvasProps {
  initialNodes: Node<TaskNodeData>[];
  initialEdges: Edge[];
  onNodesChange?: (nodes: Node<TaskNodeData>[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  onNodeClick?: (nodeId: string) => void;
  onNewNode?: (type: TaskType, position: { x: number; y: number }) => void;
  onNewEdge?: (fromId: string, toId: string) => void;
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
  showCriticalPath?: boolean;
}

function computeCriticalPath(nodes: Node<TaskNodeData>[], edges: Edge[]): Set<string> {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const roots = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  let longest: string[] = [];

  function dfs(node: string, path: string[]) {
    const np = [...path, node];
    const neighbors = adj.get(node) ?? [];
    if (neighbors.length === 0) {
      if (np.length > longest.length) longest = np;
      return;
    }
    for (const n of neighbors) dfs(n, np);
  }
  for (const r of roots) dfs(r, []);

  return new Set(longest);
}

export function DagCanvas({
  initialNodes,
  initialEdges,
  onNodeClick,
  onNewNode,
  onNewEdge,
  onNodeDragStop,
  showCriticalPath = false,
}: DagCanvasProps) {
  const [nodes, setNodes, onNodesChangeFn] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeFn] = useEdgesState(initialEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const criticalPathNodes = useMemo(
    () => showCriticalPath ? computeCriticalPath(nodes, edges) : new Set<string>(),
    [showCriticalPath, nodes, edges],
  );

  // Apply animated edges based on task statuses
  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      const targetNode = nodes.find((n) => n.id === e.target);
      const sourceStatus = sourceNode?.data?.status;
      const targetStatus = targetNode?.data?.status;

      const isCritical = showCriticalPath && criticalPathNodes.has(e.source) && criticalPathNodes.has(e.target);

      // Animate edges where source is done and target is running
      const isActive = sourceStatus === 'done' && (targetStatus === 'running' || targetStatus === 'leased');

      return {
        ...e,
        animated: isActive,
        style: {
          stroke: isCritical ? '#f97316' : isActive ? '#eab308' : '#6b7280',
          strokeWidth: isCritical ? 3 : isActive ? 2 : 1,
        },
      };
    });
  }, [edges, nodes, showCriticalPath, criticalPathNodes]);

  const onConnect: OnConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge(params, eds));
      if (params.source && params.target) {
        onNewEdge?.(params.source, params.target);
      }
    },
    [setEdges, onNewEdge],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/hive-node-type') as TaskType;
      if (!type || !rfInstance.current || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.current.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      onNewNode?.(type, position);
    },
    [onNewNode],
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChangeFn}
        onEdgesChange={onEdgesChangeFn}
        onConnect={onConnect}
        onInit={(instance) => { rfInstance.current = instance as unknown as ReactFlowInstance; }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        onNodeDragStop={(_, node) => onNodeDragStop?.(node.id, node.position)}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        className="bg-background"
      >
        <Background gap={16} size={1} className="!bg-background" />
        <Controls className="!bg-card !border-border" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor={(n) => {
            const data = n.data as TaskNodeData;
            switch (data?.status) {
              case 'done': return '#22c55e';
              case 'running': return '#eab308';
              case 'failed': return '#ef4444';
              case 'ready': return '#3b82f6';
              default: return '#6b7280';
            }
          }}
        />
      </ReactFlow>
    </div>
  );
}
