// src/components/VisualColumn.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type WSStatus = "connecting" | "open" | "closed" | "error";

const WEBOTS_URL =
  (import.meta.env.VITE_WEBOTS_URL as string) || "http://localhost:1999";
const WS_URL =
  (import.meta.env.VITE_WS_URL as string) || "ws://localhost:8000/ws";

// ===== estilos pequeños reutilizables (sin Tailwind) =====
const cardStyle: React.CSSProperties = {
  border: "1px solid #1f2937",
  borderRadius: 12,
  background: "#0b1220",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const sectionHeader: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #1f2937",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const badgeBase: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 8,
  fontSize: 12,
  border: "1px solid",
};

const padBtn: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 16,
  background:
    "radial-gradient(120% 120% at 30% 25%, #1f2937 0%, #0f172a 55%, #0b1220 100%)",
  border: "1px solid #263142",
  color: "#e5e7eb",
  boxShadow: "0 6px 18px rgba(0,0,0,0.35), inset 0 0 8px rgba(255,255,255,0.03)",
  cursor: "pointer",
  userSelect: "none",
  fontWeight: 700,
  fontSize: 18,
};

const smallText: React.CSSProperties = { fontSize: 12, color: "#9ca3af" };

type VisualColumnProps = {
  /** data URL tipo `data:image/jpeg;base64,...` (desde App.tsx) */
  imageDataUrl?: string;
};

