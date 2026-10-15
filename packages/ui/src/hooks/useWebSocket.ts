import { useEffect, useRef, useState, useCallback } from "react";

import { WS_SUBPROTOCOL, serviceProtocols, serviceUrl } from "@orbitring/shared/src/protocol";

declare global {
  interface Window { orbit?: { serviceToken?: () => string } }
}

const offeredProtocols = () => {
  const token = window.orbit?.serviceToken?.();
  return token ? serviceProtocols(token) : [WS_SUBPROTOCOL];
};

type ConnectionState = "connecting" | "connected" | "disconnected";
type MessageHandler = (msg: any) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>("disconnected");
  const handlersRef = useRef<MessageHandler[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.push(handler);
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState("connecting");
    const ws = new WebSocket(serviceUrl(), offeredProtocols());

    ws.onopen = () => {
      setState("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        for (const h of handlersRef.current) h(msg);
      } catch {}
    };

    ws.onclose = () => {
      setState("disconnected");
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  const send = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, onMessage, send };
}
