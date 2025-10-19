import { Draw } from "../types";

export type ZoneGroups = number[][]; // 9 arrays of 5 numbers each
export type PatternTuple = number[];  // length 9

export interface GroupingOptions {
  // If provided, must include exactly 9 groups, each containing 5 unique integers in [1..45].
  customGroups?: ZoneGroups;
}

export interface PerNumberFrequencies {
  mains: Record<number, number>;
  supps: Record<number, number>;
}

export interface SumStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  slopePerDraw: number;   // linear regression slope per draw index
  intercept: number;
  r2: number;
  pValue: number;
}

export interface ZoneTrend {
  zone: number;           // 1..9
  slopePerDraw: number;   // trend in counts per draw (0..6) for mains
  r2: number;
  pValue: number;
}

export interface PatternSummary {
  // Key: pattern signature like "1-0-2-0-1-1-1-0-0", Value: occurrences
  mainPatternCounts: Map<string, number>;
  suppPatternCounts: Map<string, number>;
}

export interface AnalysisSummary {
  totalDraws: number;
  totalMainNumbers: number;        // draws * 6
  avgMainFrequencyPerNumber: number;  // totalMainNumbers / 45
  totalSuppNumbers: number;        // draws * 2
  avgSuppFrequencyPerNumber: number;  // totalSuppNumbers / 45
  perNumberFrequencies: PerNumberFrequencies;
  sumOfMains: SumStats;
  zoneTrendsMain: ZoneTrend[];     // 1..9, trend on main counts per zone
  patternSummary: PatternSummary;
}

export function buildDefaultGroups(): ZoneGroups {
  // 9 contiguous groups of 5: [1..5], [6..10], ..., [41..45]
  const groups: ZoneGroups = [];
  for (let g = 0; g < 9; g++) {
    const start = g * 5 + 1;
    const arr: number[] = [];
    for (let k = 0; k < 5; k++) arr.push(start + k);
    groups.push(arr);
  }
  return groups;
}

export function validateGroups(groups: ZoneGroups): void {
  if (groups.length !== 9) throw new Error("Expected 9 groups.");
  const seen = new Set<number>();
  for (const grp of groups) {
    if (grp.length !== 5) throw new Error("Each group must have 5 numbers.");
    for (const n of grp) {
      if (!Number.isInteger(n) || n < 1 || n > 45) {
        throw new Error(`Invalid number in groups: ${n}`);
      }
      if (seen.has(n)) throw new Error(`Duplicate number in groups: ${n}`);
      seen.add(n);
    }
  }
  if (seen.size !== 45) throw new Error("Groups must cover exactly 45 unique numbers.");
}

export function groupIndexOf(n: number, groups: ZoneGroups): number {
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].includes(n)) return i;
  }
  return -1;
}

export function computePatternForDraw(nums: number[], groups: ZoneGroups): PatternTuple {
  const pattern = Array(groups.length).fill(0);
  for (const n of nums) {
    const gi = groupIndexOf(n, groups);
    if (gi >= 0) pattern[gi] += 1;
  }
  return pattern;
}

export function signatureOfPattern(p: PatternTuple): string {
  return p.join("-");
}

export function computePerNumberFrequencies(history: Draw[]): PerNumberFrequencies {
  const mains: Record<number, number> = {};
  const supps: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) { mains[n] = 0; supps[n] = 0; }
  for (const d of history) {
    d.main.forEach(n => mains[n] = (mains[n] ?? 0) + 1);
    d.supp.forEach(n => supps[n] = (supps[n] ?? 0) + 1);
  }
  return { mains, supps };
}

// Basic stats + linear regression with t-test p-value for slope
export function computeSumOfMainsStats(history: Draw[]): SumStats {
  const sums = history.map(d => d.main.reduce((a, b) => a + b, 0));
  const n = sums.length;
  if (n === 0) {
    return { min: 0, max: 0, mean: 0, std: 0, slopePerDraw: 0, intercept: 0, r2: 0, pValue: 1 };
  }
  const min = Math.min(...sums);
  const max = Math.max(...sums);
  const mean = sums.reduce((a, b) => a + b, 0) / n;
  const variance = sums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n > 1 ? (n - 1) : 1);
  const std = Math.sqrt(variance);

  // Linear regression y = a + b*x, x = 0..n-1
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = (n - 1) / 2;
  const ssXX = xs.reduce((s, x) => s + (x - xMean) * (x - xMean), 0);
  const covXY = xs.reduce((s, x, i) => s + (x - xMean) * (sums[i] - mean), 0);
  const slope = ssXX === 0 ? 0 : covXY / ssXX;
  const intercept = mean - slope * xMean;

  // R^2
  const yHat = xs.map(x => intercept + slope * x);
  const ssYY = sums.reduce((s, y) => s + (y - mean) * (y - mean), 0);
  const ssRes = sums.reduce((s, y, i) => s + (y - yHat[i]) * (y - yHat[i]), 0);
  const r2 = ssYY === 0 ? 0 : 1 - (ssRes / ssYY);

  // t-test for slope: t = b / SE(b), SE(b) = sqrt(σ^2 / SSxx), σ^2 = SSE/(n-2)
  let pValue = 1;
  if (n >= 3 && ssXX > 0) {
    const sigma2 = ssRes / (n - 2);
    const seB = Math.sqrt(sigma2 / ssXX);
    const tStat = seB > 0 ? slope / seB : 0;
    pValue = twoSidedPFromT(tStat, n - 2);
  }

  return {
    min,
    max,
    mean,
    std,
    slopePerDraw: slope,
    intercept,
    r2,
    pValue,
  };
}

