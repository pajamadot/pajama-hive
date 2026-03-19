'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsMessage } from '@pajamadot/hive-shared';

const API_WS_URL = process.env.NEXT_PUBLIC_API_WS_URL ?? 'wss://hive-api.pajamadot.com';

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface UseWebSocketOptions {
  url: string;
  token: string | null;
  onMessage: (message: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  enabled?: boolean;
}

export function useWebSocket({ url, token, onMessage, onOpen, onClose, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectAttemptsRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const connect = useCallback(() => {
    if (!token || !enabled) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    setStatus('connecting');

    const fullUrl = `${API_WS_URL}${url}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(fullUrl);

    ws.onopen = () => {
      setStatus('connected');
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      reconnectAttemptsRef.current = 0;
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        onMessage(msg);
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = (event) => {
      setStatus('disconnected');
      onClose?.();

      // Don't reconnect on intentional close (code 1000) or if disabled
      if (event.code === 1000 || !enabled) return;

      // Exponential backoff with jitter
      const jitter = Math.random() * 1000;
      const delay = Math.min(reconnectDelayRef.current + jitter, MAX_RECONNECT_DELAY);
      reconnectAttemptsRef.current++;

      setStatus('reconnecting');
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY);
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url, token, onMessage, onOpen, onClose, enabled]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000);
      }
    };
  }, [connect]);

  const send = useCallback((message: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { send, status, reconnectAttempts: reconnectAttemptsRef.current };
}
