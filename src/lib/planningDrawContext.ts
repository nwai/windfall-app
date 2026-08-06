import type { Draw } from "../types";

export interface PlanningDrawContext {
  today: Date;
  todayIso: string;
  todayMonthLabel: string;
  latestRecordedDrawDate?: string;
  latestRecordedMonthLabel?: string;
  latestRecordedMonthDrawCount: number;
  latestRecordedMonthExpectedDrawCount: number;
  latestRecordedMonthIsComplete: boolean;
  targetDrawDate: string;
  targetMonthLabel: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
  completedDrawsInTargetMonth: number;
  isPlanningReset: boolean;
  isPlanningLastDraw: boolean;
  sourceMonthLabel?: string;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

const DRAW_WEEKDAYS = new Set([1, 3, 5]);
const DAY_MS = 86_400_000;

const pad2 = (value: number): string => String(value).padStart(2, "0");

export const datePartsToIso = (parts: DateParts): string => (
  `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
);

export const monthLabelFromDateParts = (parts: DateParts): string => (
  `${parts.year}-${pad2(parts.month)}`
);

export const monthLabelFromDate = (date: Date): string => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
);

export const localDateKey = (date = new Date()): string => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);

export const dateFromMonthLabel = (monthLabel: string): Date | null => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
};

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

const datePartsFromDate = (date: Date): DateParts => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
});

const isValidDateParts = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
};

export const parseDrawDateParts = (value: string | Date | undefined | null): DateParts | null => {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return datePartsFromDate(value);
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (isValidDateParts(year, month, day)) return { year, month, day };
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const rawYear = Number(slash[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (isValidDateParts(year, month, day)) return { year, month, day };
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return datePartsFromDate(new Date(parsed));
};

const addDays = (parts: DateParts, days: number): DateParts => (
  datePartsFromTime(datePartsToTime(parts) + (days * DAY_MS))
);

const weekday = (parts: DateParts): number => (
  new Date(parts.year, parts.month - 1, parts.day).getDay()
);

export const isScheduledDrawDate = (parts: DateParts): boolean => DRAW_WEEKDAYS.has(weekday(parts));

export const countScheduledDrawsInMonth = (monthLabel: string, throughDay?: number): number => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0;

  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    if (!isValidDateParts(year, month, day)) break;
    if (throughDay !== undefined && day > throughDay) break;
    if (isScheduledDrawDate({ year, month, day })) count += 1;
  }
  return count;
};

const latestRecordedDrawParts = (history: readonly Draw[]): DateParts | null => {
  let latest: DateParts | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const draw of history) {
    if (draw.isSimulated) continue;
    const parts = parseDrawDateParts(draw.date);
    if (!parts) continue;
    const time = datePartsToTime(parts);
    if (time > latestTime) {
      latest = parts;
      latestTime = time;
    }
  }
  return latest;
};

const recordedDateSet = (history: readonly Draw[]): Set<string> => {
  const dates = new Set<string>();
  for (const draw of history) {
    if (draw.isSimulated) continue;
    const parts = parseDrawDateParts(draw.date);
    if (parts) dates.add(datePartsToIso(parts));
  }
  return dates;
};

const recordedMonthCounts = (history: readonly Draw[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const draw of history) {
    if (draw.isSimulated) continue;
    const parts = parseDrawDateParts(draw.date);
    if (!parts) continue;
    const monthLabel = monthLabelFromDateParts(parts);
    counts.set(monthLabel, (counts.get(monthLabel) ?? 0) + 1);
  }
  return counts;
};

const findNextUnrecordedScheduledDraw = (today: DateParts, recordedDates: ReadonlySet<string>): DateParts => {
  let candidate = today;
  for (let guard = 0; guard < 60; guard += 1) {
    if (isScheduledDrawDate(candidate) && !recordedDates.has(datePartsToIso(candidate))) {
      return candidate;
    }
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

export const buildPlanningDrawContext = (
  history: readonly Draw[],
  options: { now?: Date | string } = {},
): PlanningDrawContext => {
  const todayParts = parseDrawDateParts(options.now ?? new Date()) ?? datePartsFromDate(new Date());
  const today = new Date(todayParts.year, todayParts.month - 1, todayParts.day);
  const recordedDates = recordedDateSet(history);
  const monthCounts = recordedMonthCounts(history);
  const latestParts = latestRecordedDrawParts(history);
  const targetParts = findNextUnrecordedScheduledDraw(todayParts, recordedDates);

  const todayIso = datePartsToIso(todayParts);
  const todayMonthLabel = monthLabelFromDateParts(todayParts);
  const targetDrawDate = datePartsToIso(targetParts);
  const targetMonthLabel = monthLabelFromDateParts(targetParts);
  const targetMonthExpectedDrawCount = Math.max(1, countScheduledDrawsInMonth(targetMonthLabel));
  const targetDrawOrdinal = Math.max(1, countScheduledDrawsInMonth(targetMonthLabel, targetParts.day));
  const targetTime = datePartsToTime(targetParts);
  const completedDrawsInTargetMonth = history.reduce((count, draw) => {
    if (draw.isSimulated) return count;
    const parts = parseDrawDateParts(draw.date);
    if (!parts || monthLabelFromDateParts(parts) !== targetMonthLabel) return count;
    return datePartsToTime(parts) < targetTime ? count + 1 : count;
  }, 0);

  const latestRecordedDrawDate = latestParts ? datePartsToIso(latestParts) : undefined;
  const latestRecordedMonthLabel = latestParts ? monthLabelFromDateParts(latestParts) : undefined;
  const latestRecordedMonthDrawCount = latestRecordedMonthLabel
    ? monthCounts.get(latestRecordedMonthLabel) ?? 0
    : 0;
  const latestRecordedMonthExpectedDrawCount = latestRecordedMonthLabel
    ? Math.max(1, countScheduledDrawsInMonth(latestRecordedMonthLabel))
    : 0;
  const latestRecordedMonthIsComplete = latestRecordedMonthExpectedDrawCount > 0
    && latestRecordedMonthDrawCount >= latestRecordedMonthExpectedDrawCount;
  const isPlanningReset = completedDrawsInTargetMonth === 0
    && (!latestRecordedMonthLabel || targetMonthLabel !== latestRecordedMonthLabel || latestRecordedMonthIsComplete);

  return {
    today,
    todayIso,
    todayMonthLabel,
    latestRecordedDrawDate,
    latestRecordedMonthLabel,
    latestRecordedMonthDrawCount,
    latestRecordedMonthExpectedDrawCount,
    latestRecordedMonthIsComplete,
    targetDrawDate,
    targetMonthLabel,
    targetDrawOrdinal,
    targetMonthExpectedDrawCount,
    completedDrawsInTargetMonth,
    isPlanningReset,
    isPlanningLastDraw: targetDrawOrdinal >= targetMonthExpectedDrawCount,
    sourceMonthLabel: latestRecordedMonthLabel,
  };
};
