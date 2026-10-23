import type { Draw } from "../types";
import { getExcludedMonthLabelsForHistoryBaselines } from "./monthlyAverageScope";
import {
  buildPlanningDrawContext,
  countScheduledDrawsInMonth,
  datePartsToIso,
  isScheduledDrawDate,
  monthLabelFromDateParts,
  parseDrawDateParts,
} from "./planningDrawContext";
import {
  buildEmpiricalDroughtQuotaShortlist,
  buildStrictDroughtQuotaShortlist,
} from "./strictDroughtQuotaAdvice";

export const CONSECUTIVE_RUN_MONTHLY_WATCH_VERSION = "CRMW-1";
export const CONSECUTIVE_RUN_DROUGHT_CROSS_CHECK_VERSION = "CRMW-DK-1";
export const CONSECUTIVE_RUN_MIN_LENGTH = 3;
export const CONSECUTIVE_RUN_DROUGHT_MIN_TRAINING_DRAWS = 24;
export const CONSECUTIVE_RUN_DROUGHT_TOP_K = 8;

const FIELD_SIZE = 45;
const DRAW_SIZE = 8;

export interface ConsecutiveNumberRun {
  start: number;
  end: number;
  length: number;
  numbers: number[];
}

export interface ConsecutiveRunOccurrence {
  date: string;
  monthLabel: string;
  drawOrdinal: number;
  runs: ConsecutiveNumberRun[];
}

export interface ConsecutiveRunMonthRow {
  monthLabel: string;
  expectedDrawCount: number;
  recordedDrawCount: number;
  recordedDrawOrdinals: number[];
  complete: boolean;
  firstOccurrenceOrdinal: number | null;
  occurrences: ConsecutiveRunOccurrence[];
}

export type ConsecutiveRunSampleQuality = "No sample" | "Very thin" | "Thin" | "Developing";

export interface ConsecutiveRunStageRow {
  drawOrdinal: number;
  trials: number;
  occurrenceCount: number;
  occurrenceRate: number | null;
  firstRiskTrials: number;
  firstOccurrenceCount: number;
  conditionalFirstRate: number | null;
  cumulativeOccurrenceCount: number;
  cumulativeOccurrenceRate: number | null;
  exactRandomDrawRate: number;
  exactRandomCumulativeRate: number;
  sampleQuality: ConsecutiveRunSampleQuality;
}

export interface ConsecutiveRunCurrentState {
  targetDate: string;
  targetMonthLabel: string;
  targetDrawOrdinal: number;
  targetMonthExpectedDrawCount: number;
  completedDrawCount: number;
  observationCompleteThroughLatestDraw: boolean;
  firstOccurrenceOrdinal: number | null;
  occurrences: ConsecutiveRunOccurrence[];
  nextStageEvidence: ConsecutiveRunStageRow | null;
}

export type ConsecutiveRunDroughtFamily = "strict" | "empirical" | "union";
export type ConsecutiveRunDroughtMemberSource = "strict-only" | "empirical-only" | "both" | "neither";

export interface ConsecutiveRunDroughtFamilyRow {
  family: ConsecutiveRunDroughtFamily;
  label: string;
  sequenceTrials: number;
  observedSequenceCount: number;
  observedSequenceRate: number | null;
  expectedSequenceCount: number;
  expectedSequenceRate: number | null;
  lift: number | null;
  upperTailProbability: number | null;
  sampleQuality: ConsecutiveRunSampleQuality;
}

export interface ConsecutiveRunDroughtSourceRow {
  source: ConsecutiveRunDroughtMemberSource;
  label: string;
  sequenceCount: number;
  sequenceShare: number | null;
  memberCount: number;
  memberShare: number | null;
}

export interface ConsecutiveRunDroughtStageRow {
  drawOrdinal: number;
  targetDraws: number;
  sequenceTrials: number;
  familyRows: ConsecutiveRunDroughtFamilyRow[];
  sampleQuality: ConsecutiveRunSampleQuality;
}

