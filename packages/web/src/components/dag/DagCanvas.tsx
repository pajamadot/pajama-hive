'use client';

import { useCallback, useRef } from 'react';
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
}

export function DagCanvas({
  initialNodes,
  initialEdges,
  onNodeClick,
  onNewNode,
  onNewEdge,
}: DagCanvasProps) {
  const [nodes, setNodes, onNodesChangeFn] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeFn] = useEdgesState(initialEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance<Node<TaskNodeData>, Edge> | null>(null);

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
        edges={edges}
        onNodesChange={onNodesChangeFn}
        onEdgesChange={onEdgesChangeFn}
        onConnect={onConnect}
        onInit={(instance) => { rfInstance.current = instance; }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
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
