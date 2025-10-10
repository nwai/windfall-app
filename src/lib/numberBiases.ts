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