import type { Draw } from "../types";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

export interface MonthlyBucketDrawSeries {
  bucketIndexSeries: number[][];
  bucketCounts: number[];
  totalCells: number;
  drawMonthLabels: string[];
  drawDates: string[];
}

export interface BuildMonthlyBucketDrawSeriesOptions {
  includeSupp?: boolean;
  maxNumber?: number;
  maxBucket?: number;
}

const DEFAULT_MAX_NUMBER = 45;
const DEFAULT_MAX_BUCKET = 8;

export const MONTHLY_BUCKET_HEATMAP_LABELS = [
  "Undrawn",
  "1x",
  "2x",
  "3x",
  "4x",
  "5x",
  "6x",
  "7x",
  "8x+",
] as const;

export const MONTHLY_BUCKET_HEATMAP_COLORS = [
  "#757575",
  "#42a5f5",
  "#66bb6a",
  "#26c6da",
  "#fbc02d",
  "#fb8c00",
  "#f4511e",
  "#e53935",
  "#8e24aa",
] as const;

export const MONTHLY_BUCKET_HEATMAP_LETTERS = [
  "U",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8+",
] as const;

const toMonthLabel = (epoch: number): string => {
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const buildMonthlyBucketDrawSeries = (
  history: Draw[],
  options: BuildMonthlyBucketDrawSeriesOptions = {},
): MonthlyBucketDrawSeries => {
  const includeSupp = options.includeSupp ?? true;
  const maxNumber = Math.max(1, Math.floor(options.maxNumber ?? DEFAULT_MAX_NUMBER));
  const maxBucket = Math.max(1, Math.floor(options.maxBucket ?? DEFAULT_MAX_BUCKET));
  const chrono = sortDrawsChronologically(history);
  const counts = new Array<number>(maxNumber).fill(0);
  const bucketIndexSeries = Array.from({ length: maxNumber }, () => [] as number[]);
  const bucketCounts = new Array<number>(maxBucket + 1).fill(0);
  const drawMonthLabels: string[] = [];
  const drawDates: string[] = [];
  let activeMonthLabel = "";

  chrono.forEach((draw) => {
    const monthLabel = toMonthLabel(parseDrawDateToEpoch(draw.date));
    if (monthLabel !== activeMonthLabel) {
      activeMonthLabel = monthLabel;
      counts.fill(0);
    }

    const seenInDraw = new Set<number>();
    const values = [
      ...(Array.isArray(draw.main) ? draw.main : []),
      ...(includeSupp && Array.isArray(draw.supp) ? draw.supp : []),
    ];

    values.forEach((value) => {
      if (!Number.isInteger(value) || value < 1 || value > maxNumber) return;
      if (seenInDraw.has(value)) return;
      seenInDraw.add(value);
      counts[value - 1] += 1;
    });

    for (let index = 0; index < maxNumber; index++) {
      const bucketIndex = Math.min(maxBucket, Math.max(0, counts[index] ?? 0));
      bucketIndexSeries[index].push(bucketIndex);
      bucketCounts[bucketIndex] += 1;
    }

    drawMonthLabels.push(monthLabel);
    drawDates.push(draw.date ?? "");
  });

  return {
    bucketIndexSeries,
    bucketCounts,
    totalCells: maxNumber * chrono.length,
    drawMonthLabels,
    drawDates,
  };
};

export default buildMonthlyBucketDrawSeries;
