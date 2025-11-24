// src/components/HeaderStatus.tsx
import type { WebSocketStatus } from "../types";

type HeaderStatusProps = {
  status: WebSocketStatus | string; // acepta tu tipo o string "sueltos"
  onReconnect?: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
};

export default function HeaderStatus({
  status,
  onReconnect,
  showGrid,
  onToggleGrid,
}: HeaderStatusProps) {
  const color =
    status === "open"
      ? "#16a34a"
      : status === "connecting"
      ? "#f59e0b"
      : status === "error"
      ? "#dc2626"
      : "#6b7280";

  const label =
    status === "open"
      ? "Connected"
      : status === "connecting"
      ? "Connecting..."
      : status === "error"
      ? "Error"
      : "Disconnected";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#0f172a",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid #1f2937",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18 }}>Panel Rover — Columna 1</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Botón para mostrar/ocultar el grid 20x20 */}
        <button
          onClick={onToggleGrid}
          style={{
            background: showGrid ? "#1d4ed8" : "#111827",
            color: "white",
            border: "1px solid #1f2937",
            padding: "6px 10px",
            borderRadius: 999,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gridTemplateRows: "repeat(2, 1fr)",
              gap: 1,
            }}
          >
            <span style={{ background: "#020617" }} />
            <span style={{ background: "#0b1120" }} />
            <span style={{ background: "#0b1120" }} />
            <span style={{ background: "#020617" }} />
          </span>
          {showGrid ? "Ocultar grid" : "Mostrar grid"}
        </button>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          Serial: {label}
        </span>

        {status !== "open" && (
          <button
            onClick={onReconnect}
            style={{
              background: "#374151",
              color: "white",
              border: "none",
              padding: "6px 10px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Reconectar
          </button>
        )}
      </div>
    </header>
  );
}
