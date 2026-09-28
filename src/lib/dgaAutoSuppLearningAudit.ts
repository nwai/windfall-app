import type { Draw } from "../types";
import { buildDgaSuppSuggestion } from "./dgaSuppSuggestion";
import {
  prepareNextDrawEvidenceHistory,
  rankSupplementaryPairs,
} from "./nextDrawEvidenceEnsemble";
import { parseDrawDateToEpoch } from "./recentDraws";

export const DGA_AUTO_SUPP_AUDIT_VERSION = "DGA-ASLA-1";
export const DGA_AUTO_SUPP_RANDOM_MEAN_HITS = 0.5;
export const DGA_AUTO_SUPP_RANDOM_EXACT_RATE = 1 / 28;
export const DGA_AUTO_SUPP_RANDOM_ANY_HIT_RATE = 13 / 28;
export const DGA_AUTO_SUPP_MIN_HISTORY = 24;
export const DGA_AUTO_SUPP_PROMOTION_TRIALS = 60;

export type DgaAutoSuppAuditModel = "champion" | "role-rate" | "pair-blend";
export type DgaAutoSuppGateStatus =
  | "insufficient"
  | "retain-champion"
  | "watch-challenger"
  | "promote-challenger";
export type DgaAutoSuppCurrentGateStatus =
  | "insufficient"
  | "no-validated-lift"
  | "validated-lift";

export interface DgaAutoSuppModelOutcome {
  pair: [number, number];
  hits: number;
  exact: boolean;
  actualPairRank: number;
}

export interface DgaAutoSuppAuditRecord {
  targetDate: string;
  trainingDraws: number;
  activeWindowDraws: number;
  actualSupp: [number, number];
  champion: DgaAutoSuppModelOutcome;
  roleRate: DgaAutoSuppModelOutcome;
  pairBlend: DgaAutoSuppModelOutcome;
  policyModelBeforeDraw: DgaAutoSuppAuditModel;
  policyHits: number;
  gateStatusBeforeDraw: DgaAutoSuppGateStatus;
}

export interface DgaAutoSuppModelSummary {
  model: DgaAutoSuppAuditModel;
  label: string;
  trials: number;
  meanHits: number;
  exactRate: number;
  anyHitRate: number;
  zeroHits: number;
  oneHit: number;
  twoHits: number;
  averageActualPairRank: number;
}

export interface DgaAutoSuppChallengerGate {
  model: Exclude<DgaAutoSuppAuditModel, "champion">;
  status: DgaAutoSuppGateStatus;
  trials: number;
  averagePairedDifference: number;
  pairedDifferenceCi: [number, number] | null;
  reason: string;
}

export interface DgaAutoSuppCurrentGate {
  status: DgaAutoSuppCurrentGateStatus;
  trials: number;
  averageDifferenceFromRandom: number;
  differenceFromRandomCi: [number, number] | null;
  reason: string;
}

export interface DgaAutoSuppCurrentPair {
  model: DgaAutoSuppAuditModel;
  label: string;
  pair: [number, number];
}

export interface DgaAutoSuppLearningAuditResult {
  modelVersion: typeof DGA_AUTO_SUPP_AUDIT_VERSION;
  validHistoryDraws: number;
  excludedHistoryRows: number;
  activeWindowSize: number;
  minHistory: number;
  records: DgaAutoSuppAuditRecord[];
  summaries: DgaAutoSuppModelSummary[];
  currentMethodGate: DgaAutoSuppCurrentGate;
  gates: DgaAutoSuppChallengerGate[];
  selectedModel: DgaAutoSuppAuditModel;
  policyAverageHits: number;
  currentPairs: DgaAutoSuppCurrentPair[];
  selectedNumbers: number[];
}

interface RankedPair {
  pair: [number, number];
  score: number;
  rank: number;
}

const MODEL_LABELS: Record<DgaAutoSuppAuditModel, string> = {
  champion: "Current Auto supps",
  "role-rate": "Shrunk role-rate",
  "pair-blend": "Shrunk pair blend",
};

const isScheduledWeekday = (draw: Draw): boolean => {
  const epoch = parseDrawDateToEpoch(draw.date);
  if (!epoch) return false;
  return [1, 3, 5].includes(new Date(epoch).getDay());
};

const normalizeSelectedEight = (numbers: readonly unknown[] | undefined): number[] => {
  const selected = new Set<number>();
  for (const value of numbers ?? []) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 45) {
      selected.add(value);
    }
  }
  return [...selected].sort((left, right) => left - right);
};

const sortPair = (numbers: readonly number[]): [number, number] => {
  const sorted = [...numbers].sort((left, right) => left - right);
  return [sorted[0], sorted[1]];
};

const pairKey = (numbers: readonly number[]): string => sortPair(numbers).join("-");

