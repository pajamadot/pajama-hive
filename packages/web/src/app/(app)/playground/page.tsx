'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export default function PlaygroundPage() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [useStreaming, setUseStreaming] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const token = await getToken();
    if (!token) return;

    setSending(true);
    const userMsg = input;
    setInput('');
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(), role: 'user', content: userMsg, createdAt: new Date().toISOString(),
    }]);

    try {
      let convId = conversationId;
      if (!convId) {
        const conv = await api.createConversation(token, { workspaceId: 'default', title: 'Playground' });
        convId = conv.conversation.id;
        setConversationId(convId);
      }

      if (useStreaming) {
        // SSE streaming mode
        const assistantMsgId = crypto.randomUUID();
        setMessages((prev) => [...prev, {
          id: assistantMsgId, role: 'assistant', content: '', createdAt: new Date().toISOString(),
        }]);

        const res = await api.chatStream(token, { conversationId: convId!, message: userMsg });
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content' && parsed.content) {
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + parsed.content }
                    : m,
                ));
              } else if (parsed.type === 'error') {
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + `\n[Error: ${parsed.content}]` }
                    : m,
                ));
              }
            } catch { /* skip */ }
          }
        }
      } else {
        // Non-streaming mode
        const result = await api.chat(token, { conversationId: convId!, message: userMsg });
        setMessages((prev) => [...prev, {
          id: result.message?.id ?? crypto.randomUUID(),
          role: 'assistant',
          content: result.message?.content ?? 'No response',
          createdAt: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        createdAt: new Date().toISOString(),
      }]);
    }
    setSending(false);
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-semibold">Chat Playground</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={useStreaming}
            onChange={(e) => setUseStreaming(e.target.checked)}
            className="rounded" />
          Stream
        </label>
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <h2 className="text-xl font-medium mb-2">Start a conversation</h2>
            <p>Type a message to chat with an AI agent.</p>
            <p className="text-xs mt-2">Configure a model provider in Settings to enable real LLM responses.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-muted text-foreground'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content || (sending ? '...' : '')}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4 max-w-3xl mx-auto w-full shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
