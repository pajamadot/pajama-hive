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
  timeoutMs?: number;
  maxRetries?: number;
  [key: string]: unknown;
}

export interface ConnectedWorker {
  id: string;
  status: WorkerStatus;
  agentKinds: string[];
  capabilities: string[];
  currentTaskId?: string;
}

interface Snapshot {
  nodes: Node<TaskNodeData>[];
  edges: Edge[];
}

const MAX_HISTORY = 30;

interface GraphState {
  graphId: string | null;
  nodes: Node<TaskNodeData>[];
  edges: Edge[];
  workers: ConnectedWorker[];
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;

  // Undo/redo
  history: Snapshot[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  setGraphId: (id: string) => void;
  setNodes: (nodes: Node<TaskNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node<TaskNodeData>) => void;
  addEdge: (edge: Edge) => void;
  updateNodeStatus: (nodeId: string, status: TaskStatus, workerId?: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  toggleSelectedNode: (nodeId: string) => void;
  clearSelection: () => void;
  setWorkers: (workers: ConnectedWorker[]) => void;
  updateWorkerStatus: (workerId: string, status: WorkerStatus, taskId?: string) => void;
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graphId: null,
  nodes: [],
  edges: [],
  workers: [],
  selectedNodeId: null,
  selectedNodeIds: new Set<string>(),
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  setGraphId: (id) => set({ graphId: id }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  addNode: (node) => {
    const state = get();
    state.pushSnapshot();
    set({ nodes: [...state.nodes, node] });
  },
  addEdge: (edge) => {
    const state = get();
    state.pushSnapshot();
    set({ edges: [...state.edges, edge] });
  },

  updateNodeStatus: (nodeId, status, workerId) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, status, assignedWorkerId: workerId ?? n.data.assignedWorkerId } }
          : n,
      ),
    })),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  toggleSelectedNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.selectedNodeIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { selectedNodeIds: next, selectedNodeId: next.size === 1 ? [...next][0] : null };
    }),

  clearSelection: () => set({ selectedNodeId: null, selectedNodeIds: new Set() }),

  setWorkers: (workers) => set({ workers }),

  updateWorkerStatus: (workerId, status, taskId) =>
    set((state) => ({
      workers: state.workers.map((w) =>
        w.id === workerId ? { ...w, status, currentTaskId: taskId } : w,
      ),
    })),

  pushSnapshot: () => {
    const state = get();
    const snap: Snapshot = { nodes: [...state.nodes], edges: [...state.edges] };
    const history = state.history.slice(0, state.historyIndex + 1);
    history.push(snap);
    if (history.length > MAX_HISTORY) history.shift();
    set({ history, historyIndex: history.length - 1, canUndo: true, canRedo: false });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return;
    const snap = state.history[state.historyIndex];
    set({
      nodes: snap.nodes,
      edges: snap.edges,
      historyIndex: state.historyIndex - 1,
      canUndo: state.historyIndex - 1 >= 0,
      canRedo: true,
    });
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    const nextIndex = state.historyIndex + 1;
    // If we're at the end, the "redo" is the current state which is already applied
    if (nextIndex < state.history.length) {
      const snap = state.history[nextIndex];
      set({
        nodes: snap.nodes,
        edges: snap.edges,
        historyIndex: nextIndex,
        canUndo: true,
        canRedo: nextIndex < state.history.length - 1,
      });
    }
  },
}));
