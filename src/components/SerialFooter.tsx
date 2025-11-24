import { useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function SerialFooter({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [lines.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/serial/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line: text }),
      });

      if (!res.ok) {
        const bodyText = await res.text();
        setError(bodyText || "Error al enviar por serial");
      } else {
        setInput("");
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo contactar al backend");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60, // por encima de columnas
        pointerEvents: "none", // contenedor
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "0 12px 12px",
          pointerEvents: "auto", // reactivar dentro
        }}
      >
        <div
          style={{
            background: "#0b1220",
            border: "1px solid #1f2937",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: "#111827",
              borderBottom: "1px solid #1f2937",
            }}
          >
            <strong>Monitor Serial</strong>
            <button
              onClick={() => setOpen((v) => !v)}
              style={{
                background: "#374151",
                color: "white",
                border: "none",
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {open ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          {open && (
            <>
              {/* Log */}
              <div
                style={{
                  height: 180,
                  overflowY: "auto",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  padding: 10,
                  background: "#0a0f1a",
                  borderBottom: "1px solid #1f2937",
                }}
              >
                {lines.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Esperando datos…</div>
                ) : (
                  lines.slice(-800).map((l, idx) => (
                    <div key={idx} style={{ whiteSpace: "pre-wrap" }}>
                      {l}
                    </div>
                  ))
                )}
                <div ref={endRef} />
              </div>

              {/* Barra de entrada */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px 10px",
                  background: "#020617",
                }}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder='Escribe un comando (ej. "a", "d", "SENT_EST_A") y presiona Enter'
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #1f2937",
                    background: "#020617",
                    color: "#e5e7eb",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={isSending || !input.trim()}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "1px solid #22c55e",
                    background:
                      isSending || !input.trim() ? "#1f2937" : "#22c55e",
                    color:
                      isSending || !input.trim() ? "#9ca3af" : "#020617",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor:
                      isSending || !input.trim()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Enviar
                </button>
              </div>

              {error && (
                <div
                  style={{
                    padding: "0 10px 8px",
                    background: "#020617",
                    fontSize: 11,
                    color: "#f97373",
                  }}
                >
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
