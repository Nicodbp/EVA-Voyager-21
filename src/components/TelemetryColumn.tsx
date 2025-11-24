// src/components/TelemetryColumn.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ===================== Tipos ===================== */
export type TelemetryRecord = {
  ts: string; // ISO
  data: Record<string, string | number | boolean | null>;
  seq: number;
};

export type UseTelemetryOptions = {
  maxBuffer?: number;
  wsUrl?: string;
  wsPath?: string; // ya casi no lo usamos, pero lo dejamos por compatibilidad
  autoConnect?: boolean;
};

export type UseTelemetryState = {
  records: TelemetryRecord[];
  status: "idle" | "connecting" | "open" | "closed" | "error";
  lastError?: string;
  resolvedUrl: string;
  connect: () => void;
  disconnect: () => void;
  clear: () => void;
};

/* ===================== Hook WS ===================== */
function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// heurística para decidir si un objeto "parece" telemetría
function looksLikeTelemetry(o: any): boolean {
  if (!isPlainObject(o)) return false;
  const ks = Object.keys(o).map((k) => k.toLowerCase());
  const hints = [
    "rssi",
    "temp",
    "hum",
    "dist",
    "gyro",
    "acc",
    "motor",
    "vm1",
    "vm2",
    "im1",
    "im2",
  ];
  return ks.some((k) => hints.some((h) => k.includes(h)));
}

function extractTs(raw: any, payload: any): string | undefined {
  const candidates = [
    raw?.ts,
    raw?.time,
    raw?.t,
    payload?.ts,
    payload?.time,
    payload?.t,
    payload?.timestamp,
  ];

  for (const c of candidates) {
    if (typeof c === "string") {
      // si es número en string, trátalo como epoch (segundos)
      if (/^\d+(\.\d+)?$/.test(c)) {
        const num = Number(c);
        const ms = num > 1e12 ? num : num * 1000;
        return new Date(ms).toISOString();
      }
      const d = new Date(c);
      if (!isNaN(d.getTime())) return d.toISOString();
    } else if (typeof c === "number" && isFinite(c)) {
      const ms = c > 1e12 ? c : c * 1000;
      return new Date(ms).toISOString();
    }
  }
  return undefined;
}

