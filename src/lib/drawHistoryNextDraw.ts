import type { Draw } from "../types";
import {
  datePartsToIso,
  isScheduledDrawDate,
  parseDrawDateParts,
} from "./planningDrawContext";

const DAY_MS = 86_400_000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface NextHistoryDrawDateResult {
  targetDate: string | null;
  latestRecordedDate: string | null;
  isFuture: boolean;
}

const datePartsToTime = (parts: DateParts): number => (
  new Date(parts.year, parts.month - 1, parts.day).getTime()
);

const datePartsFromTime = (time: number): DateParts => {
  const date = new Date(time);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
};

const addDays = (parts: DateParts, days: number): DateParts => (
  datePartsFromTime(datePartsToTime(parts) + days * DAY_MS)
);

export function findNextHistoryDrawDate(
  history: readonly Draw[],
  today: Date | string = new Date(),
): NextHistoryDrawDateResult {
  const todayParts = parseDrawDateParts(today) ?? parseDrawDateParts(new Date());
  let latestParts: DateParts | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  const recordedDates = new Set<string>();

  for (const draw of history) {
    if (draw.isSimulated) continue;
    const parts = parseDrawDateParts(draw.date);
    if (!parts) continue;
    const isoDate = datePartsToIso(parts);
    recordedDates.add(isoDate);
    const time = datePartsToTime(parts);
    if (time > latestTime) {
      latestTime = time;
      latestParts = parts;
    }
  }

  if (!latestParts || !todayParts) {
    return { targetDate: null, latestRecordedDate: latestParts ? datePartsToIso(latestParts) : null, isFuture: false };
  }

  let candidate = addDays(latestParts, 1);
  for (let guard = 0; guard < 60; guard += 1) {
    const candidateIso = datePartsToIso(candidate);
    if (isScheduledDrawDate(candidate) && !recordedDates.has(candidateIso)) {
      return {
        targetDate: candidateIso,
        latestRecordedDate: datePartsToIso(latestParts),
        isFuture: datePartsToTime(candidate) > datePartsToTime(todayParts),
      };
    }
    candidate = addDays(candidate, 1);
  }

  return {
    targetDate: null,
    latestRecordedDate: datePartsToIso(latestParts),
    isFuture: false,
  };
}
