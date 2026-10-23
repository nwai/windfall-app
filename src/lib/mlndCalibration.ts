import type { Draw } from "../types";
import { buildMlndHistoryScope, buildMlndRiskRows, type MlndDrawScope, type MlndRiskRow } from "./mlndExclusionRisk";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";
import { strictValidateDraws } from "./strictDrawValidation";
import { summarizeNumberGroupComparison, type NumberGroupComparison } from "./numberGroupFrequencyAudit";

export const MLND_CALIBRATION_VERSION = "MLND-C1";
export const MLND_CALIBRATION_WARMUP = 30;
export const MLND_CALIBRATION_MIN_EVALUATION = 120;
export const MLND_CALIBRATION_PRIOR_WEIGHT = 45;
export const MLND_CALIBRATION_MAX_GAP = 0.03;
export const MLND_RAW_BAND_ENDS = [0.1, 0.2, 0.3, 0.4, 1] as const;

interface Counter { trials: number; hits: number }
export interface MlndCalibrationBand extends Counter {
  lower: number;
  upper: number;
  fittedRate: number;
  block: number;
}
export interface MlndCalibrationPoint {
  number: number;
  raw: number;
  adjusted: number | null;
  hit: boolean;
}
export interface MlndCalibrationRecord {
  date: string;
  trainingFrom: string;
  trainingThrough: string;
  trainingDraws: number;
  calibrationDrawsBefore: number;
  points: MlndCalibrationPoint[];
  rawBrier: number;
  adjustedBrier: number | null;
  neutralBrier: number;
}
export interface MlndReliabilityBand {
  lower: number;
  upper: number;
  cases: number;
  draws: number;
  rawMean: number | null;
  adjustedMean: number | null;
  observed: number | null;
}
export interface MlndCalibratedRow extends MlndRiskRow { adjustedRisk: number | null }
export interface MlndCalibratedAnalysis {
  version: typeof MLND_CALIBRATION_VERSION;
  scope: MlndDrawScope;
  baseline: number;
  historyScope: ReturnType<typeof buildMlndHistoryScope>;
  ignored: { simulated: number; malformed: number; offSchedule: number; future: number; duplicateDateRows: number; gapResets: number };
  minTrainingDraws: number;
  currentTrainingDraws: number;
  calibrationDraws: number;
  currentBands: MlndCalibrationBand[];
  rows: MlndCalibratedRow[];
  records: MlndCalibrationRecord[];
  evaluationDraws: number;
  rawBrier: number | null;
  adjustedBrier: number | null;
  neutralBrier: number | null;
  improvementVsRaw: NumberGroupComparison;
  improvementVsNeutral: NumberGroupComparison;
  reliability: MlndReliabilityBand[];
  calibrationGap: number | null;
  status: "learning" | "unproven" | "corrected-no-edge" | "supported";
  statusReason: string;
  asOfDate: string;
}