const allPairs = (numbers: readonly number[]): Array<[number, number]> => {
  const rows: Array<[number, number]> = [];
  for (let left = 0; left < numbers.length; left += 1) {
    for (let right = left + 1; right < numbers.length; right += 1) {
      rows.push([numbers[left], numbers[right]]);
    }
  }
  return rows;
};

const rankRoleRatePairs = (
  selectedNumbers: readonly number[],
  priorDraws: readonly Draw[],
): RankedPair[] => {
  const appearances = new Map<number, number>(selectedNumbers.map((number) => [number, 0]));
  const suppHits = new Map<number, number>(selectedNumbers.map((number) => [number, 0]));
  const selectedSet = new Set(selectedNumbers);

  for (const draw of priorDraws) {
    for (const number of [...draw.main, ...draw.supp]) {
      if (selectedSet.has(number)) appearances.set(number, (appearances.get(number) ?? 0) + 1);
    }
    for (const number of draw.supp) {
      if (selectedSet.has(number)) suppHits.set(number, (suppHits.get(number) ?? 0) + 1);
    }
  }

  const rates = new Map<number, number>();
  for (const number of selectedNumbers) {
    const appearancesForNumber = appearances.get(number) ?? 0;
    const suppForNumber = suppHits.get(number) ?? 0;
    rates.set(number, (suppForNumber + (16 * 0.25)) / (appearancesForNumber + 16));
  }

  return allPairs(selectedNumbers)
    .map((pair) => ({
      pair,
      score: Math.log((rates.get(pair[0]) ?? 0.25) / 0.25)
        + Math.log((rates.get(pair[1]) ?? 0.25) / 0.25),
      rank: 0,
    }))
    .sort((left, right) => (
      right.score - left.score
      || left.pair[0] - right.pair[0]
      || left.pair[1] - right.pair[1]
    ))
    .map((row, index) => ({ ...row, rank: index + 1 }));
};

const rankPairBlendPairs = (
  selectedNumbers: readonly number[],
  priorDraws: readonly Draw[],
): RankedPair[] => rankSupplementaryPairs(selectedNumbers, priorDraws)
  .map((row, index) => ({ pair: row.numbers, score: row.score, rank: index + 1 }));

const rankChampionPairs = (
  selectedNumbers: readonly number[],
  activePriorDraws: readonly Draw[],
  allPriorDraws: readonly Draw[],
): RankedPair[] => {
  const suggestion = buildDgaSuppSuggestion(selectedNumbers, activePriorDraws, allPriorDraws);
  if (!suggestion) return [];
  return suggestion.pairEvidence.map((row) => ({
    pair: row.pair,
    score: 29 - row.rank,
    rank: row.rank,
  }));
};

const outcomeForRanking = (
  ranking: readonly RankedPair[],
  actualSupp: readonly number[],
): DgaAutoSuppModelOutcome | null => {
  const selected = ranking[0];
  if (!selected) return null;
  const actualSet = new Set(actualSupp);
  const hits = selected.pair.filter((number) => actualSet.has(number)).length;
  const actualRank = ranking.find((row) => pairKey(row.pair) === pairKey(actualSupp))?.rank ?? 28;
  return {
    pair: sortPair(selected.pair),
    hits,
    exact: hits === 2,
    actualPairRank: actualRank,
  };
};

const modelOutcome = (
  record: DgaAutoSuppAuditRecord,
  model: DgaAutoSuppAuditModel,
): DgaAutoSuppModelOutcome => {
  if (model === "role-rate") return record.roleRate;
  if (model === "pair-blend") return record.pairBlend;
  return record.champion;
};

const mean = (values: readonly number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

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
    const bartlettWeight = 1 - (lag / (maxLag + 1));
    longRunVariance += 2 * bartlettWeight * covariance;
  }

  const standardError = Math.sqrt(Math.max(0, longRunVariance) / values.length);
  const margin = 1.96 * standardError;
  return [average - margin, average + margin];
};

const summarizeModel = (
  records: readonly DgaAutoSuppAuditRecord[],
  model: DgaAutoSuppAuditModel,
): DgaAutoSuppModelSummary => {
  const outcomes = records.map((record) => modelOutcome(record, model));
  const hitCounts = outcomes.map((outcome) => outcome.hits);
  return {
    model,
    label: MODEL_LABELS[model],
    trials: outcomes.length,
    meanHits: mean(hitCounts),
    exactRate: mean(outcomes.map((outcome) => outcome.exact ? 1 : 0)),
    anyHitRate: mean(outcomes.map((outcome) => outcome.hits > 0 ? 1 : 0)),
    zeroHits: hitCounts.filter((hits) => hits === 0).length,
    oneHit: hitCounts.filter((hits) => hits === 1).length,
    twoHits: hitCounts.filter((hits) => hits === 2).length,
    averageActualPairRank: mean(outcomes.map((outcome) => outcome.actualPairRank)),
  };
};

