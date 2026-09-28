import type { Draw } from "../types";
import {
  analyzeLatestNeighbourSupport,
  type LatestNeighbourMonthlyBucketSets,
  type LatestNeighbourSupportMode,
} from "./latestNeighbourSupport";
import {
  buildPlanningDrawContext,
  countScheduledDrawsInMonth,
  datePartsToIso,
  isScheduledDrawDate,
  monthLabelFromDateParts,
  parseDrawDateParts,
} from "./planningDrawContext";
import { sortDrawsChronologically } from "./recentDraws";

export const LATEST_NEIGHBOUR_LEARNING_VERSION = "LDN-SA-1";
export const LATEST_NEIGHBOUR_LEARNING_MIN_HISTORY = 24;
export const LATEST_NEIGHBOUR_LEARNING_GATE_TRIALS = 60;
export const LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE = 8 / 45;

export type LatestNeighbourAuditGateStatus = "insufficient" | "no-validated-lift" | "validated-lift";
export type LatestNeighbourModePreferenceStatus =
  | "insufficient"
  | "no-validated-preference"
  | "prefer-pm1"
  | "prefer-pm1pm2";
export type LatestNeighbourScreenGateStatus =
  | "insufficient"
  | "no-validated-effect"
  | "validated-help"
  | "validated-harm";

export interface LatestNeighbourAuditOutcome {
  mode: LatestNeighbourSupportMode;
  targetNumbers: number[];
  hitNumbers: number[];
  targetCount: number;
  hitCount: number;
  expectedHits: number;
  expectedAnyHitRate: number;
  rawTargetNumbers: number[];
  rawHitNumbers: number[];
  rawTargetCount: number;
  rawHitCount: number;
  rawExpectedHits: number;
  screenedOutCount: number;
  disqualifiedCount: number;
}

export interface LatestNeighbourAuditRecord {
  targetDate: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
  trainingDraws: number;
  pm1: LatestNeighbourAuditOutcome;
  pm1pm2: LatestNeighbourAuditOutcome;
}

export interface LatestNeighbourModeSummary {
  mode: LatestNeighbourSupportMode;
  label: string;
  trials: number;
  inactiveDraws: number;
  averageTargetCount: number;
  averageScreenedOut: number;
  averageHits: number;
  averageExpectedHits: number;
  averageExcessHits: number;
  targetHitRate: number;
  anyHitRate: number;
  averageExpectedAnyHitRate: number;
  rawAverageExcessHits: number;
  averageScreenEffect: number;
}

export interface LatestNeighbourCurrentGate {
  status: LatestNeighbourAuditGateStatus;
  mode: LatestNeighbourSupportMode;
  trials: number;
  averageExcessHits: number;
  excessHitsCi: [number, number] | null;
  reason: string;
}

export interface LatestNeighbourModePreferenceGate {
  status: LatestNeighbourModePreferenceStatus;
  trials: number;
  averageDifference: number;
  differenceCi: [number, number] | null;
  reason: string;
}

export interface LatestNeighbourScreenGate {
  status: LatestNeighbourScreenGateStatus;
  mode: LatestNeighbourSupportMode;
  trials: number;
  averageEffect: number;
  effectCi: [number, number] | null;
  reason: string;
}

export interface LatestNeighbourCurrentOutcome {
  mode: LatestNeighbourSupportMode;
  targetNumbers: number[];
  disqualifiedNumbers: number[];
  latestDrawDate: string | null;
  targetDrawDate: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
}

export interface LatestNeighbourLearningAuditResult {
  modelVersion: typeof LATEST_NEIGHBOUR_LEARNING_VERSION;
  minHistory: number;
  validHistoryDraws: number;
  excludedHistoryRows: number;
  records: LatestNeighbourAuditRecord[];
  summaries: LatestNeighbourModeSummary[];
  currentMode: LatestNeighbourSupportMode;
  currentGate: LatestNeighbourCurrentGate;
  modePreference: LatestNeighbourModePreferenceGate;
  screenGate: LatestNeighbourScreenGate;
  currentOutcomes: LatestNeighbourCurrentOutcome[];
  antiLookaheadNote: string;
}

export interface LatestNeighbourLearningAuditOptions {
  currentMode?: LatestNeighbourSupportMode;
  minHistory?: number;
  now?: Date | string;
}

