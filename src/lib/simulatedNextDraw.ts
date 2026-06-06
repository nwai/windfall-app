import type { Draw } from "../types";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GAP_DAYS = 2;
const SCHEDULED_GAP_BY_WEEKDAY = new Map<number, number>([
  [1, 2],
  [3, 2],
  [5, 3],
]);

const formatEpochAsIsoDate = (epoch: number): string => {
  const date = new Date(epoch);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toWholeDays = (epochDelta: number): number => Math.round(epochDelta / DAY_MS);

export const inferSimulatedNextDrawGapDays = (history: Draw[]): number => {
  const actualChrono = sortDrawsChronologically(history.filter((draw) => !draw.isSimulated));
  if (actualChrono.length < 2) return DEFAULT_GAP_DAYS;

  const latestEpoch = parseDrawDateToEpoch(actualChrono[actualChrono.length - 1]?.date ?? "");
  const latestWeekday = new Date(latestEpoch).getDay();
  const weekdaySpecificGaps = new Map<number, { count: number; lastSeenIndex: number }>();
  const allRecentGaps = new Map<number, { count: number; lastSeenIndex: number }>();

  for (let index = 0; index < actualChrono.length - 1; index += 1) {
    const currentEpoch = parseDrawDateToEpoch(actualChrono[index]?.date ?? "");
    const nextEpoch = parseDrawDateToEpoch(actualChrono[index + 1]?.date ?? "");
    const gapDays = toWholeDays(nextEpoch - currentEpoch);
    if (!Number.isFinite(gapDays) || gapDays <= 0 || gapDays > 7) continue;

    const allGapEntry = allRecentGaps.get(gapDays) ?? { count: 0, lastSeenIndex: -1 };
    allGapEntry.count += 1;
    allGapEntry.lastSeenIndex = index;
    allRecentGaps.set(gapDays, allGapEntry);

    const currentWeekday = new Date(currentEpoch).getDay();
    if (currentWeekday !== latestWeekday) continue;

    const weekdayGapEntry = weekdaySpecificGaps.get(gapDays) ?? { count: 0, lastSeenIndex: -1 };
    weekdayGapEntry.count += 1;
    weekdayGapEntry.lastSeenIndex = index;
    weekdaySpecificGaps.set(gapDays, weekdayGapEntry);
  }

  if (weekdaySpecificGaps.size === 0) {
    const scheduledGap = SCHEDULED_GAP_BY_WEEKDAY.get(latestWeekday);
    if (scheduledGap) return scheduledGap;
  }

  const source = weekdaySpecificGaps.size > 0 ? weekdaySpecificGaps : allRecentGaps;
  const bestEntry = Array.from(source.entries()).sort((left, right) => {
    if (right[1].count !== left[1].count) return right[1].count - left[1].count;
    if (right[1].lastSeenIndex !== left[1].lastSeenIndex) return right[1].lastSeenIndex - left[1].lastSeenIndex;
    return left[0] - right[0];
  })[0];

  return bestEntry?.[0] ?? DEFAULT_GAP_DAYS;
};

export const buildSimulatedNextDraw = (history: Draw[], simulatedDraw: Draw): Draw => {
  const actualChrono = sortDrawsChronologically(history.filter((draw) => !draw.isSimulated));
  const latestActualDraw = actualChrono[actualChrono.length - 1];

  if (!latestActualDraw) {
    return {
      ...simulatedDraw,
      main: [...(simulatedDraw.main ?? [])],
      supp: [...(simulatedDraw.supp ?? [])],
      date: simulatedDraw.date || formatEpochAsIsoDate(Date.now()),
      isSimulated: true,
    };
  }

  const latestEpoch = parseDrawDateToEpoch(latestActualDraw.date);
  const gapDays = inferSimulatedNextDrawGapDays(actualChrono);
  const nextEpoch = latestEpoch + gapDays * DAY_MS;

  return {
    ...simulatedDraw,
    main: [...(simulatedDraw.main ?? [])],
    supp: [...(simulatedDraw.supp ?? [])],
    date: formatEpochAsIsoDate(nextEpoch),
    isSimulated: true,
  };
};

export default buildSimulatedNextDraw;
