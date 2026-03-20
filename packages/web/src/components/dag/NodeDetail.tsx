'use client';

import { useState } from 'react';
import type { TaskNodeData } from '@/stores/graph-store';
import type { TaskType, AgentKind } from '@pajamadot/hive-shared';

interface NodeDetailProps {
  nodeId: string;
  data: TaskNodeData;
  onApprove?: (taskId: string) => void;
  onCancel?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onUpdate?: (taskId: string, updates: Record<string, unknown>) => void;
  onClose: () => void;
}

const taskTypes: TaskType[] = ['plan', 'code', 'review', 'test', 'lint', 'docs', 'custom'];
const agentKinds: AgentKind[] = ['cc', 'cx', 'generic'];

export function NodeDetail({ nodeId, data, onApprove, onCancel, onRetry, onDelete, onUpdate, onClose }: NodeDetailProps) {
  const [editingInput, setEditingInput] = useState(false);
  const [inputDraft, setInputDraft] = useState(data.input);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.title);

  const isEditable = data.status === 'pending' || data.status === 'ready' || data.status === 'draft' as string;

  const handleSaveInput = () => {
    if (inputDraft !== data.input) {
      onUpdate?.(nodeId, { input: inputDraft });
    }
    setEditingInput(false);
  };

  const handleSaveTitle = () => {
    if (titleDraft !== data.title) {
      onUpdate?.(nodeId, { title: titleDraft });
    }
    setEditingTitle(false);
  };

  return (
    <div className="w-80 border-l border-border bg-card p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
            className="text-lg font-semibold bg-background border border-border rounded px-2 py-0.5 w-full mr-2"
          />
        ) : (
          <h3
            className={`text-lg font-semibold ${isEditable ? 'cursor-pointer hover:text-primary' : ''}`}
            onClick={() => isEditable && setEditingTitle(true)}
          >
            {data.title}
          </h3>
        )}
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg shrink-0 ml-2">
          x
        </button>
      </div>

      <div className="space-y-3">
        {/* Type selector */}
        <div>
          <label className="text-xs text-muted-foreground uppercase">Type</label>
          {isEditable ? (
            <select
              value={data.type}
              onChange={(e) => onUpdate?.(nodeId, { type: e.target.value })}
              className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-sm"
            >
              {taskTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <p className="text-sm font-medium">{data.type}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase">Status</label>
          <p className="text-sm font-medium">{data.status}</p>
        </div>

        {/* Agent kind selector */}
        <div>
          <label className="text-xs text-muted-foreground uppercase">Agent</label>
          {isEditable ? (
            <select
              value={data.agentKind}
              onChange={(e) => onUpdate?.(nodeId, { agentKind: e.target.value })}
              className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-sm"
            >
              {agentKinds.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          ) : (
            <p className="text-sm font-medium">{data.agentKind}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase">Priority</label>
          {isEditable ? (
            <input
              type="number"
              min={0}
              max={1000}
              value={data.priority}
              onChange={(e) => onUpdate?.(nodeId, { priority: parseInt(e.target.value) || 100 })}
              className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded-md text-sm"
            />
          ) : (
            <p className="text-sm font-medium">{data.priority}</p>
          )}
        </div>

        {data.assignedWorkerId && (
          <div>
            <label className="text-xs text-muted-foreground uppercase">Worker</label>
            <p className="text-sm font-mono">{data.assignedWorkerId}</p>
          </div>
        )}

        {/* Editable input */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase">Input / Prompt</label>
            {isEditable && !editingInput && (
              <button
                onClick={() => { setInputDraft(data.input); setEditingInput(true); }}
                className="text-xs text-primary hover:underline"
              >
                Edit
              </button>
            )}
          </div>
          {editingInput ? (
            <div className="mt-1">
              <textarea
                autoFocus
                value={inputDraft}
                onChange={(e) => setInputDraft(e.target.value)}
                rows={6}
                className="w-full px-2 py-1.5 bg-background border border-border rounded-md text-xs font-mono resize-y"
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={handleSaveInput}
                  className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingInput(false)}
                  className="px-2 py-1 border border-border rounded text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {data.input || '(empty — click Edit to add a prompt)'}
            </pre>
          )}
        </div>

        {data.outputSummary && (
          <div>
            <label className="text-xs text-muted-foreground uppercase">Output</label>
            <pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {data.outputSummary}
            </pre>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {(data.status === 'pending' || data.status === 'ready') && (
            <button
              onClick={() => onApprove?.(nodeId)}
              className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              Approve
            </button>
          )}
          {(data.status === 'failed' || data.status === 'canceled') && (
            <button
              onClick={() => onRetry?.(nodeId)}
              className="flex-1 px-3 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700"
            >
              Retry
            </button>
          )}
          {data.status !== 'done' && data.status !== 'failed' && data.status !== 'canceled' && (
            <button
              onClick={() => onCancel?.(nodeId)}
              className="flex-1 px-3 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:opacity-90"
            >
              Cancel
            </button>
          )}
          {data.status !== 'running' && data.status !== 'leased' && (
            <button
              onClick={() => { if (confirm('Delete this task?')) onDelete?.(nodeId); }}
              className="px-3 py-2 border border-red-500/30 text-red-400 rounded-md text-sm hover:bg-red-500/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
