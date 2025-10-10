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
 * Build Odd/Even bias weights based on target ratio(s).
 * If a number's parity aligns with the target ratio, it gets a boost; otherwise penalty.
 * @param selectedRatios - array of ratio strings like ["5:3", "4:4"]
 * @param boostFactor - multiplier for numbers that align (default 1.2)
 * @param penaltyFactor - multiplier for numbers that don't align (default 0.85)
 */
export function buildOddEvenBiasWeights(
  selectedRatios: string[],
  boostFactor = 1.2,
  penaltyFactor = 0.85
): Record<number, number> {
  const weights: Record<number, number> = {};
  
  // If no ratios selected, return neutral weights
  if (!selectedRatios || selectedRatios.length === 0) {
    for (let n = 1; n <= 45; n++) weights[n] = 1;
    return weights;
  }

  // Parse the selected ratios to get target odd/even counts
  // We'll use the first ratio as the target (could be enhanced to handle multiple)
  const firstRatio = selectedRatios[0];
  const [oddStr, evenStr] = firstRatio.split(':');
  const targetOdd = parseInt(oddStr, 10);
  const targetEven = parseInt(evenStr, 10);
  
  // Total numbers in a draw (6 main + 2 supp = 8)
  const totalNumbers = 8;
  const targetOddRatio = targetOdd / totalNumbers;

  // Apply weights based on parity
  for (let n = 1; n <= 45; n++) {
    const isOdd = n % 2 === 1;
    // If we want more odds (targetOddRatio > 0.5), boost odd numbers
    // If we want more evens (targetOddRatio < 0.5), boost even numbers
    if (isOdd) {
      weights[n] = targetOddRatio >= 0.5 ? boostFactor : penaltyFactor;
    } else {
      weights[n] = targetOddRatio < 0.5 ? boostFactor : penaltyFactor;
    }
  }
  
  return weights;
}

/**
 * Build Trend Ratio bias weights based on allowed trend ratios and current trend map.
 * Numbers classified as UP/DOWN/FLAT get boosted/penalized based on target ratio.
 * @param trendMap - Map of number -> TrendClass ('UP' | 'DOWN' | 'FLAT')
 * @param allowedTrendRatios - array of ratio tags like ["3-2-3", "4-2-2"]
 * @param boostFactor - multiplier for numbers that align (default 1.25)
 * @param penaltyFactor - multiplier for numbers that don't align (default 0.8)
 */
export function buildTrendRatioBiasWeights(
  trendMap: Map<number, 'UP' | 'DOWN' | 'FLAT'>,
  allowedTrendRatios: string[],
  boostFactor = 1.25,
  penaltyFactor = 0.8
): Record<number, number> {
  const weights: Record<number, number> = {};
  
  // If no ratios selected or no trendMap, return neutral weights
  if (!allowedTrendRatios || allowedTrendRatios.length === 0 || !trendMap) {
    for (let n = 1; n <= 45; n++) weights[n] = 1;
    return weights;
  }

  // Parse the first allowed ratio to get target U-D-F counts
  const firstRatio = allowedTrendRatios[0];
  const [upStr, downStr, flatStr] = firstRatio.split('-');
  const targetUp = parseInt(upStr, 10);
  const targetDown = parseInt(downStr, 10);
  const targetFlat = parseInt(flatStr, 10);
  
  const totalNumbers = 8;
  const targetUpRatio = targetUp / totalNumbers;
  const targetDownRatio = targetDown / totalNumbers;
  const targetFlatRatio = targetFlat / totalNumbers;

  // Determine which trend class is most desired
  let primaryTrend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
  const maxTarget = Math.max(targetUpRatio, targetDownRatio, targetFlatRatio);
  if (targetUpRatio === maxTarget) primaryTrend = 'UP';
  else if (targetDownRatio === maxTarget) primaryTrend = 'DOWN';
  else primaryTrend = 'FLAT';

  // Apply weights based on trend classification
  for (let n = 1; n <= 45; n++) {
    const trendClass = trendMap.get(n) || 'FLAT';
    weights[n] = trendClass === primaryTrend ? boostFactor : penaltyFactor;
  }
  
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