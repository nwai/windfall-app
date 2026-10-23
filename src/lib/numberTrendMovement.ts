import type { Draw } from "../types";
import { filterRealDrawHistory } from "./realDrawHistory";
import { strictValidateDraws } from "./strictDrawValidation";
import { sortDrawsChronologically } from "./recentDraws";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";

export const NUMBER_TREND_WEEK_DRAW_WINDOW = 3;
export const NUMBER_TREND_MONTH_DRAW_WINDOW = 13;
export const NUMBER_TREND_FLAT_BAND_PP = 5.5;
export const NUMBER_TREND_MOVEMENT_VERSION = "NTMR-1";
export const NUMBER_TREND_NEUTRAL_RATE = 8 / 45;

export type NumberTrendDirection = "up" | "flat" | "down";

export function calculateNumberTrendRate(hits3: number, hits13: number, recentDrawCount: number, comparisonDrawCount: number) {
  const r3 = recentDrawCount > 0 ? hits3 / recentDrawCount : 0;
  const r13 = comparisonDrawCount > 0 ? hits13 / comparisonDrawCount : 0;
  const deltaPP = (r3 - r13) * 100;
  const dir: NumberTrendDirection = deltaPP > NUMBER_TREND_FLAT_BAND_PP ? "up"
    : deltaPP < -NUMBER_TREND_FLAT_BAND_PP ? "down" : "flat";
  return { r3, r13, deltaPP, dir };
}

export const NUMBER_TREND_MOVEMENT_BANDS = [
  { id: "deep-down", label: "Below -40", max: -40 },
  { id: "down", label: "-40 to below -20", max: -20 },
  { id: "slight-down", label: "-20 to below -5.5", max: -5.5 },
  { id: "flat", label: "-5.5 to +5.5", max: 5.5 },
  { id: "slight-up", label: "Above +5.5 to +20", max: 20 },
  { id: "up", label: "Above +20 to +40", max: 40 },
  { id: "high-up", label: "Above +40", max: Infinity },
] as const;

export function numberTrendMovementBand(value: number): string {
  if (value < -40) return "deep-down";
  if (value < -20) return "down";
  if (value < -NUMBER_TREND_FLAT_BAND_PP) return "slight-down";
  if (value <= NUMBER_TREND_FLAT_BAND_PP) return "flat";
  if (value <= 20) return "slight-up";
  if (value <= 40) return "up";
  return "high-up";
}

export interface NumberTrendMovementPoint {
  date: string;
  position: number;
  hits3: number;
  hits13: number;
  recentDrawCount: number;
  comparisonDrawCount: number;
  deltaPP: number;
  direction: NumberTrendDirection;
  role: "main" | "supp" | "absent";
  fullWindow: boolean;
  nextDate: string | null;
  nextHit: boolean | null;
  nextStatus: "scored" | "gap" | "pending";
}

export interface NumberTrendMovementReplay {
  number: number;
  modelVersion: string;
  points: NumberTrendMovementPoint[];
  ignored: { simulated: number; malformed: number; offSchedule: number; duplicateDateRows: number };
  summary: {
    fullWindowCount: number;
    warmupCount: number;
    lowest: NumberTrendMovementPoint | null;
    highest: NumberTrendMovementPoint | null;
    typicalRange: [number, number] | null;
    mathematicalLimit: number | null;
    currentRun: number;
  };
  states: { direction: NumberTrendDirection; count: number; longestRun: number }[];
  bands: { id: string; label: string; trials: number; hits: number; rate: number | null; liftPP: number | null }[];
}

const nextScheduledDate = (date: string): string => {
  const parts = parseDrawDateParts(date)!;
  const next = new Date(parts.year, parts.month - 1, parts.day);
  for (let offset = 0; offset < 7; offset += 1) {
    next.setDate(next.getDate() + 1);
    const candidate = { year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate() };
    if (isScheduledDrawDate(candidate)) return datePartsToIso(candidate);
  }
  throw new Error("No scheduled Windfall draw date found");
};

const quantile = (sorted: readonly number[], fraction: number): number => {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
};

