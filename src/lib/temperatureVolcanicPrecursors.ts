import type { Draw } from "../types";
import { filterRealDrawHistory } from "./realDrawHistory";
import { sortDrawsChronologically } from "./recentDraws";
import { normalizeUserSelectedNumbers } from "./userSelectedNumbers";

export type VolcanicPrecursorMetric = "recency" | "ema" | "hybrid";

export const TEMPERATURE_PRECURSOR_LABELS = [
  "prehistoric",
  "frozen",
  "permafrost",
  "cold",
  "cool",
  "temperate",
  "warm",
  "hot",
  "tropical",
  "volcanic",
] as const;

export const TEMPERATURE_PRECURSOR_COLORS = [
  "#0b1020",
  "#3a3a3a",
  "#244963",
  "#2c75a0",
  "#3ca0c7",
  "#66c2a5",
  "#a6d854",
  "#fdd835",
  "#fb8c00",
  "#e53935",
] as const;

export interface TemperatureVolcanicPrecursorRow {
  bucketIndex: number;
  label: string;
  color: string;
  trials: number;
  hits: number;
  hitRate: number | null;
  hitShare: number | null;
  averageGapBetweenHits: number | null;
  drawsSinceMostRecentHit: number | null;
  mostRecentHitDate: string | null;
  earlierTrials: number;
  earlierHits: number;
  recentTrials: number;
  recentHits: number;
  recentHitRate: number | null;
  learnt: "Thin sample" | "Recently rising" | "Recently falling" | "Stable";
  learntDetail: string;
}

export interface TemperatureVolcanicPrecursorMetricResult {
  metric: VolcanicPrecursorMetric;
  label: string;
  scopeLabel: string;
  drawCount: number;
  transitionCount: number;
  totalHits: number;
  rows: TemperatureVolcanicPrecursorRow[];
}

export interface TemperatureVolcanicPrecursorSelectedMetric {
  metric: VolcanicPrecursorMetric;
  label: string;
  currentBucketIndex: number;
  currentLabel: string;
  currentColor: string;
  currentValue: number;
  drawsSinceNumberHit: number | null;
  matchingRow: TemperatureVolcanicPrecursorRow | null;
}

export interface TemperatureVolcanicPrecursorSelectedRead {
  number: number;
  metrics: TemperatureVolcanicPrecursorSelectedMetric[];
}

export interface TemperatureVolcanicPrecursorAdvisor {
  scopeLabel: string;
  drawCount: number;
  selectedReads: TemperatureVolcanicPrecursorSelectedRead[];
  metricResults: TemperatureVolcanicPrecursorMetricResult[];
  warnings: string[];
}

export interface BuildTemperatureVolcanicPrecursorAdvisorOptions {
  history: readonly Draw[];
  scopeLabel: string;
  selectedNumbers?: readonly unknown[];
  alpha?: number;
  heightNumbers?: number;
  drawSize?: number;
  buckets?: number;
  bucketStops?: readonly number[];
  hybridWeight?: number;
  emaNormalize?: "global" | "per-number";
  enforcePeaks?: boolean;
  recentLearningWindow?: number;
}

interface TemperatureMetricSeries {
  history: Draw[];
  occurSeries: number[][];
  valueSeries: number[][];
  bucketIndexSeries: number[][];
  gapSinceHitSeries: Array<Array<number | null>>;
}

const DEFAULT_HEIGHT_NUMBERS = 45;
const DEFAULT_DRAW_SIZE = 8;
const DEFAULT_ALPHA = 0.25;
const DEFAULT_HYBRID_WEIGHT = 0.6;

const metricLabels: Record<VolcanicPrecursorMetric, string> = {
  recency: "Recency",
  ema: "EMA",
  hybrid: "Hybrid",
};

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function bucketIndexForValue(value: number, stops: readonly number[]): number {
  const safeValue = clamp01(value);
  for (let i = 0; i < stops.length; i += 1) {
    if (safeValue <= stops[i]) return i;
  }
  return stops.length;
}

function normalizedStops(bucketCount: number, bucketStops?: readonly number[]): number[] {
  if (bucketStops && bucketStops.length === bucketCount - 1) {
    return bucketStops.map((value) => clamp01(value));
  }
  return Array.from({ length: bucketCount - 1 }, (_, index) => (index + 1) / bucketCount);
}

function drawHitSet(draw: Draw | undefined, heightNumbers: number): Set<number> {
  return new Set([...(draw?.main ?? []), ...(draw?.supp ?? [])]
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= heightNumbers));
}