export function useTelemetry(options?: UseTelemetryOptions): UseTelemetryState {
  const {
    maxBuffer = 1000,
    wsUrl,
    wsPath = "/ws",
    autoConnect = true,
  } = options || {};

  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [status, setStatus] = useState<UseTelemetryState["status"]>("idle");
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef<number>(0);

  /**
   * URL de WebSocket:
   * 1) Si se pasa por props (wsUrl), usamos esa.
   * 2) Si existe VITE_WS_URL, usamos esa.
   * 3) Si no, hacemos fallback a ws://localhost:8000/ws.
   */
  const resolvedUrl = useMemo(() => {
    if (wsUrl) return wsUrl;
    const fromEnv = (import.meta as any).env?.VITE_WS_URL as
      | string
      | undefined;
    if (fromEnv) return fromEnv;

    const base = window.location.hostname || "localhost";
    return `ws://${base}:8000${wsPath}`;
  }, [wsUrl, wsPath]);

  const disconnect = useCallback(() => {
    setStatus((s) => (s === "open" ? "closed" : s));
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
  }, []);

  const clear = useCallback(() => setRecords([]), []);

  const connect = useCallback(() => {
    // Evitar reconectar si ya está abierto o conectando
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus("connecting");
    setLastError(undefined);

    try {
      const ws = new WebSocket(resolvedUrl);
      wsRef.current = ws;

      ws.onopen = () => setStatus("open");

      ws.onmessage = (ev) => {
        try {
          const nowIso = new Date().toISOString();
          if (typeof ev.data !== "string") return;
          const text = ev.data.trim();
          if (!text.startsWith("{") && !text.startsWith("[")) return;

          const obj = JSON.parse(text);
          if (!isPlainObject(obj)) return;

          let payload: Record<string, any> | null = null;

          // 1) Mensajes con type que incluya "telemetry"
          const typeRaw =
            (obj as any).type ?? (obj as any).channel ?? (obj as any).kind;
          const type =
            typeof typeRaw === "string" ? typeRaw.toLowerCase() : "";

          if (type.includes("telemetry")) {
            const inner =
              (obj as any).data ??
              (obj as any).payload ??
              (obj as any).telemetry ??
              null;
            if (isPlainObject(inner)) {
              payload = inner;
            }
          }

          // 2) Mensajes con campo "telemetry" aunque el type no diga nada
          if (!payload && isPlainObject((obj as any).telemetry)) {
            payload = (obj as any).telemetry;
          }

          // 3) Si obj.data parece telemetría
          if (!payload && isPlainObject((obj as any).data)) {
            if (looksLikeTelemetry((obj as any).data)) {
              payload = (obj as any).data;
            }
          }

          // 4) Si el propio objeto parece telemetría
          if (!payload && looksLikeTelemetry(obj)) {
            payload = obj;
          }

          if (!payload) return;

          const ts = extractTs(obj, payload) || nowIso;

          seqRef.current += 1;
          const rec: TelemetryRecord = {
            ts,
            data: payload,
            seq: seqRef.current,
          };

          setRecords((prev) => {
            const next = [rec, ...prev];
            if (next.length > maxBuffer) next.length = maxBuffer;
            return next;
          });
        } catch (err) {
          console.error("WS parse error", err);
        }
      };

      ws.onerror = (e) => {
        setStatus("error");
        setLastError(String((e as any)?.message || "WebSocket error"));
      };

      ws.onclose = () => setStatus("closed");
    } catch (err: any) {
      setStatus("error");
      setLastError(err?.message || String(err));
    }
  }, [resolvedUrl, maxBuffer]);

  useEffect(() => {
    if (autoConnect) connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, resolvedUrl]);

  return { records, status, lastError, resolvedUrl, connect, disconnect, clear };
}

/* ===================== Helpers ===================== */
// Convierte "12.3 V" o " -45 dBm " a número (si aplica)
function toNumberOrUndefined(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return undefined;
}

// Búsqueda tolerante (exacta, case-insensitive, sin espacios/guiones/underscores)
function getField(obj: Record<string, any>, names: readonly string[]): any {
  const keys = Object.keys(obj);

  // 1) exact match primero
  for (const n of names) {
    if (n in obj) return obj[n];
  }

  // 2) case-insensitive simple
  const lower = new Map<string, string>();
  for (const k of keys) lower.set(k.toLowerCase(), k);
  for (const n of names) {
    const real = lower.get(n.toLowerCase());
    if (real !== undefined) return obj[real];
  }

  // 3) normalizando separadores (espacios, _, -)
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, "");
  const normMap = new Map<string, string>();
  for (const k of keys) normMap.set(norm(k), k);
  for (const n of names) {
    const real = normMap.get(norm(String(n)));
    if (real !== undefined) return obj[real];
  }

  return undefined;
}

function fmt(v: any, unit?: string, digits = 2): string {
  const n = toNumberOrUndefined(v);
  if (n === undefined) return "–";
  return unit ? `${n.toFixed(digits)} ${unit}` : n.toFixed(digits);
}

// Temperaturas / humedades vienen *x100* (ej. 2845 → 28.45)
function fmtScaled100(v: any, unit?: string, digits = 2): string {
  const n = toNumberOrUndefined(v);
  if (n === undefined) return "–";
  const scaled = n / 100;
  return unit ? `${scaled.toFixed(digits)} ${unit}` : scaled.toFixed(digits);
}

function StatusDot({ status }: { status: UseTelemetryState["status"] }) {
  const color =
    status === "open"
      ? "#10b981"
      : status === "connecting"
      ? "#f59e0b"
      : status === "error"
      ? "#ef4444"
      : status === "closed"
      ? "#6b7280"
      : "#9ca3af";
  return (
    <span
      title={status}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 999,
        background: color,
        marginRight: 8,
      }}
    />
  );
}

