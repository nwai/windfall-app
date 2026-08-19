import type { Draw } from "../types";
import { getSDE1FilteredPool } from "../sde1";
import { getHC3OverlapNumbers, sortDrawsChronologically } from "./recentDraws";
import {
  countScheduledDrawsInMonth,
  monthLabelFromDateParts,
  parseDrawDateParts,
} from "./planningDrawContext";

const POOL_SIZE = 45;
const DEFAULT_DRAW_SIZE = 8;
const EARLY_DRAW_MAX_ORDINAL = 3;
const MIN_ROW_TRIALS_FOR_ADVICE = 4;
const MIN_GROUP_TRIALS_FOR_ADVICE = 8;
const MIN_AVOID_LIFT_FOR_SUPPORT = 0.04;
const MIN_BLOCK_DELTA_FOR_SUPPORT = 0.15;

export type Sde1Hc3AdviceTone = "strong" | "moderate" | "neutral" | "caution" | "insufficient";

export interface Sde1Hc3OrdinalBacktestRow {
  drawOrdinal: number;
  trials: number;
  avoidedDraws: number;
  blockedDraws: number;
  blockedNumbers: number;
  expectedBlockedNumbers: number;
  expectedAvoidedDraws: number;
  totalExcludedNumbers: number;
  sde1ExcludedNumbers: number;
  hc3ExcludedNumbers: number;
  observedAvoidRate: number;
  expectedAvoidRate: number;
  avoidLift: number;
  observedBlockedPerDraw: number;
  expectedBlockedPerDraw: number;
  blockedDelta: number;
}

export interface Sde1Hc3ContextSummary {
  label: string;
  trials: number;
  observedAvoidRate: number;
  expectedAvoidRate: number;
  avoidLift: number;
  observedBlockedPerDraw: number;
  expectedBlockedPerDraw: number;
  blockedDelta: number;
}

export interface Sde1Hc3ContextAdvice {
  tone: Sde1Hc3AdviceTone;
  title: string;
  message: string;
  chips: string[];
  targetDrawOrdinal: number;
}

export interface Sde1Hc3ContextBacktest {
  rows: Sde1Hc3OrdinalBacktestRow[];
  earlySummary: Sde1Hc3ContextSummary;
  laterSummary: Sde1Hc3ContextSummary;
  totalTrials: number;
  advice: Sde1Hc3ContextAdvice;
}

interface Accumulator {
  drawOrdinal: number;
  trials: number;
  avoidedDraws: number;
  blockedDraws: number;
  blockedNumbers: number;
  expectedBlockedNumbers: number;
  expectedAvoidedDraws: number;
  totalExcludedNumbers: number;
  sde1ExcludedNumbers: number;
  hc3ExcludedNumbers: number;
}

const emptyAccumulator = (drawOrdinal: number): Accumulator => ({
  drawOrdinal,
  trials: 0,
  avoidedDraws: 0,
  blockedDraws: 0,
  blockedNumbers: 0,
  expectedBlockedNumbers: 0,
  expectedAvoidedDraws: 0,
  totalExcludedNumbers: 0,
  sde1ExcludedNumbers: 0,
  hc3ExcludedNumbers: 0,
});

const safeRate = (numerator: number, denominator: number): number => (
  denominator > 0 ? numerator / denominator : 0
);

const expectedAvoidRate = (excludedCount: number, drawSize: number): number => {
  if (excludedCount <= 0) return 1;
  if (excludedCount >= POOL_SIZE) return 0;
  const allowed = POOL_SIZE - excludedCount;
  if (allowed < drawSize) return 0;
  let probability = 1;
  for (let index = 0; index < drawSize; index += 1) {
    probability *= (allowed - index) / (POOL_SIZE - index);
  }
  return probability;
};

const actualDrawNumbers = (draw: Draw): number[] => (
  Array.from(new Set([...draw.main, ...draw.supp].filter((number) => (
    Number.isInteger(number) && number >= 1 && number <= POOL_SIZE
  ))))
);

const drawOrdinal = (draw: Draw): number | null => {
  const parts = parseDrawDateParts(draw.date);
  if (!parts) return null;
  return countScheduledDrawsInMonth(monthLabelFromDateParts(parts), parts.day);
};

const rowFromAccumulator = (acc: Accumulator): Sde1Hc3OrdinalBacktestRow => {
  const observedAvoidRate = safeRate(acc.avoidedDraws, acc.trials);
  const expectedAvoidRateValue = safeRate(acc.expectedAvoidedDraws, acc.trials);
  const observedBlockedPerDraw = safeRate(acc.blockedNumbers, acc.trials);
  const expectedBlockedPerDraw = safeRate(acc.expectedBlockedNumbers, acc.trials);
  return {
    ...acc,
    observedAvoidRate,
    expectedAvoidRate: expectedAvoidRateValue,
    avoidLift: observedAvoidRate - expectedAvoidRateValue,
    observedBlockedPerDraw,
    expectedBlockedPerDraw,
    blockedDelta: expectedBlockedPerDraw - observedBlockedPerDraw,
  };
};

