import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { TaskStatus, TaskType, AgentKind, WorkerStatus } from '@pajamadot/hive-shared';

export interface TaskNodeData {
  title: string;
  type: TaskType;
  status: TaskStatus;
  agentKind: AgentKind;
  input: string;
  outputSummary?: string;
  assignedWorkerId?: string;
  priority: number;
  [key: string]: unknown;
}

export interface ConnectedWorker {
  id: string;
  status: WorkerStatus;
  agentKinds: string[];
  capabilities: string[];
  currentTaskId?: string;
}

interface GraphState {
  graphId: string | null;
  nodes: Node<TaskNodeData>[];
  edges: Edge[];
  workers: ConnectedWorker[];
  selectedNodeId: string | null;

  setGraphId: (id: string) => void;
  setNodes: (nodes: Node<TaskNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node<TaskNodeData>) => void;
  addEdge: (edge: Edge) => void;
  updateNodeStatus: (nodeId: string, status: TaskStatus, workerId?: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setWorkers: (workers: ConnectedWorker[]) => void;
  updateWorkerStatus: (workerId: string, status: WorkerStatus, taskId?: string) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graphId: null,
  nodes: [],
  edges: [],
  workers: [],
  selectedNodeId: null,

  setGraphId: (id) => set({ graphId: id }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  addEdge: (edge) => set((state) => ({ edges: [...state.edges, edge] })),

  updateNodeStatus: (nodeId, status, workerId) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status, assignedWorkerId: workerId ?? n.data.assignedWorkerId } }
          : n,
      ),
    })),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setWorkers: (workers) => set({ workers }),

  updateWorkerStatus: (workerId, status, taskId) =>
    set((state) => ({
      workers: state.workers.map((w) =>
        w.id === workerId ? { ...w, status, currentTaskId: taskId } : w,
      ),
    })),
}));
