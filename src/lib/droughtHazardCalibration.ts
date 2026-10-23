import type { Draw } from "../types";
import { DROUGHT_HAZARD_ANY_DRAWN_BASELINE } from "./droughtHazard";
import {
  isScheduledDrawDate,
  parseDrawDateParts,
} from "./planningDrawContext";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

export const DROUGHT_HAZARD_CALIBRATION_VERSION = "DHC-1";
export const DROUGHT_HAZARD_CALIBRATION_MIN_TRAINING_DRAWS = 60;
export const DROUGHT_HAZARD_CALIBRATION_SELECTION_WARMUP = 30;
export const DROUGHT_HAZARD_CALIBRATION_MIN_EVALUATION_DRAWS = 120;
export const DROUGHT_HAZARD_CALIBRATION_STABILITY_WINDOW = 60;
export const DROUGHT_HAZARD_CALIBRATION_STABILITY_SHARE = 0.7;
export const DROUGHT_HAZARD_CALIBRATION_MAX_ECE = 0.03;

export const DROUGHT_HAZARD_PRIOR_STRENGTHS = [
  null,
  0,
  1,
  2,
  5,
  10,
  20,
  45,
  90,
  180,
  360,
] as const;

export type DroughtHazardPriorStrength = (typeof DROUGHT_HAZARD_PRIOR_STRENGTHS)[number];
export type DroughtHazardCalibrationStatus =
  | "insufficient"
  | "baseline-favoured"
  | "unstable"
  | "miscalibrated"
  | "supported";

export interface DroughtHazardCalibrationObservation {
  number: number;
  drought: number | null;
  predictedRate: number;
  hit: boolean;
}

export interface DroughtHazardCalibrationRecord {
  targetDate: string;
  trainingDraws: number;
  scoredDrawsBeforeSelection: number;
  selectedPriorStrength: DroughtHazardPriorStrength;
  selectionWasLearned: boolean;
  modelBrierScore: number;
  baselineBrierScore: number;
  observations: DroughtHazardCalibrationObservation[];
}

export interface DroughtHazardPriorCandidateRow {
  priorStrength: DroughtHazardPriorStrength;
  label: string;
  scoredDraws: number;
  numberStateChecks: number;
  brierScore: number | null;
  improvementVsBaseline: number | null;
}

export interface DroughtHazardReliabilityRow {
  label: string;
  trials: number;
  hits: number;
  averagePredictedRate: number;
  observedRate: number;
  absoluteGap: number;
  brierScore: number;
}

export type DroughtHazardSampleLabel = "thin" | "5pp" | "3pp" | "2pp" | "1pp";

export interface DroughtHazardByDroughtRow {
  drought: number;
  trials: number;
  hits: number;
  averagePredictedRate: number;
  observedRate: number;
  absoluteGap: number;
  nominalMargin95: number;
  sample: DroughtHazardSampleLabel;
}

export interface DroughtHazardPrecisionRow {
  margin: number;
  requiredIndependentTrials: number;
  achievedByOverallNumberStates: boolean;
}

export interface DroughtHazardCalibrationVerdict {
  status: DroughtHazardCalibrationStatus;
  title: string;
  reason: string;
}

export interface DroughtHazardCalibrationResult {
  version: typeof DROUGHT_HAZARD_CALIBRATION_VERSION;
  scope: "mains+supps";
  dataPolicy: "validated-real-draws-only";
  baselineProbability: number;
  validHistoryDraws: number;
  excludedHistoryRows: number;
  minTrainingDraws: number;
  selectionWarmupDraws: number;
  records: DroughtHazardCalibrationRecord[];
  evaluationRecords: DroughtHazardCalibrationRecord[];
  candidateRows: DroughtHazardPriorCandidateRow[];
  reliabilityRows: DroughtHazardReliabilityRow[];
  byDroughtRows: DroughtHazardByDroughtRow[];
  precisionRows: DroughtHazardPrecisionRow[];
  currentLearnedPriorStrength: DroughtHazardPriorStrength;
  recentStrengthAgreement: number;
  recentStrengthDraws: number;
  modelBrierScore: number | null;
  baselineBrierScore: number | null;
  brierImprovement: number | null;
  brierImprovementCi: [number, number] | null;
  expectedCalibrationError: number | null;
  numberStateChecks: number;
  verdict: DroughtHazardCalibrationVerdict;
}

export interface DroughtHazardCalibrationOptions {
  minTrainingDraws?: number;
  selectionWarmupDraws?: number;
}