export interface ConsecutiveRunDroughtCrossCheck {
  modelVersion: typeof CONSECUTIVE_RUN_DROUGHT_CROSS_CHECK_VERSION;
  scope: "mains+supps";
  minTrainingDraws: number;
  topK: number;
  eligibleTargetDraws: number;
  eligibleRunSequences: number;
  familyRows: ConsecutiveRunDroughtFamilyRow[];
  sourceRows: ConsecutiveRunDroughtSourceRow[];
  stageRows: ConsecutiveRunDroughtStageRow[];
  warnings: string[];
}

export interface ConsecutiveRunMonthlyWatchResult {
  modelVersion: typeof CONSECUTIVE_RUN_MONTHLY_WATCH_VERSION;
  scopeLabel: string;
  validRealDraws: number;
  baselineRealDraws: number;
  excludedHistoryRows: number;
  simulatedRowsIgnored: number;
  excludedOpeningMonthLabels: string[];
  exactRandomDrawRate: number;
  exactCombinationCount: number;
  totalCombinationCount: number;
  completedMonthCount: number;
  completedMonthsWithOccurrence: number;
  expectedCompletedMonthsWithOccurrence: number;
  completedMonthTailProbability: number | null;
  stageRows: ConsecutiveRunStageRow[];
  monthRows: ConsecutiveRunMonthRow[];
  currentState: ConsecutiveRunCurrentState | null;
  droughtKeyCrossCheck: ConsecutiveRunDroughtCrossCheck;
  warnings: string[];
}

export interface ConsecutiveRunMonthlyWatchOptions {
  now?: Date | string;
  droughtCrossCheck?: {
    minTrainingDraws?: number;
    topK?: number;
    strictShortlistBuilder?: (trainingHistory: Draw[]) => number[];
    empiricalShortlistBuilder?: (trainingHistory: Draw[]) => number[];
  };
}

interface ValidatedDraw {
  draw: Draw;
  date: string;
  timestamp: number;
  monthLabel: string;
  drawOrdinal: number;
  expectedDrawCount: number;
  runs: ConsecutiveNumberRun[];
}

const combinationCount = (n: number, k: number): number => {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return 0;
  const width = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= width; index += 1) {
    value = (value * (n - width + index)) / index;
  }
  return Math.round(value);
};

export const exactConsecutiveRunProbability = (
  fieldSize = FIELD_SIZE,
  drawSize = DRAW_SIZE,
  minimumRunLength = CONSECUTIVE_RUN_MIN_LENGTH,
): { probability: number; matchingCombinations: number; totalCombinations: number } => {
  if (
    !Number.isInteger(fieldSize)
    || !Number.isInteger(drawSize)
    || !Number.isInteger(minimumRunLength)
    || fieldSize <= 0
    || drawSize <= 0
    || drawSize > fieldSize
    || minimumRunLength <= 1
  ) {
    return { probability: 0, matchingCombinations: 0, totalCombinations: 0 };
  }

  let states = Array.from(
    { length: drawSize + 1 },
    () => new Array(minimumRunLength).fill(0),
  );
  states[0][0] = 1;

  for (let position = 0; position < fieldSize; position += 1) {
    const next = Array.from(
      { length: drawSize + 1 },
      () => new Array(minimumRunLength).fill(0),
    );
    for (let selected = 0; selected <= drawSize; selected += 1) {
      for (let trailingRun = 0; trailingRun < minimumRunLength; trailingRun += 1) {
        const count = states[selected][trailingRun];
        if (!count) continue;
        next[selected][0] += count;
        if (selected < drawSize && trailingRun + 1 < minimumRunLength) {
          next[selected + 1][trailingRun + 1] += count;
        }
      }
    }
    states = next;
  }

  const totalCombinations = combinationCount(fieldSize, drawSize);
  const combinationsWithoutRun = Math.round(states[drawSize].reduce((sum, count) => sum + count, 0));
  const matchingCombinations = Math.max(0, totalCombinations - combinationsWithoutRun);
  return {
    probability: totalCombinations > 0 ? matchingCombinations / totalCombinations : 0,
    matchingCombinations,
    totalCombinations,
  };
};

