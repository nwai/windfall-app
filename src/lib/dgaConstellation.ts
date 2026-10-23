import type { Draw } from "../types";

export type DgaConstellationCellRole = "main" | "supp" | "none";

export interface DgaConstellationCell {
  drawDate: string;
  drawNumber: number;
  isFuture?: boolean;
  number: number;
  offsetDraw: number;
  offsetNumber: number;
  role: DgaConstellationCellRole;
}

export interface DgaConstellationMetric {
  baselineRate: number;
  cells: DgaConstellationCell[];
  expectedHits: number;
  hitCount: number;
  label: string;
  lift: number | null;
  mainHits: number;
  possibleCells: number;
  suppHits: number;
  upperTailPValue: number | null;
  zScore: number | null;
}

export interface DgaConstellationRadiusSummary {
  diagonalCross: DgaConstellationMetric;
  fallingDiagonal: DgaConstellationMetric;
  followThrough: DgaConstellationMetric;
  leadIn: DgaConstellationMetric;
  localWindow: DgaConstellationMetric;
  radius: number;
  risingDiagonal: DgaConstellationMetric;
}

export interface DgaConstellationDiagnostic {
  baselineRate: number;
  centerCell: DgaConstellationCell;
  centerDrawNumber: number;
  centerNumber: number;
  drawCount: number;
  forwardHorizon: number;
  historyScopeLabel: string;
  matrixRows: Array<{ drawDate: string; drawNumber: number; isFuture?: boolean; cells: DgaConstellationCell[] }>;
  radius: number;
  radiusSummary: DgaConstellationRadiusSummary;
  warnings: string[];
}

export interface DgaConstellationOptions {
  centerDrawNumber: number;
  centerNumber: number;
  forwardHorizon?: number;
  radius?: number;
}

const MIN_NUMBER = 1;
const MAX_NUMBER = 45;
const DEFAULT_RADIUS = 3;
const DEFAULT_FORWARD_HORIZON = 3;
export const MAX_CONSTELLATION_RADIUS = 156;
export const MAX_CONSTELLATION_HORIZON = 156;

const clampInteger = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
};

const roleForNumber = (draw: Draw | undefined, number: number): DgaConstellationCellRole => {
  if (!draw) return "none";
  if (draw.main.includes(number)) return "main";
  if (draw.supp.includes(number)) return "supp";
  return "none";
};

const buildCell = (
  history: Draw[],
  centerDrawNumber: number,
  centerNumber: number,
  drawNumber: number,
  number: number,
  includeNextDrawColumn = false,
): DgaConstellationCell | null => {
  if (drawNumber < 1) return null;
  if (number < MIN_NUMBER || number > MAX_NUMBER) return null;
  if (includeNextDrawColumn && drawNumber === history.length + 1) {
    return {
      drawDate: "Next draw (not yet recorded)",
      drawNumber,
      isFuture: true,
      number,
      offsetDraw: drawNumber - centerDrawNumber,
      offsetNumber: number - centerNumber,
      role: "none",
    };
  }
  if (drawNumber > history.length) return null;
  const draw = history[drawNumber - 1];
  if (!draw) return null;
  return {
    drawDate: draw.date,
    drawNumber,
    number,
    offsetDraw: drawNumber - centerDrawNumber,
    offsetNumber: number - centerNumber,
    role: roleForNumber(draw, number),
  };
};

