// src/components/Grid20x20.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";

// Ahora el grid lógico es 10x10 (matriz del rover)
const GRID_ROWS = 10;
const GRID_COLS = 10;
const START_ROW = GRID_ROWS - 1; // fila inferior (índice 9)
const START_COL = 0; // primera columna (izquierda)

// Dirección del rover
type Direction = "N" | "E" | "S" | "W";

// Pose = posición + orientación (en índices de matriz)
type RoverPose = {
  row: number; // 0 arriba ... 9 abajo
  col: number; // 0 izquierda ... 9 derecha
  dir: Direction;
};

// Estado de cada celda
type Cell = {
  visited: boolean;
  obstacle: boolean;
};

type Props = {
  /** Línea completa tipo "RECV_ROVER_...,M,2000000000,..." */
  matrixLine?: string | null;
  /** Callback opcional: aquí el padre puede mandar '.CLEAR' por serial */
  onReset?: () => void;
};

const initialPose: RoverPose = {
  row: START_ROW,
  col: START_COL,
  dir: "N", // mirando hacia arriba (vertical)
};

// Origen de coordenadas = posición inicial del rover
const ORIGIN_ROW = initialPose.row;
const ORIGIN_COL = initialPose.col;

function createEmptyGrid(): Cell[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({
      visited: false,
      obstacle: false,
    }))
  );
}

// 2,3,4,5 -> N,E,W,S (puedes ajustar esto si tu firmware usa otra convención)
function codeToDirection(code: number): Direction {
  switch (code) {
    case 2:
      return "N";
    case 3:
      return "E";
    case 4:
      return "W";
    case 5:
      return "S";
    default:
      return "N";
  }
}

/**
 * Recibe la línea tipo:
 * RECV_ROVER_-45,-44,M,2000000000,0000000000,1000000000,...
 *
 * CONVENCIÓN:
 *  - El PRIMER grupo después de 'M' es la fila INFERIOR del grid.
 *  - El ÚLTIMO grupo es la fila SUPERIOR.
 *
 * Devuelve:
 *  - grid: Cell[][]
 *  - pose: RoverPose con la posición/dirección del rover (por el 2/3/4/5)
 */
function parseMatrixLine(
  line: string
): { grid: Cell[][]; pose: RoverPose | null } | null {
  const parts = line.split(",");
  const idxM = parts.indexOf("M");
  if (idxM === -1) return null;

  // Después de la M vienen las filas del grid:
  // rowTokens[0] = fila INFERIOR
  // rowTokens[rowTokens.length - 1] = fila SUPERIOR
  const rowTokens = parts.slice(idxM + 1);
  if (rowTokens.length === 0) return null;

  const numRows = Math.min(rowTokens.length, GRID_ROWS);

  const grid: Cell[][] = [];
  let roverPose: RoverPose | null = null;

  // grid[0] = fila de ARRIBA (como la dibuja el CSS)
  // rowTokens[0] = fila de ABAJO
  for (let visualRow = 0; visualRow < numRows; visualRow++) {
    // tokenIndex recorre las filas de arriba hacia abajo
    const tokenIndex = numRows - 1 - visualRow; // último token -> fila 0 (arriba)

    const rowStr = rowTokens[tokenIndex];
    const trimmed = rowStr.trim();
    if (!trimmed) {
      grid.push(
        Array.from({ length: GRID_COLS }, () => ({
          visited: false,
          obstacle: false,
        }))
      );
      continue;
    }

    const chars = Array.from(trimmed); // ["2","0","0",...]
    const rowCells: Cell[] = [];

    chars.forEach((ch, c) => {
      const v = Number(ch);
      const cell: Cell = { visited: false, obstacle: false };

      if (v === 1) {
        cell.obstacle = true;
      } else if (v >= 2 && v <= 5) {
        // celda donde está el rover
        const dir = codeToDirection(v);
        // visualRow: 0 = arriba, numRows-1 = abajo
        roverPose = { row: visualRow, col: c, dir };
      }

      rowCells.push(cell);
    });

    grid.push(rowCells);
  }

  return { grid, pose: roverPose };
}

const baseGradient =
  "radial-gradient(circle at 30% 30%, #111827 0, #020617 60%, #000000 100%)";

// convierte índices de matriz -> coords “humanas” (0,0 = posición inicial)
// N (arriba) = y positivo, E (derecha) = x positivo
function toDisplayCoords(pose: RoverPose): { x: number; y: number } {
  const x = pose.col - ORIGIN_COL; // 0 en la col inicial, +1 a la derecha
  const y = ORIGIN_ROW - pose.row; // 0 en la fila inicial, +1 hacia arriba
  return { x, y };
}

const Grid20x20: React.FC<Props> = ({ matrixLine, onReset }) => {
  const [grid, setGrid] = useState<Cell[][]>(() => createEmptyGrid());
  const [pose, setPose] = useState<RoverPose>(initialPose);
  const poseRef = useRef<RoverPose>(initialPose);

  // ------- aplicar matriz completa --------
  const applyMatrix = useCallback((line: string) => {
    const parsed = parseMatrixLine(line);
    if (!parsed) return;

    const { grid: newGrid, pose: newPose } = parsed;

    // actualizamos el grid al 10x10 que venga de la matriz
    setGrid(newGrid);

    // si la matriz trae un 2/3/4/5, actualizamos la pose para seguir mostrando N/E/S/W
    if (newPose) {
      poseRef.current = newPose;
      setPose(newPose);
    }
  }, []);

  // Si hay matrixLine, la aplicamos
  useEffect(() => {
    if (!matrixLine) return;
    applyMatrix(matrixLine);
  }, [matrixLine, applyMatrix]);

  // Reset local + callback para .CLEAR
  const handleResetClick = () => {
    const pose0: RoverPose = { ...initialPose };
    poseRef.current = pose0;
    setPose(pose0);
    setGrid(createEmptyGrid());
    if (onReset) onReset();
  };

  const columnCount = grid[0]?.length ?? GRID_COLS;
  const { x, y } = toDisplayCoords(pose);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 400,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* mini header del grid */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#9ca3af",
        }}
      >
        <span>
          Pos: ({x}, {y}) · Dir: {pose.dir}
        </span>
        <button
          onClick={handleResetClick}
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #4b5563",
            background: "transparent",
            color: "#e5e7eb",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      {/* Grid visual 10x10 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          gap: 2,
          width: "100%",
        }}
      >
        {grid.map((rowCells, r) =>
          rowCells.map((cell, c) => {
            const isRover = pose.row === r && pose.col === c;

            let bg = baseGradient; // vacío
            if (cell.obstacle) bg = "#b91c1c"; // obstáculo
            if (isRover) bg = "#eab308"; // rover

            return (
              <div
                key={`${r}-${c}`}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 4,
                  border: "1px solid #111827",
                  background: bg,
                  boxShadow: "0 0 0 1px rgba(15,23,42,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 600,
                  color: "#020617",
                }}
              >
                {isRover ? pose.dir : ""}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Grid20x20;
