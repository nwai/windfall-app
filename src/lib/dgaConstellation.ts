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
  radiusSummaries: DgaConstellationRadiusSummary[];
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

const countHistoryHitsForNumbers = (history: Draw[], numbers: Set<number>): number => {
  let hits = 0;
  for (const draw of history) {
    for (const number of numbers) {
      if (roleForNumber(draw, number) !== "none") hits += 1;
    }
  }
  return hits;
};

const combination = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  const shortK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= shortK; i += 1) {
    result = (result * (n - shortK + i)) / i;
  }
  return result;
};

const binomialUpperTail = (n: number, p: number, observedHits: number): number | null => {
  if (n <= 0 || p < 0 || p > 1) return null;
  if (observedHits <= 0) return 1;
  if (p === 0) return observedHits > 0 ? 0 : 1;
  if (p === 1) return observedHits <= n ? 1 : 0;
  let probability = 0;
  for (let k = observedHits; k <= n; k += 1) {
    probability += combination(n, k) * (p ** k) * ((1 - p) ** (n - k));
  }
  return Math.min(1, Math.max(0, probability));
};

const buildMetric = (
  label: string,
  cells: DgaConstellationCell[],
  history: Draw[],
  fallbackBaselineRate: number,
): DgaConstellationMetric => {
  const possibleCells = cells.length;
  const hitCount = cells.filter((cell) => cell.role !== "none").length;
  const mainHits = cells.filter((cell) => cell.role === "main").length;
  const suppHits = cells.filter((cell) => cell.role === "supp").length;
  const numbers = new Set(cells.map((cell) => cell.number));
  const baselineRate = numbers.size > 0 && history.length > 0
    ? countHistoryHitsForNumbers(history, numbers) / (history.length * numbers.size)
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
  for (let drawOffset = -radius; drawOffset <= radius; drawOffset += 1) {
    for (let numberOffset = -radius; numberOffset <= radius; numberOffset += 1) {
      cells.push(buildCell(
        history,
        centerDrawNumber,
        centerNumber,
        centerDrawNumber + drawOffset,
        centerNumber + numberOffset,
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
  for (let drawOffset = 1; drawOffset <= horizon; drawOffset += 1) {
    for (let numberOffset = -radius; numberOffset <= radius; numberOffset += 1) {
      cells.push(buildCell(history, centerDrawNumber, centerNumber, centerDrawNumber + drawOffset, centerNumber + numberOffset));
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
  for (let drawOffset = -horizon; drawOffset <= -1; drawOffset += 1) {
    for (let numberOffset = -radius; numberOffset <= radius; numberOffset += 1) {
      cells.push(buildCell(history, centerDrawNumber, centerNumber, centerDrawNumber + drawOffset, centerNumber + numberOffset));
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
  const radius = clampInteger(options.radius ?? DEFAULT_RADIUS, 1, 8);
  const forwardHorizon = clampInteger(options.forwardHorizon ?? DEFAULT_FORWARD_HORIZON, 1, 8);
  if (centerDrawNumber !== Math.round(options.centerDrawNumber)) {
    warnings.push(`Center draw was adjusted to D${centerDrawNumber}.`);
  }
  if (centerNumber !== Math.round(options.centerNumber)) {
    warnings.push(`Center number was adjusted to ${centerNumber}.`);
  }

  const totalHits = realHistory.reduce((sum, draw) => (
    sum + new Set([...draw.main, ...draw.supp].filter((number) => number >= MIN_NUMBER && number <= MAX_NUMBER)).size
  ), 0);
  const baselineRate = realHistory.length > 0 ? totalHits / (realHistory.length * MAX_NUMBER) : 0;
  const centerCell = buildCell(realHistory, centerDrawNumber, centerNumber, centerDrawNumber, centerNumber) ?? {
    drawDate: "",
    drawNumber: centerDrawNumber,
    number: centerNumber,
    offsetDraw: 0,
    offsetNumber: 0,
    role: "none" as const,
  };

  const radiusSummaries = Array.from({ length: radius }, (_, index) => {
    const currentRadius = index + 1;
    const risingDiagonal = cellsForRisingDiagonal(realHistory, centerDrawNumber, centerNumber, currentRadius);
    const fallingDiagonal = cellsForFallingDiagonal(realHistory, centerDrawNumber, centerNumber, currentRadius);
    const diagonalCross = uniqueCells([...risingDiagonal, ...fallingDiagonal]);
    return {
      diagonalCross: buildMetric(`Diagonal cross r${currentRadius}`, diagonalCross, realHistory, baselineRate),
      fallingDiagonal: buildMetric(`Falling diagonal r${currentRadius}`, fallingDiagonal, realHistory, baselineRate),
      followThrough: buildMetric(
        `Forward band r${currentRadius}`,
        cellsForForwardBand(realHistory, centerDrawNumber, centerNumber, currentRadius, forwardHorizon),
        realHistory,
        baselineRate,
      ),
      leadIn: buildMetric(
        `Lead-in band r${currentRadius}`,
        cellsForLeadInBand(realHistory, centerDrawNumber, centerNumber, currentRadius, forwardHorizon),
        realHistory,
        baselineRate,
      ),
      localWindow: buildMetric(
        `Local window r${currentRadius}`,
        cellsForLocalWindow(realHistory, centerDrawNumber, centerNumber, currentRadius),
        realHistory,
        baselineRate,
      ),
      radius: currentRadius,
      risingDiagonal: buildMetric(`Rising diagonal r${currentRadius}`, risingDiagonal, realHistory, baselineRate),
    };
  });

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
    radiusSummaries,
    warnings,
  };
}
