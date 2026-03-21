'use client';

import { useState, useEffect } from 'react';

interface NodeConfig {
  id: string;
  nodeType: string;
  label: string;
  config: Record<string, unknown> | null;
}

interface Props {
  node: NodeConfig;
  onSave: (nodeId: string, updates: { label?: string; config?: Record<string, unknown> }) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  onTest?: (nodeId: string, input: unknown) => Promise<unknown>;
}

export default function NodeConfigPanel({ node, onSave, onDelete, onClose, onTest }: Props) {
  const [label, setLabel] = useState(node.label);
  const [config, setConfig] = useState<Record<string, unknown>>(node.config ?? {});
  const [dirty, setDirty] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setLabel(node.label);
    setConfig(node.config ?? {});
    setDirty(false);
  }, [node.id, node.label, node.config]);

  function updateConfig(key: string, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    onSave(node.id, { label, config });
    setDirty(false);
  }

  return (
    <div className="w-80 border-l bg-card flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Node Config</h3>
          {dirty && <span className="w-2 h-2 bg-yellow-500 rounded-full" title="Unsaved changes" />}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">×</button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Common: Label */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
          <input type="text" value={label} onChange={(e) => { setLabel(e.target.value); setDirty(true); }}
            className="w-full px-2 py-1.5 border rounded text-sm bg-background" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
          <div className="text-sm capitalize px-2 py-1.5 bg-muted rounded">{node.nodeType.replace(/_/g, ' ')}</div>
        </div>

        {/* Type-specific config */}
        {node.nodeType === 'llm' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Prompt</label>
              <textarea rows={6} value={(config.prompt as string) ?? ''}
                onChange={(e) => updateConfig('prompt', e.target.value)}
                placeholder="Enter the prompt for this LLM node..."
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Temperature</label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="2" step="0.1"
                  value={(config.temperature as number) ?? 0.7}
                  onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
                  className="flex-1" />
                <span className="text-xs w-8 text-right">{(config.temperature as number) ?? 0.7}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Max Tokens</label>
              <input type="number" value={(config.maxTokens as number) ?? ''} placeholder="Default"
                onChange={(e) => updateConfig('maxTokens', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background" />
            </div>
          </>
        )}

        {node.nodeType === 'code' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Language</label>
              <select value={(config.language as string) ?? 'javascript'}
                onChange={(e) => updateConfig('language', e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background">
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Code</label>
              <textarea rows={10} value={(config.code as string) ?? ''}
                onChange={(e) => updateConfig('code', e.target.value)}
                placeholder="// Write your code here\nreturn input;"
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
            </div>
          </>
        )}

        {node.nodeType === 'condition' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Condition Expression</label>
            <textarea rows={3} value={(config.expression as string) ?? ''}
              onChange={(e) => updateConfig('expression', e.target.value)}
              placeholder="{{value}} > 10 && {{status}} === 'active'"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
            <p className="text-[10px] text-muted-foreground mt-1">Use {'{{variable}}'} to reference upstream outputs. Returns true/false for branching.</p>
          </div>
        )}

        {node.nodeType === 'http_request' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Method</label>
              <select value={(config.method as string) ?? 'GET'}
                onChange={(e) => updateConfig('method', e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background">
                <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
              <input type="text" value={(config.url as string) ?? ''} placeholder="https://api.example.com/endpoint"
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Headers (JSON)</label>
              <textarea rows={3} value={config.headers ? JSON.stringify(config.headers, null, 2) : ''}
                onChange={(e) => { try { updateConfig('headers', JSON.parse(e.target.value)); } catch { /* invalid json */ } }}
                placeholder='{"Content-Type": "application/json"}'
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Body (JSON)</label>
              <textarea rows={4} value={config.body ? JSON.stringify(config.body, null, 2) : ''}
                onChange={(e) => { try { updateConfig('body', JSON.parse(e.target.value)); } catch { /* invalid json */ } }}
                placeholder='{"key": "{{value}}"}'
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
            </div>
          </>
        )}

        {node.nodeType === 'knowledge_retrieval' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Knowledge Base ID</label>
              <input type="text" value={(config.knowledgeBaseId as string) ?? ''}
                onChange={(e) => updateConfig('knowledgeBaseId', e.target.value)}
                placeholder="kb_..."
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Top K Results</label>
              <input type="number" min="1" max="20" value={(config.topK as number) ?? 5}
                onChange={(e) => updateConfig('topK', parseInt(e.target.value))}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Query</label>
              <input type="text" value={(config.query as string) ?? ''}
                onChange={(e) => updateConfig('query', e.target.value)}
                placeholder="{{input}} (uses upstream output by default)"
                className="w-full px-2 py-1.5 border rounded text-sm bg-background" />
            </div>
          </>
        )}

        {node.nodeType === 'plugin' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tool ID</label>
              <input type="text" value={(config.toolId as string) ?? ''}
                onChange={(e) => updateConfig('toolId', e.target.value)}
                placeholder="tool_..."
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Input (JSON)</label>
              <textarea rows={4} value={config.input ? JSON.stringify(config.input, null, 2) : ''}
                onChange={(e) => { try { updateConfig('input', JSON.parse(e.target.value)); } catch { /* */ } }}
                placeholder='{"query": "{{input}}"}'
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
            </div>
          </>
        )}

        {node.nodeType === 'variable' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Variable Name</label>
              <input type="text" value={(config.name as string) ?? ''}
                onChange={(e) => updateConfig('name', e.target.value)}
                placeholder="result"
                className="w-full px-2 py-1.5 border rounded text-sm bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Value</label>
              <input type="text" value={(config.value as string) ?? ''}
                onChange={(e) => updateConfig('value', e.target.value)}
                placeholder="{{upstream_output}}"
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
            </div>
          </>
        )}

        {node.nodeType === 'text_processor' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Operation</label>
              <select value={(config.operation as string) ?? 'template'}
                onChange={(e) => updateConfig('operation', e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background">
                <option value="template">Template</option>
                <option value="uppercase">Uppercase</option>
                <option value="lowercase">Lowercase</option>
                <option value="trim">Trim</option>
              </select>
            </div>
            {(config.operation ?? 'template') === 'template' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Template</label>
                <textarea rows={4} value={(config.template as string) ?? ''}
                  onChange={(e) => updateConfig('template', e.target.value)}
                  placeholder="Dear {{name}}, your order {{orderId}} is confirmed."
                  className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
              </div>
            )}
          </>
        )}

        {node.nodeType === 'message' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Message</label>
            <textarea rows={4} value={(config.message as string) ?? ''}
              onChange={(e) => updateConfig('message', e.target.value)}
              placeholder="Processing complete. Result: {{result}}"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background resize-y" />
          </div>
        )}

        {node.nodeType === 'loop' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Max Iterations</label>
            <input type="number" min="1" max="1000" value={(config.maxIterations as number) ?? 100}
              onChange={(e) => updateConfig('maxIterations', parseInt(e.target.value))}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background" />
          </div>
        )}

        {node.nodeType === 'batch' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Batch Size</label>
            <input type="number" min="1" max="1000" value={(config.batchSize as number) ?? 10}
              onChange={(e) => updateConfig('batchSize', parseInt(e.target.value))}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background" />
          </div>
        )}

        {node.nodeType === 'database' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Table ID</label>
              <input type="text" value={(config.tableId as string) ?? ''}
                onChange={(e) => updateConfig('tableId', e.target.value)}
                placeholder="tbl_..."
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Operation</label>
              <select value={(config.operation as string) ?? 'read'}
                onChange={(e) => updateConfig('operation', e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm bg-background">
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
              </select>
            </div>
          </>
        )}

        {node.nodeType === 'intent_detector' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Intents (one per line)</label>
            <textarea rows={5} value={((config.intents as string[]) ?? []).join('\n')}
              onChange={(e) => updateConfig('intents', e.target.value.split('\n').filter(Boolean))}
              placeholder="billing\nsupport\nsales\ngeneral"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
          </div>
        )}

        {node.nodeType === 'json_transform' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">JSON Path Expression</label>
            <input type="text" value={(config.expression as string) ?? ''}
              onChange={(e) => updateConfig('expression', e.target.value)}
              placeholder=".data.items[0].name"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
          </div>
        )}

        {node.nodeType === 'qa' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Context</label>
            <textarea rows={6} value={(config.context as string) ?? ''}
              onChange={(e) => updateConfig('context', e.target.value)}
              placeholder="Paste the context text that the Q&A node should use to answer questions..."
              className="w-full px-2 py-1.5 border rounded text-sm bg-background resize-y" />
          </div>
        )}

        {node.nodeType === 'sub_workflow' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Sub-Workflow ID</label>
            <input type="text" value={(config.workflowId as string) ?? ''}
              onChange={(e) => updateConfig('workflowId', e.target.value)}
              placeholder="wf_..."
              className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
          </div>
        )}

        {node.nodeType === 'agent_call' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Agent ID</label>
              <input type="text" value={(config.agentId as string) ?? ''}
                onChange={(e) => updateConfig('agentId', e.target.value)}
                placeholder="agent_..."
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Message Template</label>
              <input type="text" value={(config.message as string) ?? ''}
                onChange={(e) => updateConfig('message', e.target.value)}
                placeholder="{{input}}"
                className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
            </div>
          </>
        )}

        {node.nodeType === 'selector' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Index Expression</label>
            <input type="text" value={(config.expression as string) ?? '0'}
              onChange={(e) => updateConfig('expression', e.target.value)}
              placeholder="0"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono" />
          </div>
        )}

        {node.nodeType === 'variable_assigner' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Assignments (JSON)</label>
            <textarea rows={5} value={config.assignments ? JSON.stringify(config.assignments, null, 2) : ''}
              onChange={(e) => { try { updateConfig('assignments', JSON.parse(e.target.value)); } catch { /* */ } }}
              placeholder='{"x": 1, "y": "hello"}'
              className="w-full px-2 py-1.5 border rounded text-sm bg-background font-mono resize-y" />
          </div>
        )}

        {(node.nodeType === 'start' || node.nodeType === 'end') && (
          <div className="text-sm text-muted-foreground py-4 text-center">
            {node.nodeType === 'start' ? 'Workflow entry point. Connect to the first processing node.' : 'Workflow exit point. Collects final output.'}
          </div>
        )}
      </div>

      {/* Test Section */}
      {onTest && node.nodeType !== 'start' && node.nodeType !== 'end' && (
        <div className="border-t p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Test Node</div>
          <input type="text" value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Test input (text or JSON)"
            className="w-full px-2 py-1.5 border rounded text-xs bg-background font-mono" />
          <button onClick={async () => {
            if (testing) return;
            setTesting(true);
            setTestResult(null);
            try {
              let parsed: unknown = testInput;
              try { parsed = JSON.parse(testInput); } catch { /* use as string */ }
              const result = await onTest(node.id, parsed);
              setTestResult(result);
            } catch (err) {
              setTestResult({ error: err instanceof Error ? err.message : 'Test failed' });
            }
            setTesting(false);
          }} disabled={testing}
            className="w-full px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {testing ? 'Testing...' : 'Run Test'}
          </button>
          {testResult != null && (
            <pre className="text-[10px] bg-muted p-2 rounded max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t p-3 flex gap-2">
        <button onClick={handleSave} disabled={!dirty}
          className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-30">
          {dirty ? 'Save' : 'Saved'}
        </button>
        <button onClick={() => onDelete(node.id)}
          className="px-3 py-1.5 text-sm text-red-400 border border-red-500/30 rounded hover:bg-red-500/10">
          Delete
        </button>
      </div>
    </div>
  );
}
