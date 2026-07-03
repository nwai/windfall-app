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