function computeMetricSeries(
  historyRaw: readonly Draw[],
  metric: VolcanicPrecursorMetric,
  options: Required<Pick<
    BuildTemperatureVolcanicPrecursorAdvisorOptions,
    "alpha" | "heightNumbers" | "drawSize" | "buckets" | "hybridWeight" | "emaNormalize" | "enforcePeaks"
  >> & { bucketStops?: readonly number[] },
): TemperatureMetricSeries {
  const history = sortDrawsChronologically(filterRealDrawHistory(historyRaw, "temperature volcanic precursor diagnostics").history);
  const drawCount = history.length;
  const {
    alpha,
    heightNumbers,
    drawSize,
    buckets,
    hybridWeight,
    emaNormalize,
    enforcePeaks,
    bucketStops,
  } = options;
  const stops = normalizedStops(buckets, bucketStops);
  const hitSets = history.map((draw) => drawHitSet(draw, heightNumbers));
  const occurSeries: number[][] = Array.from({ length: heightNumbers }, () => Array(drawCount).fill(0));
  const emaSeries: number[][] = Array.from({ length: heightNumbers }, () => Array(drawCount).fill(0));
  const recencySeries: number[][] = Array.from({ length: heightNumbers }, () => Array(drawCount).fill(0));
  const gapSinceHitSeries: Array<Array<number | null>> = Array.from({ length: heightNumbers }, () => Array(drawCount).fill(null));

  for (let n = 0; n < heightNumbers; n += 1) {
    let emaPrevious = 0;
    let ageForRecency = Math.max(1, Math.floor((heightNumbers / Math.max(1, drawSize)) * 8));
    let gapSinceHit: number | null = null;
    const recencyK = heightNumbers / Math.max(1, drawSize);
    for (let t = 0; t < drawCount; t += 1) {
      const hit = hitSets[t].has(n + 1);
      occurSeries[n][t] = hit ? 1 : 0;
      const emaValue = alpha * (hit ? 1 : 0) + (1 - alpha) * emaPrevious;
      emaSeries[n][t] = emaValue;
      emaPrevious = emaValue;

      ageForRecency = hit ? 0 : Math.min(Math.max(1, Math.floor(recencyK * 8)), ageForRecency + 1);
      recencySeries[n][t] = Math.exp(-ageForRecency / recencyK);

      gapSinceHit = hit ? 0 : gapSinceHit == null ? null : gapSinceHit + 1;
      gapSinceHitSeries[n][t] = gapSinceHit;
    }
  }

  const emaNorm: number[][] = Array.from({ length: heightNumbers }, () => Array(drawCount).fill(0));
  if (emaNormalize === "per-number") {
    for (let n = 0; n < heightNumbers; n += 1) {
      let minValue = Number.POSITIVE_INFINITY;
      let maxValue = Number.NEGATIVE_INFINITY;
      for (let t = 0; t < drawCount; t += 1) {
        const value = emaSeries[n][t];
        if (value < minValue) minValue = value;
        if (value > maxValue) maxValue = value;
      }
      const denominator = maxValue - minValue || 1;
      for (let t = 0; t < drawCount; t += 1) {
        emaNorm[n][t] = (emaSeries[n][t] - minValue) / denominator;
      }
    }
  } else {
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (let n = 0; n < heightNumbers; n += 1) {
      for (let t = 0; t < drawCount; t += 1) {
        const value = emaSeries[n][t];
        if (value < minValue) minValue = value;
        if (value > maxValue) maxValue = value;
      }
    }
    const denominator = maxValue - minValue || 1;
    for (let n = 0; n < heightNumbers; n += 1) {
      for (let t = 0; t < drawCount; t += 1) {
        emaNorm[n][t] = (emaSeries[n][t] - minValue) / denominator;
      }
    }
  }

  const valueSeries: number[][] = Array.from({ length: heightNumbers }, () => Array(drawCount).fill(0));
  const bucketIndexSeries: number[][] = Array.from({ length: heightNumbers }, () => Array(drawCount).fill(0));
  const hybridEmaWeight = clamp01(hybridWeight);
  for (let n = 0; n < heightNumbers; n += 1) {
    for (let t = 0; t < drawCount; t += 1) {
      let value = 0;
      if (metric === "ema") value = emaNorm[n][t];
      else if (metric === "recency") value = recencySeries[n][t];
      else value = hybridEmaWeight * emaNorm[n][t] + (1 - hybridEmaWeight) * recencySeries[n][t];
      if (enforcePeaks && occurSeries[n][t] === 1) value = 1;
      valueSeries[n][t] = value;
      bucketIndexSeries[n][t] = bucketIndexForValue(value, stops);
    }
  }

  return {
    history,
    occurSeries,
    valueSeries,
    bucketIndexSeries,
    gapSinceHitSeries,
  };
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatRate(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function learntStatus(
  baselineRate: number | null,
  earlierTrials: number,
  recentTrials: number,
  recentRate: number | null,
): Pick<TemperatureVolcanicPrecursorRow, "learnt" | "learntDetail"> {
  if (baselineRate == null || recentRate == null || earlierTrials < 24 || recentTrials < 12) {
    return {
      learnt: "Thin sample",
      learntDetail: "Not enough earlier/recent trials to call movement.",
    };
  }
  const delta = recentRate - baselineRate;
  if (delta >= 0.03) {
    return {
      learnt: "Recently rising",
      learntDetail: `Recent rate ${formatRate(recentRate)} vs full ${formatRate(baselineRate)}.`,
    };
  }
  if (delta <= -0.03) {
    return {
      learnt: "Recently falling",
      learntDetail: `Recent rate ${formatRate(recentRate)} vs full ${formatRate(baselineRate)}.`,
    };
  }
  return {
    learnt: "Stable",
    learntDetail: `Recent rate ${formatRate(recentRate)} is close to full ${formatRate(baselineRate)}.`,
  };
}

function buildMetricResult(
  series: TemperatureMetricSeries,
  metric: VolcanicPrecursorMetric,
  scopeLabel: string,
  options: Required<Pick<BuildTemperatureVolcanicPrecursorAdvisorOptions, "heightNumbers" | "buckets" | "recentLearningWindow">>,
): TemperatureVolcanicPrecursorMetricResult {
  const { heightNumbers, buckets, recentLearningWindow } = options;
  const transitionCount = Math.max(0, series.history.length - 1);
  const latestIndex = series.history.length - 1;
  const recentStartTargetIndex = Math.max(1, series.history.length - Math.max(1, recentLearningWindow));
  const rows = Array.from({ length: buckets }, (_, bucketIndex) => {
    const eventTargetIndexes: number[] = [];
    const eventGaps: number[] = [];
    let trials = 0;
    let hits = 0;
    let earlierTrials = 0;
    let earlierHits = 0;
    let recentTrials = 0;
    let recentHits = 0;

    for (let t = 1; t < series.history.length; t += 1) {
      const isRecent = t >= recentStartTargetIndex;
      for (let n = 0; n < heightNumbers; n += 1) {
        if (series.bucketIndexSeries[n]?.[t - 1] !== bucketIndex) continue;
        trials += 1;
        if (isRecent) recentTrials += 1;
        else earlierTrials += 1;

        if (series.occurSeries[n]?.[t] === 1) {
          hits += 1;
          eventTargetIndexes.push(t);
          const gap = series.gapSinceHitSeries[n]?.[t - 1];
          if (typeof gap === "number" && Number.isFinite(gap)) eventGaps.push(gap + 1);
          if (isRecent) recentHits += 1;
          else earlierHits += 1;
        }
      }
    }

    const hitRate = trials > 0 ? hits / trials : null;
    const recentHitRate = recentTrials > 0 ? recentHits / recentTrials : null;
    const hitIndexGaps: number[] = [];
    for (let i = 1; i < eventTargetIndexes.length; i += 1) {
      hitIndexGaps.push(eventTargetIndexes[i] - eventTargetIndexes[i - 1]);
    }
    const mostRecentHitIndex = eventTargetIndexes.length > 0 ? eventTargetIndexes[eventTargetIndexes.length - 1] : null;
    const learnt = learntStatus(hitRate, earlierTrials, recentTrials, recentHitRate);

    return {
      bucketIndex,
      label: TEMPERATURE_PRECURSOR_LABELS[bucketIndex] ?? `bucket ${bucketIndex}`,
      color: TEMPERATURE_PRECURSOR_COLORS[bucketIndex] ?? "#64748b",
      trials,
      hits,
      hitRate,
      hitShare: null,
      averageGapBetweenHits: mean(hitIndexGaps) ?? mean(eventGaps),
      drawsSinceMostRecentHit: mostRecentHitIndex == null ? null : latestIndex - mostRecentHitIndex,
      mostRecentHitDate: mostRecentHitIndex == null ? null : series.history[mostRecentHitIndex]?.date ?? null,
      earlierTrials,
      earlierHits,
      recentTrials,
      recentHits,
      recentHitRate,
      ...learnt,
    };
  });

  const totalHits = rows.reduce((sum, row) => sum + row.hits, 0);
  return {
    metric,
    label: metricLabels[metric],
    scopeLabel,
    drawCount: series.history.length,
    transitionCount,
    totalHits,
    rows: rows
      .map((row) => ({
        ...row,
        hitShare: totalHits > 0 ? row.hits / totalHits : null,
      }))
      .sort((left, right) => right.bucketIndex - left.bucketIndex),
  };
}

function buildSelectedReads(
  selectedNumbers: readonly number[],
  metricResults: readonly TemperatureVolcanicPrecursorMetricResult[],
  seriesByMetric: Record<VolcanicPrecursorMetric, TemperatureMetricSeries>,
): TemperatureVolcanicPrecursorSelectedRead[] {
  return selectedNumbers.map((number) => {
    const metrics = metricResults.map((result) => {
      const series = seriesByMetric[result.metric];
      const latestIndex = series.history.length - 1;
      const rowIndex = number - 1;
      const currentBucketIndex = latestIndex >= 0
        ? series.bucketIndexSeries[rowIndex]?.[latestIndex] ?? 0
        : 0;
      const safeBucketIndex = Math.max(0, Math.min(result.rows.length - 1, currentBucketIndex));
      return {
        metric: result.metric,
        label: result.label,
        currentBucketIndex: safeBucketIndex,
        currentLabel: TEMPERATURE_PRECURSOR_LABELS[safeBucketIndex] ?? `bucket ${safeBucketIndex}`,
        currentColor: TEMPERATURE_PRECURSOR_COLORS[safeBucketIndex] ?? "#64748b",
        currentValue: latestIndex >= 0 ? series.valueSeries[rowIndex]?.[latestIndex] ?? 0 : 0,
        drawsSinceNumberHit: latestIndex >= 0 ? series.gapSinceHitSeries[rowIndex]?.[latestIndex] ?? null : null,
        matchingRow: result.rows.find((row) => row.bucketIndex === safeBucketIndex) ?? null,
      };
    });
    return { number, metrics };
  });
}

export function buildTemperatureVolcanicPrecursorAdvisor(
  options: BuildTemperatureVolcanicPrecursorAdvisorOptions,
): TemperatureVolcanicPrecursorAdvisor {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const heightNumbers = options.heightNumbers ?? DEFAULT_HEIGHT_NUMBERS;
  const drawSize = options.drawSize ?? DEFAULT_DRAW_SIZE;
  const buckets = options.buckets ?? TEMPERATURE_PRECURSOR_LABELS.length;
  const hybridWeight = options.hybridWeight ?? DEFAULT_HYBRID_WEIGHT;
  const emaNormalize = options.emaNormalize ?? "per-number";
  const enforcePeaks = options.enforcePeaks ?? true;
  const recentLearningWindow = options.recentLearningWindow ?? 50;
  const selectedNumbers = normalizeUserSelectedNumbers(options.selectedNumbers ?? []);
  const real = filterRealDrawHistory(options.history, "temperature volcanic precursor diagnostics");
  const warnings = [...real.warnings];
  if (real.history.length < 3) {
    warnings.push("Volcanic precursor advisor needs at least 3 real draws to compare an immediate prior state with a next draw.");
  }

  const sharedOptions = {
    alpha,
    heightNumbers,
    drawSize,
    buckets,
    bucketStops: options.bucketStops,
    hybridWeight,
    emaNormalize,
    enforcePeaks,
  };
  const seriesByMetric: Record<VolcanicPrecursorMetric, TemperatureMetricSeries> = {
    recency: computeMetricSeries(real.history, "recency", sharedOptions),
    ema: computeMetricSeries(real.history, "ema", sharedOptions),
    hybrid: computeMetricSeries(real.history, "hybrid", sharedOptions),
  };
  const metricResults = (["recency", "ema", "hybrid"] as const).map((metric) => (
    buildMetricResult(seriesByMetric[metric], metric, options.scopeLabel, {
      heightNumbers,
      buckets,
      recentLearningWindow,
    })
  ));

  return {
    scopeLabel: options.scopeLabel,
    drawCount: real.history.length,
    selectedReads: buildSelectedReads(selectedNumbers, metricResults, seriesByMetric),
    metricResults,
    warnings: Array.from(new Set(warnings)),
  };
}