const evaluateChallenger = (
  records: readonly DgaAutoSuppAuditRecord[],
  model: Exclude<DgaAutoSuppAuditModel, "champion">,
): DgaAutoSuppChallengerGate => {
  const differences = records.map((record) => (
    modelOutcome(record, model).hits - record.champion.hits
  ));
  const pairedDifferenceCi = serialAdjustedMeanCi(differences);
  const challenger = summarizeModel(records, model);
  const champion = summarizeModel(records, "champion");
  const averagePairedDifference = mean(differences);

  if (records.length < DGA_AUTO_SUPP_PROMOTION_TRIALS) {
    return {
      model,
      status: "insufficient",
      trials: records.length,
      averagePairedDifference,
      pairedDifferenceCi,
      reason: `Needs at least ${DGA_AUTO_SUPP_PROMOTION_TRIALS} paired walk-forward draws before promotion can be considered.`,
    };
  }

  const clearsMeanGate = Boolean(pairedDifferenceCi && pairedDifferenceCi[0] > 0);
  const clearsRandomGate = challenger.meanHits > DGA_AUTO_SUPP_RANDOM_MEAN_HITS;
  const preservesExactPairs = (
    challenger.exactRate >= champion.exactRate
    && challenger.exactRate >= DGA_AUTO_SUPP_RANDOM_EXACT_RATE
  );

  if (clearsMeanGate && clearsRandomGate && preservesExactPairs) {
    return {
      model,
      status: "promote-challenger",
      trials: records.length,
      averagePairedDifference,
      pairedDifferenceCi,
      reason: "The challenger clears the paired mean-hit gate, exceeds random mean hits, and does not sacrifice exact-pair performance.",
    };
  }

  if (averagePairedDifference > 0) {
    return {
      model,
      status: "watch-challenger",
      trials: records.length,
      averagePairedDifference,
      pairedDifferenceCi,
      reason: clearsMeanGate && clearsRandomGate
        ? "Mean-hit evidence is positive, but exact-pair performance has not cleared the conservative preservation gate."
        : "The challenger is ahead descriptively, but uncertainty or the random baseline still prevents promotion.",
    };
  }

  return {
    model,
    status: "retain-champion",
    trials: records.length,
    averagePairedDifference,
    pairedDifferenceCi,
    reason: "The challenger has not improved average supplementary hits over the current Auto supp method.",
  };
};

const evaluateCurrentMethod = (
  records: readonly DgaAutoSuppAuditRecord[],
): DgaAutoSuppCurrentGate => {
  const summary = summarizeModel(records, "champion");
  const differences = records.map((record) => (
    record.champion.hits - DGA_AUTO_SUPP_RANDOM_MEAN_HITS
  ));
  const differenceFromRandomCi = serialAdjustedMeanCi(differences);
  const averageDifferenceFromRandom = mean(differences);

  if (records.length < DGA_AUTO_SUPP_PROMOTION_TRIALS) {
    return {
      status: "insufficient",
      trials: records.length,
      averageDifferenceFromRandom,
      differenceFromRandomCi,
      reason: `Needs at least ${DGA_AUTO_SUPP_PROMOTION_TRIALS} walk-forward targets before lift over random can be assessed.`,
    };
  }

  const clearsMeanGate = Boolean(differenceFromRandomCi && differenceFromRandomCi[0] > 0);
  const preservesExactPairs = summary.exactRate >= DGA_AUTO_SUPP_RANDOM_EXACT_RATE;
  if (clearsMeanGate && preservesExactPairs) {
    return {
      status: "validated-lift",
      trials: records.length,
      averageDifferenceFromRandom,
      differenceFromRandomCi,
      reason: "The live method clears the serial-adjusted mean-hit gate and its exact-pair rate is not below the exact random reference.",
    };
  }

  return {
    status: "no-validated-lift",
    trials: records.length,
    averageDifferenceFromRandom,
    differenceFromRandomCi,
    reason: clearsMeanGate
      ? "Average-hit evidence is above random, but exact-pair performance remains below the exact random reference."
      : "The live method has not established average-hit lift over the exact random reference.",
  };
};

