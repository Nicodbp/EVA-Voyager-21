// src/App.tsx
import React, { useMemo, useState } from "react";
import HeaderStatus from "./components/HeaderStatus";
import SerialFooter from "./components/SerialFooter";
import PanelColumns from "./components/PanelColumns";
import { useWebSocketFeed } from "./lib/useWebSocketFeed";
import Grid20x20 from "./components/Grid20x20";
import { TelemetryRow } from "./types";

// --- helpers para trabajar con el monitor serial ---

/** Intenta obtener el texto visible de una línea de consola (string u objeto). */
function getLineText(item: any): string {
  if (typeof item === "string") return item;
  if (!item) return "";
  if (typeof item.text === "string") return item.text;
  if (typeof item.line === "string") return item.line;
  try {
    return JSON.stringify(item);
  } catch {
    return "";
  }
}

/**
 * Extrae el ÚLTIMO bloque de imagen base64 que haya en consoleLines
 * delimitado por:
 *   B64_IMAGE_START
 *   ... (líneas base64) ...
 *   B64_IMAGE_END
 */
function extractLastImageFromConsole(lines: any[]): string | null {
  let capturing = false;
  let buffer: string[] = [];
  let lastImage: string | null = null;

  for (const item of lines) {
    const raw = getLineText(item).trim();
    if (!raw) continue;

    if (raw === "B64_IMAGE_START") {
      capturing = true;
      buffer = [];
      continue;
    }

    if (raw === "B64_IMAGE_END") {
      if (capturing && buffer.length > 0) {
        lastImage = buffer.join("");
      }
      capturing = false;
      continue;
    }

    if (capturing) {
      buffer.push(raw);
    }
  }

  return lastImage;
}

export default function App() {
  // Hook de WebSocket
  const {
    status,
    rows,
    consoleLines,
    reconnect,
    lastMatrixLine, // matriz 10x10 del rover
  } = useWebSocketFeed(900);

  const [showGrid, setShowGrid] = useState(false);

  // Última fila de telemetría (por si la quieres para otras cosas)
  const lastRow: TelemetryRow | undefined =
    rows.length > 0 ? rows[rows.length - 1] : undefined;

  // 📷 Imagen más reciente detectada en el monitor serial (para PanelColumns)
  const latestImageDataUrl = useMemo(() => {
    const b64 = extractLastImageFromConsole(consoleLines as any[]);
    return b64 ? `data:image/jpeg;base64,${b64}` : undefined;
  }, [consoleLines]);

  // Solo strings para SerialFooter (como lo espera su tipo)
  const consoleTextLines = useMemo(
    () => (consoleLines as any[]).map(getLineText),
    [consoleLines]
  );

  // Reset del grid: manda .CLEAR por serial + lo que haga el componente localmente
  const handleGridClear = () => {
    // ⚠️ Ajusta la URL/path según tu backend real.
    // La idea es que esto sea equivalente a escribir ".CLEAR" en el serial.
    fetch("http://localhost:8000/api/serial/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line: ".CLEAR" }),
    }).catch((err) => {
      console.error("Error enviando .CLEAR", err);
    });
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0a0f1a",
        color: "#e5e7eb",
      }}
    >
      <HeaderStatus
        status={status}
        onReconnect={reconnect}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((prev) => !prev)}
      />

      {/* Grid 10x10 opcional */}
      {showGrid && (
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "8px 12px 0",
          }}
        >
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #1f2937",
              padding: "10px 12px 14px",
              background: "rgba(15,23,42,0.9)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                marginBottom: 8,
                color: "#9ca3af",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Grid 10×10</span>
            </div>

            {/* Grid alimentado solo por la matriz + callback de reset */}
            <Grid20x20
              matrixLine={lastMatrixLine}
              onReset={handleGridClear}
            />
          </div>
        </div>
      )}

      <main
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "12px",
          paddingBottom: 220, // espacio para el SerialFooter fijo
          minHeight: 0,
        }}
      >
        {/* Le pasamos también la imagen a las columnas */}
        <PanelColumns rows={rows} imageDataUrl={latestImageDataUrl} />
      </main>

      {/* Aquí ya son solo strings, así que el tipo cuadra */}
      <SerialFooter lines={consoleTextLines} />
    </div>
  );
}
