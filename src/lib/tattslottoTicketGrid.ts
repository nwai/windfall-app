import type { Draw } from "../types";
import { sortDrawsChronologically } from "./recentDraws";

export const TATTSLOTTO_GRID_COLUMNS = 9;
export const TATTSLOTTO_GRID_ROWS = 5;
export const TATTSLOTTO_MIN_NUMBER = 1;
export const TATTSLOTTO_MAX_NUMBER = 45;

export type TicketGridDrawScope = "mains" | "mainsSupps";

export interface TicketGridPosition {
  number: number;
  row: number;
  column: number;
}

export interface TicketGridReplayFrame {
  index: number;
  frameNumber: number;
  totalFrames: number;
  date: string;
  main: number[];
  supp: number[];
  draw: Draw;
}

export interface TicketReplayStepInput {
  currentIndex: number;
  frameCount: number;
  direction: -1 | 1;
}

const isTicketNumber = (value: unknown): value is number => (
  typeof value === "number"
  && Number.isInteger(value)
  && Number.isFinite(value)
  && value >= TATTSLOTTO_MIN_NUMBER
  && value <= TATTSLOTTO_MAX_NUMBER
);

const normalizeTicketNumbers = (numbers: readonly unknown[] | undefined): number[] => (
  Array.from(new Set((numbers ?? []).filter(isTicketNumber))).sort((left, right) => left - right)
);

export const getTicketGridPosition = (number: number): TicketGridPosition | null => {
  if (!isTicketNumber(number)) return null;
  const zeroIndex = number - TATTSLOTTO_MIN_NUMBER;
  return {
    number,
    row: Math.floor(zeroIndex / TATTSLOTTO_GRID_COLUMNS),
    column: zeroIndex % TATTSLOTTO_GRID_COLUMNS,
  };
};

export const buildTicketGridCells = (): TicketGridPosition[] => (
  Array.from({ length: TATTSLOTTO_MAX_NUMBER }, (_, index) => {
    const position = getTicketGridPosition(index + TATTSLOTTO_MIN_NUMBER);
    if (!position) {
      throw new Error(`Invalid Tattslotto ticket number ${index + TATTSLOTTO_MIN_NUMBER}`);
    }
    return position;
  })
);

export const buildTicketGridReplayFrames = (history: readonly Draw[]): TicketGridReplayFrame[] => {
  const realDraws = sortDrawsChronologically(history.filter((draw) => !draw.isSimulated));
  const totalFrames = realDraws.length;

  return realDraws.map((draw, index) => ({
    index,
    frameNumber: index + 1,
    totalFrames,
    date: draw.date,
    main: normalizeTicketNumbers(draw.main),
    supp: normalizeTicketNumbers(draw.supp),
    draw,
  }));
};

export const ticketNumbersForFrame = (
  frame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): number[] => {
  if (!frame) return [];
  return scope === "mains"
    ? frame.main
    : normalizeTicketNumbers([...frame.main, ...frame.supp]);
};

export const stepTicketReplayFrame = ({
  currentIndex,
  frameCount,
  direction,
}: TicketReplayStepInput): number => {
  if (frameCount <= 0) return 0;
  return Math.max(0, Math.min(frameCount - 1, currentIndex + direction));
};

export interface TicketGridDensity {
  rowCounts: number[];
  columnCounts: number[];
  maxRowCount: number;
  maxColumnCount: number;
  normalizedRowIntensity: number[];
  normalizedColumnIntensity: number[];
}

export interface RunningHotColdCounts {
  countsByNumber: Record<number, number>;
  hotCount: number;
  hotNumbers: number[];
  coldCount: number;
  coldNumbers: number[];
}

const uniqueSortedNumbers = (numbers: readonly number[]): number[] => (
  Array.from(new Set(numbers.filter(isTicketNumber))).sort((left, right) => left - right)
);

const numbersInScopeSet = (
  frame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): Set<number> => new Set(ticketNumbersForFrame(frame, scope));

export const computeCarryOverMarkers = (
  currentFrame: TicketGridReplayFrame | null | undefined,
  previousFrame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): number[] => {
  if (!currentFrame || !previousFrame) return [];
  const previous = numbersInScopeSet(previousFrame, scope);
  return uniqueSortedNumbers(ticketNumbersForFrame(currentFrame, scope).filter((number) => previous.has(number)));
};

const buildAdjacentNeighbourSet = (numbers: readonly number[]): Set<number> => {
  const neighbours = new Set<number>();
  numbers.forEach((number) => {
    [-2, -1, 1, 2].forEach((delta) => {
      const candidate = number + delta;
      if (isTicketNumber(candidate)) neighbours.add(candidate);
    });
  });
  return neighbours;
};

export const computeAdjacentTraceMarkers = (
  currentFrame: TicketGridReplayFrame | null | undefined,
  previousFrame: TicketGridReplayFrame | null | undefined,
  scope: TicketGridDrawScope,
): number[] => {
  if (!currentFrame || !previousFrame) return [];
  const neighbours = buildAdjacentNeighbourSet(ticketNumbersForFrame(previousFrame, scope));
  return uniqueSortedNumbers(ticketNumbersForFrame(currentFrame, scope).filter((number) => neighbours.has(number)));
};

export const computeTicketGridDensity = (
  frames: readonly TicketGridReplayFrame[],
  scope: TicketGridDrawScope,
): TicketGridDensity => {
  const rowCounts = Array.from({ length: TATTSLOTTO_GRID_ROWS }, () => 0);
  const columnCounts = Array.from({ length: TATTSLOTTO_GRID_COLUMNS }, () => 0);

  frames.forEach((frame) => {
    ticketNumbersForFrame(frame, scope).forEach((number) => {
      const position = getTicketGridPosition(number);
      if (!position) return;
      rowCounts[position.row] += 1;
      columnCounts[position.column] += 1;
    });
  });

  const maxRowCount = Math.max(0, ...rowCounts);
  const maxColumnCount = Math.max(0, ...columnCounts);
  const normalize = (value: number, max: number): number => (max > 0 ? value / max : 0);

  return {
    rowCounts,
    columnCounts,
    maxRowCount,
    maxColumnCount,
    normalizedRowIntensity: rowCounts.map((value) => normalize(value, maxRowCount)),
    normalizedColumnIntensity: columnCounts.map((value) => normalize(value, maxColumnCount)),
  };
};

export const computeRunningHotColdCounts = (
  frames: readonly TicketGridReplayFrame[],
  frameIndex: number,
  scope: TicketGridDrawScope,
): RunningHotColdCounts => {
  const safeIndex = Math.max(0, Math.min(frames.length - 1, Math.floor(frameIndex)));
  const countsByNumber: Record<number, number> = {};
  for (let number = TATTSLOTTO_MIN_NUMBER; number <= TATTSLOTTO_MAX_NUMBER; number += 1) {
    countsByNumber[number] = 0;
  }

  frames.slice(0, safeIndex + 1).forEach((frame) => {
    ticketNumbersForFrame(frame, scope).forEach((number) => {
      countsByNumber[number] += 1;
    });
  });

  const counts = Object.values(countsByNumber);
  const hotCount = counts.length ? Math.max(...counts) : 0;
  const coldCount = counts.length ? Math.min(...counts) : 0;
  const numbersForCount = (count: number): number[] => (
    Object.entries(countsByNumber)
      .filter(([, value]) => value === count)
      .map(([number]) => Number(number))
      .sort((left, right) => left - right)
  );

  return {
    countsByNumber,
    hotCount,
    hotNumbers: numbersForCount(hotCount),
    coldCount,
    coldNumbers: numbersForCount(coldCount),
  };
};