/* ===================== Mapeo EXACTO a tus nombres ===================== */
const NAMES = {
  rssi: ["Rssi", "RSSI", "rssi", "rssi_dbm", "dbm"],
  avgRssi: ["avgRssi", "avg_rssi", "rssi_avg"],

  temp1: ["Temp 1", "Temp1", "temp1", "temperature1", "t1"],
  hum1: ["Hum 1", "Hum1", "hum1", "humidity1", "h1", "rh1"],
  temp2: ["Temp 2", "Temp2", "temp2", "temperature2", "t2"],
  hum2: ["Hum 2", "Hum2", "hum2", "humidity2", "h2", "rh2"],

  vEsp: ["V Esp", "V_Esp", "v_esp", "esp_v", "v_bus", "v_batt", "vbatt"],
  iEsp: ["I Esp", "I_Esp", "i_esp", "esp_i", "i_total"],
  pEsp: ["P Esp", "P_Esp", "p_esp", "esp_p", "power"],

  vM1: ["V M1", "V_M1", "v_m1", "vm1", "motor1_v"],
  iM1: ["I M1", "I_M1", "i_m1", "i1", "motor1_i", "i_left", "i_motor_left"],
  pM1: ["P M1", "P_M1", "p_m1", "pm1", "motor1_p"],
  vM2: ["V M2", "V_M2", "v_m2", "vm2", "motor2_v"],
  iM2: ["I M2", "I_M2", "i_m2", "i2", "motor2_i", "i_right", "i_motor_right"],
  pM2: ["P M2", "P_M2", "p_m2", "pm2", "motor2_p"],

  accX: ["acc X", "accX", "acc_x", "ax", "accx"],
  accY: ["acc Y", "accY", "acc_y", "ay", "accy"],
  accZ: ["acc Z", "accZ", "acc_z", "az", "accz"],

  gyroX: ["gyro X", "gyroX", "gyro_x", "gx"],
  gyroY: ["gyro Y", "gyroY", "gyro_y", "gy"],
  gyroZ: ["gyro Z", "gyroZ", "gyro_z", "gz"],

  dist1: ["Dist 1", "Dist1", "dist1", "distance1", "ultra1"],
  dist2: ["Dist 2", "Dist2", "dist2", "distance2", "ultra2"],
  dist3: ["Dist 3", "Dist3", "dist3", "distance3", "ultra3"],
} as const;

/* ===================== UI ===================== */
function LineKV({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        padding: "2px 0",
      }}
    >
      <span>{k}</span>
      <span style={{ color: "#e5e7eb" }}>{v}</span>
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #1f2937",
  borderRadius: 12,
  background: "#0b1220",
  minHeight: 0,
  overflow: "hidden",
};
const cardHeader: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #1f2937",
};
const cardBody: React.CSSProperties = {
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const cardGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};
const btnBase: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #374151",
  background: "#0a0f1a",
  color: "#e5e7eb",
  cursor: "pointer",
};
const btnStyle: React.CSSProperties = { ...btnBase };
const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "#111827",
  color: "#fff",
  borderColor: "#111827",
};
const btnWarn: React.CSSProperties = {
  ...btnBase,
  background: "#3f1d1d",
  color: "#fca5a5",
  borderColor: "#7f1d1d",
};