// Approximate two-sided p-value from t-statistic with v degrees of freedom.
function twoSidedPFromT(t: number, v: number): number {
  const x = Math.abs(t);
  if (v > 30) {
    const p = 2 * (1 - normalCdf(x));
    return clamp01(p);
  }
  const z = x;
  const p = 2 * (1 - normalCdf(z));
  return clamp01(p);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  let prob = 1 - d * (0.319381530 * t - 0.356563782 * t ** 2 + 1.781477937 * t ** 3 - 1.821255978 * t ** 4 + 1.330274429 * t ** 5);
  if (z < 0) prob = 1 - prob;
  return prob;
}
function clamp01(p: number): number {
  return Math.max(0, Math.min(1, p));
}

export function analyzeZoneTrendsMain(history: Draw[], groups: ZoneGroups): ZoneTrend[] {
  const n = history.length;
  const perDrawCounts: number[][] = Array.from({ length: 9 }, () => Array(n).fill(0));
  history.forEach((d, i) => {
    const p = computePatternForDraw(d.main, groups);
    for (let z = 0; z < 9; z++) perDrawCounts[z][i] = p[z];
  });

  const trends: ZoneTrend[] = [];
  for (let z = 0; z < 9; z++) {
    const y = perDrawCounts[z];
    const n = y.length;
    if (n < 3) {
      trends.push({ zone: z + 1, slopePerDraw: 0, r2: 0, pValue: 1 });
      continue;
    }
    const xs = Array.from({ length: n }, (_, i) => i);
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const xMean = (n - 1) / 2;
    const ssXX = xs.reduce((s, x) => s + (x - xMean) * (x - xMean), 0);
    const covXY = xs.reduce((s, x, i) => s + (x - xMean) * (y[i] - yMean), 0);
    const slope = ssXX === 0 ? 0 : covXY / ssXX;
    const intercept = yMean - slope * xMean;

    const yHat = xs.map(x => intercept + slope * x);
    const ssYY = y.reduce((s, yy) => s + (yy - yMean) * (yy - yMean), 0);
    const ssRes = y.reduce((s, yy, i) => s + (yy - yHat[i]) * (yy - yHat[i]), 0);
    const r2 = ssYY === 0 ? 0 : 1 - (ssRes / ssYY);

    let pValue = 1;
    if (n >= 3 && ssXX > 0) {
      const sigma2 = ssRes / (n - 2);
      const seB = Math.sqrt(sigma2 / ssXX);
      const tStat = seB > 0 ? slope / seB : 0;
      pValue = twoSidedPFromT(tStat, n - 2);
    }

    trends.push({ zone: z + 1, slopePerDraw: slope, r2, pValue });
  }
  return trends;
}

export function summarizePatterns(history: Draw[], groups: ZoneGroups): PatternSummary {
  const mainPatternCounts = new Map<string, number>();
  const suppPatternCounts = new Map<string, number>();
  for (const d of history) {
    const pM = signatureOfPattern(computePatternForDraw(d.main, groups));
    mainPatternCounts.set(pM, (mainPatternCounts.get(pM) || 0) + 1);

    const pS = signatureOfPattern(computePatternForDraw(d.supp, groups));
    suppPatternCounts.set(pS, (suppPatternCounts.get(pS) || 0) + 1);
  }
  return { mainPatternCounts, suppPatternCounts };
}

export function analyzeGroups(history: Draw[], options: GroupingOptions = {}): AnalysisSummary {
  const groups = options.customGroups ?? buildDefaultGroups();
  validateGroups(groups);

  const totalDraws = history.length;
  const totalMainNumbers = totalDraws * 6;
  const totalSuppNumbers = totalDraws * 2;
  const avgMainFrequencyPerNumber = totalMainNumbers / 45;
  const avgSuppFrequencyPerNumber = totalSuppNumbers / 45;

  const perNumberFrequencies = computePerNumberFrequencies(history);
  const sumOfMains = computeSumOfMainsStats(history);
  const zoneTrendsMain = analyzeZoneTrendsMain(history, groups);
  const patternSummary = summarizePatterns(history, groups);

  return {
    totalDraws,
    totalMainNumbers,
    avgMainFrequencyPerNumber,
    totalSuppNumbers,
    avgSuppFrequencyPerNumber,
    perNumberFrequencies,
    sumOfMains,
    zoneTrendsMain,
    patternSummary,
  };
}