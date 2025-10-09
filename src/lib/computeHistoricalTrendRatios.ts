/**
 * Historical trend ratio distribution.
 *
 * For each draw t (starting at index lookback), we classify every number 1..45
 * using the same logic as your active trend filter:
 *   trend(n, t) = sign( value[n][t] - value[n][t - lookback] ) with threshold.
 *
 * Then we read the actual draw at t (its 6 main + 2 supp) and count UP/DOWN/FLAT
 * among those 8 numbers producing ratio "u-d-f".
 *
 * We aggregate frequency of each tag across the examined draws.
 */
export interface TrendRatioStat {
  tag: string;        // "u-d-f"
  count: number;
  percent: number;    // of all draws considered
  up: number;
  down: number;
  flat: number;
}

interface Options {
  lookback: number;
  threshold: number;
  // valueSeries[number-1] = array (oldest -> newest) of hybrid/temperature values
  valueSeries: number[][];
  historyDraws: { main: number[]; supp: number[] }[]; // chronological oldest->newest
}

export function computeHistoricalTrendRatios(opts: Options): TrendRatioStat[] {
  const { lookback, threshold, valueSeries, historyDraws } = opts;
  if (!historyDraws.length || valueSeries.length !== 45) return [];

  const ratioCount = new Map<string, { c: number; up: number; down: number; flat: number }>();
  let eligibleDraws = 0;

  // We need at least lookback+1 value points to classify before draw t
  // For draw t we classify using values at indices (t-1) and (t-1 - lookback).
  for (let t = 0; t < historyDraws.length; t++) {
    const valueIndex = t; // assuming each draw appended a value row after it was processed previously
    const prevIndex = valueIndex - lookback;
    if (prevIndex < 0) continue; // insufficient history for lookback window
    // Ensure all series have enough length
    if (valueSeries[0].length <= valueIndex || valueSeries[0].length <= prevIndex) continue;

    eligibleDraws++;

    const draw = historyDraws[t];
    const nums8 = [...draw.main, ...draw.supp];

    let u = 0, d = 0, f = 0;
    for (const n of nums8) {
      if (n < 1 || n > 45) continue;
      const arr = valueSeries[n - 1];
      const delta = arr[valueIndex] - arr[prevIndex];
      if (delta >= threshold) u++;
      else if (delta <= -threshold) d++;
      else f++;
    }
    const tag = `${u}-${d}-${f}`;
    const rec = ratioCount.get(tag) || { c: 0, up: 0, down: 0, flat: 0 };
    rec.c += 1;
    rec.up += u;
    rec.down += d;
    rec.flat += f;
    ratioCount.set(tag, rec);
  }

  if (eligibleDraws === 0) return [];

  const stats: TrendRatioStat[] = Array.from(ratioCount.entries()).map(
    ([tag, obj]) => ({
      tag,
      count: obj.c,
      percent: +(100 * obj.c / eligibleDraws).toFixed(2),
      up: obj.up,
      down: obj.down,
      flat: obj.flat
    })
  );

  // Sort by frequency descending then tag
  stats.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return stats;
}