import { Draw } from "../types";
import { computePatternForDraw, signatureOfPattern, ZoneGroups } from "./groupPatterns";

// Simple linear regression; returns slope, r2, and two-sided p-value for slope (normal approx)
function linreg(y: number[]) {
  const n = y.length;
  if (n <= 1) return { slope: 0, r2: 0, p: 1 };
  const x = Array.from({ length: n }, (_, i) => i + 1);
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    num += dx * (y[i] - my);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yiHat = my + slope * (x[i] - mx);
    ssRes += (y[i] - yiHat) ** 2;
    ssTot += (y[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  let p = 1;
  if (n > 2 && den > 0) {
    const se = Math.sqrt((ssRes / (n - 2)) / den);
    if (se > 0) {
      const t = slope / se;
      const z = Math.abs(t);
      const cdf = (zv: number) => 0.5 * (1 + erf(zv / Math.SQRT2));
      function erf(zv: number) {
        const sign = zv < 0 ? -1 : 1;
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p5 = 0.3275911;
        const t = 1 / (1 + p5 * Math.abs(zv));
        const yv = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-zv * zv);
        return sign * yv;
      }
      p = 2 * (1 - cdf(z));
    }
  }
  return { slope, r2, p };
}

export type GroupPatternSummaryFlex = {
  totalDraws: number;
  totalMainNumbers: number;
  totalSuppNumbers: number;
  avgMainFrequencyPerNumber: number;
  avgSuppFrequencyPerNumber: number;
  sumOfMains: { min: number; max: number; mean: number; slopePerDraw: number; pValue: number };
  patternSummary: { mainPatternCounts: Map<string, number> };
  perNumberFrequencies: { mains: Record<number, number>; supps: Record<number, number> };
  zoneTrendsMain: Array<{ zone: number; slopePerDraw: number }>;
};

export function analyzeGroupsFlex(history: Draw[], groups: ZoneGroups): GroupPatternSummaryFlex {
  const zones = groups.length;

  const mainsFreq: Record<number, number> = {}; const suppsFreq: Record<number, number> = {};
  for (let n = 1; n <= 45; n++) { mainsFreq[n] = 0; suppsFreq[n] = 0; }

  const sumMainsSeries: number[] = [];
  const mainPatternCounts: Map<string, number> = new Map();
  const zoneSeries: number[][] = Array.from({ length: zones }, () => []);

  for (let i = 0; i < history.length; i++) {
    const d = history[i];
    for (const n of d.main) mainsFreq[n] = (mainsFreq[n] ?? 0) + 1;
    for (const n of d.supp) suppsFreq[n] = (suppsFreq[n] ?? 0) + 1;
    sumMainsSeries.push(d.main.reduce((a, b) => a + b, 0));
    const patM = computePatternForDraw(d.main, groups); // length = zones
    const sigM = signatureOfPattern(patM);
    mainPatternCounts.set(sigM, (mainPatternCounts.get(sigM) ?? 0) + 1);
    for (let z = 0; z < zones; z++) zoneSeries[z].push(patM[z] ?? 0);
  }

  const totalDraws = history.length;
  const totalMainNumbers = history.reduce((acc, d) => acc + d.main.length, 0);
  const totalSuppNumbers = history.reduce((acc, d) => acc + d.supp.length, 0);
  const avgMainFrequencyPerNumber = totalDraws === 0 ? 0 : totalMainNumbers / 45 / totalDraws;
  const avgSuppFrequencyPerNumber = totalDraws === 0 ? 0 : totalSuppNumbers / 45 / totalDraws;

  const smMin = sumMainsSeries.length ? Math.min(...sumMainsSeries) : 0;
  const smMax = sumMainsSeries.length ? Math.max(...sumMainsSeries) : 0;
  const smMean = sumMainsSeries.length ? sumMainsSeries.reduce((a, b) => a + b, 0) / sumMainsSeries.length : 0;
  const lr = linreg(sumMainsSeries);
  const sumOfMains = { min: smMin, max: smMax, mean: smMean, slopePerDraw: lr.slope, pValue: lr.p };

  const zoneTrendsMain = zoneSeries.map((series, idx) => {
    const lrZ = linreg(series);
    return { zone: idx + 1, slopePerDraw: lrZ.slope };
  });

  return {
    totalDraws,
    totalMainNumbers,
    totalSuppNumbers,
    avgMainFrequencyPerNumber,
    avgSuppFrequencyPerNumber,
    sumOfMains,
    patternSummary: { mainPatternCounts },
    perNumberFrequencies: { mains: mainsFreq, supps: suppsFreq },
    zoneTrendsMain,
  };
}