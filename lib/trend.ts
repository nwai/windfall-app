/**
 * Trend classification utilities.
 * We approximate trend by (value_now - value_{now-L}) using a supplied
 * per-number time series (older -> newer).
 */

export type TrendClass = 'UP' | 'DOWN' | 'FLAT';

export interface ComputeTrendMapOptions {
  lookback?: number;     // L, default 4
  threshold?: number;    // θ, default 0.02 (2% of normalized scale)
}

export function computeTrendMap(
  // valueSeries[number-1] = array of hybrid/temperature values chronological (old->new)
  valueSeries: number[][],
  options: ComputeTrendMapOptions = {}
): Map<number, TrendClass> {
  const L = options.lookback ?? 4;
  const thresh = options.threshold ?? 0.02;
  const out = new Map<number, TrendClass>();
  for (let n = 0; n < valueSeries.length; n++) {
    const arr = valueSeries[n];
    if (!arr.length || arr.length <= L) {
      out.set(n + 1, 'FLAT');
      continue;
    }
    const now = arr[arr.length - 1];
    const past = arr[arr.length - 1 - L];
    const delta = now - past;
    if (delta >= thresh) out.set(n + 1, 'UP');
    else if (delta <= -thresh) out.set(n + 1, 'DOWN');
    else out.set(n + 1, 'FLAT');
  }
  return out;
}

/**
 * Produce a ratio tag "u-d-f" for an array of 8 numbers based on a trendMap.
 */
export function trendRatioTag(numbers: number[], trendMap: Map<number, TrendClass>): string {
  let u = 0, d = 0, f = 0;
  for (const n of numbers) {
    const cls = trendMap.get(n) || 'FLAT';
    if (cls === 'UP') u++; else if (cls === 'DOWN') d++; else f++;
  }
  return `${u}-${d}-${f}`;
}