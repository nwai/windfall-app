// Backtest support for "Most likely to break a drought next draw"
// Uses computeTemperatureSignal (same signal used by your heatmap / DGA panels)
// For each eligible timepoint it computes the ordered top-K predictions and checks
// whether the next draw contains any of the predicted numbers and at what rank.

import { Draw } from "../types";
import { computeTemperatureSignal } from "./temperatureSignal";

export type BacktestOptions = {
  minHistory?: number;      // minimum number of draws before we start predicting (default 20)
  useRollingWindow?: boolean; // whether to use only the last windowSize draws when computing signal
  windowSize?: number;      // relevant if useRollingWindow true (default 180)
  topK?: number;            // how many top predictions to consider (default 12)
  // options forwarded to computeTemperatureSignal
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

/**
 * Run drought-prediction backtest on `history`.
 * Returns summary and per-prediction records.
 */
export function backtestDroughtPredictions(history: Draw[], opts: BacktestOptions = {}): BacktestSummary {
  const o = { ...defaultOpts, ...opts };
  const n = history.length;
  const records: SingleBacktestRecord[] = [];

  // We can predict the 'next' draw only when we have at least minHistory draws before prediction.
  // We'll iterate predictionIndex = t where we build signal from draws[0..t] and compare to draws[t+1].
  // So t must run from (minHistory - 1) .. n-2
  const startT = Math.max((o.minHistory ?? 20) - 1, 0);
  for (let t = startT; t <= n - 2; t++) {
    // build window for signal
    const windowStart = o.useRollingWindow ? Math.max(0, t + 1 - (o.windowSize ?? 180)) : 0;
    const windowDraws = history.slice(windowStart, t + 1); // inclusive up to t
    if (windowDraws.length === 0) continue;

    const tempSignal = computeTemperatureSignal(windowDraws, {
      alpha: o.alpha!,
      hybridWeight: o.hybridWeight!,
      emaNormalize: o.emaNormalize!,
      enforcePeaks: o.enforcePeaks!,
      metric: o.metric!,
      heightNumbers: 45,
    });

    // tempSignal is expected array length 45 for numbers 1..45
    const arr: { n: number; s: number }[] = [];
    for (let i = 0; i < 45; i++) arr.push({ n: i + 1, s: tempSignal[i] ?? 0 });
    arr.sort((a, b) => b.s - a.s || a.n - b.n);

    const topK = (o.topK ?? 12);
    const topList = arr.slice(0, topK).map((x) => x.n);

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
    records,
  };

  return summary;
}