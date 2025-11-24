// src/components/ChartsColumn.tsx
import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Legend,
  Tooltip,
  Filler,
  TimeSeriesScale,
} from "chart.js";
import type { TelemetryRow, KeyAliases } from "../types";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Legend,
  Tooltip,
  Filler,
  TimeSeriesScale
);

type ChartsColumnProps = {
  rows: TelemetryRow[] | any[];
  windowSec?: number; // default 10 s
  aliases?: KeyAliases;
};

// ==========================
// Utilidades
// ==========================
function toMillis(
  v: string | number | undefined | null
): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") {
    // Si parece “segundos desde epoch”, pásalo a ms
    return v < 1e12 ? v * 1000 : v;
  }
  const t = Date.parse(v);
  return isNaN(t) ? undefined : t;
}

// Normaliza unidades para que coincida con TelemetryColumn
function normalizeValue(key: string, raw: number): number {
  const k = key.toLowerCase();

  // Temperaturas: 2845 -> 28.45 °C
  if (k.includes("temp") || k === "t1" || k === "t2") {
    return raw / 100;
  }

  // Humedad: 6261 -> 62.61 %
  if (k.includes("hum")) {
    return raw / 100;
  }

  // Voltajes en mV -> V
  if (
    k === "v" ||
    k.includes("volt") ||
    k.includes("vbatt") ||
    k.includes("vbus") ||
    k.startsWith("v_") ||
    k.endsWith("_v")
  ) {
    return raw / 1000;
  }

  // Corrientes en mA -> A
  if (
    k === "i" ||
    k.includes("current") ||
    k.startsWith("i_") ||
    k.endsWith("_i")
  ) {
    return raw / 1000;
  }

  // Potencias en mW -> W
  if (
    k === "p" ||
    k.includes("power") ||
    k.endsWith("_w") ||
    k.includes("mw")
  ) {
    return raw / 1000;
  }

  // Distancias / demás se quedan igual
  return raw;
}

// ==========================
// Colores para series
// ==========================
const SERIES_COLORS: Record<string, string> = {
  // Distancias
  dist1: "#38bdf8", // sky-400
  dist2: "#22c55e", // green-500
  dist3: "#e879f9", // fuchsia-400

  // Corrientes
  i_esp: "#f97316", // orange-500
  i_m1: "#eab308",  // yellow-500
  i_m2: "#f472b6",  // pink-400

  // Voltajes
  v_esp: "#a855f7", // purple-500
  v_m1: "#2dd4bf",  // teal-400
  v_m2: "#ef4444",  // red-500

  // Temperaturas
  temp1: "#f97316",
  temp2: "#ef4444",
};

const FALLBACK_PALETTE = [
  "#38bdf8",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#f472b6",
  "#2dd4bf",
];

function colorForKey(key: string, idx: number): string {
  return SERIES_COLORS[key] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
}