const uniqueCells = (cells: Array<DgaConstellationCell | null>): DgaConstellationCell[] => {
  const seen = new Set<string>();
  const unique: DgaConstellationCell[] = [];
  for (const cell of cells) {
    if (!cell) continue;
    const key = `${cell.drawNumber}:${cell.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cell);
  }
  return unique.sort((left, right) => (left.drawNumber - right.drawNumber) || (left.number - right.number));
};

const binomialUpperTail = (n: number, p: number, observedHits: number): number | null => {
  if (n <= 0 || p < 0 || p > 1) return null;
  if (observedHits <= 0) return 1;
  if (p === 0) return observedHits > 0 ? 0 : 1;
  if (p === 1) return observedHits <= n ? 1 : 0;
  // Log recurrence avoids overflowing combinations in wide diagnostic windows.
  let logMass = n * Math.log1p(-p);
  const logOdds = Math.log(p) - Math.log1p(-p);
  let probability = 0;
  for (let k = 0; k <= n; k += 1) {
    if (k >= observedHits) probability += Math.exp(logMass);
    if (k < n) logMass += Math.log(n - k) - Math.log(k + 1) + logOdds;
  }
  return Math.min(1, Math.max(0, probability));
};

const buildMetric = (
  label: string,
  cells: DgaConstellationCell[],
  historyDrawCount: number,
  numberHitCounts: readonly number[],
  fallbackBaselineRate: number,
): DgaConstellationMetric => {
  const possibleCells = cells.length;
  const hitCount = cells.filter((cell) => cell.role !== "none").length;
  const mainHits = cells.filter((cell) => cell.role === "main").length;
  const suppHits = cells.filter((cell) => cell.role === "supp").length;
  const numbers = new Set(cells.map((cell) => cell.number));
  const baselineRate = numbers.size > 0 && historyDrawCount > 0
    ? [...numbers].reduce((sum, number) => sum + numberHitCounts[number], 0) / (historyDrawCount * numbers.size)
    : fallbackBaselineRate;
  const expectedHits = possibleCells * baselineRate;
  const variance = possibleCells * baselineRate * (1 - baselineRate);
  const zScore = variance > 0 ? (hitCount - expectedHits) / Math.sqrt(variance) : null;
  const lift = expectedHits > 0 ? hitCount / expectedHits : null;
  return {
    baselineRate,
    cells,
    expectedHits,
    hitCount,
    label,
    lift,
    mainHits,
    possibleCells,
    suppHits,
    upperTailPValue: binomialUpperTail(possibleCells, baselineRate, hitCount),
    zScore,
  };
};

const cellsForLocalWindow = (
  history: Draw[],
  centerDrawNumber: number,
  centerNumber: number,
  radius: number,
): DgaConstellationCell[] => {
  const cells: Array<DgaConstellationCell | null> = [];
  for (let drawNumber = Math.max(1, centerDrawNumber - radius); drawNumber <= Math.min(history.length, centerDrawNumber + radius); drawNumber += 1) {
    for (let number = Math.max(MIN_NUMBER, centerNumber - radius); number <= Math.min(MAX_NUMBER, centerNumber + radius); number += 1) {
      cells.push(buildCell(
        history,
        centerDrawNumber,
        centerNumber,
        drawNumber,
        number,
      ));
    }
  }
  return uniqueCells(cells);
};

const cellsForRisingDiagonal = (
  history: Draw[],
  centerDrawNumber: number,
  centerNumber: number,
  radius: number,
): DgaConstellationCell[] => uniqueCells(
  Array.from({ length: radius * 2 + 1 }, (_, index) => index - radius)
    .map((offset) => buildCell(history, centerDrawNumber, centerNumber, centerDrawNumber + offset, centerNumber + offset)),
);

const cellsForFallingDiagonal = (
  history: Draw[],
  centerDrawNumber: number,
  centerNumber: number,
  radius: number,
): DgaConstellationCell[] => uniqueCells(
  Array.from({ length: radius * 2 + 1 }, (_, index) => index - radius)
    .map((offset) => buildCell(history, centerDrawNumber, centerNumber, centerDrawNumber + offset, centerNumber - offset)),
);

const cellsForForwardBand = (
  history: Draw[],
  centerDrawNumber: number,
  centerNumber: number,
  radius: number,
  horizon: number,
): DgaConstellationCell[] => {
  const cells: Array<DgaConstellationCell | null> = [];
  for (let drawNumber = centerDrawNumber + 1; drawNumber <= Math.min(history.length, centerDrawNumber + horizon); drawNumber += 1) {
    for (let number = Math.max(MIN_NUMBER, centerNumber - radius); number <= Math.min(MAX_NUMBER, centerNumber + radius); number += 1) {
      cells.push(buildCell(history, centerDrawNumber, centerNumber, drawNumber, number));
    }
  }
  return uniqueCells(cells);
};

const cellsForLeadInBand = (
  history: Draw[],
  centerDrawNumber: number,
  centerNumber: number,
  radius: number,
  horizon: number,
): DgaConstellationCell[] => {
  const cells: Array<DgaConstellationCell | null> = [];
  for (let drawNumber = Math.max(1, centerDrawNumber - horizon); drawNumber < centerDrawNumber; drawNumber += 1) {
    for (let number = Math.max(MIN_NUMBER, centerNumber - radius); number <= Math.min(MAX_NUMBER, centerNumber + radius); number += 1) {
      cells.push(buildCell(history, centerDrawNumber, centerNumber, drawNumber, number));
    }
  }
  return uniqueCells(cells);
};

const buildMatrixRows = (
  history: Draw[],
  centerDrawNumber: number,
  centerNumber: number,
  radius: number,
  forwardHorizon: number,
): DgaConstellationDiagnostic["matrixRows"] => {
  const rows: DgaConstellationDiagnostic["matrixRows"] = [];
  const drawHorizon = Math.max(radius, forwardHorizon);
  const startDraw = Math.max(1, centerDrawNumber - drawHorizon);
  const endDraw = Math.min(history.length + 1, centerDrawNumber + drawHorizon);
  for (let drawNumber = startDraw; drawNumber <= endDraw; drawNumber += 1) {
    const draw = history[drawNumber - 1];
    const isFuture = drawNumber === history.length + 1;
    const cells: DgaConstellationCell[] = [];
    for (let number = Math.max(MIN_NUMBER, centerNumber - radius); number <= Math.min(MAX_NUMBER, centerNumber + radius); number += 1) {
      const cell = buildCell(history, centerDrawNumber, centerNumber, drawNumber, number, true);
      if (cell) cells.push(cell);
    }
    rows.push({
      drawDate: isFuture ? "Next draw (not yet recorded)" : draw.date,
      drawNumber,
      isFuture,
      cells,
    });
  }
  return rows;
};

export function buildDgaConstellationDiagnostic(
  history: readonly Draw[],
  options: DgaConstellationOptions,
): DgaConstellationDiagnostic {
  const realHistory = history.filter((draw) => !draw.isSimulated);
  const warnings: string[] = [];
  if (realHistory.length === 0) {
    warnings.push("No real draw history is available for DGA constellation diagnostics.");
  }
  const drawCount = Math.max(1, realHistory.length);
  const centerDrawNumber = clampInteger(options.centerDrawNumber, 1, drawCount);
  const centerNumber = clampInteger(options.centerNumber, MIN_NUMBER, MAX_NUMBER);
  const radius = clampInteger(options.radius ?? DEFAULT_RADIUS, 1, MAX_CONSTELLATION_RADIUS);
  const forwardHorizon = clampInteger(options.forwardHorizon ?? DEFAULT_FORWARD_HORIZON, 1, MAX_CONSTELLATION_HORIZON);
  if (centerDrawNumber !== Math.round(options.centerDrawNumber)) {
    warnings.push(`Center draw was adjusted to D${centerDrawNumber}.`);
  }
  if (centerNumber !== Math.round(options.centerNumber)) {
    warnings.push(`Center number was adjusted to ${centerNumber}.`);
  }

  const numberHitCounts = Array<number>(MAX_NUMBER + 1).fill(0);
  for (const draw of realHistory) {
    for (const number of new Set([...draw.main, ...draw.supp])) {
      if (Number.isInteger(number) && number >= MIN_NUMBER && number <= MAX_NUMBER) numberHitCounts[number]++;
    }
  }
  const totalHits = numberHitCounts.reduce((sum, count) => sum + count, 0);
  const baselineRate = realHistory.length > 0 ? totalHits / (realHistory.length * MAX_NUMBER) : 0;
  const centerCell = buildCell(realHistory, centerDrawNumber, centerNumber, centerDrawNumber, centerNumber) ?? {
    drawDate: "",
    drawNumber: centerDrawNumber,
    number: centerNumber,
    offsetDraw: 0,
    offsetNumber: 0,
    role: "none" as const,
  };

  // Only the selected radius is displayed. Avoid retaining every nested window.
  const risingDiagonal = cellsForRisingDiagonal(realHistory, centerDrawNumber, centerNumber, radius);
  const fallingDiagonal = cellsForFallingDiagonal(realHistory, centerDrawNumber, centerNumber, radius);
  const diagonalCross = uniqueCells([...risingDiagonal, ...fallingDiagonal]);
  const radiusSummary: DgaConstellationRadiusSummary = {
    diagonalCross: buildMetric(`Diagonal cross r${radius}`, diagonalCross, realHistory.length, numberHitCounts, baselineRate),
    fallingDiagonal: buildMetric(`Falling diagonal r${radius}`, fallingDiagonal, realHistory.length, numberHitCounts, baselineRate),
    followThrough: buildMetric(
      `Forward band r${radius}`,
      cellsForForwardBand(realHistory, centerDrawNumber, centerNumber, radius, forwardHorizon),
      realHistory.length,
      numberHitCounts,
      baselineRate,
    ),
    leadIn: buildMetric(
      `Lead-in band r${radius}`,
      cellsForLeadInBand(realHistory, centerDrawNumber, centerNumber, radius, forwardHorizon),
      realHistory.length,
      numberHitCounts,
      baselineRate,
    ),
    localWindow: buildMetric(
      `Local window r${radius}`,
      cellsForLocalWindow(realHistory, centerDrawNumber, centerNumber, radius),
      realHistory.length,
      numberHitCounts,
      baselineRate,
    ),
    radius,
    risingDiagonal: buildMetric(`Rising diagonal r${radius}`, risingDiagonal, realHistory.length, numberHitCounts, baselineRate),
  };

  return {
    baselineRate,
    centerCell,
    centerDrawNumber,
    centerNumber,
    drawCount: realHistory.length,
    forwardHorizon,
    historyScopeLabel: `${realHistory.length} real chronological DGA draw${realHistory.length === 1 ? "" : "s"}`,
    matrixRows: buildMatrixRows(realHistory, centerDrawNumber, centerNumber, radius, forwardHorizon),
    radius,
    radiusSummary,
    warnings,
  };
}