const summarizeRows = (
  label: string,
  rows: Sde1Hc3OrdinalBacktestRow[],
): Sde1Hc3ContextSummary => {
  const trials = rows.reduce((sum, row) => sum + row.trials, 0);
  const avoidedDraws = rows.reduce((sum, row) => sum + row.avoidedDraws, 0);
  const expectedAvoidedDraws = rows.reduce((sum, row) => sum + row.expectedAvoidedDraws, 0);
  const blockedNumbers = rows.reduce((sum, row) => sum + row.blockedNumbers, 0);
  const expectedBlockedNumbers = rows.reduce((sum, row) => sum + row.expectedBlockedNumbers, 0);
  const observedAvoidRate = safeRate(avoidedDraws, trials);
  const expectedAvoidRateValue = safeRate(expectedAvoidedDraws, trials);
  const observedBlockedPerDraw = safeRate(blockedNumbers, trials);
  const expectedBlockedPerDraw = safeRate(expectedBlockedNumbers, trials);
  return {
    label,
    trials,
    observedAvoidRate,
    expectedAvoidRate: expectedAvoidRateValue,
    avoidLift: observedAvoidRate - expectedAvoidRateValue,
    observedBlockedPerDraw,
    expectedBlockedPerDraw,
    blockedDelta: expectedBlockedPerDraw - observedBlockedPerDraw,
  };
};

const percentagePoint = (value: number): string => `${(value * 100).toFixed(1)}pp`;

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const isSupportive = (row: Pick<Sde1Hc3OrdinalBacktestRow | Sde1Hc3ContextSummary, "trials" | "avoidLift" | "blockedDelta">): boolean => (
  row.trials >= MIN_ROW_TRIALS_FOR_ADVICE &&
  row.avoidLift >= MIN_AVOID_LIFT_FOR_SUPPORT &&
  row.blockedDelta >= MIN_BLOCK_DELTA_FOR_SUPPORT
);

const buildAdvice = (
  rows: Sde1Hc3OrdinalBacktestRow[],
  earlySummary: Sde1Hc3ContextSummary,
  laterSummary: Sde1Hc3ContextSummary,
  targetDrawOrdinal: number,
): Sde1Hc3ContextAdvice => {
  const targetRow = rows.find((row) => row.drawOrdinal === targetDrawOrdinal);
  const earlySupported = earlySummary.trials >= MIN_GROUP_TRIALS_FOR_ADVICE &&
    earlySummary.avoidLift >= MIN_AVOID_LIFT_FOR_SUPPORT &&
    earlySummary.blockedDelta >= MIN_BLOCK_DELTA_FOR_SUPPORT;
  const laterWeaker = laterSummary.trials >= MIN_GROUP_TRIALS_FOR_ADVICE &&
    earlySummary.trials >= MIN_GROUP_TRIALS_FOR_ADVICE &&
    laterSummary.avoidLift + MIN_AVOID_LIFT_FOR_SUPPORT < earlySummary.avoidLift;

  if (!targetRow || targetRow.trials < MIN_ROW_TRIALS_FOR_ADVICE) {
    return {
      tone: "insufficient",
      title: "SDE1 + HC3 advice: not enough matching history",
      message: `D${targetDrawOrdinal} has too few no-lookahead trials for a strong nudge. Review the ordinal backtest before relying on this setup.`,
      chips: [`D${targetDrawOrdinal}`, `Trials ${targetRow?.trials ?? 0}`],
      targetDrawOrdinal,
    };
  }

  if (targetDrawOrdinal <= EARLY_DRAW_MAX_ORDINAL && isSupportive(targetRow)) {
    return {
      tone: "strong",
      title: "SDE1 + HC3 advice: consider ON",
      message: `For D${targetDrawOrdinal}, historical SDE1+HC3 exclusions were avoided ${percent(targetRow.observedAvoidRate)} of the time versus a ${percent(targetRow.expectedAvoidRate)} random-size baseline. Treat as evidence support, not a guarantee.`,
      chips: [`D${targetDrawOrdinal}`, `Lift ${percentagePoint(targetRow.avoidLift)}`, `Blocked/draw ${targetRow.observedBlockedPerDraw.toFixed(2)}`],
      targetDrawOrdinal,
    };
  }

  if (targetDrawOrdinal <= EARLY_DRAW_MAX_ORDINAL && earlySupported) {
    return {
      tone: "moderate",
      title: "SDE1 + HC3 advice: early-month support",
      message: `The exact D${targetDrawOrdinal} row is not decisive, but early-month rows collectively beat the random-size baseline by ${percentagePoint(earlySummary.avoidLift)}. Consider reviewing SDE1+HC3 before generating.`,
      chips: [`D1-D${EARLY_DRAW_MAX_ORDINAL}`, `Trials ${earlySummary.trials}`, `Lift ${percentagePoint(earlySummary.avoidLift)}`],
      targetDrawOrdinal,
    };
  }

  if (targetDrawOrdinal > EARLY_DRAW_MAX_ORDINAL && laterWeaker) {
    return {
      tone: "caution",
      title: "SDE1 + HC3 advice: weaker outside early draws",
      message: `Early-month support is stronger than later-month support. For D${targetDrawOrdinal}, treat SDE1+HC3 as optional and only turn it on if other evidence agrees.`,
      chips: [`D${targetDrawOrdinal}`, `Early lift ${percentagePoint(earlySummary.avoidLift)}`, `Later lift ${percentagePoint(laterSummary.avoidLift)}`],
      targetDrawOrdinal,
    };
  }

  return {
    tone: "neutral",
    title: "SDE1 + HC3 advice: observe, do not force",
    message: `D${targetDrawOrdinal} does not currently show enough measured support for a strong SDE1+HC3 nudge. The panel is reporting evidence only.`,
    chips: [`D${targetDrawOrdinal}`, `Lift ${percentagePoint(targetRow.avoidLift)}`, `Trials ${targetRow.trials}`],
    targetDrawOrdinal,
  };
};

