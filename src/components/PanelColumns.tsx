import React from "react";
import ChartsColumn from "./ChartsColumn";
import TelemetryColumn from "./TelemetryColumn";
import VisualColumn from "./VisualColumn";
import type { TelemetryRow } from "../types";

// Componente layout que recibe rows y los pasa a ChartsColumn
type PanelColumnsProps = {
  rows: TelemetryRow[];
  imageDataUrl?: string; // 👈 NUEVO: imagen de la cámara (data URL)
};

export default function PanelColumns({ rows, imageDataUrl }: PanelColumnsProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(320px, 1.2fr) minmax(260px, 1fr) minmax(260px, 1fr)",
        gap: 12,
        minHeight: 0,
        height: "100%",
      }}
    >
      {/* Columna 1: Gráficas */}
      <div
        style={{
          border: "1px solid #1f2937",
          borderRadius: 12,
          background: "#0b1220",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 8, borderBottom: "1px solid #1f2937" }}>
          <strong>Charts</strong>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <ChartsColumn rows={rows} />
        </div>
      </div>

      {/* Columna 2: Telemetría */}
      <div
        style={{
          border: "1px solid #1f2937",
          borderRadius: 12,
          background: "#0b1220",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 8, borderBottom: "1px solid #1f2937" }}>
          <strong>Telemetry</strong>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <TelemetryColumn />
        </div>
      </div>

      {/* Columna 3: Visual (Webots + imagen base64 + WASD) */}
      <div
        style={{
          border: "1px solid #1f2937",
          borderRadius: 12,
          background: "#0b1220",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 8, borderBottom: "1px solid #1f2937" }}>
          <strong>Visual</strong>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {/* 👇 Le pasamos la imagen a la columna visual */}
          <VisualColumn imageDataUrl={imageDataUrl} />
        </div>
      </div>
    </div>
  );
}