interface PreparedHistory {
  draws: Array<{ draw: Draw; date: string; numbers: Set<number> }>;
  excludedRows: number;
}

interface Counter {
  trials: number;
  hits: number;
}

interface CandidateAccumulator {
  priorStrength: DroughtHazardPriorStrength;
  brierSum: number;
  scoredDraws: number;
}

interface CandidateForecast {
  priorStrength: DroughtHazardPriorStrength;
  observations: DroughtHazardCalibrationObservation[];
  brierScore: number;
}

const Z_95 = 1.96;
const INITIAL_PRIOR_STRENGTH = 2;

const mean = (values: readonly number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const drawNumbers = (draw: Draw): number[] => [
  ...(draw.main ?? []),
  ...(draw.supp ?? []),
].filter((number) => Number.isInteger(number) && number >= 1 && number <= 45);

const prepareHistory = (history: readonly Draw[]): PreparedHistory => {
  const draws: PreparedHistory["draws"] = [];
  const seenDates = new Set<string>();
  let excludedRows = 0;

  for (const draw of sortDrawsChronologically(history.map((row) => ({ ...row })))) {
    const parts = parseDrawDateParts(draw.date);
    const epoch = parseDrawDateToEpoch(draw.date);
    const numbers = new Set(drawNumbers(draw));
    if (
      draw.isSimulated
      || !parts
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

    const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    if (seenDates.has(date)) {
      excludedRows += 1;
      continue;
    }
    seenDates.add(date);
    draws.push({ draw, date, numbers });
  }

  return { draws, excludedRows };
};

const priorLabel = (strength: DroughtHazardPriorStrength): string => (
  strength === null ? "Neutral 8/45" : `${strength} prior trial${strength === 1 ? "" : "s"}`
);

const smoothedRate = (counter: Counter | undefined, strength: DroughtHazardPriorStrength): number => {
  if (strength === null) return DROUGHT_HAZARD_ANY_DRAWN_BASELINE;
  const trials = counter?.trials ?? 0;
  const hits = counter?.hits ?? 0;
  const denominator = trials + strength;
  if (denominator <= 0) return DROUGHT_HAZARD_ANY_DRAWN_BASELINE;
  return (hits + (DROUGHT_HAZARD_ANY_DRAWN_BASELINE * strength)) / denominator;
};

const forecastCandidate = (
  priorStrength: DroughtHazardPriorStrength,
  droughts: readonly (number | null)[],
  exposures: ReadonlyMap<number, Counter>,
  actualNumbers: ReadonlySet<number>,
): CandidateForecast => {
  const observations = Array.from({ length: 45 }, (_, index): DroughtHazardCalibrationObservation => {
    const number = index + 1;
    const drought = droughts[number] ?? null;
    return {
      number,
      drought,
      predictedRate: drought == null
        ? DROUGHT_HAZARD_ANY_DRAWN_BASELINE
        : smoothedRate(exposures.get(drought), priorStrength),
      hit: actualNumbers.has(number),
    };
  });
  return {
    priorStrength,
    observations,
    brierScore: mean(observations.map((row) => (row.predictedRate - (row.hit ? 1 : 0)) ** 2)),
  };
};

const candidateMeanBrier = (candidate: CandidateAccumulator): number => (
  candidate.scoredDraws ? candidate.brierSum / candidate.scoredDraws : Number.POSITIVE_INFINITY
);

const candidateTiePriority = (strength: DroughtHazardPriorStrength): number => {
  if (strength === null) return 0;
  return 1 + (360 - strength);
};

const bestCandidate = (candidates: readonly CandidateAccumulator[]): CandidateAccumulator | null => {
  if (!candidates.some((candidate) => candidate.scoredDraws > 0)) return null;
  return [...candidates].sort((left, right) => {
    const scoreDelta = candidateMeanBrier(left) - candidateMeanBrier(right);
    if (Math.abs(scoreDelta) > 1e-12) return scoreDelta;
    return candidateTiePriority(left.priorStrength) - candidateTiePriority(right.priorStrength);
  })[0] ?? null;
};

const updateExposure = (
  exposures: Map<number, Counter>,
  drought: number | null,
  hit: boolean,
): void => {
  // A number not yet seen in the available history has a left-censored drought.
  // It is excluded until its first real appearance establishes a known state.
  if (drought == null) return;
  const counter = exposures.get(drought) ?? { trials: 0, hits: 0 };
  counter.trials += 1;
  if (hit) counter.hits += 1;
  exposures.set(drought, counter);
};

const confidenceIntervalForMean = (values: readonly number[]): [number, number] | null => {
  if (values.length < 2) return null;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
  const margin = Z_95 * Math.sqrt(variance / values.length);
  return [average - margin, average + margin];
};

const reliabilityRows = (
  observations: readonly DroughtHazardCalibrationObservation[],
): DroughtHazardReliabilityRow[] => {
  const bands = [
    { label: "Under 12%", min: 0, max: 0.12 },
    { label: "12% to under 15%", min: 0.12, max: 0.15 },
    { label: "15% to under 18%", min: 0.15, max: 0.18 },
    { label: "18% to under 21%", min: 0.18, max: 0.21 },
    { label: "21% to under 24%", min: 0.21, max: 0.24 },
    { label: "24% and above", min: 0.24, max: Number.POSITIVE_INFINITY },
  ];

  return bands.map((band) => {
    const rows = observations.filter((row) => row.predictedRate >= band.min && row.predictedRate < band.max);
    const hits = rows.filter((row) => row.hit).length;
    const averagePredictedRate = mean(rows.map((row) => row.predictedRate));
    const observedRate = rows.length ? hits / rows.length : 0;
    return {
      label: band.label,
      trials: rows.length,
      hits,
      averagePredictedRate,
      observedRate,
      absoluteGap: rows.length ? Math.abs(averagePredictedRate - observedRate) : 0,
      brierScore: rows.length
        ? mean(rows.map((row) => (row.predictedRate - (row.hit ? 1 : 0)) ** 2))
        : 0,
    };
  });
};

export const requiredIndependentTrialsForMargin = (
  margin: number,
  probability = DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
): number => {
  if (!Number.isFinite(margin) || margin <= 0) return 0;
  return Math.ceil((Z_95 ** 2) * probability * (1 - probability) / (margin ** 2));
};

const sampleLabel = (trials: number): DroughtHazardSampleLabel => {
  if (trials >= requiredIndependentTrialsForMargin(0.01)) return "1pp";
  if (trials >= requiredIndependentTrialsForMargin(0.02)) return "2pp";
  if (trials >= requiredIndependentTrialsForMargin(0.03)) return "3pp";
  if (trials >= requiredIndependentTrialsForMargin(0.05)) return "5pp";
  return "thin";
};

const byDroughtRows = (
  observations: readonly DroughtHazardCalibrationObservation[],
): DroughtHazardByDroughtRow[] => {
  const grouped = new Map<number, DroughtHazardCalibrationObservation[]>();
  observations.forEach((row) => {
    if (row.drought == null) return;
    const rows = grouped.get(row.drought) ?? [];
    rows.push(row);
    grouped.set(row.drought, rows);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([drought, rows]) => {
      const hits = rows.filter((row) => row.hit).length;
      const observedRate = hits / rows.length;
      const averagePredictedRate = mean(rows.map((row) => row.predictedRate));
      return {
        drought,
        trials: rows.length,
        hits,
        averagePredictedRate,
        observedRate,
        absoluteGap: Math.abs(averagePredictedRate - observedRate),
        nominalMargin95: Z_95 * Math.sqrt(
          DROUGHT_HAZARD_ANY_DRAWN_BASELINE
          * (1 - DROUGHT_HAZARD_ANY_DRAWN_BASELINE)
          / rows.length,
        ),
        sample: sampleLabel(rows.length),
      };
    });
};

const strengthEquals = (
  left: DroughtHazardPriorStrength,
  right: DroughtHazardPriorStrength,
): boolean => left === right;

const buildVerdict = (input: {
  evaluationDraws: number;
  learnedStrength: DroughtHazardPriorStrength;
  improvement: number | null;
  improvementCi: [number, number] | null;
  ece: number | null;
  recentAgreement: number;
  recentDraws: number;
}): DroughtHazardCalibrationVerdict => {
  if (input.evaluationDraws < DROUGHT_HAZARD_CALIBRATION_MIN_EVALUATION_DRAWS) {
    return {
      status: "insufficient",
      title: "Not enough draw-level evidence",
      reason: `Only ${input.evaluationDraws} learned-policy target draws are available; the audit requires at least ${DROUGHT_HAZARD_CALIBRATION_MIN_EVALUATION_DRAWS} before considering stability.`,
    };
  }
  if (
    input.learnedStrength === null
    || input.improvement == null
    || input.improvementCi == null
    || input.improvement <= 0
    || input.improvementCi[0] <= 0
  ) {
    return {
      status: "baseline-favoured",
      title: "Stable improvement is not demonstrated",
      reason: "The sequentially selected drought-rate policy has not produced a draw-level Brier improvement whose 95% interval is entirely above the neutral 8/45 benchmark.",
    };
  }
  if (
    input.recentDraws < DROUGHT_HAZARD_CALIBRATION_STABILITY_WINDOW
    || input.recentAgreement < DROUGHT_HAZARD_CALIBRATION_STABILITY_SHARE
  ) {
    return {
      status: "unstable",
      title: "A finite prior is ahead, but not stable",
      reason: `The current prior was selected in ${(input.recentAgreement * 100).toFixed(0)}% of the latest ${input.recentDraws} learned-policy draws; the declared stability gate is ${(DROUGHT_HAZARD_CALIBRATION_STABILITY_SHARE * 100).toFixed(0)}% of ${DROUGHT_HAZARD_CALIBRATION_STABILITY_WINDOW}.`,
    };
  }
  if (input.ece == null || input.ece > DROUGHT_HAZARD_CALIBRATION_MAX_ECE) {
    return {
      status: "miscalibrated",
      title: "Brier evidence is positive, but reliability is loose",
      reason: `The weighted calibration gap is ${input.ece == null ? "unavailable" : `${(input.ece * 100).toFixed(1)}pp`}; the declared descriptive guardrail is ${(DROUGHT_HAZARD_CALIBRATION_MAX_ECE * 100).toFixed(0)}pp.`,
    };
  }
  return {
    status: "supported",
    title: "Stable out-of-sample calibration demonstrated",
    reason: "The finite prior cleared the declared draw-count, draw-level Brier, recent-strength stability, and reliability-gap guardrails using prior real draws only.",
  };
};

export const analyzeDroughtHazardCalibration = (
  history: readonly Draw[],
  options: DroughtHazardCalibrationOptions = {},
): DroughtHazardCalibrationResult => {
  const minTrainingDraws = Math.max(
    2,
    Math.round(options.minTrainingDraws ?? DROUGHT_HAZARD_CALIBRATION_MIN_TRAINING_DRAWS),
  );
  const selectionWarmupDraws = Math.max(
    1,
    Math.round(options.selectionWarmupDraws ?? DROUGHT_HAZARD_CALIBRATION_SELECTION_WARMUP),
  );
  const prepared = prepareHistory(history);
  const exposures = new Map<number, Counter>();
  const droughts = new Array<number | null>(46).fill(null);
  const candidates: CandidateAccumulator[] = DROUGHT_HAZARD_PRIOR_STRENGTHS.map((priorStrength) => ({
    priorStrength,
    brierSum: 0,
    scoredDraws: 0,
  }));
  const records: DroughtHazardCalibrationRecord[] = [];

  const first = prepared.draws[0];
  if (first) {
    for (let number = 1; number <= 45; number += 1) {
      droughts[number] = first.numbers.has(number) ? 0 : null;
    }
  }

  for (let targetIndex = 1; targetIndex < prepared.draws.length; targetIndex += 1) {
    const target = prepared.draws[targetIndex];
    const trainingDraws = targetIndex;
    const candidateForecasts = DROUGHT_HAZARD_PRIOR_STRENGTHS.map((priorStrength) => (
      forecastCandidate(priorStrength, droughts, exposures, target.numbers)
    ));

    if (trainingDraws >= minTrainingDraws) {
      const learnedSelectionReady = records.length >= selectionWarmupDraws;
      const learnedCandidate = bestCandidate(candidates);
      const selectedStrength = learnedSelectionReady
        ? (learnedCandidate ? learnedCandidate.priorStrength : INITIAL_PRIOR_STRENGTH)
        : INITIAL_PRIOR_STRENGTH;
      const selectedForecast = candidateForecasts.find(
        (forecast) => strengthEquals(forecast.priorStrength, selectedStrength),
      ) ?? candidateForecasts[0];
      const baselineForecast = candidateForecasts.find((forecast) => forecast.priorStrength === null)
        ?? candidateForecasts[0];

      records.push({
        targetDate: target.date,
        trainingDraws,
        scoredDrawsBeforeSelection: candidates[0]?.scoredDraws ?? 0,
        selectedPriorStrength: selectedStrength,
        selectionWasLearned: learnedSelectionReady,
        modelBrierScore: selectedForecast.brierScore,
        baselineBrierScore: baselineForecast.brierScore,
        observations: selectedForecast.observations,
      });

      candidates.forEach((candidate) => {
        const forecast = candidateForecasts.find((row) => strengthEquals(row.priorStrength, candidate.priorStrength));
        if (!forecast) return;
        candidate.brierSum += forecast.brierScore;
        candidate.scoredDraws += 1;
      });
    }

    for (let number = 1; number <= 45; number += 1) {
      const hit = target.numbers.has(number);
      updateExposure(exposures, droughts[number], hit);
      if (hit) {
        droughts[number] = 0;
      } else if (droughts[number] != null) {
        droughts[number] = (droughts[number] as number) + 1;
      }
    }
  }

  const evaluationRecords = records.filter((record) => record.selectionWasLearned);
  const evaluationObservations = evaluationRecords.flatMap((record) => record.observations);
  const modelBrierScore = evaluationRecords.length
    ? mean(evaluationRecords.map((record) => record.modelBrierScore))
    : null;
  const baselineBrierScore = evaluationRecords.length
    ? mean(evaluationRecords.map((record) => record.baselineBrierScore))
    : null;
  const brierImprovement = modelBrierScore == null || baselineBrierScore == null
    ? null
    : baselineBrierScore - modelBrierScore;
  const drawImprovements = evaluationRecords.map(
    (record) => record.baselineBrierScore - record.modelBrierScore,
  );
  const brierImprovementCi = confidenceIntervalForMean(drawImprovements);
  const currentBestCandidate = bestCandidate(candidates);
  const currentLearnedPriorStrength = currentBestCandidate
    ? currentBestCandidate.priorStrength
    : INITIAL_PRIOR_STRENGTH;
  const recentStrengthRecords = evaluationRecords.slice(-DROUGHT_HAZARD_CALIBRATION_STABILITY_WINDOW);
  const recentStrengthAgreement = recentStrengthRecords.length
    ? recentStrengthRecords.filter((record) => (
      strengthEquals(record.selectedPriorStrength, currentLearnedPriorStrength)
    )).length / recentStrengthRecords.length
    : 0;
  const reliability = reliabilityRows(evaluationObservations);
  const nonEmptyReliabilityRows = reliability.filter((row) => row.trials > 0);
  const expectedCalibrationError = evaluationObservations.length
    ? nonEmptyReliabilityRows.reduce(
      (sum, row) => sum + (row.absoluteGap * row.trials),
      0,
    ) / evaluationObservations.length
    : null;
  const neutralBrier = DROUGHT_HAZARD_ANY_DRAWN_BASELINE
    * (1 - DROUGHT_HAZARD_ANY_DRAWN_BASELINE);
  const candidateRows = candidates.map((candidate): DroughtHazardPriorCandidateRow => {
    const brierScore = candidate.scoredDraws ? candidateMeanBrier(candidate) : null;
    return {
      priorStrength: candidate.priorStrength,
      label: priorLabel(candidate.priorStrength),
      scoredDraws: candidate.scoredDraws,
      numberStateChecks: candidate.scoredDraws * 45,
      brierScore,
      improvementVsBaseline: brierScore == null ? null : neutralBrier - brierScore,
    };
  });
  const precisionRows = [0.05, 0.03, 0.02, 0.01].map((margin): DroughtHazardPrecisionRow => {
    const requiredIndependentTrials = requiredIndependentTrialsForMargin(margin);
    return {
      margin,
      requiredIndependentTrials,
      achievedByOverallNumberStates: evaluationObservations.length >= requiredIndependentTrials,
    };
  });
  const verdict = buildVerdict({
    evaluationDraws: evaluationRecords.length,
    learnedStrength: currentLearnedPriorStrength,
    improvement: brierImprovement,
    improvementCi: brierImprovementCi,
    ece: expectedCalibrationError,
    recentAgreement: recentStrengthAgreement,
    recentDraws: recentStrengthRecords.length,
  });

  return {
    version: DROUGHT_HAZARD_CALIBRATION_VERSION,
    scope: "mains+supps",
    dataPolicy: "validated-real-draws-only",
    baselineProbability: DROUGHT_HAZARD_ANY_DRAWN_BASELINE,
    validHistoryDraws: prepared.draws.length,
    excludedHistoryRows: prepared.excludedRows,
    minTrainingDraws,
    selectionWarmupDraws,
    records,
    evaluationRecords,
    candidateRows,
    reliabilityRows: reliability,
    byDroughtRows: byDroughtRows(evaluationObservations),
    precisionRows,
    currentLearnedPriorStrength,
    recentStrengthAgreement,
    recentStrengthDraws: recentStrengthRecords.length,
    modelBrierScore,
    baselineBrierScore,
    brierImprovement,
    brierImprovementCi,
    expectedCalibrationError,
    numberStateChecks: evaluationObservations.length,
    verdict,
  };
};

export const formatDroughtHazardPriorStrength = priorLabel;