export function analyzeSde1Hc3ContextBacktest(
  history: Draw[],
  options: { targetDrawOrdinal?: number } = {},
): Sde1Hc3ContextBacktest {
  const rowsByOrdinal = new Map<number, Accumulator>();
  const chronological = sortDrawsChronologically(history.filter((draw) => !draw.isSimulated));

  for (let index = 0; index < chronological.length; index += 1) {
    const targetDraw = chronological[index];
    if (!targetDraw) continue;
    const priorHistory = chronological.slice(0, index);
    if (priorHistory.length < 2) continue;
    const ordinal = drawOrdinal(targetDraw);
    if (!ordinal || ordinal < 1) continue;

    const sde1Excluded = getSDE1FilteredPool(priorHistory).excludedNumbers;
    const hc3Excluded = getHC3OverlapNumbers(priorHistory);
    const combinedExcluded = Array.from(new Set([...sde1Excluded, ...hc3Excluded]));
    if (combinedExcluded.length === 0) continue;

    const actualNumbers = actualDrawNumbers(targetDraw);
    if (actualNumbers.length === 0) continue;
    const excludedSet = new Set(combinedExcluded);
    const blockedNumbers = actualNumbers.filter((number) => excludedSet.has(number)).length;
    const drawSize = actualNumbers.length || DEFAULT_DRAW_SIZE;
    const acc = rowsByOrdinal.get(ordinal) ?? emptyAccumulator(ordinal);
    acc.trials += 1;
    acc.avoidedDraws += blockedNumbers === 0 ? 1 : 0;
    acc.blockedDraws += blockedNumbers > 0 ? 1 : 0;
    acc.blockedNumbers += blockedNumbers;
    acc.expectedBlockedNumbers += drawSize * (combinedExcluded.length / POOL_SIZE);
    acc.expectedAvoidedDraws += expectedAvoidRate(combinedExcluded.length, drawSize);
    acc.totalExcludedNumbers += combinedExcluded.length;
    acc.sde1ExcludedNumbers += sde1Excluded.length;
    acc.hc3ExcludedNumbers += hc3Excluded.length;
    rowsByOrdinal.set(ordinal, acc);
  }

  const rows = Array.from(rowsByOrdinal.values())
    .map(rowFromAccumulator)
    .sort((left, right) => left.drawOrdinal - right.drawOrdinal);
  const earlySummary = summarizeRows(
    `D1-D${EARLY_DRAW_MAX_ORDINAL}`,
    rows.filter((row) => row.drawOrdinal <= EARLY_DRAW_MAX_ORDINAL),
  );
  const laterSummary = summarizeRows(
    `D${EARLY_DRAW_MAX_ORDINAL + 1}+`,
    rows.filter((row) => row.drawOrdinal > EARLY_DRAW_MAX_ORDINAL),
  );
  const targetDrawOrdinal = Math.max(1, Math.floor(options.targetDrawOrdinal ?? 1));

  return {
    rows,
    earlySummary,
    laterSummary,
    totalTrials: rows.reduce((sum, row) => sum + row.trials, 0),
    advice: buildAdvice(rows, earlySummary, laterSummary, targetDrawOrdinal),
  };
}