export const findConsecutiveNumberRuns = (
  numbers: readonly number[],
  minimumRunLength = CONSECUTIVE_RUN_MIN_LENGTH,
): ConsecutiveNumberRun[] => {
  const sorted = [...new Set(numbers)]
    .filter((number) => Number.isInteger(number))
    .sort((left, right) => left - right);
  const runs: ConsecutiveNumberRun[] = [];
  let startIndex = 0;

  for (let index = 1; index <= sorted.length; index += 1) {
    const continues = index < sorted.length && sorted[index] === sorted[index - 1] + 1;
    if (continues) continue;
    const values = sorted.slice(startIndex, index);
    if (values.length >= minimumRunLength) {
      runs.push({
        start: values[0],
        end: values[values.length - 1],
        length: values.length,
        numbers: values,
      });
    }
    startIndex = index;
  }

  return runs;
};

const prepareHistory = (history: readonly Draw[]): {
  validDraws: ValidatedDraw[];
  excludedHistoryRows: number;
  simulatedRowsIgnored: number;
} => {
  const validDraws: ValidatedDraw[] = [];
  const seenDates = new Set<string>();
  let excludedHistoryRows = 0;
  let simulatedRowsIgnored = 0;

  history.forEach((draw) => {
    if (draw.isSimulated) {
      simulatedRowsIgnored += 1;
      return;
    }
    const parts = parseDrawDateParts(draw.date);
    const numbers = [...(draw.main ?? []), ...(draw.supp ?? [])];
    const uniqueNumbers = new Set(numbers);
    if (
      !parts
      || !isScheduledDrawDate(parts)
      || draw.main?.length !== 6
      || draw.supp?.length !== 2
      || uniqueNumbers.size !== DRAW_SIZE
      || numbers.some((number) => !Number.isInteger(number) || number < 1 || number > FIELD_SIZE)
    ) {
      excludedHistoryRows += 1;
      return;
    }
    const date = datePartsToIso(parts);
    if (seenDates.has(date)) {
      excludedHistoryRows += 1;
      return;
    }
    seenDates.add(date);
    const monthLabel = monthLabelFromDateParts(parts);
    validDraws.push({
      draw: { ...draw, date },
      date,
      timestamp: new Date(parts.year, parts.month - 1, parts.day).getTime(),
      monthLabel,
      drawOrdinal: countScheduledDrawsInMonth(monthLabel, parts.day),
      expectedDrawCount: countScheduledDrawsInMonth(monthLabel),
      runs: findConsecutiveNumberRuns(numbers),
    });
  });

  validDraws.sort((left, right) => left.timestamp - right.timestamp);
  return { validDraws, excludedHistoryRows, simulatedRowsIgnored };
};

const sampleQuality = (trials: number): ConsecutiveRunSampleQuality => {
  if (trials <= 0) return "No sample";
  if (trials < 10) return "Very thin";
  if (trials < 20) return "Thin";
  return "Developing";
};

const hasRecordedPrefix = (month: ConsecutiveRunMonthRow, drawOrdinal: number): boolean => {
  if (drawOrdinal <= 0) return true;
  const recorded = new Set(month.recordedDrawOrdinals);
  for (let ordinal = 1; ordinal <= drawOrdinal; ordinal += 1) {
    if (!recorded.has(ordinal)) return false;
  }
  return true;
};

const poissonBinomialTail = (probabilities: readonly number[], observed: number): number | null => {
  if (!probabilities.length || observed < 0) return null;
  const distribution = new Array(probabilities.length + 1).fill(0);
  distribution[0] = 1;
  probabilities.forEach((probability, index) => {
    for (let successes = index + 1; successes >= 0; successes -= 1) {
      distribution[successes] = (
        (distribution[successes] ?? 0) * (1 - probability)
        + (successes > 0 ? (distribution[successes - 1] ?? 0) * probability : 0)
      );
    }
  });
  return distribution.slice(Math.min(observed, probabilities.length)).reduce((sum, value) => sum + value, 0);
};

interface ConsecutiveRunDroughtTrial {
  targetDate: string;
  drawOrdinal: number;
  run: ConsecutiveNumberRun;
  observed: Record<ConsecutiveRunDroughtFamily, boolean>;
  expected: Record<ConsecutiveRunDroughtFamily, number>;
  memberSources: ConsecutiveRunDroughtMemberSource[];
}

