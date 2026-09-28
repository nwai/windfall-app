import type { Draw } from "../types";
import {
  computeStrictDroughtShortlist,
  DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
  STRICT_DROUGHT_DEFAULT_THRESHOLD,
  type StrictDroughtNumberRow,
} from "./droughtHazard";
import {
  countScheduledDrawsInMonth,
  isScheduledDrawDate,
  monthLabelFromDateParts,
  parseDrawDateParts,
} from "./planningDrawContext";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

export const DROUGHT_LEARNING_MODEL_VERSION = "DLA-1";
export const DROUGHT_LEARNING_MIN_HISTORY = 24;
export const DROUGHT_LEARNING_PROMOTION_TRIALS = 60;

const BASE_PRIOR_STRENGTH = 45;
const COARSE_PRIOR_STRENGTH = 30;
const EXACT_PRIOR_STRENGTH = 20;

export type DroughtLearningModel = "champion" | "challenger";
export type DroughtLearningGateStatus =
  | "insufficient"
  | "retain-champion"
  | "watch-challenger"
  | "promote-challenger";
export type DroughtLearningSample = "none" | "thin" | "limited" | "broader";

export interface DroughtLearningRankedNumber {
  number: number;
  strictRank: number;
  learnedRank: number;
  currentDrought: number;
  bucketCount: number;
  bucketLabel: string;
  learnedRate: number;
  baseTrials: number;
  coarseTrials: number;
  exactTrials: number;
  sample: DroughtLearningSample;
}

export interface DroughtLearningAuditRecord {
  targetDate: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
  trainingDraws: number;
  championNumbers: number[];
  challengerNumbers: number[];
  championHits: number[];
  challengerHits: number[];
  championHitCount: number;
  challengerHitCount: number;
  expectedRandomHits: number;
  policyModelBeforeDraw: DroughtLearningModel;
  policyHitCount: number;
  gateStatusBeforeDraw: DroughtLearningGateStatus;
  challengerPredictions: Array<{ number: number; learnedRate: number; hit: boolean }>;
}

export interface DroughtLearningCalibrationRow {
  label: string;
  trials: number;
  hits: number;
  averageLearnedRate: number;
  observedRate: number;
  brierScore: number;
}

export interface DroughtLearningGate {
  status: DroughtLearningGateStatus;
  selectedModel: DroughtLearningModel;
  trials: number;
  averagePairedDifference: number;
  pairedDifferenceCi: [number, number] | null;
  reason: string;
}

export interface DroughtLearningAuditResult {
  modelVersion: typeof DROUGHT_LEARNING_MODEL_VERSION;
  scope: "mains+supps";
  baselineProbability: number;
  threshold: number;
  topK: number;
  minHistory: number;
  validHistoryDraws: number;
  excludedHistoryRows: number;
  records: DroughtLearningAuditRecord[];
  currentChampion: number[];
  currentChallenger: number[];
  currentRankedNumbers: DroughtLearningRankedNumber[];
  gate: DroughtLearningGate;
  calibrationRows: DroughtLearningCalibrationRow[];
  challengerBrierScore: number | null;
  neutralBrierScore: number | null;
  championAverageHits: number;
  challengerAverageHits: number;
  policyAverageHits: number;
  expectedRandomAverageHits: number;
  targetMonthLabel: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
}

export interface DroughtLearningAuditOptions {
  threshold?: number;
  topK?: number;
  minHistory?: number;
  targetMonthLabel: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
}

interface PreparedDraw {
  draw: Draw;
  date: string;
  monthLabel: string;
  drawOrdinal: number;
  expectedMonthDrawCount: number;
  numbers: Set<number>;
}

interface Counter {
  trials: number;
  hits: number;
}

interface LearningCounters {
  global: Counter;
  base: Map<string, Counter>;
  coarse: Map<string, Counter>;
  exact: Map<string, Counter>;
}

interface NumberStateKeys {
  base: string;
  coarse: string;
  exact: string;
}

interface ScoredNumber {
  row: StrictDroughtNumberRow;
  bucketCount: number;
  learnedRate: number;
  baseTrials: number;
  coarseTrials: number;
  exactTrials: number;
}

