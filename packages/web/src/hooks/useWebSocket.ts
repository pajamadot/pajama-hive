'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { WsMessage } from '@pajamadot/hive-shared';

const API_WS_URL = process.env.NEXT_PUBLIC_API_WS_URL ?? 'wss://hive-api.pajamadot.com';

interface UseWebSocketOptions {
  url: string;
  token: string | null;
  onMessage: (message: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useWebSocket({ url, token, onMessage, onOpen, onClose }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!token) return;

    const fullUrl = `${API_WS_URL}${url}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(fullUrl);

    ws.onopen = () => {
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        onMessage(msg);
      } catch {
        console.warn('Failed to parse WS message:', event.data);
      }
    };

    ws.onclose = () => {
      onClose?.();
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url, token, onMessage, onOpen, onClose]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { send };
}