const normalizeShortlist = (numbers: readonly number[], topK: number): number[] => {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1 || number > FIELD_SIZE || seen.has(number)) continue;
    seen.add(number);
    normalized.push(number);
    if (normalized.length >= topK) break;
  }
  return normalized;
};

const contiguousStartCoverage = (
  shortlist: ReadonlySet<number>,
  runLength: number,
): number => {
  const possibleStarts = FIELD_SIZE - runLength + 1;
  if (possibleStarts <= 0 || shortlist.size === 0) return 0;
  let coveredStarts = 0;
  for (let start = 1; start <= possibleStarts; start += 1) {
    let covered = false;
    for (let offset = 0; offset < runLength; offset += 1) {
      if (shortlist.has(start + offset)) {
        covered = true;
        break;
      }
    }
    if (covered) coveredStarts += 1;
  }
  return coveredStarts / possibleStarts;
};

const droughtFamilyLabel = (family: ConsecutiveRunDroughtFamily): string => {
  if (family === "strict") return "Strict top 8";
  if (family === "empirical") return "Empirical top 8";
  return "Either list";
};

const summarizeDroughtFamilies = (
  trials: readonly ConsecutiveRunDroughtTrial[],
): ConsecutiveRunDroughtFamilyRow[] => (
  (["strict", "empirical", "union"] as const).map((family) => {
    const sequenceTrials = trials.length;
    const observedSequenceCount = trials.filter((trial) => trial.observed[family]).length;
    const probabilities = trials.map((trial) => trial.expected[family]);
    const expectedSequenceCount = probabilities.reduce((sum, probability) => sum + probability, 0);
    const observedSequenceRate = sequenceTrials ? observedSequenceCount / sequenceTrials : null;
    const expectedSequenceRate = sequenceTrials ? expectedSequenceCount / sequenceTrials : null;
    return {
      family,
      label: droughtFamilyLabel(family),
      sequenceTrials,
      observedSequenceCount,
      observedSequenceRate,
      expectedSequenceCount,
      expectedSequenceRate,
      lift: observedSequenceRate !== null && expectedSequenceRate !== null
        ? observedSequenceRate - expectedSequenceRate
        : null,
      upperTailProbability: poissonBinomialTail(probabilities, observedSequenceCount),
      sampleQuality: sampleQuality(sequenceTrials),
    };
  })
);