export default function VisualColumn({ imageDataUrl }: VisualColumnProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<WSStatus>("connecting");

  // Snapshot cámara (bajo petición)
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const [frameMime, setFrameMime] = useState<string>("image/jpeg");

  // Cuando cambie la imagen desde App (B64_IMAGE_* → imageDataUrl)
  useEffect(() => {
    if (!imageDataUrl) return;
    setLastFrame(imageDataUrl);
    setIsCapturing(false);

    const m = /^data:(.+?);base64,/.exec(imageDataUrl);
    if (m) {
      setFrameMime(m[1]);
    } else {
      setFrameMime("image/jpeg");
    }
  }, [imageDataUrl]);

  // Conexión WS (para comandos WASD y .IMAGE)
  useEffect(() => {
    let alive = true;

    const connect = () => {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        setWsStatus("connecting");

        ws.onopen = () => alive && setWsStatus("open");
        ws.onerror = () => alive && setWsStatus("error");
        ws.onclose = () => {
          if (!alive) return;
          setWsStatus("closed");
          setTimeout(connect, 1000);
        };
        ws.onmessage = (ev) => {
          // Si en algún momento decides mandar frames por WS (type: "camera_base64"),
          // esto sigue funcionando como fallback.
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.type === "camera_base64" && typeof msg.data === "string") {
              const mime = msg?.mime || "image/jpeg";
              setFrameMime(mime);
              setLastFrame(`data:${mime};base64,${msg.data}`);
              setIsCapturing(false);
            }
          } catch {
            // Ignorar mensajes no JSON
          }
        };
      } catch {
        setWsStatus("error");
      }
    };

    connect();
    return () => {
      alive = false;
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, []);

  // Enviar comando serial (.w/.a/.s/.d/.IMAGE)
  const sendSerial = (cmd: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "serial_write", data: cmd }));
  };

  // WASD por teclado (una vez por pulsación) — ignorar cuando se escribe en inputs
  const pressed = useRef<Set<string>>(new Set());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // ⛔ No capturar WASD si estamos escribiendo en un input/textarea/contentEditable
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isTypingElement =
          tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
        if (isTypingElement) {
          return;
        }
      }

      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") {
        if (!pressed.current.has(k)) {
          pressed.current.add(k);
          e.preventDefault();
          e.stopPropagation();
          sendSerial("." + k); // .w .a .s .d
        }
      }
    };

    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (pressed.current.has(k)) pressed.current.delete(k);
    };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Solicitar snapshot a la cámara → manda ".IMAGE" por serial
  const requestSnapshot = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setIsCapturing(true);
    sendSerial(".IMAGE");
  };

  const wsBadge = useMemo(() => {
    const base = { ...badgeBase };
    if (wsStatus === "open")
      return (
        <span style={{ ...base, borderColor: "#16a34a", color: "#16a34a" }}>
          WS: OPEN
        </span>
      );
    if (wsStatus === "connecting")
      return (
        <span style={{ ...base, borderColor: "#f59e0b", color: "#f59e0b" }}>
          WS: CONNECTING
        </span>
      );
    if (wsStatus === "error")
      return (
        <span style={{ ...base, borderColor: "#ef4444", color: "#ef4444" }}>
          WS: ERROR
        </span>
      );
    return (
      <span style={{ ...base, borderColor: "#6b7280", color: "#6b7280" }}>
        WS: CLOSED
      </span>
    );
  }, [wsStatus]);

  // ======= UI =======
  return (
    <div className="flex flex-col gap-3 h-full w-full p-2">
      {/* 1) Control WASD (primero) */}
      <div style={cardStyle}>
        <div style={sectionHeader}>
          <strong>Control — WASD</strong>
          {wsBadge}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto auto",
            placeItems: "center",
            gap: 14,
            padding: 16,
          }}
        >
          <div />
          <button
            style={padBtn}
            onMouseDown={() => sendSerial(".w")}
            onTouchStart={(e) => {
              e.preventDefault();
              sendSerial(".w");
            }}
            aria-label="W"
            title="W / Adelante"
          >
            W
          </button>
          <div />

          <button
            style={padBtn}
            onMouseDown={() => sendSerial(".a")}
            onTouchStart={(e) => {
              e.preventDefault();
              sendSerial(".a");
            }}
            aria-label="A"
            title="A / Izquierda"
          >
            A
          </button>

          <button
            style={{
              ...padBtn,
              width: 88,
              height: 88,
              borderRadius: 20,
              fontSize: 22,
              boxShadow:
                "0 10px 24px rgba(0,0,0,0.45), inset 0 0 10px rgba(255,255,255,0.04)",
              background:
                "radial-gradient(130% 130% at 35% 25%, #233146 0%, #111a2e 55%, #0b1220 100%)",
            }}
            onMouseDown={() => sendSerial(".s")}
            onTouchStart={(e) => {
              e.preventDefault();
              sendSerial(".s");
            }}
            aria-label="S"
            title="S / Atrás"
          >
            S
          </button>

          <button
            style={padBtn}
            onMouseDown={() => sendSerial(".d")}
            onTouchStart={(e) => {
              e.preventDefault();
              sendSerial(".d");
            }}
            aria-label="D"
            title="D / Derecha"
          >
            D
          </button>
        </div>

        <div style={{ padding: "0 16px 12px", ...smallText }}>
          También funciona con el teclado: <b>W-A-S-D</b>.
        </div>
      </div>

      {/* 2) Webots siempre activo */}
      <div style={{ ...cardStyle, minHeight: 0, flex: 1 }}>
        <div style={sectionHeader}>
          <strong>Webots</strong>
          <span style={smallText}>Siempre activo</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              minHeight: 220,
              borderTop: "1px solid #0f172a",
            }}
          >
            <iframe
              src={WEBOTS_URL}
              style={{ width: "100%", height: "100%", border: "none" }}
              allowFullScreen
              title="WebotsStream"
            />
          </div>
        </div>
      </div>

      {/* 3) Cámara bajo petición */}
      <div style={cardStyle}>
        <div style={sectionHeader}>
          <strong>Cámara — Snapshot bajo petición</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {wsBadge}
            <button
              onClick={requestSnapshot}
              disabled={wsStatus !== "open" || isCapturing}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: isCapturing ? "#0b1220" : "#111827",
                color: isCapturing ? "#6b7280" : "#e5e7eb",
                cursor:
                  wsStatus !== "open" || isCapturing ? "not-allowed" : "pointer",
              }}
            >
              {isCapturing ? "Tomando…" : "Tomar snapshot"}
            </button>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            aspectRatio: "16/9",
          }}
        >
          {lastFrame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lastFrame}
              alt="camera"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : (
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
              Sin imagen. Presiona <b>Tomar snapshot</b> o manda <b>.IMAGE</b>.
            </div>
          )}

          {isCapturing && (
            <div
              style={{
                position: "absolute",
                right: 10,
                top: 10,
                padding: "2px 8px",
                borderRadius: 8,
                background: "rgba(17,24,39,0.9)",
                border: "1px solid #334155",
                color: "#e5e7eb",
                fontSize: 12,
              }}
            >
              Capturando…
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderTop: "1px solid #1f2937",
          }}
        >
          <div style={{ ...smallText }}>MIME: {frameMime}</div>
          {lastFrame && (
            <a
              href={lastFrame}
              download={`snapshot_${Date.now()}.${
                frameMime.split("/")[1] || "jpg"
              }`}
              style={{ ...smallText, textDecoration: "underline", cursor: "pointer" }}
            >
              Descargar snapshot
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