const mean = (values: readonly number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const bandIndex = (score: number): number => MLND_RAW_BAND_ENDS.findIndex((end, index) => score < end || index === MLND_RAW_BAND_ENDS.length - 1);
const emptyCounters = (): Counter[] => MLND_RAW_BAND_ENDS.map(() => ({ trials: 0, hits: 0 }));

// Weighted pool-adjacent-violators on fixed raw-score bands. The declared prior
// regularises the fit; it is never counted as an observed draw or state check.
export function fitMlndCalibration(counters: readonly Counter[], baseline: number): MlndCalibrationBand[] {
  if (counters.length !== MLND_RAW_BAND_ENDS.length || !Number.isFinite(baseline) || baseline <= 0 || baseline >= 1) throw new RangeError("Five bands and a valid baseline are required");
  const blocks: { first: number; last: number; weight: number; hits: number }[] = [];
  counters.forEach((counter, index) => {
    if (!Number.isInteger(counter.trials) || !Number.isInteger(counter.hits) || counter.trials < 0 || counter.hits < 0 || counter.hits > counter.trials) throw new RangeError("Calibration requires valid observed counts");
    blocks.push({ first: index, last: index, weight: counter.trials + MLND_CALIBRATION_PRIOR_WEIGHT, hits: counter.hits + MLND_CALIBRATION_PRIOR_WEIGHT * baseline });
    while (blocks.length >= 2) {
      const right = blocks[blocks.length - 1], left = blocks[blocks.length - 2];
      if (left.hits / left.weight < right.hits / right.weight - 1e-12) break;
      blocks.splice(-2, 2, { first: left.first, last: right.last, weight: left.weight + right.weight, hits: left.hits + right.hits });
    }
  });
  return counters.map((counter, index) => {
    const block = blocks.findIndex(row => row.first <= index && row.last >= index);
    return { ...counter, lower: index ? MLND_RAW_BAND_ENDS[index - 1] : 0, upper: MLND_RAW_BAND_ENDS[index], fittedRate: blocks[block].hits / blocks[block].weight, block };
  });
}

export function applyMlndCalibration(raw: readonly number[], bands: readonly MlndCalibrationBand[], drawSize: number): number[] {
  if (raw.length !== 45 || raw.some(value => !Number.isFinite(value) || value < 0 || value > 1) || bands.length !== 5 || ![6, 8].includes(drawSize)) throw new RangeError("Calibration requires 45 valid scores and a six- or eight-ball scope");
  const fitted = raw.map(score => bands[bandIndex(score)].fittedRate);
  if (fitted.some(value => !Number.isFinite(value) || value <= 0 || value >= 1)) throw new RangeError("Invalid fitted calibration rates");
  if (Math.max(...fitted) - Math.min(...fitted) < 1e-12) return raw.map(() => drawSize / 45);
  // One common log-odds offset enforces the known six/eight-ball total without
  // looking at which numbers appeared, changing order, or splitting tied blocks.
  const logits = fitted.map(rate => Math.log(rate / (1 - rate)));
  let low = -40, high = 40;
  for (let iteration = 0; iteration < 60; iteration++) {
    const offset = (low + high) / 2;
    const total = logits.reduce((sum, logit) => sum + 1 / (1 + Math.exp(-logit - offset)), 0);
    if (total < drawSize) low = offset; else high = offset;
  }
  const offset = (low + high) / 2;
  return logits.map(logit => 1 / (1 + Math.exp(-logit - offset)));
}

const nextScheduled = (iso: string): string => {
  const date = new Date(`${iso}T12:00:00Z`);
  do { date.setUTCDate(date.getUTCDate() + 1); } while (![1, 3, 5].includes(date.getUTCDay()));
  return date.toISOString().slice(0, 10);
};

export function buildMlndCalibratedAnalysis(rawHistory: readonly Draw[], options: { scope?: MlndDrawScope; minTrainingDraws?: number; asOfDate?: string } = {}): MlndCalibratedAnalysis {
  const scope = options.scope ?? "mainAndSupp", drawSize = scope === "mains" ? 6 : 8, baseline = drawSize / 45;
  const minTrainingDraws = Math.max(20, Math.min(180, Math.round(Number.isFinite(options.minTrainingDraws) ? options.minTrainingDraws! : 60)));
  const asOfParts = parseDrawDateParts(options.asOfDate ?? new Date());
  if (!asOfParts) throw new RangeError("A valid audit date is required");
  const asOfDate = datePartsToIso(asOfParts);
  const ignored = { simulated: 0, malformed: 0, offSchedule: 0, future: 0, duplicateDateRows: 0, gapResets: 0 };
  const dates = new Map<string, Draw[]>();
  for (const draw of rawHistory) {
    if (draw.isSimulated) { ignored.simulated++; continue; }
    if (!strictValidateDraws([draw]).length) { ignored.malformed++; continue; }
    const parts = parseDrawDateParts(draw.date);
    if (!parts) { ignored.malformed++; continue; }
    if (!isScheduledDrawDate(parts)) { ignored.offSchedule++; continue; }
    const date = datePartsToIso(parts);
    if (date > asOfDate) { ignored.future++; continue; }
    dates.set(date, [...(dates.get(date) ?? []), { date, main: [...draw.main], supp: [...draw.supp] }]);
  }
  const valid = [...dates.values()].flatMap(rows => {
    if (rows.length === 1) return rows;
    ignored.duplicateDateRows += rows.length;
    return [];
  });
  const historyScope = buildMlndHistoryScope(valid), history = historyScope.history;
  let counters = emptyCounters(), calibrationDraws = 0, segmentStart = 0;
  const records: MlndCalibrationRecord[] = [];
  for (let index = 0; index < history.length; index++) {
    if (index && nextScheduled(history[index - 1].date) !== history[index].date) {
      counters = emptyCounters(); calibrationDraws = 0; segmentStart = index; ignored.gapResets++;
    }
    if (index - segmentStart < minTrainingDraws) continue;
    const training = history.slice(segmentStart, index);
    const rawRows = buildMlndRiskRows(training, scope);
    const adjusted = calibrationDraws >= MLND_CALIBRATION_WARMUP
      ? applyMlndCalibration(rawRows.map(row => row.riskScore), fitMlndCalibration(counters, baseline), drawSize)
      : null;
    const actual = new Set(scope === "mains" ? history[index].main : [...history[index].main, ...history[index].supp]);
    const points = rawRows.map((row, position) => ({ number: row.number, raw: row.riskScore, adjusted: adjusted?.[position] ?? null, hit: actual.has(row.number) }));
    records.push({ date: history[index].date, trainingFrom: training[0].date, trainingThrough: training[training.length - 1].date,
      trainingDraws: training.length, calibrationDrawsBefore: calibrationDraws, points,
      rawBrier: mean(points.map(row => (row.raw - Number(row.hit)) ** 2))!,
      adjustedBrier: adjusted ? mean(points.map(row => (row.adjusted! - Number(row.hit)) ** 2)) : null,
      neutralBrier: baseline * (1 - baseline) });
    // Only now may the target's real outcome teach the next calibrator.
    for (const point of points) {
      const counter = counters[bandIndex(point.raw)];
      counter.trials++; counter.hits += Number(point.hit);
    }
    calibrationDraws++;
  }
  const currentTraining = history.slice(segmentStart);
  const rawRows = buildMlndRiskRows(currentTraining, scope);
  const currentBands = fitMlndCalibration(counters, baseline);
  const current = calibrationDraws >= MLND_CALIBRATION_WARMUP ? applyMlndCalibration(rawRows.map(row => row.riskScore), currentBands, drawSize) : null;
  const evaluation = records.filter(row => row.adjustedBrier != null);
  const reliability = MLND_RAW_BAND_ENDS.map((upper, index): MlndReliabilityBand => {
    const grouped = evaluation.map(record => record.points.filter(point => bandIndex(point.raw) === index));
    const points = grouped.flat();
    return { lower: index ? MLND_RAW_BAND_ENDS[index - 1] : 0, upper, cases: points.length,
      draws: grouped.filter(rows => rows.length).length, rawMean: mean(points.map(point => point.raw)),
      adjustedMean: mean(points.map(point => point.adjusted!)), observed: mean(points.map(point => Number(point.hit))) };
  });
  const totalCases = reliability.reduce((sum, row) => sum + row.cases, 0);
  const calibrationGap = totalCases ? reliability.reduce((sum, row) => sum + (row.cases ? row.cases * Math.abs(row.adjustedMean! - row.observed!) : 0), 0) / totalCases : null;
  const improvementVsRaw = summarizeNumberGroupComparison(evaluation.map(row => row.rawBrier - row.adjustedBrier!));
  const improvementVsNeutral = summarizeNumberGroupComparison(evaluation.map(row => row.neutralBrier - row.adjustedBrier!));
  let status: MlndCalibratedAnalysis["status"] = "learning";
  let statusReason = `Calibration needs ${MLND_CALIBRATION_MIN_EVALUATION} later evaluation draws; ${evaluation.length} are available.`;
  if (evaluation.length >= MLND_CALIBRATION_MIN_EVALUATION && current) {
    const improves = improvementVsRaw.interval95 && improvementVsRaw.interval95[0] > 0 && improvementVsRaw.earlierMean! > 0 && improvementVsRaw.laterMean! > 0;
    const reliable = calibrationGap != null && calibrationGap <= MLND_CALIBRATION_MAX_GAP;
    const edge = improvementVsNeutral.interval95 && improvementVsNeutral.interval95[0] > 0 && improvementVsNeutral.earlierMean! > 0 && improvementVsNeutral.laterMean! > 0;
    status = improves && reliable ? edge ? "supported" : "corrected-no-edge" : "unproven";
    statusReason = status === "supported"
      ? "The sequential correction cleared the declared reliability and draw-level Brier gates against both raw scores and the neutral reference. Future performance remains uncertain."
      : status === "corrected-no-edge"
        ? "The correction improves raw-score reliability, but does not demonstrate an advantage over equal-chance risk. No calibrated exclusion recommendation is supported."
        : "The sequential correction has not cleared the declared reliability and raw-score improvement gates. No calibrated exclusion recommendation is supported.";
  } else if (!current) {
    statusReason = `The current continuous history segment needs ${MLND_CALIBRATION_WARMUP} earlier scored forecasts after ${minTrainingDraws} initial training draws. ${calibrationDraws} scored forecasts are available.`;
  }
  return { version: MLND_CALIBRATION_VERSION, scope, baseline, historyScope, ignored, minTrainingDraws,
    currentTrainingDraws: currentTraining.length, calibrationDraws, currentBands,
    rows: rawRows.map((row, index) => ({ ...row, adjustedRisk: current?.[index] ?? null })), records,
    evaluationDraws: evaluation.length, rawBrier: mean(evaluation.map(row => row.rawBrier)),
    adjustedBrier: mean(evaluation.map(row => row.adjustedBrier!)), neutralBrier: evaluation.length ? baseline * (1 - baseline) : null,
    improvementVsRaw, improvementVsNeutral, reliability, calibrationGap, status, statusReason, asOfDate };
}

export function selectMlndCalibrationBudget(analysis: MlndCalibratedAnalysis, requestedBudget: number) {
  const budget = Math.max(1, Math.min(44, Math.round(Number.isFinite(requestedBudget) ? requestedBudget : 37)));
  const rawReady = analysis.currentTrainingDraws >= analysis.minTrainingDraws;
  const rawExcluded = rawReady ? analysis.rows.slice(0, budget).map(row => row.number) : [];
  const rawAllowed = rawReady ? analysis.rows.slice(budget).map(row => row.number) : [];
  const evaluation = analysis.records.filter(row => row.adjustedBrier != null);
  const drawSize = analysis.scope === "mains" ? 6 : 8;
  const fairFalseExcluded = budget * drawSize / 45;
  const falseCounts = evaluation.map(row => row.points.slice(0, budget).filter(point => point.hit).length);
  const delta = summarizeNumberGroupComparison(falseCounts.map(count => fairFalseExcluded - count));
  const ordered = analysis.rows.slice().sort((a, b) => (a.adjustedRisk ?? analysis.baseline) - (b.adjustedRisk ?? analysis.baseline) || a.number - b.number);
  const tiedBoundary = ordered[budget - 1].adjustedRisk == null || Math.abs(ordered[budget - 1].adjustedRisk! - ordered[budget].adjustedRisk!) < 1e-12;
  const rankSupported = delta.interval95 != null && delta.interval95[0] > 0 && delta.earlierMean! > 0 && delta.laterMean! > 0;
  const supported = analysis.status === "supported" && !tiedBoundary && rankSupported;
  return { budget, rawExcluded, rawAllowed, calibratedExcluded: supported ? ordered.slice(0, budget).map(row => row.number) : [],
    tiedBoundary, supported, evaluationDraws: evaluation.length, meanFalseExcluded: mean(falseCounts), fairFalseExcluded, delta,
    reason: analysis.status !== "supported" ? analysis.statusReason : tiedBoundary
      ? "This budget cuts through numbers with equal calibrated risk. No arbitrary tie-break is presented as evidence."
      : !rankSupported ? "The raw ordering has not cleared the draw-level advantage gate at this exclusion budget."
      : "Selected complete lower-risk groups; no calibrated tie is split at the budget boundary." };
}