const buildDroughtKeyCrossCheck = (
  validDraws: readonly ValidatedDraw[],
  baselineDraws: readonly ValidatedDraw[],
  options: NonNullable<ConsecutiveRunMonthlyWatchOptions["droughtCrossCheck"]> = {},
): ConsecutiveRunDroughtCrossCheck => {
  const minTrainingDraws = Math.max(
    1,
    Math.round(options.minTrainingDraws ?? CONSECUTIVE_RUN_DROUGHT_MIN_TRAINING_DRAWS),
  );
  const topK = Math.max(1, Math.min(
    FIELD_SIZE,
    Math.round(options.topK ?? CONSECUTIVE_RUN_DROUGHT_TOP_K),
  ));
  const baselineTargetDates = new Set(baselineDraws.map((draw) => draw.date));
  const trials: ConsecutiveRunDroughtTrial[] = [];
  const eligibleTargetDates = new Set<string>();

  validDraws.forEach((target, targetIndex) => {
    if (
      targetIndex < minTrainingDraws
      || !baselineTargetDates.has(target.date)
      || target.runs.length === 0
    ) return;

    const trainingHistory = validDraws.slice(0, targetIndex).map((row) => row.draw);
    const strictShortlist = normalizeShortlist(
      options.strictShortlistBuilder
        ? options.strictShortlistBuilder(trainingHistory)
        : buildStrictDroughtQuotaShortlist(trainingHistory, trainingHistory, { topK }).numbers,
      topK,
    );
    const empiricalShortlist = normalizeShortlist(
      options.empiricalShortlistBuilder
        ? options.empiricalShortlistBuilder(trainingHistory)
        : buildEmpiricalDroughtQuotaShortlist(trainingHistory, { topK }).numbers,
      topK,
    );
    const strictSet = new Set(strictShortlist);
    const empiricalSet = new Set(empiricalShortlist);
    const unionSet = new Set([...strictShortlist, ...empiricalShortlist]);
    eligibleTargetDates.add(target.date);

    target.runs.forEach((run) => {
      const memberSources = run.numbers.map((number): ConsecutiveRunDroughtMemberSource => {
        const inStrict = strictSet.has(number);
        const inEmpirical = empiricalSet.has(number);
        if (inStrict && inEmpirical) return "both";
        if (inStrict) return "strict-only";
        if (inEmpirical) return "empirical-only";
        return "neither";
      });
      trials.push({
        targetDate: target.date,
        drawOrdinal: target.drawOrdinal,
        run,
        observed: {
          strict: run.numbers.some((number) => strictSet.has(number)),
          empirical: run.numbers.some((number) => empiricalSet.has(number)),
          union: run.numbers.some((number) => unionSet.has(number)),
        },
        expected: {
          strict: contiguousStartCoverage(strictSet, run.length),
          empirical: contiguousStartCoverage(empiricalSet, run.length),
          union: contiguousStartCoverage(unionSet, run.length),
        },
        memberSources,
      });
    });
  });

  const sourceLabels: Record<ConsecutiveRunDroughtMemberSource, string> = {
    "strict-only": "Strict only",
    "empirical-only": "Empirical only",
    both: "In both lists",
    neither: "In neither list",
  };
  const sources = ["strict-only", "empirical-only", "both", "neither"] as const;
  const totalMembers = trials.reduce((sum, trial) => sum + trial.memberSources.length, 0);
  const sourceRows = sources.map((source): ConsecutiveRunDroughtSourceRow => {
    const sequenceCount = trials.filter((trial) => trial.memberSources.includes(source)).length;
    const memberCount = trials.reduce(
      (sum, trial) => sum + trial.memberSources.filter((memberSource) => memberSource === source).length,
      0,
    );
    return {
      source,
      label: sourceLabels[source],
      sequenceCount,
      sequenceShare: trials.length ? sequenceCount / trials.length : null,
      memberCount,
      memberShare: totalMembers ? memberCount / totalMembers : null,
    };
  });

  const stageGroups = new Map<number, ConsecutiveRunDroughtTrial[]>();
  trials.forEach((trial) => {
    const rows = stageGroups.get(trial.drawOrdinal) ?? [];
    rows.push(trial);
    stageGroups.set(trial.drawOrdinal, rows);
  });
  const stageRows = [...stageGroups.entries()]
    .map(([drawOrdinal, rows]): ConsecutiveRunDroughtStageRow => ({
      drawOrdinal,
      targetDraws: new Set(rows.map((row) => row.targetDate)).size,
      sequenceTrials: rows.length,
      familyRows: summarizeDroughtFamilies(rows),
      sampleQuality: sampleQuality(rows.length),
    }))
    .sort((left, right) => left.drawOrdinal - right.drawOrdinal);

  const warnings: string[] = [];
  if (!trials.length) {
    warnings.push(`No qualifying run occurred after the ${minTrainingDraws}-draw warm-up.`);
  }
  const d13 = stageRows.find((row) => row.drawOrdinal === 13);
  if (d13 && d13.sequenceTrials < 10) {
    warnings.push(`D13 drought-key evidence is very thin (${d13.sequenceTrials} sequences) and is a post-hoc stage view.`);
  }

  return {
    modelVersion: CONSECUTIVE_RUN_DROUGHT_CROSS_CHECK_VERSION,
    scope: "mains+supps",
    minTrainingDraws,
    topK,
    eligibleTargetDraws: eligibleTargetDates.size,
    eligibleRunSequences: trials.length,
    familyRows: summarizeDroughtFamilies(trials),
    sourceRows,
    stageRows,
    warnings,
  };
};

