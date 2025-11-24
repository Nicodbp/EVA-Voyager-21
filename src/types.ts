// src/types.ts

// ------------------------------
// Telemetría (fila cruda)
// ------------------------------
// Cada mensaje que llega del backend/parsers suele convertirse en una fila.
// Aceptamos varios alias comunes de timestamp: ts | time | t.
// Los demás campos son pares clave/valor dinámicos.
export type TelemetryRow = {
  ts?: string | number; // ISO string o epoch (ms/seg)
  time?: number;        // alias opcional (seg o ms)
  t?: number;           // alias opcional (seg o ms)
  [key: string]: number | string | boolean | null | undefined;
};

// ------------------------------
// Telemetría (registro procesado en frontend)
// ------------------------------
// Útil para listas/columnas de log donde ya normalizamos y añadimos metadatos.
export type TelemetryRecord = {
  ts: string; // ISO timestamp asignado/normalizado
  data: Record<string, string | number | boolean | null>;
  seq: number; // contador incremental para keys estables
};

// ------------------------------
// Alias de llaves para detección automática en charts
// ------------------------------
// Permite que ChartsColumn detecte qué campos graficar aunque cambien los nombres.
export type KeyAliases = {
  distance?: string[];    // ej: ["dist1", "dist2", "dist3", "distance_cm"]
  current?: string[];     // ej: ["i", "i_left", "i_right", "current_a", "esp_i"]
  voltage?: string[];     // ej: ["v", "v_bus", "v_batt", "vbatt", "voltage"]
  temperature?: string[]; // ej: ["temp1", "temp2", "temperature", "t1", "t2"]
};

// Un grupo “completo” (si necesitas exigir todas las categorías)
export type SeriesKeyGroup = Required<Pick<
  KeyAliases,
  "distance" | "current" | "voltage" | "temperature"
>>;

// ------------------------------
// Opciones de ventana para gráficas
// ------------------------------
export type ChartWindowOptions = {
  /** Ventana de tiempo a mostrar (segundos). Default: 10 */
  windowSec?: number;
};

// ------------------------------
// (Opcional) Estado del WebSocket si quieres tipar HeaderStatus/useWebSocketFeed
// ------------------------------
export type WebSocketStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";
