import { Draw } from "../types";
import { getSDE1FilteredPool } from "../sde1";

/**
 * GPWF-style per-number weights from recent history.
 * weight[n] = (freq[n] + 1) / (avgFreq + 1), then clamped
 * - Uses both main and supp, like your Monte Carlo empirical weights.
 * - Self-normalizing around 1.0 by dividing by the average frequency.
 */
export function buildGPWFNumberWeights(
  recent: Draw[],
  clampMin = 0.75,
  clampMax = 1.33
): Record<number, number> {
  const freq = Array(46).fill(0); // 1..45
  for (const draw of recent) {
    for (const n of draw.main) if (n >= 1 && n <= 45) freq[n]++;
    for (const n of draw.supp) if (n >= 1 && n <= 45) freq[n]++;
  }
  const total = freq.slice(1).reduce((a, b) => a + b, 0);
  const avg = total / 45;
  const weights: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) {
    const w = (freq[n] + 1) / (avg + 1);
    weights[n] = Math.max(clampMin, Math.min(clampMax, w));
  }
  return weights;
}

/**
 * HC3 penalty: numbers that appeared in both of the last two draws (main or supp)
 * get a multiplicative penalty; others are 1.0.
 */
export function buildHC3PenaltyWeights(
  history: Draw[],
  penalty = 0.7
): Record<number, number> {
  const weights: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) weights[n] = 1;

  if (history.length < 2) return weights;

  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const lastAll = new Set([...last.main, ...last.supp]);
  const prevAll = new Set([...prev.main, ...prev.supp]);
  const overlap = new Set<number>();
  lastAll.forEach((n) => {
    if (prevAll.has(n)) overlap.add(n);
  });
  overlap.forEach((n) => {
    if (n >= 1 && n <= 45) weights[n] = penalty;
  });
  return weights;
}

/**
 * SDE1 penalty: numbers whose last digit is duplicated in the most recent draw
 * get a multiplicative penalty; others are 1.0.
 */
export function buildSDE1PenaltyWeights(
  history: Draw[],
  penalty = 0.75
): Record<number, number> {
  const weights: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) weights[n] = 1;

  if (history.length === 0) return weights;
  const { excludedNumbers } = getSDE1FilteredPool(history);
  excludedNumbers.forEach((n) => {
    if (n >= 1 && n <= 45) weights[n] = penalty;
  });
  return weights;
}

export interface MRBBucketBoosts {
  undrawn: number;
  times1: number;
  times2: number;
  times3: number;
  times4: number;
  times5: number;
  times6: number;
  times7: number;
  times8: number;
}

export type MRBBucketNums = Record<keyof MRBBucketBoosts, number[]>;

export interface MRBResult {
  weights: Record<number, number>;
  /** Numbers in each frequency bucket for the current month */
  bucketNums: MRBBucketNums;
  drawsSoFarThisMonth: number;
  /** Back-compat aliases */
  onceDrawnNums: number[];
  repeatedNums: number[];
  twiceDrawnNums: number[];
}

export const MRB_BUCKET_KEYS = ["undrawn", "times1", "times2", "times3", "times4", "times5", "times6", "times7", "times8"] as const;
export const MRB_BUCKET_LABELS: Record<keyof MRBBucketBoosts, string> = {
  undrawn: "Undrawn (0x)", times1: "Drawn 1x", times2: "Drawn 2x", times3: "Drawn 3x",
  times4: "Drawn 4x", times5: "Drawn 5x", times6: "Drawn 6x", times7: "Drawn 7x", times8: "Drawn 8x+",
};
export const MRB_DEFAULT_BOOSTS: MRBBucketBoosts = {
  undrawn: 1, times1: 1, times2: 1, times3: 1, times4: 1, times5: 1, times6: 1, times7: 1, times8: 1,
};
/** Max sum of (boost - 1.0) across all active buckets */
export const MRB_BUDGET = 9;

/**
 * Monthly Repeat Bias: applies per-bucket boost multipliers to numbers based on how many
 * times they appeared in the current calendar month.
 *
 * Budget rule: sum of (boost − 1.0) for all buckets ≤ MRB_BUDGET (9).
 * boost = 1.0 → neutral (no effect). Values > 1.0 increase selection probability.
 *
 * @param includeSupp - include supplementary numbers when counting (default true)
 * @param effectiveDate - the date to treat as "today" when determining the current month.
 *   Defaults to the actual current date (new Date()). Pass a date in the next month to
 *   forward-look (e.g. when the previous month is already complete).
 */
export function buildMonthlyRepeatBiasWeights(
  history: Draw[],
  bucketBoosts: MRBBucketBoosts = MRB_DEFAULT_BOOSTS,
  includeSupp: boolean = true,
  effectiveDate?: Date,
): MRBResult {
  const weights: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) weights[n] = 1;

  const emptyBuckets: MRBBucketNums = { undrawn: [], times1: [], times2: [], times3: [], times4: [], times5: [], times6: [], times7: [], times8: [] };
  const empty: MRBResult = { weights, bucketNums: emptyBuckets, drawsSoFarThisMonth: 0, onceDrawnNums: [], repeatedNums: [], twiceDrawnNums: [] };

  if (!history.length) return empty;

  // Use the provided effective date, or today's calendar date.
  // This ensures the function always works in the month the user is planning
  // for, not the month of the most recent draw (which may already be over).
  const ref = effectiveDate ?? new Date();
  if (isNaN(ref.getTime())) return empty;

  const currentYear = ref.getFullYear();
  const currentMonth = ref.getMonth();

  const currentMonthDraws = history.filter((d) => {
    const dt = new Date(d.date || "");
    return !isNaN(dt.getTime()) && dt.getFullYear() === currentYear && dt.getMonth() === currentMonth;
  });

  const freq: Record<number, number> = {};
  for (const draw of currentMonthDraws) {
    const nums = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
    for (const n of nums) {
      if (n >= 1 && n <= 45) freq[n] = (freq[n] || 0) + 1;
    }
  }

  const bucketNums: MRBBucketNums = { undrawn: [], times1: [], times2: [], times3: [], times4: [], times5: [], times6: [], times7: [], times8: [] };

  for (let n = 1; n <= 45; n++) {
    const count = freq[n] ?? 0;
    let bucket: keyof MRBBucketBoosts;
    if (count === 0) bucket = "undrawn";
    else if (count === 1) bucket = "times1";
    else if (count === 2) bucket = "times2";
    else if (count === 3) bucket = "times3";
    else if (count === 4) bucket = "times4";
    else if (count === 5) bucket = "times5";
    else if (count === 6) bucket = "times6";
    else if (count === 7) bucket = "times7";
    else bucket = "times8";

    bucketNums[bucket].push(n);
    const boost = bucketBoosts[bucket] ?? 1;
    if (boost !== 1) weights[n] = boost;
  }

  return {
    weights,
    bucketNums,
    drawsSoFarThisMonth: currentMonthDraws.length,
    onceDrawnNums: bucketNums.times1,
    repeatedNums: [...bucketNums.times2, ...bucketNums.times3, ...bucketNums.times4, ...bucketNums.times5, ...bucketNums.times6, ...bucketNums.times7, ...bucketNums.times8],
    twiceDrawnNums: bucketNums.times2,
  };
}

/**
 * Combine multiple per-number weight maps by multiplying them.
 */
export function combinePerNumberWeights(
  ...maps: Array<Record<number, number> | undefined>
): Record<number, number> {
  const out: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) {
    let w = 1;
    for (const m of maps) {
      if (m) w *= m[n] ?? 1;
    }
    out[n] = w;
  }
  return out;
}