export function analyzeNumberTrendMovement(history: readonly Draw[], number: number): NumberTrendMovementReplay {
  if (!Number.isInteger(number) || number < 1 || number > 45) throw new RangeError("Inspect a number from 1 to 45");
  const real = filterRealDrawHistory(history, "Number Trends Movement Replay");
  const valid = strictValidateDraws(real.history);
  const scheduled = valid.filter(draw => isScheduledDrawDate(parseDrawDateParts(draw.date)!));
  const dateCounts = new Map<string, number>();
  scheduled.forEach(draw => {
    const date = datePartsToIso(parseDrawDateParts(draw.date)!);
    dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
  });
  // Do not choose between competing results or count one date as two draws.
  const unique = scheduled.filter(draw => dateCounts.get(datePartsToIso(parseDrawDateParts(draw.date)!)) === 1);
  const ordered = sortDrawsChronologically(unique);
  const appearances = ordered.map(draw => draw.main.includes(number) || draw.supp.includes(number) ? 1 : 0);
  const prefix = [0];
  appearances.forEach(hit => prefix.push(prefix[prefix.length - 1] + hit));
  const points = ordered.map((draw, index): NumberTrendMovementPoint => {
    const recentDrawCount = Math.min(index + 1, NUMBER_TREND_WEEK_DRAW_WINDOW);
    const comparisonDrawCount = Math.min(index + 1, NUMBER_TREND_MONTH_DRAW_WINDOW);
    const hits3 = prefix[index + 1] - prefix[index + 1 - recentDrawCount];
    const hits13 = prefix[index + 1] - prefix[index + 1 - comparisonDrawCount];
    const { deltaPP, dir } = calculateNumberTrendRate(hits3, hits13, recentDrawCount, comparisonDrawCount);
    const date = datePartsToIso(parseDrawDateParts(draw.date)!);
    const next = ordered[index + 1];
    const nextDate = next ? datePartsToIso(parseDrawDateParts(next.date)!) : null;
    const nextStatus = nextDate === null ? "pending" : nextDate === nextScheduledDate(date) ? "scored" : "gap";
    return {
      date, position: index + 1, hits3, hits13, recentDrawCount, comparisonDrawCount, deltaPP, direction: dir,
      role: draw.main.includes(number) ? "main" : draw.supp.includes(number) ? "supp" : "absent",
      fullWindow: comparisonDrawCount === NUMBER_TREND_MONTH_DRAW_WINDOW,
      nextDate, nextHit: nextStatus === "scored" ? appearances[index + 1] === 1 : null, nextStatus,
    };
  });
  const complete = points.filter(point => point.fullWindow);
  const states = (["up", "flat", "down"] as const).map(direction => ({ direction, count: 0, longestRun: 0 }));
  let previous: NumberTrendMovementPoint | null = null;
  let run = 0;
  for (const point of complete) {
    run = point.direction === previous?.direction && previous.nextStatus === "scored" ? run + 1 : 1;
    previous = point;
    const state = states.find(row => row.direction === point.direction)!;
    state.count += 1;
    state.longestRun = Math.max(state.longestRun, run);
  }
  const values = complete.map(point => point.deltaPP).sort((a, b) => a - b);
  const current = points[points.length - 1];
  const bands = NUMBER_TREND_MOVEMENT_BANDS.map(band => {
    const trials = complete.filter(point => point.nextStatus === "scored" && numberTrendMovementBand(point.deltaPP) === band.id);
    const hits = trials.filter(point => point.nextHit).length;
    const rate = trials.length ? hits / trials.length : null;
    return { id: band.id, label: band.label, trials: trials.length, hits, rate,
      liftPP: rate === null ? null : (rate - NUMBER_TREND_NEUTRAL_RATE) * 100 };
  });
  return {
    number, modelVersion: NUMBER_TREND_MOVEMENT_VERSION, points,
    ignored: { simulated: real.simulatedRowsIgnored, malformed: real.history.length - valid.length,
      offSchedule: valid.length - scheduled.length, duplicateDateRows: scheduled.length - unique.length },
    summary: {
      fullWindowCount: complete.length, warmupCount: points.length - complete.length,
      lowest: complete.reduce<NumberTrendMovementPoint | null>((lowest, p) => !lowest || p.deltaPP < lowest.deltaPP ? p : lowest, null),
      highest: complete.reduce<NumberTrendMovementPoint | null>((highest, p) => !highest || p.deltaPP > highest.deltaPP ? p : highest, null),
      typicalRange: values.length ? [quantile(values, 0.1), quantile(values, 0.9)] : null,
      mathematicalLimit: current ? 100 * (1 - current.recentDrawCount / current.comparisonDrawCount) : null,
      currentRun: current?.fullWindow ? run : 0,
    }, states, bands,
  };
}
