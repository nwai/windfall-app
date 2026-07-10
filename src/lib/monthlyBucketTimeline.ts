import type { Draw } from "../types";
import { createEmptyMonthlyBucketSets, type MonthlyBucketSets } from "./monthlyDrawSummary";

export interface MonthlyBucketTimelineEntry {
  monthLabel: string;
  bucketSets: MonthlyBucketSets;
  drawCount: number;
  totalDrawCount: number;
  drawStates: MonthlyBucketTimelineDrawState[];
}

export interface MonthlyBucketTimelineDrawState {
  drawOrdinal: number;
  drawDate: string;
  bucketSets: MonthlyBucketSets;
  isSimulated: boolean;
}

const DEFAULT_MAX_NUMBER = 45;
const ISO_DATE_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/;

const toMonthLabel = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
);

const parseDrawTimestamp = (rawDate: string | undefined): number | null => {
  if (!rawDate) return null;
  const isoMatch = rawDate.match(ISO_DATE_RE);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const timestamp = new Date(year, month - 1, day).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const parts = rawDate.split("/");
  if (parts.length >= 3) {
    const month = Number(parts[0]);
    const day = Number(parts[1]);
    let year = Number(parts[2]);
    if (year < 100) year += 2000;
    const timestamp = new Date(year, month - 1, day).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const timestamp = Date.parse(rawDate);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const bucketSetsFromCounts = (counts: readonly number[]): MonthlyBucketSets => {
  const sets = createEmptyMonthlyBucketSets();
  for (let index = 0; index < DEFAULT_MAX_NUMBER; index++) {
    const n = index + 1;
    const count = counts[index] ?? 0;
    if (count <= 0) sets.undrawn.add(n);
    else if (count === 1) sets.times1.add(n);
    else if (count === 2) sets.times2.add(n);
    else if (count === 3) sets.times3.add(n);
    else if (count === 4) sets.times4.add(n);
    else if (count === 5) sets.times5.add(n);
    else if (count === 6) sets.times6.add(n);
    else if (count === 7) sets.times7.add(n);
    else sets.times8.add(n);
  }
  return sets;
};

const parseMonthParts = (monthLabel: string): { year: number; month: number } | null => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const countScheduledDrawsInMonth = (monthLabel: string): number => {
  const parts = parseMonthParts(monthLabel);
  if (!parts) return 0;
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(parts.year, parts.month - 1, day);
    if (date.getMonth() !== parts.month - 1) break;
    const weekday = date.getDay();
    if (weekday === 1 || weekday === 3 || weekday === 5) count += 1;
  }
  return count;
};

export const buildMonthlyBucketTimeline = (history: Draw[]): MonthlyBucketTimelineEntry[] => {
  const parsedDraws = history
    .map((draw) => {
      const timestamp = parseDrawTimestamp(draw.date);
      if (timestamp === null) return null;
      return {
        draw,
        timestamp,
        monthLabel: toMonthLabel(new Date(timestamp)),
      };
    })
    .filter((entry): entry is { draw: Draw; timestamp: number; monthLabel: string } => entry !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  const grouped = new Map<string, {
    timestamp: number;
    counts: number[];
    drawCount: number;
    drawStates: MonthlyBucketTimelineDrawState[];
  }>();

  parsedDraws.forEach(({ draw, timestamp, monthLabel }) => {
    const existing = grouped.get(monthLabel);
    const bucket = existing ?? {
      timestamp,
      counts: new Array<number>(DEFAULT_MAX_NUMBER).fill(0),
      drawCount: 0,
      drawStates: [],
    };

    bucket.drawCount += 1;
    const seenInDraw = new Set<number>();
    [...(draw.main ?? []), ...(draw.supp ?? [])].forEach((value) => {
      if (!Number.isInteger(value) || value < 1 || value > DEFAULT_MAX_NUMBER) return;
      if (seenInDraw.has(value)) return;
      seenInDraw.add(value);
      bucket.counts[value - 1] += 1;
    });
    bucket.drawStates.push({
      drawOrdinal: bucket.drawCount,
      drawDate: draw.date ?? "",
      bucketSets: bucketSetsFromCounts(bucket.counts),
      isSimulated: !!draw.isSimulated,
    });

    if (!existing) grouped.set(monthLabel, bucket);
  });

  return [...grouped.entries()]
    .sort(([, a], [, b]) => a.timestamp - b.timestamp)
    .map(([monthLabel, bucket]) => ({
      monthLabel,
      bucketSets: bucketSetsFromCounts(bucket.counts),
      drawCount: bucket.drawCount,
      totalDrawCount: Math.max(bucket.drawCount, countScheduledDrawsInMonth(monthLabel)),
      drawStates: bucket.drawStates,
    }));
};

export default buildMonthlyBucketTimeline;