const selectModel = (
  records: readonly DgaAutoSuppAuditRecord[],
): { model: DgaAutoSuppAuditModel; status: DgaAutoSuppGateStatus } => {
  const promoted = (["role-rate", "pair-blend"] as const)
    .map((model) => evaluateChallenger(records, model))
    .filter((gate) => gate.status === "promote-challenger")
    .sort((left, right) => (
      (right.pairedDifferenceCi?.[0] ?? -Infinity) - (left.pairedDifferenceCi?.[0] ?? -Infinity)
      || right.averagePairedDifference - left.averagePairedDifference
      || left.model.localeCompare(right.model)
    ));
  if (promoted[0]) return { model: promoted[0].model, status: promoted[0].status };
  const status = records.length < DGA_AUTO_SUPP_PROMOTION_TRIALS
    ? "insufficient"
    : "retain-champion";
  return { model: "champion", status };
};

const currentPairsForSelection = (
  selectedNumbers: readonly number[],
  activeHistory: readonly Draw[],
  fullHistory: readonly Draw[],
): DgaAutoSuppCurrentPair[] => {
  if (selectedNumbers.length !== 8) return [];
  const rankings: Array<[DgaAutoSuppAuditModel, RankedPair[]]> = [
    ["champion", rankChampionPairs(selectedNumbers, activeHistory, fullHistory)],
    ["role-rate", rankRoleRatePairs(selectedNumbers, fullHistory)],
    ["pair-blend", rankPairBlendPairs(selectedNumbers, fullHistory)],
  ];
  return rankings
    .filter(([, rows]) => rows.length > 0)
    .map(([model, rows]) => ({ model, label: MODEL_LABELS[model], pair: sortPair(rows[0].pair) }));
};

export const analyzeDgaAutoSuppLearningAudit = (
  history: readonly Draw[],
  options: {
    activeWindowSize?: number;
    selectedNumbers?: readonly unknown[];
    minHistory?: number;
  } = {},
): DgaAutoSuppLearningAuditResult => {
  const prepared = prepareNextDrawEvidenceHistory(history);
  const draws = prepared.draws.filter(isScheduledWeekday);
  const invalidScheduleRows = prepared.draws.length - draws.length;
  const minHistory = Math.max(8, Math.floor(options.minHistory ?? DGA_AUTO_SUPP_MIN_HISTORY));
  const requestedWindow = Math.max(1, Math.floor(options.activeWindowSize ?? (draws.length || 1)));
  const activeWindowSize = Math.min(requestedWindow, Math.max(1, draws.length));
  const records: DgaAutoSuppAuditRecord[] = [];

  for (let targetIndex = minHistory; targetIndex < draws.length; targetIndex += 1) {
    const priorDraws = draws.slice(0, targetIndex);
    const activePriorDraws = priorDraws.slice(-activeWindowSize);
    const target = draws[targetIndex];
    const selectedEight = [...target.main, ...target.supp].sort((left, right) => left - right);
    const actualSupp = sortPair(target.supp);
    const champion = outcomeForRanking(
      rankChampionPairs(selectedEight, activePriorDraws, priorDraws),
      actualSupp,
    );
    const roleRate = outcomeForRanking(rankRoleRatePairs(selectedEight, priorDraws), actualSupp);
    const pairBlend = outcomeForRanking(rankPairBlendPairs(selectedEight, priorDraws), actualSupp);
    if (!champion || !roleRate || !pairBlend) continue;

    const gateBeforeDraw = selectModel(records);
    const provisional: DgaAutoSuppAuditRecord = {
      targetDate: target.date,
      trainingDraws: priorDraws.length,
      activeWindowDraws: activePriorDraws.length,
      actualSupp,
      champion,
      roleRate,
      pairBlend,
      policyModelBeforeDraw: gateBeforeDraw.model,
      policyHits: 0,
      gateStatusBeforeDraw: gateBeforeDraw.status,
    };
    records.push({
      ...provisional,
      policyHits: modelOutcome(provisional, gateBeforeDraw.model).hits,
    });
  }

  const finalSelection = selectModel(records);
  const selectedNumbers = normalizeSelectedEight(options.selectedNumbers);
  const activeHistory = draws.slice(-activeWindowSize);
  const summaries = (["champion", "role-rate", "pair-blend"] as const)
    .map((model) => summarizeModel(records, model));

  return {
    modelVersion: DGA_AUTO_SUPP_AUDIT_VERSION,
    validHistoryDraws: draws.length,
    excludedHistoryRows: prepared.ignoredSimulatedRows
      + prepared.ignoredInvalidRows
      + prepared.ignoredDuplicateRows
      + prepared.ignoredConflictingDateRows
      + invalidScheduleRows,
    activeWindowSize,
    minHistory,
    records,
    summaries,
    currentMethodGate: evaluateCurrentMethod(records),
    gates: (["role-rate", "pair-blend"] as const).map((model) => evaluateChallenger(records, model)),
    selectedModel: finalSelection.model,
    policyAverageHits: mean(records.map((record) => record.policyHits)),
    currentPairs: currentPairsForSelection(selectedNumbers, activeHistory, draws),
    selectedNumbers,
  };
};
