import type { Draw } from "../types";
import { buildSpokeRanges, computeOGA } from "../utils/oga";
import { strictValidateDraws } from "./strictDrawValidation";
import { getExcludedMonthLabelsForHistoryBaselines, HISTORY_BASELINE_POLICY_VERSION } from "./monthlyAverageScope";
import { countScheduledDrawsInMonth, datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";

export const NUMBER_GROUP_AUDIT_VERSION = "NGFA-1";
export const NUMBER_GROUP_SCALES = [3, 5, 9, 15] as const;
export const NUMBER_GROUP_WARMUP = 100;
export const NUMBER_GROUP_NEUTRAL_STRENGTH = 30;
export const NUMBER_GROUP_NEUTRAL_RATE = 8 / 45;
export const NUMBER_GROUP_METHODS = ["uniform", "individual", "individual-cautious", "group", "blend"] as const;
export type NumberGroupScale = typeof NUMBER_GROUP_SCALES[number];
export type NumberGroupMethod = typeof NUMBER_GROUP_METHODS[number];
export type NumberGroupWindow = "all" | 13 | 36 | 156;
export const NUMBER_GROUP_METHOD_LABELS: Record<NumberGroupMethod, string> = {
  uniform: "Equal-chance baseline", individual: "Individual frequency", "individual-cautious": "Individual, stronger neutral pull",
  group: "Group frequency", blend: "Individual + group (50/50)",
};

export interface NumberGroupAuditOptions { window?: NumberGroupWindow; asOfDate?: string }
export interface NumberGroupSide { groups: number[]; poolSize: number; hits: number; expected: number }
export interface NumberGroupAuditRecord {
  date: string; ordinal: number; monthLength: number; scale: NumberGroupScale;
  trainingFrom: string; trainingThrough: string; trainingDraws: number;
  actual: { main: number[]; supp: number[] }; actualCounts: number[]; predictedCounts: number[];
  high: NumberGroupSide; quiet: NumberGroupSide; rawOga: number; fairOgaMean: number;
  neutralCompositionLoss: number; groupCompositionLoss: number;
  losses: Record<NumberGroupMethod, number>;
}
export interface NumberGroupComparison {
  trials: number; mean: number | null; interval95: [number, number] | null;
  earlierMean: number | null; laterMean: number | null;
}
export interface NumberGroupScaleSummary {
  scale: NumberGroupScale; size: number; trials: number;
  high: { informativeTrials: number; hitsPerDraw: number | null; fairHitsPerDraw: number | null; excessPP: number | null };
  quiet: NumberGroupScaleSummary["high"];
  rawOgaMean: number | null; fairOgaMean: number | null;
  neutralCompositionLoss: number | null; groupCompositionLoss: number | null; compositionGain: NumberGroupComparison;
  methods: { method: NumberGroupMethod; loss: number | null; fairGain: NumberGroupComparison; individualGain: NumberGroupComparison }[];
}
export interface NumberGroupCurrent {
  date: string; trainingFrom: string; trainingThrough: string; trainingDraws: number;
  scales: { scale: NumberGroupScale; ranges: number[][]; predictedCounts: number[]; observedCounts: number[] }[];
}
export interface NumberGroupAudit {
  modelVersion: string; baselinePolicy: string; config: { window: NumberGroupWindow; warmup: number; neutralStrength: number; blendGroupWeight: number; ciLag: number; asOfDate: string };
  ignored: { simulated: number; malformed: number; offSchedule: number; future: number; ambiguousDateRows: number; openingMonthRows: number; warmupRows: number; gapResets: number };
  excludedMonths: string[]; validDraws: number; baseline: Draw[]; firstTarget: string | null; lastTarget: string | null;
  targets: number; earlierTargets: number; laterTargets: number; summaries: NumberGroupScaleSummary[];
  records: NumberGroupAuditRecord[]; current: NumberGroupCurrent | null;
}

const mean = (values: readonly number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

// Draw-level Newey-West interval, matching the app's six-lag learning-audit convention.
// No p-values or automatic winner: intervals are unadjusted exploratory comparisons.
function interval95(values: readonly number[]): [number, number] | null {
  if (values.length < 30) return null;
  const average = mean(values)!;
  const centered = values.map(value => value - average);
  let variance = centered.reduce((sum, value) => sum + value * value, 0) / values.length;
  for (let lag = 1; lag <= 6; lag++) {
    let covariance = 0;
    for (let index = lag; index < values.length; index++) covariance += centered[index] * centered[index - lag];
    variance += 2 * (1 - lag / 7) * covariance / values.length;
  }
  const margin = 1.96 * Math.sqrt(Math.max(0, variance) / values.length);
  return [average - margin, average + margin];
}

export function summarizeNumberGroupComparison(values: readonly number[]): NumberGroupComparison {
  const split = Math.ceil(values.length / 2);
  return { trials: values.length, mean: mean(values), interval95: interval95(values), earlierMean: mean(values.slice(0, split)), laterMean: mean(values.slice(split)) };
}

function nextScheduled(date: string): string {
  const parts = parseDrawDateParts(date)!;
  const day = new Date(parts.year, parts.month - 1, parts.day);
  do { day.setDate(day.getDate() + 1); }
  while (!isScheduledDrawDate({ year: day.getFullYear(), month: day.getMonth() + 1, day: day.getDate() }));
  return datePartsToIso({ year: day.getFullYear(), month: day.getMonth() + 1, day: day.getDate() });
}

export function numberGroupBrier(probabilities: readonly number[], actual: readonly number[]): number {
  if (probabilities.length !== 45 || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw new RangeError("45 finite appearance estimates between zero and one are required");
  const drawn = new Set(actual);
  if (drawn.size !== 8 || actual.length !== 8 || actual.some(n => !Number.isInteger(n) || n < 1 || n > 45)) throw new RangeError("Eight unique actual draw numbers are required");
  return probabilities.reduce((sum, p, index) => sum + (p - Number(drawn.has(index + 1))) ** 2, 0) / 45;
}

export function numberGroupForecast(training: readonly Draw[], scale: NumberGroupScale) {
  if (!NUMBER_GROUP_SCALES.includes(scale)) throw new RangeError("Use 3, 5, 9 or 15 number groups");
  if (!training.length) throw new RangeError("Real training history is required");
  const ranges = buildSpokeRanges(scale);
  const size = 45 / scale;
  const hits = Array<number>(45).fill(0);
  for (const draw of training) for (const number of [...draw.main, ...draw.supp]) hits[number - 1]++;
  const groupHits = ranges.map(([first, last]) => hits.slice(first - 1, last).reduce((sum, value) => sum + value, 0));
  const alpha = NUMBER_GROUP_NEUTRAL_STRENGTH;
  const individual = hits.map(count => (count + alpha * NUMBER_GROUP_NEUTRAL_RATE) / (training.length + alpha));
  const cautious = hits.map(count => (count + 2 * alpha * NUMBER_GROUP_NEUTRAL_RATE) / (training.length + 2 * alpha));
  const group = hits.map((_count, index) => (groupHits[Math.floor(index / size)] / size + alpha * NUMBER_GROUP_NEUTRAL_RATE) / (training.length + alpha));
  const probabilities: Record<NumberGroupMethod, number[]> = {
    uniform: Array<number>(45).fill(NUMBER_GROUP_NEUTRAL_RATE), individual, "individual-cautious": cautious,
    group, blend: individual.map((p, index) => (p + group[index]) / 2),
  };
  return { ranges, groupHits, probabilities, predictedCounts: ranges.map(([first]) => group[first - 1] * size) };
}

function side(groupHits: readonly number[], actualCounts: readonly number[], scale: number, high: boolean): NumberGroupSide {
  const extreme = high ? Math.max(...groupHits) : Math.min(...groupHits);
  const groups = groupHits.flatMap((count, index) => count === extreme ? [index] : []);
  const poolSize = groups.length * (45 / scale);
  return { groups, poolSize, hits: groups.reduce((sum, index) => sum + actualCounts[index], 0), expected: 8 * poolSize / 45 };
}

function summarizeSide(records: readonly NumberGroupAuditRecord[], key: "high" | "quiet"): NumberGroupScaleSummary["high"] {
  const informative = records.filter(row => row[key].poolSize < 45);
  const hits = informative.reduce((sum, row) => sum + row[key].hits, 0);
  const opportunities = informative.reduce((sum, row) => sum + row[key].poolSize, 0);
  return { informativeTrials: informative.length, hitsPerDraw: informative.length ? hits / informative.length : null,
    fairHitsPerDraw: mean(informative.map(row => row[key].expected)), excessPP: opportunities ? 100 * (hits / opportunities - NUMBER_GROUP_NEUTRAL_RATE) : null };
}

export function analyzeNumberGroupFrequencyAudit(history: readonly Draw[], options: NumberGroupAuditOptions = {}): NumberGroupAudit {
  const window = options.window ?? "all";
  if (!["all", 13, 36, 156].includes(window)) throw new RangeError("Unsupported audit training window");
  const asOfParts = parseDrawDateParts(options.asOfDate ?? new Date());
  if (!asOfParts) throw new RangeError("A valid audit date is required");
  const asOfDate = datePartsToIso(asOfParts);
  const ignored = { simulated: 0, malformed: 0, offSchedule: 0, future: 0, ambiguousDateRows: 0, openingMonthRows: 0, warmupRows: 0, gapResets: 0 };
  const byDate = new Map<string, Draw[]>();
  for (const draw of history) {
    if (draw.isSimulated) { ignored.simulated++; continue; }
    if (!strictValidateDraws([draw]).length) { ignored.malformed++; continue; }
    const parts = parseDrawDateParts(draw.date);
    if (!parts) { ignored.malformed++; continue; }
    if (!isScheduledDrawDate(parts)) { ignored.offSchedule++; continue; }
    const date = datePartsToIso(parts);
    if (date > asOfDate) { ignored.future++; continue; }
    byDate.set(date, [...(byDate.get(date) ?? []), { date, main: [...draw.main], supp: [...draw.supp] }]);
  }
  const valid = [...byDate.values()].flatMap(rows => {
    if (rows.length !== 1) { ignored.ambiguousDateRows += rows.length; return []; }
    return rows;
  }).sort((a, b) => a.date.localeCompare(b.date));
  const excludedMonths = getExcludedMonthLabelsForHistoryBaselines(valid, row => row.date.slice(0, 7), row => row.date);
  const baseline = valid.filter(row => !excludedMonths.includes(row.date.slice(0, 7)));
  ignored.openingMonthRows = valid.length - baseline.length;
  const records: NumberGroupAuditRecord[] = [];
  let segmentStart = 0;
  for (let index = 0; index < baseline.length; index++) {
    const target = baseline[index];
    if (index && nextScheduled(baseline[index - 1].date) !== target.date) { segmentStart = index; ignored.gapResets++; }
    if (index - segmentStart < NUMBER_GROUP_WARMUP) { ignored.warmupRows++; continue; }
    const from = window === "all" ? segmentStart : Math.max(segmentStart, index - window);
    const training = baseline.slice(from, index);
    const actual = [...target.main, ...target.supp];
    for (const scale of NUMBER_GROUP_SCALES) {
      const forecast = numberGroupForecast(training, scale);
      const size = 45 / scale;
      const actualCounts = Array<number>(scale).fill(0);
      actual.forEach(n => { actualCounts[Math.floor((n - 1) / size)]++; });
      const losses = Object.fromEntries(NUMBER_GROUP_METHODS.map(method => [method, numberGroupBrier(forecast.probabilities[method], actual)])) as Record<NumberGroupMethod, number>;
      records.push({ date: target.date, ordinal: countScheduledDrawsInMonth(target.date.slice(0, 7), parseDrawDateParts(target.date)!.day),
        monthLength: countScheduledDrawsInMonth(target.date.slice(0, 7)), scale,
        trainingFrom: training[0].date, trainingThrough: training[training.length - 1].date, trainingDraws: training.length,
        actual: { main: [...target.main], supp: [...target.supp] }, actualCounts, predictedCounts: forecast.predictedCounts,
        high: side(forecast.groupHits, actualCounts, scale, true), quiet: side(forecast.groupHits, actualCounts, scale, false),
        rawOga: computeOGA(actual, training, scale),
        fairOgaMean: forecast.groupHits.reduce((sum, count) => sum + (8 / scale) / (count / training.length + 0.001), 0),
        neutralCompositionLoss: actualCounts.reduce((sum, count) => sum + (count - 8 / scale) ** 2, 0) / scale,
        groupCompositionLoss: actualCounts.reduce((sum, count, group) => sum + (count - forecast.predictedCounts[group]) ** 2, 0) / scale,
        losses });
    }
  }
  const summaries = NUMBER_GROUP_SCALES.map((scale): NumberGroupScaleSummary => {
    const rows = records.filter(row => row.scale === scale);
    return { scale, size: 45 / scale, trials: rows.length, high: summarizeSide(rows, "high"), quiet: summarizeSide(rows, "quiet"),
      rawOgaMean: mean(rows.map(row => row.rawOga)), fairOgaMean: mean(rows.map(row => row.fairOgaMean)),
      neutralCompositionLoss: mean(rows.map(row => row.neutralCompositionLoss)), groupCompositionLoss: mean(rows.map(row => row.groupCompositionLoss)),
      compositionGain: summarizeNumberGroupComparison(rows.map(row => row.neutralCompositionLoss - row.groupCompositionLoss)),
      methods: NUMBER_GROUP_METHODS.map(method => ({ method, loss: mean(rows.map(row => row.losses[method])),
        fairGain: summarizeNumberGroupComparison(rows.map(row => row.losses.uniform - row.losses[method])),
        individualGain: summarizeNumberGroupComparison(rows.map(row => row.losses.individual - row.losses[method])) })) };
  });
  const last = baseline[baseline.length - 1];
  let current: NumberGroupCurrent | null = null;
  if (last && baseline.length - segmentStart >= NUMBER_GROUP_WARMUP) {
    const from = window === "all" ? segmentStart : Math.max(segmentStart, baseline.length - window);
    const training = baseline.slice(from);
    current = { date: nextScheduled(last.date), trainingFrom: training[0].date, trainingThrough: last.date, trainingDraws: training.length,
      scales: NUMBER_GROUP_SCALES.map(scale => {
        const forecast = numberGroupForecast(training, scale);
        return { scale, ranges: forecast.ranges, predictedCounts: forecast.predictedCounts, observedCounts: forecast.groupHits };
      }) };
  }
  const targetDates = [...new Set(records.map(row => row.date))];
  return { modelVersion: NUMBER_GROUP_AUDIT_VERSION, baselinePolicy: HISTORY_BASELINE_POLICY_VERSION,
    config: { window, warmup: NUMBER_GROUP_WARMUP, neutralStrength: NUMBER_GROUP_NEUTRAL_STRENGTH, blendGroupWeight: 0.5, ciLag: 6, asOfDate },
    ignored, excludedMonths, validDraws: valid.length, baseline, firstTarget: targetDates[0] ?? null, lastTarget: targetDates[targetDates.length - 1] ?? null,
    targets: targetDates.length, earlierTargets: Math.ceil(targetDates.length / 2), laterTargets: Math.floor(targetDates.length / 2), summaries, records, current };
}