const emptyCounter = (): Counter => ({ trials: 0, hits: 0 });

const makeCounters = (): LearningCounters => ({
  global: emptyCounter(),
  base: new Map(),
  coarse: new Map(),
  exact: new Map(),
});

const drawNumbers = (draw: Draw): number[] => (
  [...(draw.main ?? []), ...(draw.supp ?? [])]
    .filter((number) => Number.isInteger(number) && number >= 1 && number <= 45)
);

const prepareHistory = (history: readonly Draw[]): { draws: PreparedDraw[]; excludedRows: number } => {
  const seenDates = new Set<string>();
  let excludedRows = 0;
  const draws: PreparedDraw[] = [];

  for (const draw of sortDrawsChronologically(history.filter((row) => !row.isSimulated).map((row) => ({ ...row })))) {
    const parts = parseDrawDateParts(draw.date);
    const numbers = new Set(drawNumbers(draw));
    const epoch = parseDrawDateToEpoch(draw.date);
    if (
      !parts
      || !isScheduledDrawDate(parts)
      || !Number.isFinite(epoch)
      || epoch <= 0
      || draw.main.length !== 6
      || draw.supp.length !== 2
      || numbers.size !== 8
    ) {
      excludedRows += 1;
      continue;
    }
    const monthLabel = monthLabelFromDateParts(parts);
    const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    if (seenDates.has(date)) {
      excludedRows += 1;
      continue;
    }
    seenDates.add(date);
    draws.push({
      draw,
      date,
      monthLabel,
      drawOrdinal: countScheduledDrawsInMonth(monthLabel, parts.day),
      expectedMonthDrawCount: countScheduledDrawsInMonth(monthLabel),
      numbers,
    });
  }

  return { draws, excludedRows };
};

const monthCountsBefore = (history: readonly PreparedDraw[], targetMonthLabel: string): number[] => {
  const counts = new Array<number>(46).fill(0);
  history.forEach((row) => {
    if (row.monthLabel !== targetMonthLabel) return;
    row.numbers.forEach((number) => {
      counts[number] += 1;
    });
  });
  return counts;
};

const bucketGroup = (count: number): string => {
  if (count <= 0) return "0x";
  if (count === 1) return "1x";
  if (count === 2) return "2x";
  return "3x+";
};

const droughtBand = (drought: number, threshold: number): string => {
  const start = Math.max(1, threshold);
  if (drought <= start + 2) return `${start}-${start + 2}`;
  if (drought <= start + 6) return `${start + 3}-${start + 6}`;
  return `${start + 7}+`;
};

const stageBand = (ordinal: number): string => {
  if (ordinal <= 3) return "D1-D3";
  if (ordinal <= 6) return "D4-D6";
  if (ordinal <= 9) return "D7-D9";
  return "D10+";
};

const stateKeys = (
  row: StrictDroughtNumberRow,
  bucketCount: number,
  drawOrdinal: number,
  monthDrawCount: number,
  threshold: number,
): NumberStateKeys => {
  const bucket = bucketGroup(bucketCount);
  const drought = droughtBand(row.currentDrought, threshold);
  const stage = stageBand(drawOrdinal);
  const base = `${bucket}|${drought}`;
  const coarse = `${stage}|${base}`;
  // Completed episode counts and strict rank are deliberately excluded from
  // the learned rate. Strict rank is retained only as a deterministic tie-break.
  const exact = `${monthDrawCount}D|${coarse}`;
  return { base, coarse, exact };
};

const posteriorRate = (counter: Counter | undefined, priorRate: number, priorStrength: number): number => {
  const trials = counter?.trials ?? 0;
  const hits = counter?.hits ?? 0;
  return (hits + priorRate * priorStrength) / (trials + priorStrength);
};