export const analyzeConsecutiveRunMonthlyWatch = (
  history: readonly Draw[],
  options: ConsecutiveRunMonthlyWatchOptions = {},
): ConsecutiveRunMonthlyWatchResult => {
  const prepared = prepareHistory(history);
  const excludedOpeningMonthLabels = getExcludedMonthLabelsForHistoryBaselines(
    prepared.validDraws,
    (row) => row.monthLabel,
    (row) => row.date,
  );
  const excludedOpeningMonths = new Set(excludedOpeningMonthLabels);
  const baselineDraws = prepared.validDraws.filter((draw) => !excludedOpeningMonths.has(draw.monthLabel));
  const exact = exactConsecutiveRunProbability();
  const droughtKeyCrossCheck = buildDroughtKeyCrossCheck(
    prepared.validDraws,
    baselineDraws,
    options.droughtCrossCheck,
  );

  const monthMap = new Map<string, ValidatedDraw[]>();
  baselineDraws.forEach((draw) => {
    const rows = monthMap.get(draw.monthLabel) ?? [];
    rows.push(draw);
    monthMap.set(draw.monthLabel, rows);
  });

  const monthRows = [...monthMap.entries()]
    .map(([monthLabel, rows]): ConsecutiveRunMonthRow => {
      rows.sort((left, right) => left.timestamp - right.timestamp);
      const expectedDrawCount = rows[0]?.expectedDrawCount ?? countScheduledDrawsInMonth(monthLabel);
      const occurrences = rows
        .filter((draw) => draw.runs.length > 0)
        .map((draw) => ({
          date: draw.date,
          monthLabel,
          drawOrdinal: draw.drawOrdinal,
          runs: draw.runs,
        }));
      const ordinals = new Set(rows.map((draw) => draw.drawOrdinal));
      return {
        monthLabel,
        expectedDrawCount,
        recordedDrawCount: rows.length,
        recordedDrawOrdinals: [...ordinals].sort((left, right) => left - right),
        complete: expectedDrawCount > 0
          && rows.length >= expectedDrawCount
          && ordinals.size >= expectedDrawCount,
        firstOccurrenceOrdinal: occurrences[0]?.drawOrdinal ?? null,
        occurrences,
      };
    })
    .sort((left, right) => left.monthLabel.localeCompare(right.monthLabel));

  const maxDrawOrdinal = monthRows.reduce(
    (maximum, month) => Math.max(maximum, month.expectedDrawCount),
    0,
  );
  const stageRows: ConsecutiveRunStageRow[] = [];
  for (let drawOrdinal = 1; drawOrdinal <= maxDrawOrdinal; drawOrdinal += 1) {
    const eligibleMonths = monthRows.filter((month) => hasRecordedPrefix(month, drawOrdinal));
    const occurrenceCount = eligibleMonths.filter((month) => (
      month.occurrences.some((occurrence) => occurrence.drawOrdinal === drawOrdinal)
    )).length;
    const firstRiskMonths = eligibleMonths.filter((month) => (
      month.firstOccurrenceOrdinal === null || month.firstOccurrenceOrdinal >= drawOrdinal
    ));
    const firstOccurrenceCount = firstRiskMonths.filter(
      (month) => month.firstOccurrenceOrdinal === drawOrdinal,
    ).length;
    const cumulativeOccurrenceCount = eligibleMonths.filter((month) => (
      month.firstOccurrenceOrdinal !== null && month.firstOccurrenceOrdinal <= drawOrdinal
    )).length;

    stageRows.push({
      drawOrdinal,
      trials: eligibleMonths.length,
      occurrenceCount,
      occurrenceRate: eligibleMonths.length ? occurrenceCount / eligibleMonths.length : null,
      firstRiskTrials: firstRiskMonths.length,
      firstOccurrenceCount,
      conditionalFirstRate: firstRiskMonths.length ? firstOccurrenceCount / firstRiskMonths.length : null,
      cumulativeOccurrenceCount,
      cumulativeOccurrenceRate: eligibleMonths.length
        ? cumulativeOccurrenceCount / eligibleMonths.length
        : null,
      exactRandomDrawRate: exact.probability,
      exactRandomCumulativeRate: 1 - ((1 - exact.probability) ** drawOrdinal),
      sampleQuality: sampleQuality(firstRiskMonths.length),
    });
  }

  const completedMonths = monthRows.filter((month) => month.complete);
  const completedMonthsWithOccurrence = completedMonths.filter(
    (month) => month.occurrences.length > 0,
  ).length;
  const completedMonthProbabilities = completedMonths.map(
    (month) => 1 - ((1 - exact.probability) ** month.expectedDrawCount),
  );
  const expectedCompletedMonthsWithOccurrence = completedMonthProbabilities.reduce(
    (sum, probability) => sum + probability,
    0,
  );
  const planning = prepared.validDraws.length
    ? buildPlanningDrawContext(prepared.validDraws.map((draw) => draw.draw), { now: options.now })
    : null;
  const currentMonth = planning
    ? monthRows.find((month) => month.monthLabel === planning.targetMonthLabel) ?? null
    : null;
  const currentLatestRecordedOrdinal = currentMonth?.recordedDrawOrdinals[
    currentMonth.recordedDrawOrdinals.length - 1
  ] ?? 0;
  const observationCompleteThroughLatestDraw = currentMonth
    ? hasRecordedPrefix(currentMonth, currentLatestRecordedOrdinal)
    : true;
  const currentState = planning ? {
    targetDate: planning.targetDrawDate,
    targetMonthLabel: planning.targetMonthLabel,
    targetDrawOrdinal: planning.targetDrawOrdinal,
    targetMonthExpectedDrawCount: planning.targetMonthExpectedDrawCount,
    completedDrawCount: planning.completedDrawsInTargetMonth,
    observationCompleteThroughLatestDraw,
    firstOccurrenceOrdinal: observationCompleteThroughLatestDraw
      ? currentMonth?.firstOccurrenceOrdinal ?? null
      : null,
    occurrences: observationCompleteThroughLatestDraw ? currentMonth?.occurrences ?? [] : [],
    nextStageEvidence: stageRows.find((row) => row.drawOrdinal === planning.targetDrawOrdinal) ?? null,
  } satisfies ConsecutiveRunCurrentState : null;

  const warnings: string[] = [];
  if (!completedMonths.length) warnings.push("No completed baseline months are available.");
  const gappedMonthCount = monthRows.filter((month) => {
    const latestOrdinal = month.recordedDrawOrdinals[month.recordedDrawOrdinals.length - 1] ?? 0;
    return !hasRecordedPrefix(month, latestOrdinal);
  }).length;
  if (gappedMonthCount > 0) {
    warnings.push(`${gappedMonthCount} month${gappedMonthCount === 1 ? "" : "s"} with missing earlier scheduled draws ${gappedMonthCount === 1 ? "is" : "are"} excluded from affected draw-stage evidence.`);
  }
  const d13 = stageRows.find((row) => row.drawOrdinal === 13);
  if (d13 && d13.firstRiskTrials > 0 && d13.firstRiskTrials < 10) {
    warnings.push(`D13 first-occurrence evidence is very thin (${d13.firstOccurrenceCount}/${d13.firstRiskTrials}).`);
  }

  return {
    modelVersion: CONSECUTIVE_RUN_MONTHLY_WATCH_VERSION,
    scopeLabel: excludedOpeningMonthLabels.length
      ? `Windfall baseline real history; excludes partial opening month ${excludedOpeningMonthLabels.join(", ")}`
      : "All valid real history",
    validRealDraws: prepared.validDraws.length,
    baselineRealDraws: baselineDraws.length,
    excludedHistoryRows: prepared.excludedHistoryRows,
    simulatedRowsIgnored: prepared.simulatedRowsIgnored,
    excludedOpeningMonthLabels,
    exactRandomDrawRate: exact.probability,
    exactCombinationCount: exact.matchingCombinations,
    totalCombinationCount: exact.totalCombinations,
    completedMonthCount: completedMonths.length,
    completedMonthsWithOccurrence,
    expectedCompletedMonthsWithOccurrence,
    completedMonthTailProbability: poissonBinomialTail(
      completedMonthProbabilities,
      completedMonthsWithOccurrence,
    ),
    stageRows,
    monthRows,
    currentState,
    droughtKeyCrossCheck,
    warnings,
  };
};
