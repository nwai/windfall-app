/**
 * Historical trend ratio distribution.
 *
 * For each eligible draw t, we classify every number 1..45
 * using the same logic as your active trend filter:
 *   trend(n, t) = sign( value[n][t-1] - value[n][t-1-lookback] ) with threshold.
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
  expected?: number;   // finite-population null expected count
  variance?: number;   // finite-population null variance approximation
  prob?: number;       // average per-draw finite-population probability
}

interface Options {
  lookback: number;
  threshold: number;
  // valueSeries[number-1] = array (oldest -> newest) of hybrid/temperature values
  valueSeries: number[][];
  historyDraws: { main: number[]; supp: number[] }[]; // chronological oldest->newest
}

function allRatioTags(): string[] {
  const tags: string[] = [];
  for (let up = 0; up <= 8; up += 1) {
    for (let down = 0; down <= 8 - up; down += 1) {
      const flat = 8 - up - down;
      tags.push(`${up}-${down}-${flat}`);
    }
  }
  return tags;
}

function choose(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0;
  const r = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= r; i += 1) {
    result = (result * (n - r + i)) / i;
  }
  return result;
}

function parseRatioTag(tag: string): { up: number; down: number; flat: number } | null {
  const parts = tag.split("-").map((part) => Number(part));
  if (parts.length !== 3) return null;
  const [up, down, flat] = parts;
  if (![up, down, flat].every((value) => Number.isInteger(value) && value >= 0)) return null;
  if (up + down + flat !== 8) return null;
  return { up, down, flat };
}

function validDrawNumbers(draw: { main: number[]; supp: number[] }): number[] | null {
  if (!Array.isArray(draw.main) || !Array.isArray(draw.supp)) return null;
  if (draw.main.length !== 6 || draw.supp.length !== 2) return null;
  const nums = [...draw.main, ...draw.supp];
  if (!nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) return null;
  if (new Set(nums).size !== nums.length) return null;
  return nums;
}

function finiteDeltaForNumber(valueSeries: number[][], n: number, valueIndex: number, prevIndex: number): number | null {
  const arr = valueSeries[n - 1];
  if (!Array.isArray(arr) || arr.length <= valueIndex || arr.length <= prevIndex) return null;
  const now = arr[valueIndex];
  const past = arr[prevIndex];
  if (!Number.isFinite(now) || !Number.isFinite(past)) return null;
  return now - past;
}

function finitePopulationProbability(
  upPopulation: number,
  downPopulation: number,
  flatPopulation: number,
  up: number,
  down: number,
  flat: number,
): number {
  const denominator = choose(45, 8);
  if (denominator <= 0) return 0;
  return (
    choose(upPopulation, up) *
    choose(downPopulation, down) *
    choose(flatPopulation, flat)
  ) / denominator;
}

export function computeHistoricalTrendRatios(opts: Options): TrendRatioStat[] {
  const { lookback, threshold, valueSeries, historyDraws } = opts;
  if (!historyDraws.length || valueSeries.length !== 45) return [];
  const L = Math.max(1, Math.floor(Number.isFinite(lookback) ? lookback : 1));
  const theta = Math.max(0, Number.isFinite(threshold) ? threshold : 0);
  const tags = allRatioTags();

  const ratioCount = new Map<string, { c: number; up: number; down: number; flat: number; expected: number; variance: number }>();
  let eligibleDraws = 0;

  // We need at least lookback+1 value points to classify before draw t
  // For draw t we classify using values at indices (t-1) and (t-1 - lookback).
  for (let t = 0; t < historyDraws.length; t++) {
    const valueIndex = t - 1;
    const prevIndex = valueIndex - L;
    if (prevIndex < 0) continue; // insufficient history for lookback window

    const draw = historyDraws[t];
    const nums8 = validDrawNumbers(draw);
    if (!nums8) continue;

    const deltas = new Map<number, number>();
    let populationUp = 0;
    let populationDown = 0;
    let populationFlat = 0;

    let validSeries = true;
    for (let n = 1; n <= 45; n += 1) {
      const delta = finiteDeltaForNumber(valueSeries, n, valueIndex, prevIndex);
      if (delta === null) {
        validSeries = false;
        break;
      }
      deltas.set(n, delta);
      if (delta >= theta) populationUp += 1;
      else if (delta <= -theta) populationDown += 1;
      else populationFlat += 1;
    }
    if (!validSeries) continue;

    eligibleDraws++;

    for (const tag of tags) {
      const parsed = parseRatioTag(tag);
      if (!parsed) continue;
      const probability = finitePopulationProbability(
        populationUp,
        populationDown,
        populationFlat,
        parsed.up,
        parsed.down,
        parsed.flat,
      );
      const rec = ratioCount.get(tag) || { c: 0, up: 0, down: 0, flat: 0, expected: 0, variance: 0 };
      rec.expected += probability;
      rec.variance += probability * (1 - probability);
      ratioCount.set(tag, rec);
    }

    let u = 0, d = 0, f = 0;
    for (const n of nums8) {
      const delta = deltas.get(n);
      if (delta === undefined) continue;
      if (delta >= theta) u++;
      else if (delta <= -theta) d++;
      else f++;
    }
    const tag = `${u}-${d}-${f}`;
    const rec = ratioCount.get(tag) || { c: 0, up: 0, down: 0, flat: 0, expected: 0, variance: 0 };
    rec.c += 1;
    rec.up += u;
    rec.down += d;
    rec.flat += f;
    ratioCount.set(tag, rec);
  }

  if (eligibleDraws === 0) return [];

  const stats: TrendRatioStat[] = tags.map((tag) => {
    const obj = ratioCount.get(tag) || { c: 0, up: 0, down: 0, flat: 0, expected: 0, variance: 0 };
    return {
      tag,
      count: obj.c,
      percent: +(100 * obj.c / eligibleDraws).toFixed(2),
      up: obj.up,
      down: obj.down,
      flat: obj.flat,
      expected: obj.expected,
      variance: obj.variance,
      prob: obj.expected / eligibleDraws,
    };
  });

  // Sort by frequency descending then tag
  stats.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return stats;
}