const scoreRows = (
  rows: readonly StrictDroughtNumberRow[],
  monthlyCounts: readonly number[],
  drawOrdinal: number,
  monthDrawCount: number,
  threshold: number,
  counters: LearningCounters,
): ScoredNumber[] => {
  const globalRate = posteriorRate(counters.global, DROUGHT_HAZARD_ANY_DRAWN_BASELINE, BASE_PRIOR_STRENGTH);
  return rows.map((row) => {
    const bucketCount = monthlyCounts[row.number] ?? 0;
    const keys = stateKeys(row, bucketCount, drawOrdinal, monthDrawCount, threshold);
    const baseCounter = counters.base.get(keys.base);
    const coarseCounter = counters.coarse.get(keys.coarse);
    const exactCounter = counters.exact.get(keys.exact);
    const baseRate = posteriorRate(baseCounter, globalRate, BASE_PRIOR_STRENGTH);
    const coarseRate = posteriorRate(coarseCounter, baseRate, COARSE_PRIOR_STRENGTH);
    const learnedRate = posteriorRate(exactCounter, coarseRate, EXACT_PRIOR_STRENGTH);
    return {
      row,
      bucketCount,
      learnedRate,
      baseTrials: baseCounter?.trials ?? 0,
      coarseTrials: coarseCounter?.trials ?? 0,
      exactTrials: exactCounter?.trials ?? 0,
    };
  });
};

const learnedOrder = (rows: readonly ScoredNumber[]): ScoredNumber[] => (
  [...rows].sort((left, right) =>
    right.learnedRate - left.learnedRate
    || right.row.currentDrought - left.row.currentDrought
    || (left.row.strictRank ?? 99) - (right.row.strictRank ?? 99)
    || left.row.number - right.row.number
  )
);

const updateCounter = (map: Map<string, Counter>, key: string, hit: boolean): void => {
  const counter = map.get(key) ?? emptyCounter();
  counter.trials += 1;
  if (hit) counter.hits += 1;
  map.set(key, counter);
};

const updateLearningCounters = (
  counters: LearningCounters,
  scoredRows: readonly ScoredNumber[],
  actualNumbers: ReadonlySet<number>,
  drawOrdinal: number,
  monthDrawCount: number,
  threshold: number,
): void => {
  scoredRows.forEach((scored) => {
    const hit = actualNumbers.has(scored.row.number);
    const keys = stateKeys(scored.row, scored.bucketCount, drawOrdinal, monthDrawCount, threshold);
    counters.global.trials += 1;
    if (hit) counters.global.hits += 1;
    updateCounter(counters.base, keys.base, hit);
    updateCounter(counters.coarse, keys.coarse, hit);
    updateCounter(counters.exact, keys.exact, hit);
  });
};