interface PreparedDraw {
  draw: Draw;
  date: string;
  monthLabel: string;
  drawOrdinal: number;
  expectedMonthDrawCount: number;
  numbers: Set<number>;
}

const MODES: LatestNeighbourSupportMode[] = ["pm1", "pm1pm2"];
const MODE_LABELS: Record<LatestNeighbourSupportMode, string> = {
  pm1: "±1",
  pm1pm2: "±1/±2",
};
const OFFSETS: Record<LatestNeighbourSupportMode, number[]> = {
  pm1: [-1, 1],
  pm1pm2: [-2, -1, 1, 2],
};

const mean = (values: readonly number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const drawNumbers = (draw: Draw): number[] => (
  [...(draw.main ?? []), ...(draw.supp ?? [])]
    .filter((number) => Number.isInteger(number) && number >= 1 && number <= 45)
);

const prepareHistory = (history: readonly Draw[]): { draws: PreparedDraw[]; excludedRows: number } => {
  const seenDates = new Set<string>();
  const draws: PreparedDraw[] = [];
  let excludedRows = history.filter((row) => row.isSimulated).length;

  for (const draw of sortDrawsChronologically(history.filter((row) => !row.isSimulated).map((row) => ({ ...row })))) {
    const parts = parseDrawDateParts(draw.date);
    const numbers = new Set(drawNumbers(draw));
    if (
      !parts
      || !isScheduledDrawDate(parts)
      || draw.main.length !== 6
      || (draw.supp ?? []).length !== 2
      || numbers.size !== 8
    ) {
      excludedRows += 1;
      continue;
    }

    const date = datePartsToIso(parts);
    if (seenDates.has(date)) {
      excludedRows += 1;
      continue;
    }
    seenDates.add(date);
    const monthLabel = monthLabelFromDateParts(parts);
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

const monthlyBucketsBefore = (
  history: readonly PreparedDraw[],
  targetMonthLabel: string,
): LatestNeighbourMonthlyBucketSets => {
  const counts = new Array<number>(46).fill(0);
  history.forEach((row) => {
    if (row.monthLabel !== targetMonthLabel) return;
    row.numbers.forEach((number) => {
      counts[number] += 1;
    });
  });

  const buckets: LatestNeighbourMonthlyBucketSets = {
    undrawn: new Set<number>(),
    times1: new Set<number>(),
    times2: new Set<number>(),
    times3: new Set<number>(),
    times4: new Set<number>(),
    times5: new Set<number>(),
    times6: new Set<number>(),
    times7: new Set<number>(),
    times8: new Set<number>(),
  };
  for (let number = 1; number <= 45; number += 1) {
    const count = counts[number];
    if (count <= 0) buckets.undrawn.add(number);
    else if (count === 1) buckets.times1.add(number);
    else if (count === 2) buckets.times2.add(number);
    else if (count === 3) buckets.times3.add(number);
    else if (count === 4) buckets.times4.add(number);
    else if (count === 5) buckets.times5.add(number);
    else if (count === 6) buckets.times6.add(number);
    else if (count === 7) buckets.times7.add(number);
    else buckets.times8.add(number);
  }
  return buckets;
};

const rawTargets = (draw: Draw, mode: LatestNeighbourSupportMode): number[] => {
  const targets = new Set<number>();
  drawNumbers(draw).forEach((source) => {
    OFFSETS[mode].forEach((offset) => {
      const target = source + offset;
      if (target >= 1 && target <= 45) targets.add(target);
    });
  });
  return [...targets].sort((left, right) => left - right);
};

const expectedAnyHitRate = (targetCount: number, drawSize = 8, population = 45): number => {
  if (targetCount <= 0 || drawSize <= 0) return 0;
  if (targetCount >= population - drawSize + 1) return 1;
  let noHitProbability = 1;
  const nonTargets = population - targetCount;
  for (let index = 0; index < drawSize; index += 1) {
    if (nonTargets - index <= 0) return 1;
    noHitProbability *= (nonTargets - index) / (population - index);
  }
  return 1 - noHitProbability;
};

const buildOutcome = (
  training: readonly PreparedDraw[],
  target: PreparedDraw,
  mode: LatestNeighbourSupportMode,
): LatestNeighbourAuditOutcome => {
  const trainingDraws = training.map((row) => row.draw);
  const latest = training[training.length - 1];
  const rawTargetNumbers = latest ? rawTargets(latest.draw, mode) : [];
  const analysis = analyzeLatestNeighbourSupport(
    trainingDraws,
    monthlyBucketsBefore(training, target.monthLabel),
    {
      enabled: true,
      mode,
      recentWindow: 10,
      maxRecentConsecutiveHits: 7,
      droughtDisqualifyThreshold: 6,
      planningLastDrawOverride: target.drawOrdinal === target.expectedMonthDrawCount,
    },
  );
  const targetNumbers = analysis.targetNumbers;
  const hitNumbers = targetNumbers.filter((number) => target.numbers.has(number));
  const rawHitNumbers = rawTargetNumbers.filter((number) => target.numbers.has(number));

  return {
    mode,
    targetNumbers,
    hitNumbers,
    targetCount: targetNumbers.length,
    hitCount: hitNumbers.length,
    expectedHits: targetNumbers.length * LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE,
    expectedAnyHitRate: expectedAnyHitRate(targetNumbers.length),
    rawTargetNumbers,
    rawHitNumbers,
    rawTargetCount: rawTargetNumbers.length,
    rawHitCount: rawHitNumbers.length,
    rawExpectedHits: rawTargetNumbers.length * LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE,
    screenedOutCount: Math.max(0, rawTargetNumbers.length - targetNumbers.length),
    disqualifiedCount: analysis.disqualified.length,
  };
};

const outcomeForMode = (
  record: LatestNeighbourAuditRecord,
  mode: LatestNeighbourSupportMode,
): LatestNeighbourAuditOutcome => mode === "pm1" ? record.pm1 : record.pm1pm2;

const serialAdjustedMeanCi = (values: readonly number[]): [number, number] | null => {
  if (values.length < 2) return null;
  const average = mean(values);
  const centered = values.map((value) => value - average);
  const maxLag = Math.min(6, values.length - 1);
  let longRunVariance = centered.reduce((sum, value) => sum + (value ** 2), 0) / values.length;

  for (let lag = 1; lag <= maxLag; lag += 1) {
    let covariance = 0;
    for (let index = lag; index < centered.length; index += 1) {
      covariance += centered[index] * centered[index - lag];
    }
    covariance /= values.length;
    longRunVariance += 2 * (1 - (lag / (maxLag + 1))) * covariance;
  }

  const standardError = Math.sqrt(Math.max(0, longRunVariance) / values.length);
  const margin = 1.96 * standardError;
  return [average - margin, average + margin];
};

const summarizeMode = (
  records: readonly LatestNeighbourAuditRecord[],
  mode: LatestNeighbourSupportMode,
): LatestNeighbourModeSummary => {
  const allOutcomes = records.map((record) => outcomeForMode(record, mode));
  const outcomes = allOutcomes.filter((outcome) => outcome.targetCount > 0);
  const totalTargets = outcomes.reduce((sum, outcome) => sum + outcome.targetCount, 0);
  const totalHits = outcomes.reduce((sum, outcome) => sum + outcome.hitCount, 0);
  return {
    mode,
    label: MODE_LABELS[mode],
    trials: outcomes.length,
    inactiveDraws: allOutcomes.length - outcomes.length,
    averageTargetCount: mean(outcomes.map((outcome) => outcome.targetCount)),
    averageScreenedOut: mean(outcomes.map((outcome) => outcome.screenedOutCount)),
    averageHits: mean(outcomes.map((outcome) => outcome.hitCount)),
    averageExpectedHits: mean(outcomes.map((outcome) => outcome.expectedHits)),
    averageExcessHits: mean(outcomes.map((outcome) => outcome.hitCount - outcome.expectedHits)),
    targetHitRate: totalTargets ? totalHits / totalTargets : 0,
    anyHitRate: mean(outcomes.map((outcome) => outcome.hitCount > 0 ? 1 : 0)),
    averageExpectedAnyHitRate: mean(outcomes.map((outcome) => outcome.expectedAnyHitRate)),
    rawAverageExcessHits: mean(outcomes.map((outcome) => outcome.rawHitCount - outcome.rawExpectedHits)),
    averageScreenEffect: mean(outcomes.map((outcome) => (
      (outcome.hitCount - outcome.expectedHits) - (outcome.rawHitCount - outcome.rawExpectedHits)
    ))),
  };
};

const evaluateCurrentGate = (
  records: readonly LatestNeighbourAuditRecord[],
  mode: LatestNeighbourSupportMode,
): LatestNeighbourCurrentGate => {
  const outcomes = records.map((record) => outcomeForMode(record, mode)).filter((outcome) => outcome.targetCount > 0);
  const differences = outcomes.map((outcome) => outcome.hitCount - outcome.expectedHits);
  const excessHitsCi = serialAdjustedMeanCi(differences);
  const summary = summarizeMode(records, mode);
  const averageExcessHits = mean(differences);

  if (outcomes.length < LATEST_NEIGHBOUR_LEARNING_GATE_TRIALS) {
    return {
      status: "insufficient",
      mode,
      trials: outcomes.length,
      averageExcessHits,
      excessHitsCi,
      reason: `Needs at least ${LATEST_NEIGHBOUR_LEARNING_GATE_TRIALS} active walk-forward targets before lift can be considered.`,
    };
  }

  if (
    excessHitsCi
    && excessHitsCi[0] > 0
    && summary.targetHitRate > LATEST_NEIGHBOUR_RANDOM_NUMBER_RATE
    && summary.anyHitRate >= summary.averageExpectedAnyHitRate
  ) {
    return {
      status: "validated-lift",
      mode,
      trials: outcomes.length,
      averageExcessHits,
      excessHitsCi,
      reason: "The screened target set clears the serial-adjusted excess-hit gate, the per-target rate exceeds random, and at-least-one coverage is not below its exact random expectation.",
    };
  }

  return {
    status: "no-validated-lift",
    mode,
    trials: outcomes.length,
    averageExcessHits,
    excessHitsCi,
    reason: "The current neighbour mode has not cleared every conservative lift condition. Continue observing; no automatic mode change is justified.",
  };
};

const evaluateModePreference = (
  records: readonly LatestNeighbourAuditRecord[],
): LatestNeighbourModePreferenceGate => {
  const paired = records.filter((record) => record.pm1.targetCount > 0 && record.pm1pm2.targetCount > 0);
  const differences = paired.map((record) => (
    (record.pm1pm2.hitCount - record.pm1pm2.expectedHits)
    - (record.pm1.hitCount - record.pm1.expectedHits)
  ));
  const differenceCi = serialAdjustedMeanCi(differences);
  const averageDifference = mean(differences);
  const pm1Gate = evaluateCurrentGate(records, "pm1");
  const pm1pm2Gate = evaluateCurrentGate(records, "pm1pm2");

  if (paired.length < LATEST_NEIGHBOUR_LEARNING_GATE_TRIALS) {
    return {
      status: "insufficient",
      trials: paired.length,
      averageDifference,
      differenceCi,
      reason: `Needs at least ${LATEST_NEIGHBOUR_LEARNING_GATE_TRIALS} paired targets before the two modes can be compared.`,
    };
  }
  if (differenceCi && differenceCi[0] > 0 && pm1pm2Gate.status === "validated-lift") {
    return {
      status: "prefer-pm1pm2",
      trials: paired.length,
      averageDifference,
      differenceCi,
      reason: "±1/±2 has a serial-adjusted excess-hit advantage and independently clears its random-reference gate.",
    };
  }
  if (differenceCi && differenceCi[1] < 0 && pm1Gate.status === "validated-lift") {
    return {
      status: "prefer-pm1",
      trials: paired.length,
      averageDifference,
      differenceCi,
      reason: "±1 has a serial-adjusted excess-hit advantage and independently clears its random-reference gate.",
    };
  }
  return {
    status: "no-validated-preference",
    trials: paired.length,
    averageDifference,
    differenceCi,
    reason: "Neither mode has established a conservative paired advantage over the other. Keep mode selection manual.",
  };
};

const evaluateScreenGate = (
  records: readonly LatestNeighbourAuditRecord[],
  mode: LatestNeighbourSupportMode,
): LatestNeighbourScreenGate => {
  const outcomes = records.map((record) => outcomeForMode(record, mode)).filter((outcome) => outcome.targetCount > 0);
  const effects = outcomes.map((outcome) => (
    (outcome.hitCount - outcome.expectedHits) - (outcome.rawHitCount - outcome.rawExpectedHits)
  ));
  const effectCi = serialAdjustedMeanCi(effects);
  const averageEffect = mean(effects);

  if (outcomes.length < LATEST_NEIGHBOUR_LEARNING_GATE_TRIALS) {
    return {
      status: "insufficient",
      mode,
      trials: outcomes.length,
      averageEffect,
      effectCi,
      reason: `Needs at least ${LATEST_NEIGHBOUR_LEARNING_GATE_TRIALS} active walk-forward targets before the screen effect can be judged.`,
    };
  }
  if (effectCi && effectCi[0] > 0) {
    return {
      status: "validated-help",
      mode,
      trials: outcomes.length,
      averageEffect,
      effectCi,
      reason: "The fixed streak and monthly terminal-family screens improve size-adjusted excess hits over the raw neighbour cloud.",
    };
  }
  if (effectCi && effectCi[1] < 0) {
    return {
      status: "validated-harm",
      mode,
      trials: outcomes.length,
      averageEffect,
      effectCi,
      reason: "The fixed screens reduce size-adjusted excess hits versus the raw neighbour cloud. This is a repair signal, not an automatic code change.",
    };
  }
  return {
    status: "no-validated-effect",
    mode,
    trials: outcomes.length,
    averageEffect,
    effectCi,
    reason: "The screen effect remains uncertain. The audit will continue updating as real draws are added.",
  };
};

const buildCurrentOutcome = (
  prepared: readonly PreparedDraw[],
  mode: LatestNeighbourSupportMode,
  now?: Date | string,
): LatestNeighbourCurrentOutcome => {
  const history = prepared.map((row) => row.draw);
  const context = buildPlanningDrawContext(history, { now });
  const analysis = analyzeLatestNeighbourSupport(
    history,
    monthlyBucketsBefore(prepared, context.targetMonthLabel),
    {
      enabled: true,
      mode,
      recentWindow: 10,
      maxRecentConsecutiveHits: 7,
      droughtDisqualifyThreshold: 6,
      planningLastDrawOverride: context.isPlanningLastDraw,
    },
  );
  return {
    mode,
    targetNumbers: analysis.targetNumbers,
    disqualifiedNumbers: analysis.disqualified.map((row) => row.number),
    latestDrawDate: analysis.latestDrawDate,
    targetDrawDate: context.targetDrawDate,
    targetDrawOrdinal: context.targetDrawOrdinal,
    targetMonthExpectedDrawCount: context.targetMonthExpectedDrawCount,
  };
};

export const analyzeLatestNeighbourLearningAudit = (
  history: readonly Draw[],
  options: LatestNeighbourLearningAuditOptions = {},
): LatestNeighbourLearningAuditResult => {
  const currentMode: LatestNeighbourSupportMode = options.currentMode === "pm1pm2" ? "pm1pm2" : "pm1";
  const minHistory = Math.max(1, Math.round(options.minHistory ?? LATEST_NEIGHBOUR_LEARNING_MIN_HISTORY));
  const prepared = prepareHistory(history);
  const records: LatestNeighbourAuditRecord[] = [];

  for (let targetIndex = minHistory; targetIndex < prepared.draws.length; targetIndex += 1) {
    const training = prepared.draws.slice(0, targetIndex);
    const target = prepared.draws[targetIndex];
    records.push({
      targetDate: target.date,
      targetDrawOrdinal: target.drawOrdinal,
      targetMonthExpectedDrawCount: target.expectedMonthDrawCount,
      trainingDraws: training.length,
      pm1: buildOutcome(training, target, "pm1"),
      pm1pm2: buildOutcome(training, target, "pm1pm2"),
    });
  }

  return {
    modelVersion: LATEST_NEIGHBOUR_LEARNING_VERSION,
    minHistory,
    validHistoryDraws: prepared.draws.length,
    excludedHistoryRows: prepared.excludedRows,
    records,
    summaries: MODES.map((mode) => summarizeMode(records, mode)),
    currentMode,
    currentGate: evaluateCurrentGate(records, currentMode),
    modePreference: evaluateModePreference(records),
    screenGate: evaluateScreenGate(records, currentMode),
    currentOutcomes: MODES.map((mode) => buildCurrentOutcome(prepared.draws, mode, options.now)),
    antiLookaheadNote: "Each target draw is hidden while Windfall rebuilds the exact live streak, drought, month-bucket and terminal-family screens from earlier valid scheduled real draws only. The target draw is revealed only for scoring.",
  };
};
