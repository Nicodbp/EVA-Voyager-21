// src/lib/useWebSocketFeed.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { TelemetryRow, WebSocketStatus } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws";

type ConsoleLine = {
  ts: number;
  text: string;
};

type UseWebSocketFeedResult = {
  status: WebSocketStatus;
  isConnected: boolean;
  rows: TelemetryRow[];
  consoleLines: ConsoleLine[];
  lastImageDataUrl: string | null;
  lastMatrixLine: string | null; // <-- NUEVO: última línea con matriz RECV_ROVER_...,M,...
  reconnect: () => void;
};

export function useWebSocketFeed(
  maxRows: number = 900
): UseWebSocketFeedResult {
  const [status, setStatus] = useState<WebSocketStatus>("connecting");
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [lastImageDataUrl, setLastImageDataUrl] = useState<string | null>(null);
  const [lastMatrixLine, setLastMatrixLine] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  // Para ir acumulando el bloque B64_IMAGE_START ... B64_IMAGE_END
  const imageCaptureRef = useRef<{ pending: boolean; chunks: string[] }>({
    pending: false,
    chunks: [],
  });

  const isConnected = status === "open";

  const handleMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data);

        if (!msg || typeof msg.type !== "string") return;

        // --- Telemetría normal ---
        if (msg.type === "telemetry") {
          const row = (msg.row ?? msg.data ?? null) as TelemetryRow | null;
          if (!row) return;

          setRows((prev) => {
            const next = [...prev, row];
            if (next.length > maxRows) {
              next.splice(0, next.length - maxRows);
            }
            return next;
          });
          return;
        }

        // --- Consola serial ---
        if (msg.type === "serial_in") {
          const ts =
            typeof msg.ts === "number" ? msg.ts * 1000 : Date.now(); // tu ts viene en segundos
          const text =
            typeof msg.line === "string"
              ? msg.line
              : msg.line != null
              ? String(msg.line)
              : "";

          // Siempre mandamos a la consola
          setConsoleLines((prev) => {
            const next = [...prev, { ts, text }];
            if (next.length > 2000) {
              next.splice(0, next.length - 2000);
            }
            return next;
          });

          // ---------- Manejo de imagen B64 ----------
          const capture = imageCaptureRef.current;

          if (text === "B64_IMAGE_START") {
            capture.pending = true;
            capture.chunks = [];
            return;
          }

          if (text === "B64_IMAGE_END") {
            if (capture.pending && capture.chunks.length > 0) {
              const base64 = capture.chunks.join("");
              const dataUrl = `data:image/jpeg;base64,${base64}`;
              setLastImageDataUrl(dataUrl);
            }
            capture.pending = false;
            capture.chunks = [];
            return;
          }

          if (capture.pending) {
            // Cualquier línea intermedia se considera parte del payload base64
            capture.chunks.push(text.trim());
            return;
          }

          // ---------- AQUÍ detectamos la matriz del grid ----------
          // Ejemplo:
          // RECV_ROVER_-45,-44,M,2000000000,0000000000,1000000000,...
          if (
            text.startsWith("RECV_ROVER_") &&
            text.includes(",M,") // asegura que es la segunda parte (matriz)
          ) {
            setLastMatrixLine(text);
          }

          return;
        }

        // --- Por si en algún momento mandas mensajes tipo "image" desde el backend ---
        if (msg.type === "image") {
          if (typeof msg.data_url === "string") {
            setLastImageDataUrl(msg.data_url);
          } else if (typeof msg.b64 === "string") {
            const mime = typeof msg.mime === "string" ? msg.mime : "image/jpeg";
            setLastImageDataUrl(`data:${mime};base64,${msg.b64}`);
          }
        }
      } catch (err) {
        console.error("WS message parse error", err);
      }
    },
    [maxRows]
  );

  const connect = useCallback(() => {
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => setStatus("open");
    ws.onclose = () => {
      setStatus("closed");
      socketRef.current = null;
    };
    ws.onerror = () => setStatus("error");
    ws.onmessage = handleMessage;
  }, [handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
    }
    connect();
  }, [connect]);

  return {
    status,
    isConnected,
    rows,
    consoleLines,
    lastImageDataUrl,
    lastMatrixLine,
    reconnect,
  };
}