const mean = (values: readonly number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const pairedDifferenceCi = (values: readonly number[]): [number, number] | null => {
  if (values.length < 2) return null;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return [average - margin, average + margin];
};

const evaluateGate = (records: readonly DroughtLearningAuditRecord[]): DroughtLearningGate => {
  const differences = records.map((record) => record.challengerHitCount - record.championHitCount);
  const averagePairedDifference = mean(differences);
  const ci = pairedDifferenceCi(differences);
  const challengerAverage = mean(records.map((record) => record.challengerHitCount));
  const randomAverage = mean(records.map((record) => record.expectedRandomHits));

  if (records.length < DROUGHT_LEARNING_PROMOTION_TRIALS || !ci) {
    return {
      status: "insufficient",
      selectedModel: "champion",
      trials: records.length,
      averagePairedDifference,
      pairedDifferenceCi: ci,
      reason: `Needs at least ${DROUGHT_LEARNING_PROMOTION_TRIALS} scored walk-forward draws before the challenger can be considered for promotion.`,
    };
  }
  if (ci[0] > 0 && challengerAverage > randomAverage) {
    return {
      status: "promote-challenger",
      selectedModel: "challenger",
      trials: records.length,
      averagePairedDifference,
      pairedDifferenceCi: ci,
      reason: "The challenger's paired 95% interval is entirely above the champion and its average hits exceed the equal-size random expectation. Promotion is supported for observe-only tracking.",
    };
  }
  if (averagePairedDifference <= 0 || ci[1] < 0) {
    return {
      status: "retain-champion",
      selectedModel: "champion",
      trials: records.length,
      averagePairedDifference,
      pairedDifferenceCi: ci,
      reason: "The challenger has not improved average hits over the champion. The existing strict ordering remains the observe-only reference.",
    };
  }
  return {
    status: "watch-challenger",
    selectedModel: "champion",
    trials: records.length,
    averagePairedDifference,
    pairedDifferenceCi: ci,
    reason: "The challenger is ahead on the sample average, but its paired 95% interval still includes no improvement. Continue observing without promotion.",
  };
};

const sampleLabel = (trials: number): DroughtLearningSample => {
  if (trials <= 0) return "none";
  if (trials < 20) return "thin";
  if (trials < 50) return "limited";
  return "broader";
};

const calibrationRows = (
  records: readonly DroughtLearningAuditRecord[],
): DroughtLearningCalibrationRow[] => {
  const predictions = records.flatMap((record) => record.challengerPredictions);
  const bins = [
    { label: "Under 15%", min: 0, max: 0.15 },
    { label: "15% to under 18%", min: 0.15, max: 0.18 },
    { label: "18% to under 21%", min: 0.18, max: 0.21 },
    { label: "21% and above", min: 0.21, max: Number.POSITIVE_INFINITY },
  ];
  return bins.map((bin) => {
    const rows = predictions.filter((prediction) => prediction.learnedRate >= bin.min && prediction.learnedRate < bin.max);
    const hits = rows.filter((prediction) => prediction.hit).length;
    return {
      label: bin.label,
      trials: rows.length,
      hits,
      averageLearnedRate: mean(rows.map((row) => row.learnedRate)),
      observedRate: rows.length ? hits / rows.length : 0,
      brierScore: rows.length
        ? mean(rows.map((row) => (row.learnedRate - (row.hit ? 1 : 0)) ** 2))
        : 0,
    };
  });
};

const brierScores = (records: readonly DroughtLearningAuditRecord[]): { challenger: number | null; neutral: number | null } => {
  const predictions = records.flatMap((record) => record.challengerPredictions);
  if (!predictions.length) return { challenger: null, neutral: null };
  return {
    challenger: mean(predictions.map((row) => (row.learnedRate - (row.hit ? 1 : 0)) ** 2)),
    neutral: mean(predictions.map((row) => (DROUGHT_HAZARD_ANY_DRAWN_BASELINE - (row.hit ? 1 : 0)) ** 2)),
  };
};

export const analyzeDroughtLearningAudit = (
  history: readonly Draw[],
  options: DroughtLearningAuditOptions,
): DroughtLearningAuditResult => {
  const threshold = Math.max(1, Math.round(options.threshold ?? STRICT_DROUGHT_DEFAULT_THRESHOLD));
  const topK = Math.max(1, Math.min(45, Math.round(options.topK ?? 8)));
  const minHistory = Math.max(1, Math.round(options.minHistory ?? DROUGHT_LEARNING_MIN_HISTORY));
  const targetDrawOrdinal = Math.max(1, Math.round(options.targetDrawOrdinal));
  const targetMonthExpectedDrawCount = Math.max(targetDrawOrdinal, Math.round(options.targetMonthExpectedDrawCount));
  const prepared = prepareHistory(history);
  const counters = makeCounters();
  const records: DroughtLearningAuditRecord[] = [];

  for (let targetIndex = 1; targetIndex < prepared.draws.length; targetIndex += 1) {
    const target = prepared.draws[targetIndex];
    const trainingPrepared = prepared.draws.slice(0, targetIndex);
    const trainingDraws = trainingPrepared.map((row) => row.draw);
    const strictRows = computeStrictDroughtShortlist(trainingDraws, trainingDraws, { threshold }).rows;
    const monthlyCounts = monthCountsBefore(trainingPrepared, target.monthLabel);
    const scored = scoreRows(
      strictRows,
      monthlyCounts,
      target.drawOrdinal,
      target.expectedMonthDrawCount,
      threshold,
      counters,
    );
    const ordered = learnedOrder(scored);
    const champion = strictRows.slice(0, topK).map((row) => row.number);
    const challengerRows = ordered.slice(0, topK);
    const challenger = challengerRows.map((row) => row.row.number);
    const gateBeforeDraw = evaluateGate(records);
    const championHits = champion.filter((number) => target.numbers.has(number));
    const challengerHits = challenger.filter((number) => target.numbers.has(number));

    if (targetIndex >= minHistory && champion.length > 0) {
      const policyModelBeforeDraw = gateBeforeDraw.selectedModel;
      records.push({
        targetDate: target.date,
        targetDrawOrdinal: target.drawOrdinal,
        targetMonthExpectedDrawCount: target.expectedMonthDrawCount,
        trainingDraws: trainingDraws.length,
        championNumbers: champion,
        challengerNumbers: challenger,
        championHits,
        challengerHits,
        championHitCount: championHits.length,
        challengerHitCount: challengerHits.length,
        expectedRandomHits: champion.length * DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
        policyModelBeforeDraw,
        policyHitCount: policyModelBeforeDraw === "challenger" ? challengerHits.length : championHits.length,
        gateStatusBeforeDraw: gateBeforeDraw.status,
        challengerPredictions: challengerRows.map((row) => ({
          number: row.row.number,
          learnedRate: row.learnedRate,
          hit: target.numbers.has(row.row.number),
        })),
      });
    }

    updateLearningCounters(
      counters,
      scored,
      target.numbers,
      target.drawOrdinal,
      target.expectedMonthDrawCount,
      threshold,
    );
  }

  const allPreparedDraws = prepared.draws;
  const allDraws = allPreparedDraws.map((row) => row.draw);
  const currentStrictRows = computeStrictDroughtShortlist(allDraws, allDraws, { threshold }).rows;
  const currentMonthlyCounts = monthCountsBefore(allPreparedDraws, options.targetMonthLabel);
  const currentScored = scoreRows(
    currentStrictRows,
    currentMonthlyCounts,
    targetDrawOrdinal,
    targetMonthExpectedDrawCount,
    threshold,
    counters,
  );
  const currentOrdered = learnedOrder(currentScored);
  const learnedRankByNumber = new Map(currentOrdered.map((row, index) => [row.row.number, index + 1]));
  const currentRankedNumbers = currentOrdered.map((row): DroughtLearningRankedNumber => ({
    number: row.row.number,
    strictRank: row.row.strictRank ?? 0,
    learnedRank: learnedRankByNumber.get(row.row.number) ?? 0,
    currentDrought: row.row.currentDrought,
    bucketCount: row.bucketCount,
    bucketLabel: bucketGroup(row.bucketCount),
    learnedRate: row.learnedRate,
    baseTrials: row.baseTrials,
    coarseTrials: row.coarseTrials,
    exactTrials: row.exactTrials,
    sample: sampleLabel(row.exactTrials),
  }));
  const scores = brierScores(records);

  return {
    modelVersion: DROUGHT_LEARNING_MODEL_VERSION,
    scope: "mains+supps",
    baselineProbability: DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
    threshold,
    topK,
    minHistory,
    validHistoryDraws: prepared.draws.length,
    excludedHistoryRows: prepared.excludedRows,
    records,
    currentChampion: currentStrictRows.slice(0, topK).map((row) => row.number),
    currentChallenger: currentOrdered.slice(0, topK).map((row) => row.row.number),
    currentRankedNumbers,
    gate: evaluateGate(records),
    calibrationRows: calibrationRows(records),
    challengerBrierScore: scores.challenger,
    neutralBrierScore: scores.neutral,
    championAverageHits: mean(records.map((record) => record.championHitCount)),
    challengerAverageHits: mean(records.map((record) => record.challengerHitCount)),
    policyAverageHits: mean(records.map((record) => record.policyHitCount)),
    expectedRandomAverageHits: mean(records.map((record) => record.expectedRandomHits)),
    targetMonthLabel: options.targetMonthLabel,
    targetDrawOrdinal,
    targetMonthExpectedDrawCount,
  };
};