/* ===================== Componente principal ===================== */
export default function TelemetryColumn(props: {
  records?: TelemetryRecord[];
  wsUrl?: string;
}) {
  // ⚠️ Cambio importante: solo modo externo si hay registros reales
  const usingExternal = !!(props.records && props.records.length > 0);

  const { records, status, lastError, resolvedUrl, connect, disconnect, clear } =
    useTelemetry({ autoConnect: !usingExternal, wsUrl: props.wsUrl });

  const [showJSON, setShowJSON] = useState(false);

  const latest = useMemo(() => {
    const arr = usingExternal ? props.records! : records;
    return arr?.[0];
  }, [usingExternal, props.records, records]);

  // --- Sticky last: conserva el último paquete aunque deje de llegar data ---
  const lastSeenRef = useRef<TelemetryRecord | null>(null);
  useEffect(() => {
    if (latest) lastSeenRef.current = latest;
  }, [latest]);

  const display = latest ?? lastSeenRef.current;
  const d = display?.data || {};
  const tsLabel = display?.ts ?? "–";

  // Señal
  const rssi = getField(d, NAMES.rssi);
  const avgRssi = getField(d, NAMES.avgRssi);

  // Temp/Hum
  const temp1 = getField(d, NAMES.temp1);
  const hum1 = getField(d, NAMES.hum1);
  const temp2 = getField(d, NAMES.temp2);
  const hum2 = getField(d, NAMES.hum2);

  // ESP
  const vEsp = getField(d, NAMES.vEsp);
  const iEsp = getField(d, NAMES.iEsp);
  const pEsp = getField(d, NAMES.pEsp);

  // Motores
  const vM1 = getField(d, NAMES.vM1);
  const iM1 = getField(d, NAMES.iM1);
  const pM1 = getField(d, NAMES.pM1);
  const vM2 = getField(d, NAMES.vM2);
  const iM2 = getField(d, NAMES.iM2);
  const pM2 = getField(d, NAMES.pM2);

  // IMU
  const accX = getField(d, NAMES.accX);
  const accY = getField(d, NAMES.accY);
  const accZ = getField(d, NAMES.accZ);
  const gyroX = getField(d, NAMES.gyroX);
  const gyroY = getField(d, NAMES.gyroY);
  const gyroZ = getField(d, NAMES.gyroZ);

  // Distancias
  const dist1 = getField(d, NAMES.dist1);
  const dist2 = getField(d, NAMES.dist2);
  const dist3 = getField(d, NAMES.dist3);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #1f2937",
          background: "#0b1220",
        }}
      >
        <StatusDot status={usingExternal ? "idle" : status} />
        <strong>Telemetry</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setShowJSON((s) => !s)} style={btnStyle}>
            {showJSON ? "Ocultar JSON" : "Ver JSON"}
          </button>
          {!usingExternal &&
            (status !== "open" ? (
              <button onClick={connect} style={btnPrimary}>
                Conectar
              </button>
            ) : (
              <button onClick={disconnect} style={btnWarn}>
                Desconectar
              </button>
            ))}
          <button
            onClick={() => {
              clear();
              lastSeenRef.current = null;
            }}
            style={btnStyle}
          >
            Limpiar
          </button>
        </div>
      </div>

      {lastError && !usingExternal && (
        <div
          style={{
            color: "#ef4444",
            padding: 8,
            borderBottom: "1px solid #7f1d1d",
            background: "#1f0a0a",
          }}
        >
          Error WS: {lastError}
        </div>
      )}

      {/* Body */}
      <div
        style={{
          padding: 10,
          display: "grid",
          gridTemplateRows: "auto auto auto auto auto auto",
          gap: 10,
          overflow: "auto",
          minHeight: 0,
        }}
      >
        {/* Tiempo / Señal */}
        <div style={cardGrid2}>
          <div style={card}>
            <div style={cardHeader}>
              <strong>Tiempo</strong>
            </div>
            <div style={cardBody}>
              <LineKV k="ts:" v={tsLabel} />
            </div>
          </div>
          <div style={card}>
            <div style={cardHeader}>
              <strong>Señal</strong>
            </div>
            <div style={cardBody}>
              <LineKV k="Rssi:" v={fmt(rssi, "dBm", 0)} />
              <LineKV k="avgRssi:" v={fmt(avgRssi, "dBm", 0)} />
            </div>
          </div>
        </div>

        {/* Temperaturas y Humedades */}
        <div style={card}>
          <div style={cardHeader}>
            <strong>Temperaturas y Humedades</strong>
          </div>
          <div style={cardBody}>
            <LineKV k="Temp 1:" v={fmtScaled100(temp1, "°C")} />
            <LineKV k="Hum 1:" v={fmtScaled100(hum1, "%")} />
            <LineKV k="Temp 2:" v={fmtScaled100(temp2, "°C")} />
            <LineKV k="Hum 2:" v={fmtScaled100(hum2, "%")} />
          </div>
        </div>

        {/* Voltajes y Corrientes */}
        <div style={card}>
          <div style={cardHeader}>
            <strong>Voltajes y Corrientes</strong>
          </div>
          <div style={cardBody}>
            <div style={{ marginBottom: 6, color: "#9ca3af" }}>
              <strong>ESP</strong>
            </div>
            {/* Ahora en mV, mA, mW */}
            <LineKV k="V Esp:" v={fmt(vEsp, "mV")} />
            <LineKV k="I Esp:" v={fmt(iEsp, "mA")} />
            <LineKV k="P Esp:" v={fmt(pEsp, "mW")} />
            <div
              style={{
                margin: "8px 0 6px",
                color: "#9ca3af",
              }}
            >
              <strong>Motores</strong>
            </div>
            <LineKV k="V M1:" v={fmt(vM1, "mV")} />
            <LineKV k="I M1:" v={fmt(iM1, "mA")} />
            <LineKV k="P M1:" v={fmt(pM1, "mW")} />
            <LineKV k="V M2:" v={fmt(vM2, "mV")} />
            <LineKV k="I M2:" v={fmt(iM2, "mA")} />
            <LineKV k="P M2:" v={fmt(pM2, "mW")} />
          </div>
        </div>

        {/* IMU */}
        <div style={card}>
          <div style={cardHeader}>
            <strong>IMU</strong>
          </div>
          <div style={cardBody}>
            <div style={{ marginBottom: 6, color: "#9ca3af" }}>
              <strong>Gyro</strong>
            </div>
            <LineKV k="gyro X:" v={fmt(accX)} />
            <LineKV k="gyro Y:" v={fmt(accY)} />
            <LineKV k="gyro Z:" v={fmt(accZ)} />
            <div
              style={{
                margin: "8px 0 6px",
                color: "#9ca3af",
              }}
            >
              <strong>Acc</strong>
            </div>
            <LineKV k="acc X:" v={fmt(gyroX)} />
            <LineKV k="acc Y:" v={fmt(gyroY)} />
            <LineKV k="acc Z:" v={fmt(gyroZ)} />
          </div>
        </div>

        {/* Distancias */}
        <div style={card}>
          <div style={cardHeader}>
            <strong>Distancias</strong>
          </div>
          <div style={cardBody}>
            <LineKV k="Dist A:" v={fmt(dist1)} />
            <LineKV k="Dist D:" v={fmt(dist2)} />
            <LineKV k="Dist I:" v={fmt(dist3)} />
          </div>
        </div>

        {/* Inspector JSON (debug) */}
        {showJSON && (
          <div style={card}>
            <div style={cardHeader}>
              <strong>Último payload (debug)</strong>
            </div>
            <div
              style={{
                ...cardBody,
                whiteSpace: "pre",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              }}
            >
              {display
                ? JSON.stringify(display.data, null, 2)
                : "Sin datos…"}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "6px 12px",
          fontSize: 12,
          color: "#9ca3af",
          borderTop: "1px solid #1f2937",
          background: "#0b1220",
        }}
      >
        {usingExternal ? (
          <span>
            Modo externo: usando <code>records</code> por props.
          </span>
        ) : (
          <span>
            WS: <code>{resolvedUrl}</code> · estado: <code>{status}</code> ·
            registros: <code>{records.length}</code>
          </span>
        )}
      </div>
    </div>
  );
}
