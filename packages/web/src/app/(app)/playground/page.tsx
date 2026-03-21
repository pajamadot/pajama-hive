'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  feedback?: 'thumbs_up' | 'thumbs_down' | null;
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
        const wsId = await api.getWorkspaceId(token);
        const conv = await api.createConversation(token, { workspaceId: wsId, title: 'Playground' });
        convId = conv.conversation.id;
        setConversationId(convId);
      }

      if (useStreaming) {
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
                  m.id === assistantMsgId ? { ...m, content: m.content + parsed.content } : m,
                ));
              }
            } catch { /* skip */ }
          }
        }
      } else {
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
        id: crypto.randomUUID(), role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        createdAt: new Date().toISOString(),
      }]);
    }
    setSending(false);
  }

  async function handleRegenerate(msgId: string) {
    const token = await getToken();
    if (!token) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/v1/conversations/messages/${msgId}/regenerate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => prev.map((m) =>
          m.id === msgId ? { ...m, content: data.message?.content ?? m.content } : m
        ));
      }
    } catch { /* */ }
    setSending(false);
  }

  async function handleFeedback(msgId: string, rating: 'thumbs_up' | 'thumbs_down') {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_URL}/v1/conversations/messages/${msgId}/feedback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, feedback: rating } : m,
    ));
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-sm font-medium">Playground</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
              className="rounded w-3.5 h-3.5" />
            Stream
          </label>
          {conversationId && (
            <button onClick={() => { setMessages([]); setConversationId(null); }}
              className="text-xs text-muted-foreground hover:text-foreground">
              New chat
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-2xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-base font-medium mb-1">New conversation</p>
            <p className="text-sm">Send a message to start chatting.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="mb-5">
            <div className="text-[11px] text-muted-foreground/60 mb-1 uppercase tracking-wide">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className={`text-sm leading-relaxed ${msg.role === 'user' ? '' : ''}`}>
              <p className="whitespace-pre-wrap">{msg.content || (sending && msg.role === 'assistant' ? '...' : '')}</p>
            </div>

            {/* Actions for assistant messages */}
            {msg.role === 'assistant' && msg.content && (
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={() => handleRegenerate(msg.id)}
                  className="text-[11px] text-muted-foreground hover:text-foreground">
                  Regenerate
                </button>
                <span className="text-muted-foreground/30">|</span>
                <button onClick={() => handleFeedback(msg.id, 'thumbs_up')}
                  className={`text-[11px] ${msg.feedback === 'thumbs_up' ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'}`}>
                  Good
                </button>
                <button onClick={() => handleFeedback(msg.id, 'thumbs_down')}
                  className={`text-[11px] ${msg.feedback === 'thumbs_down' ? 'text-red-500' : 'text-muted-foreground hover:text-foreground'}`}>
                  Bad
                </button>
              </div>
            )}

            {msg.role === 'user' && <div className="border-b mt-4 mb-1" />}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4 max-w-2xl mx-auto w-full shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Send a message..."
            className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-3 py-2 bg-foreground text-background text-sm rounded-lg hover:opacity-90 disabled:opacity-30"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