export default function ChartsColumn({
  rows,
  windowSec = 10,
  aliases,
}: ChartsColumnProps) {
  // ==========================
  // Timestamp por fila
  // ==========================
  const rowsWithTs = useMemo(() => {
    return (rows || [])
      .map((r: any) => {
        const tsMs =
          toMillis(r.ts) ??
          toMillis(r.time) ??
          toMillis(r.t) ??
          toMillis(r.timestamp); // <-- usamos timestamp de tu JSON
        if (tsMs === undefined) return null;
        return { ...r, __ts_ms: tsMs } as any & { __ts_ms: number };
      })
      .filter(Boolean) as Array<any & { __ts_ms: number }>;
  }, [rows]);

  // Recorta a los últimos windowSec segundos y ordena ascendente
  const windowed = useMemo(() => {
    if (rowsWithTs.length === 0) return [];
    const lastTs = rowsWithTs.reduce(
      (max, r) => (r.__ts_ms > max ? r.__ts_ms : max),
      rowsWithTs[0].__ts_ms
    );
    const from = lastTs - windowSec * 1000;
    const filtered = rowsWithTs.filter((r) => r.__ts_ms >= from);
    filtered.sort((a, b) => a.__ts_ms - b.__ts_ms);
    return filtered;
  }, [rowsWithTs, windowSec]);

  // Eje X: tiempo relativo (s) a la última muestra
  const labels = useMemo(() => {
    if (windowed.length === 0) return [];
    const last = windowed[windowed.length - 1].__ts_ms;
    return windowed.map((r) => ((r.__ts_ms - last) / 1000).toFixed(2));
  }, [windowed]);

  // ==========================
  // Alias de llaves
  // ==========================
  const defaultAliases: Required<KeyAliases> = {
    distance: [
      "dist1",
      "dist2",
      "dist3",
      "distance",
      "distance_cm",
      "ultra1",
      "ultra2",
      "ultra3",
    ],
    current: [
      "i",
      "i_total",
      "current",
      "i_left",
      "i_right",
      "i_motor_left",
      "i_motor_right",
      "esp_i",
      "current_a",
      "i_esp",
      "i_m1",
      "i_m2",
    ],
    voltage: [
      "v",
      "voltage",
      "v_bus",
      "v_batt",
      "esp_v",
      "vbatt",
      "vout",
      "v_esp",
      "v_m1",
      "v_m2",
    ],
    temperature: ["temp1", "temp2", "temperature", "t1", "t2"],
  };
  const A = { ...defaultAliases, ...(aliases || {}) };

  // ==========================
  // Detección de llaves presentes
  // ==========================
  function pickExistingNumericKeys(
    candidates: string[],
    maxN: number
  ): string[] {
    const set = new Set<string>();
    for (const name of candidates) {
      const existsNumeric = windowed.some((r: any) => {
        const top = r[name];
        const nested = r.data?.[name];
        return typeof top === "number" || typeof nested === "number";
      });
      if (existsNumeric) set.add(name);
      if (set.size >= maxN) break;
    }
    return [...set];
  }

  // ==========================
  // Construcción de datasets
  // ==========================
  function buildDatasets(keys: string[]) {
    return keys.map((k, idx) => {
      const color = colorForKey(k, idx);
      const data = windowed.map((r: any) => {
        const top = r[k];
        const nested = r.data?.[k];
        const raw =
          typeof top === "number"
            ? top
            : typeof nested === "number"
            ? nested
            : null;
        if (raw === null) return null;
        return normalizeValue(k, raw);
      });
      return {
        label: k,
        data,
        spanGaps: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
        fill: false,
        borderColor: color,
      };
    });
  }

  const baseOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: "#e5e7eb", // texto leyenda claro
        },
      },
      tooltip: { mode: "nearest", intersect: false },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Tiempo (s, relativo a la última muestra)",
          color: "#e5e7eb",
        },
        ticks: { maxRotation: 0, color: "#9ca3af" },
        grid: { display: true, color: "#111827" },
      },
      y: {
        grid: { display: true, color: "#111827" },
        ticks: { maxRotation: 0, color: "#9ca3af" },
      },
    },
    elements: {
      line: { cubicInterpolationMode: "monotone" },
    },
  };

  // ===== Distancia =====
  const distanceKeys = pickExistingNumericKeys(A.distance, 3);
  const distanceData = {
    labels,
    datasets: buildDatasets(distanceKeys),
  };

  // ===== Corriente =====
  const currentKeys = pickExistingNumericKeys(A.current, 4);
  const currentData = {
    labels,
    datasets: buildDatasets(currentKeys),
  };

  // ===== Voltaje =====
  const voltageKeys = pickExistingNumericKeys(A.voltage, 4);
  const voltageData = {
    labels,
    datasets: buildDatasets(voltageKeys),
  };

  // ===== Temperatura =====
  const temperatureKeys = pickExistingNumericKeys(A.temperature, 2);
  const temperatureData = {
    labels,
    datasets: buildDatasets(temperatureKeys),
  };

  const warnStyle: React.CSSProperties = {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows:
          "minmax(160px, 1fr) minmax(160px, 1fr) minmax(160px, 1fr) minmax(160px, 1fr)",
        gap: 12,
        minHeight: 0,
      }}
    >
      {/* Distancia */}
      <div style={card}>
        <div style={cardHeader}>
          <strong>Distancia (últimos {windowSec}s)</strong>
        </div>
        <div style={cardBody}>
          {distanceKeys.length ? (
            <Line data={distanceData} options={baseOptions} />
          ) : (
            <em style={warnStyle}>
              No se detectaron llaves de distancia. Alias buscados:{" "}
              {A.distance.join(", ")}
            </em>
          )}
        </div>
      </div>

      {/* Corriente */}
      <div style={card}>
        <div style={cardHeader}>
          <strong>Corriente (últimos {windowSec}s)</strong>
        </div>
        <div style={cardBody}>
          {currentKeys.length ? (
            <Line data={currentData} options={baseOptions} />
          ) : (
            <em style={warnStyle}>
              No se detectaron llaves de corriente. Alias buscados:{" "}
              {A.current.join(", ")}
            </em>
          )}
        </div>
      </div>

      {/* Voltaje */}
      <div style={card}>
        <div style={cardHeader}>
          <strong>Voltaje (últimos {windowSec}s)</strong>
        </div>
        <div style={cardBody}>
          {voltageKeys.length ? (
            <Line data={voltageData} options={baseOptions} />
          ) : (
            <em style={warnStyle}>
              No se detectaron llaves de voltaje. Alias buscados:{" "}
              {A.voltage.join(", ")}
            </em>
          )}
        </div>
      </div>

      {/* Temperatura */}
      <div style={card}>
        <div style={cardHeader}>
          <strong>Temperatura (últimos {windowSec}s)</strong>
        </div>
        <div style={cardBody}>
          {temperatureKeys.length ? (
            <Line data={temperatureData} options={baseOptions} />
          ) : (
            <em style={warnStyle}>
              No se detectaron llaves de temperatura. Alias buscados:{" "}
              {A.temperature.join(", ")}
            </em>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================
// Estilos mínimos
// ==========================
const card: React.CSSProperties = {
  border: "1px solid #1f2937",
  borderRadius: 12,
  background: "#0b1220",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const cardHeader: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #1f2937",
};

const cardBody: React.CSSProperties = {
  padding: 8,
  flex: 1,
  minHeight: 0,
};
