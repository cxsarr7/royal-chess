import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "./auth";

type Handler = (message: { type: string; [key: string]: unknown }) => void;

const LiveContext = createContext<((handler: Handler) => () => void) | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const handlers = useRef(new Set<Handler>());

  useEffect(() => {
    if (!user) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let timer = 0;
    const connect = () => {
      if (stopped) return;
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${location.host}/ws`);
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { type: string };
        for (const handler of handlers.current) handler(message);
      };
      socket.onclose = () => {
        if (!stopped) timer = window.setTimeout(connect, 1500);
      };
    };
    connect();
    const ping = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 20000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(ping);
      socket?.close();
    };
  }, [user?.id]);

  return (
    <LiveContext.Provider value={(handler) => {
      handlers.current.add(handler);
      return () => handlers.current.delete(handler);
    }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLive(handler: Handler): void {
  const subscribe = useContext(LiveContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((message) => ref.current(message));
  }, [subscribe]);
}
