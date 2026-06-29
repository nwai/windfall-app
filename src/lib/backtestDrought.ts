// Backtest support for DGA drought-break empirical shortlist.
// Uses the same computeDroughtHazard model displayed in the DGA panel. For each
// eligible timepoint, it ranks numbers from history available up to that point
// and checks whether the next draw contains any ranked numbers.

import { Draw } from "../types";
import { computeDroughtHazard, DROUGHT_HAZARD_ANY_DRAWN_BASELINE } from "./droughtHazard";

export type BacktestOptions = {
  minHistory?: number;      // minimum number of draws before we start predicting (default 20)
  useRollingWindow?: boolean; // whether to use only the last windowSize draws when computing signal
  windowSize?: number;      // relevant if useRollingWindow true (default 180)
  topK?: number;            // how many top predictions to consider (default 12)
  // Deprecated temperature options are accepted for old saved state, but this
  // backtest now intentionally ranks from empirical drought hazard only.
  alpha?: number;
  hybridWeight?: number;
  emaNormalize?: "per-number" | "global";
  enforcePeaks?: boolean;
  metric?: "ema" | "recency" | "hybrid";
};

export type SingleBacktestRecord = {
  indexAtPrediction: number;     // index of the last draw used to form prediction
  predictDate?: string;
  nextIndex: number;             // index of the actual next draw we compare against
  nextDate?: string;
  topK: number[];
  firstHitNum?: number;          // number that matched (closest in rank)
  firstHitRank?: number;         // 1-based rank in topK
  hits: { num: number; rank: number; where: "main" | "supp" }[];
};

export type BacktestSummary = {
  totalPredictions: number;
  totalHits: number;           // any hit in topK
  hitAtTop1: number;
  hitAtTop3: number;
  hitAtTop5: number;
  hitAtTop10: number;
  averageFirstHitRank?: number; // only among predictions with a hit
  rankDistribution: Record<string, number>; // map "1","2",...,"miss" -> counts
  baseline: {
    scope: "mains+supps";
    perNumberAnyDrawnProbability: number;
    topKAnyHitProbability: number;
    expectedHitsInTopK: number;
  };
  records: SingleBacktestRecord[];
};

const defaultOpts: BacktestOptions = {
  minHistory: 20,
  useRollingWindow: true,
  windowSize: 180,
  topK: 12,
  alpha: 0.25,
  hybridWeight: 0.6,
  emaNormalize: "per-number",
  enforcePeaks: true,
  metric: "hybrid",
};

function combinations(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i;
  }
  return result;
}

function topKAnyHitBaseline(topK: number): number {
  const safeTopK = Math.max(0, Math.min(45, Math.round(topK)));
  if (safeTopK <= 0) return 0;
  if (safeTopK > 37) return 1;
  return 1 - combinations(45 - safeTopK, 8) / combinations(45, 8);
}

/**
 * Run empirical drought-hazard backtest on `history`.
 * Returns summary and per-prediction records.
 */
export function backtestDroughtPredictions(history: Draw[], opts: BacktestOptions = {}): BacktestSummary {
  const o = { ...defaultOpts, ...opts };
  const n = history.length;
  const records: SingleBacktestRecord[] = [];
  const topK = Math.max(1, Math.min(45, Math.round(o.topK ?? 12)));

  // We can predict the 'next' draw only when we have at least minHistory draws before prediction.
  // We'll iterate predictionIndex = t where we build signal from draws[0..t] and compare to draws[t+1].
  // So t must run from (minHistory - 1) .. n-2
  const startT = Math.max((o.minHistory ?? 20) - 1, 0);
  for (let t = startT; t <= n - 2; t++) {
    // build window for signal
    const windowStart = o.useRollingWindow ? Math.max(0, t + 1 - (o.windowSize ?? 180)) : 0;
    const windowDraws = history.slice(windowStart, t + 1); // inclusive up to t
    if (windowDraws.length === 0) continue;

    const droughtHazard = computeDroughtHazard(windowDraws);
    const topList = droughtHazard.byNumber
      .slice()
      .sort((a, b) => b.p - a.p || b.k - a.k || a.number - b.number)
      .slice(0, topK)
      .map((x) => x.number);

    const nextDraw = history[t + 1];
    const nextNums = new Set<number>([...nextDraw.main, ...nextDraw.supp]);

    const hits: { num: number; rank: number; where: "main" | "supp" }[] = [];
    for (let rank = 0; rank < topList.length; rank++) {
      const num = topList[rank];
      if (nextNums.has(num)) {
        const where = nextDraw.main.includes(num) ? "main" : "supp";
        hits.push({ num, rank: rank + 1, where });
      }
    }

    let firstHitNum: number | undefined = undefined;
    let firstHitRank: number | undefined = undefined;
    if (hits.length) {
      // pick the predicted with smallest rank (already ascending)
      hits.sort((a, b) => a.rank - b.rank);
      firstHitNum = hits[0].num;
      firstHitRank = hits[0].rank;
    }

    records.push({
      indexAtPrediction: t,
      predictDate: windowDraws[windowDraws.length - 1]?.date,
      nextIndex: t + 1,
      nextDate: nextDraw?.date,
      topK: topList,
      firstHitNum,
      firstHitRank,
      hits,
    });
  }

  // compute summary metrics
  const totalPredictions = records.length;
  let totalHits = 0;
  let hitAtTop1 = 0;
  let hitAtTop3 = 0;
  let hitAtTop5 = 0;
  let hitAtTop10 = 0;
  const rankCounts: Record<string, number> = {};
  let sumRanks = 0;
  let rankCountForAvg = 0;

  for (const r of records) {
    if (!r.hits || r.hits.length === 0) {
      rankCounts["miss"] = (rankCounts["miss"] || 0) + 1;
      continue;
    }
    totalHits++;
    const first = r.firstHitRank!;
    rankCounts[String(first)] = (rankCounts[String(first)] || 0) + 1;
    sumRanks += first;
    rankCountForAvg++;

    if (first === 1) hitAtTop1++;
    if (first <= 3) hitAtTop3++;
    if (first <= 5) hitAtTop5++;
    if (first <= 10) hitAtTop10++;
  }

  const averageFirstHitRank = rankCountForAvg > 0 ? sumRanks / rankCountForAvg : undefined;

  const summary: BacktestSummary = {
    totalPredictions,
    totalHits,
    hitAtTop1,
    hitAtTop3,
    hitAtTop5,
    hitAtTop10,
    averageFirstHitRank,
    rankDistribution: rankCounts,
    baseline: {
      scope: "mains+supps",
      perNumberAnyDrawnProbability: DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
      topKAnyHitProbability: topKAnyHitBaseline(topK),
      expectedHitsInTopK: topK * DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
    },
    records,
  };

  return summary;
}
