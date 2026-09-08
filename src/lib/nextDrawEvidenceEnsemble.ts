import type { Draw } from "../types";
import { filterRealDrawHistory } from "./realDrawHistory";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";
import { strictValidateDraws } from "./strictDrawValidation";

export const NEXT_DRAW_EVIDENCE_MODEL_VERSION = "WF-NDEE-1.0.0";

const NUMBER_MIN = 1;
const NUMBER_MAX = 45;
const DRAW_SIZE = 8;
const MAIN_SIZE = 6;
const SUPP_SIZE = 2;
const RANDOM_INCLUSION_RATE = DRAW_SIZE / NUMBER_MAX;
const RANDOM_TOP_EIGHT_OVERLAP = (DRAW_SIZE * DRAW_SIZE) / NUMBER_MAX;
const RANDOM_SUPP_HITS_FROM_KNOWN_EIGHT = (SUPP_SIZE * SUPP_SIZE) / DRAW_SIZE;
const RANDOM_EXACT_SUPP_PAIR_RATE = 1 / 28;

const FEATURE_WARMUP_DRAWS = 36;
const VALIDATION_MIN_TRAINING_DRAWS = 104;
const VALIDATION_BLOCK_SIZE = 26;
const RIDGE_LAMBDA = 0.18;
const TRAINING_ITERATIONS = 84;
const TRAINING_LEARNING_RATE = 0.28;
const BOOTSTRAP_ITERATIONS = 1_000;
const BOOTSTRAP_BLOCK_SIZE = 13;

export const NEXT_DRAW_EVIDENCE_FEATURES = [
  { key: "longRate", label: "All-history inclusion rate" },
  { key: "recent6", label: "Recent 6-draw rate" },
  { key: "recent13", label: "Recent 13-draw rate" },
  { key: "recent36", label: "Recent 36-draw rate" },
  { key: "drought", label: "Current drought length" },
  { key: "droughtRank", label: "Relative drought rank" },
  { key: "latestRepeat", label: "Latest-draw repeat" },
  { key: "neighbour1", label: "Latest-draw +/-1 neighbour" },
  { key: "neighbour2", label: "Latest-draw +/-2 neighbour" },
  { key: "monthBucket", label: "Current-month hit count" },
  { key: "monthBucketStage", label: "Month bucket x stage" },
  { key: "monthUndrawnStage", label: "Undrawn x month stage" },
  { key: "terminalLift", label: "Terminal-digit recent lift" },
  { key: "companionLift", label: "Latest-draw companion lift" },
] as const;

export type NextDrawEvidenceFeatureKey = typeof NEXT_DRAW_EVIDENCE_FEATURES[number]["key"];

export interface NextDrawEvidenceContribution {
  key: NextDrawEvidenceFeatureKey;
  label: string;
  value: number;
  contribution: number;
}

export interface NextDrawEvidenceNumberRow {
  number: number;
  rank: number;
  inclusionEstimate: number;
  rawScore: number;
  selectedRole: "main" | "supp" | "alternate";
  features: Record<NextDrawEvidenceFeatureKey, number>;
  contributions: NextDrawEvidenceContribution[];
}

export interface NextDrawEvidenceValidationRow {
  drawDate: string;
  modelHits: number;
  fullFrequencyHits: number;
  recent13Hits: number;
  modelNumbers: number[];
  actualNumbers: number[];
  oracleSuppHits: number;
  oracleSuppExact: boolean;
}

export interface NextDrawEvidenceMetric {
  meanHits: number;
  brier: number;
}

export interface NextDrawEvidenceValidation {
  drawsEvaluated: number;
  firstTargetDate?: string;
  lastTargetDate?: string;
  model: NextDrawEvidenceMetric;
  fullFrequency: NextDrawEvidenceMetric;
  recent13Frequency: NextDrawEvidenceMetric;
  randomExpectedHits: number;
  modelVsFullFrequencyCi: [number, number] | null;
  modelVsRecent13Ci: [number, number] | null;
  modelVsRandomCi: [number, number] | null;
  oracleSuppMeanHits: number;
  oracleSuppExactRate: number;
  randomOracleSuppMeanHits: number;
  randomOracleSuppExactRate: number;
  status: "supported-lift" | "no-validated-lift" | "insufficient";
  statusLabel: string;
  latestRows: NextDrawEvidenceValidationRow[];
}

export interface NextDrawEvidenceSupplementaryPair {
  numbers: [number, number];
  score: number;
  individualSupport: number;
  pairSupport: number;
  pairSuppHits: number;
  pairExposure: number;
}

export interface NextDrawEvidenceResult {
  modelVersion: string;
  cutoffDate?: string;
  targetDate?: string;
  validDraws: number;
  ignoredSimulatedRows: number;
  ignoredInvalidRows: number;
  ignoredDuplicateRows: number;
  ignoredConflictingDateRows: number;
  main: number[];
  supp: number[];
  topEight: number[];
  alternates: number[];
  supplementaryPairs: NextDrawEvidenceSupplementaryPair[];
  numberRows: NextDrawEvidenceNumberRow[];
  validation: NextDrawEvidenceValidation;
  warnings: string[];
  methodology: string[];
}

interface PreparedHistory {
  draws: Draw[];
  ignoredSimulatedRows: number;
  ignoredInvalidRows: number;
  ignoredDuplicateRows: number;
  ignoredConflictingDateRows: number;
  warnings: string[];
}

interface FeatureFrame {
  targetIndex: number;
  targetDate?: string;
  vectors: number[][];
  counts: number[];
  recent13Counts: number[];
}

interface FittedModel {
  means: number[];
  standardDeviations: number[];
  weights: number[];
  intercept: number;
}

interface PredictedFrame {
  probabilities: number[];
  logits: number[];
}

interface RoleEvidence {
  mainCounts: number[];
  suppCounts: number[];
  pairExposure: number[][];
  suppPairCounts: number[][];
}

const allNumbers = (): number[] => Array.from({ length: NUMBER_MAX }, (_, index) => index + 1);

const drawNumbers = (draw: Draw): number[] => [...draw.main, ...draw.supp];

const sortedNumbers = (numbers: readonly number[]): number[] => [...numbers].sort((left, right) => left - right);

const drawFingerprint = (draw: Draw): string => (
  `${sortedNumbers(draw.main).join(",")}|${sortedNumbers(draw.supp).join(",")}`
);

const mean = (values: readonly number[]): number => (
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const sigmoid = (value: number): number => {
  if (value >= 0) {
    const inverse = Math.exp(-Math.min(value, 40));
    return 1 / (1 + inverse);
  }
  const positive = Math.exp(Math.max(value, -40));
  return positive / (1 + positive);
};

const logit = (value: number): number => {
  const clamped = Math.min(1 - 1e-9, Math.max(1e-9, value));
  return Math.log(clamped / (1 - clamped));
};

const monthKey = (date: string | undefined): string => {
  const epoch = date ? parseDrawDateToEpoch(date) : 0;
  if (!epoch) return "";
  const parsed = new Date(epoch);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
};

export function deriveNextScheduledDrawDateAfterCutoff(cutoffDate: string | undefined): string | undefined {
  const epoch = cutoffDate ? parseDrawDateToEpoch(cutoffDate) : 0;
  if (!epoch) return undefined;
  const candidate = new Date(epoch);
  candidate.setHours(0, 0, 0, 0);
  for (let day = 0; day < 7; day += 1) {
    candidate.setDate(candidate.getDate() + 1);
    if ([1, 3, 5].includes(candidate.getDay())) {
      return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;
    }
  }
  return undefined;
}

const buildMatrix = (): number[][] => (
  Array.from({ length: NUMBER_MAX + 1 }, () => Array(NUMBER_MAX + 1).fill(0))
);

export function prepareNextDrawEvidenceHistory(history: readonly Draw[]): PreparedHistory {
  const real = filterRealDrawHistory(history, "Next-Draw Evidence Ensemble");
  const strict = strictValidateDraws([...real.history]);
  const ignoredInvalidRows = real.history.length - strict.length;
  const groups = new Map<number, Draw[]>();

  for (const draw of sortDrawsChronologically(strict)) {
    const epoch = parseDrawDateToEpoch(draw.date);
    const rows = groups.get(epoch) ?? [];
    rows.push(draw);
    groups.set(epoch, rows);
  }

  const draws: Draw[] = [];
  let ignoredDuplicateRows = 0;
  let ignoredConflictingDateRows = 0;
  for (const rows of groups.values()) {
    const fingerprints = new Set(rows.map(drawFingerprint));
    if (fingerprints.size > 1) {
      ignoredConflictingDateRows += rows.length;
      continue;
    }
    draws.push(rows[0]);
    ignoredDuplicateRows += Math.max(0, rows.length - 1);
  }

  const warnings = [...real.warnings];
  if (ignoredInvalidRows > 0) {
    warnings.push(`Excluded ${ignoredInvalidRows} real row${ignoredInvalidRows === 1 ? "" : "s"} with an invalid date or invalid 6+2 number structure.`);
  }
  if (ignoredDuplicateRows > 0) {
    warnings.push(`Ignored ${ignoredDuplicateRows} exact duplicate draw row${ignoredDuplicateRows === 1 ? "" : "s"}.`);
  }
  if (ignoredConflictingDateRows > 0) {
    warnings.push(`Excluded ${ignoredConflictingDateRows} row${ignoredConflictingDateRows === 1 ? "" : "s"} from dates with conflicting draw records.`);
  }

  return {
    draws: sortDrawsChronologically(draws),
    ignoredSimulatedRows: real.simulatedRowsIgnored,
    ignoredInvalidRows,
    ignoredDuplicateRows,
    ignoredConflictingDateRows,
    warnings,
  };
}

const countWindow = (draws: readonly Draw[], endExclusive: number, windowSize: number): number[] => {
  const counts = Array(NUMBER_MAX + 1).fill(0);
  const start = Math.max(0, endExclusive - windowSize);
  for (let index = start; index < endExclusive; index += 1) {
    for (const number of drawNumbers(draws[index])) counts[number] += 1;
  }
  return counts;
};

const smoothedRate = (hits: number, trials: number, priorStrength: number): number => (
  (hits + priorStrength * RANDOM_INCLUSION_RATE) / Math.max(1, trials + priorStrength)
);

const rankPercentiles = (values: readonly number[]): number[] => {
  const output = Array(values.length).fill(0);
  const denominator = Math.max(1, NUMBER_MAX - 1);
  for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
    const value = values[number];
    let lower = 0;
    let equal = 0;
    for (let other = NUMBER_MIN; other <= NUMBER_MAX; other += 1) {
      if (values[other] < value) lower += 1;
      else if (values[other] === value) equal += 1;
    }
    output[number] = (lower + ((equal - 1) / 2)) / denominator;
  }
  return output;
};

const terminalGroupSize = (digit: number): number => (
  allNumbers().filter((number) => number % 10 === digit).length
);

const latestNeighbourSet = (latest: Draw | undefined, distance: 1 | 2): Set<number> => {
  const targets = new Set<number>();
  if (!latest) return targets;
  for (const number of drawNumbers(latest)) {
    for (const candidate of [number - distance, number + distance]) {
      if (candidate >= NUMBER_MIN && candidate <= NUMBER_MAX) targets.add(candidate);
    }
  }
  return targets;
};

const buildFeatureFrames = (draws: readonly Draw[], forecastTargetDate?: string): FeatureFrame[] => {
  const frames: FeatureFrame[] = [];
  const totalCounts = Array(NUMBER_MAX + 1).fill(0);
  const lastSeen = Array(NUMBER_MAX + 1).fill(-1);
  const pairCounts = buildMatrix();

  for (let targetIndex = 0; targetIndex <= draws.length; targetIndex += 1) {
    const targetDate = targetIndex < draws.length ? draws[targetIndex].date : forecastTargetDate;
    const targetMonth = monthKey(targetDate);
    const latest = targetIndex > 0 ? draws[targetIndex - 1] : undefined;
    const latestSet = new Set(latest ? drawNumbers(latest) : []);
    const neighbour1 = latestNeighbourSet(latest, 1);
    const neighbour2 = latestNeighbourSet(latest, 2);
    const recent6Counts = countWindow(draws, targetIndex, 6);
    const recent13Counts = countWindow(draws, targetIndex, 13);
    const recent36Counts = countWindow(draws, targetIndex, 36);
    const recent6Trials = Math.min(6, targetIndex);
    const recent13Trials = Math.min(13, targetIndex);
    const recent36Trials = Math.min(36, targetIndex);
    const droughts = Array(NUMBER_MAX + 1).fill(0);
    const monthCounts = Array(NUMBER_MAX + 1).fill(0);
    let completedMonthDraws = 0;

    for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
      droughts[number] = lastSeen[number] < 0 ? targetIndex : targetIndex - lastSeen[number] - 1;
    }
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      if (monthKey(draws[index].date) !== targetMonth) break;
      completedMonthDraws += 1;
      for (const number of drawNumbers(draws[index])) monthCounts[number] += 1;
    }

    const droughtRanks = rankPercentiles(droughts);
    const terminalLongCounts = Array(10).fill(0);
    const terminalRecentCounts = Array(10).fill(0);
    for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
      terminalLongCounts[number % 10] += totalCounts[number];
      terminalRecentCounts[number % 10] += recent13Counts[number];
    }

    const stage = Math.min(1, completedMonthDraws / 14);
    const vectors = Array.from({ length: NUMBER_MAX + 1 }, () => Array(NEXT_DRAW_EVIDENCE_FEATURES.length).fill(0));
    for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
      const digit = number % 10;
      const digitMembers = terminalGroupSize(digit);
      const recentTerminalPerMember = recent13Trials > 0
        ? terminalRecentCounts[digit] / (recent13Trials * digitMembers)
        : RANDOM_INCLUSION_RATE;
      const longTerminalPerMember = targetIndex > 0
        ? terminalLongCounts[digit] / (targetIndex * digitMembers)
        : RANDOM_INCLUSION_RATE;
      const companionRates: number[] = [];
      if (latest) {
        for (const companion of latestSet) {
          if (companion === number) continue;
          companionRates.push(smoothedRate(pairCounts[number][companion], totalCounts[companion], 12));
        }
      }
      const monthBucket = Math.min(monthCounts[number], 6) / 6;

      vectors[number] = [
        smoothedRate(totalCounts[number], targetIndex, 16) - RANDOM_INCLUSION_RATE,
        smoothedRate(recent6Counts[number], recent6Trials, 4) - RANDOM_INCLUSION_RATE,
        smoothedRate(recent13Counts[number], recent13Trials, 8) - RANDOM_INCLUSION_RATE,
        smoothedRate(recent36Counts[number], recent36Trials, 12) - RANDOM_INCLUSION_RATE,
        Math.min(droughts[number], 24) / 24,
        droughtRanks[number],
        latestSet.has(number) ? 1 : 0,
        neighbour1.has(number) ? 1 : 0,
        neighbour2.has(number) ? 1 : 0,
        monthBucket,
        monthBucket * stage,
        monthCounts[number] === 0 ? stage : 0,
        recentTerminalPerMember - longTerminalPerMember,
        companionRates.length > 0 ? mean(companionRates) - RANDOM_INCLUSION_RATE : 0,
      ];
    }

    frames.push({
      targetIndex,
      targetDate,
      vectors,
      counts: [...totalCounts],
      recent13Counts,
    });

    if (targetIndex >= draws.length) continue;
    const currentNumbers = drawNumbers(draws[targetIndex]);
    for (const number of currentNumbers) {
      totalCounts[number] += 1;
      lastSeen[number] = targetIndex;
    }
    for (let left = 0; left < currentNumbers.length; left += 1) {
      for (let right = left + 1; right < currentNumbers.length; right += 1) {
        const a = currentNumbers[left];
        const b = currentNumbers[right];
        pairCounts[a][b] += 1;
        pairCounts[b][a] += 1;
      }
    }
  }

  return frames;
};

const fitModel = (frames: readonly FeatureFrame[], draws: readonly Draw[], cutoffExclusive: number): FittedModel | null => {
  const firstTarget = FEATURE_WARMUP_DRAWS;
  if (cutoffExclusive <= firstTarget) return null;
  const featureCount = NEXT_DRAW_EVIDENCE_FEATURES.length;
  const rowCount = (cutoffExclusive - firstTarget) * NUMBER_MAX;
  const features = new Float64Array(rowCount * featureCount);
  const labels = new Uint8Array(rowCount);
  const means = Array(featureCount).fill(0);
  let row = 0;

  for (let targetIndex = firstTarget; targetIndex < cutoffExclusive; targetIndex += 1) {
    const actual = new Set(drawNumbers(draws[targetIndex]));
    for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
      const vector = frames[targetIndex].vectors[number];
      labels[row] = actual.has(number) ? 1 : 0;
      for (let feature = 0; feature < featureCount; feature += 1) {
        const value = vector[feature];
        features[(row * featureCount) + feature] = value;
        means[feature] += value;
      }
      row += 1;
    }
  }

  for (let feature = 0; feature < featureCount; feature += 1) means[feature] /= rowCount;
  const standardDeviations = Array(featureCount).fill(0);
  for (let index = 0; index < rowCount; index += 1) {
    for (let feature = 0; feature < featureCount; feature += 1) {
      const offset = (index * featureCount) + feature;
      const centered = features[offset] - means[feature];
      standardDeviations[feature] += centered * centered;
    }
  }
  for (let feature = 0; feature < featureCount; feature += 1) {
    standardDeviations[feature] = Math.sqrt(standardDeviations[feature] / Math.max(1, rowCount - 1));
    if (standardDeviations[feature] < 1e-9) standardDeviations[feature] = 1;
  }
  for (let index = 0; index < rowCount; index += 1) {
    for (let feature = 0; feature < featureCount; feature += 1) {
      const offset = (index * featureCount) + feature;
      features[offset] = (features[offset] - means[feature]) / standardDeviations[feature];
    }
  }

  const weights = Array(featureCount).fill(0);
  let intercept = logit(RANDOM_INCLUSION_RATE);
  for (let iteration = 0; iteration < TRAINING_ITERATIONS; iteration += 1) {
    const gradients = Array(featureCount).fill(0);
    let interceptGradient = 0;
    for (let index = 0; index < rowCount; index += 1) {
      const offset = index * featureCount;
      let score = intercept;
      for (let feature = 0; feature < featureCount; feature += 1) {
        score += weights[feature] * features[offset + feature];
      }
      const residual = sigmoid(score) - labels[index];
      interceptGradient += residual;
      for (let feature = 0; feature < featureCount; feature += 1) {
        gradients[feature] += residual * features[offset + feature];
      }
    }
    const learningRate = TRAINING_LEARNING_RATE / (1 + iteration * 0.012);
    intercept -= learningRate * (interceptGradient / rowCount);
    for (let feature = 0; feature < featureCount; feature += 1) {
      weights[feature] -= learningRate * ((gradients[feature] / rowCount) + (RIDGE_LAMBDA * weights[feature]));
    }
  }

  return { means, standardDeviations, weights, intercept };
};

const budgetProbabilities = (logits: readonly number[], targetSum: number): number[] => {
  let low = -30;
  let high = 30;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = (low + high) / 2;
    const sum = logits.reduce((total, score) => total + sigmoid(score + midpoint), 0);
    if (sum > targetSum) high = midpoint;
    else low = midpoint;
  }
  const shift = (low + high) / 2;
  return logits.map((score) => sigmoid(score + shift));
};

const predictFrame = (model: FittedModel, frame: FeatureFrame): PredictedFrame => {
  const logits: number[] = [];
  for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
    let score = model.intercept;
    for (let feature = 0; feature < model.weights.length; feature += 1) {
      const standardized = (frame.vectors[number][feature] - model.means[feature]) / model.standardDeviations[feature];
      score += model.weights[feature] * standardized;
    }
    logits.push(score);
  }
  return { logits, probabilities: budgetProbabilities(logits, DRAW_SIZE) };
};

const topNumbers = (values: readonly number[], count = DRAW_SIZE): number[] => (
  allNumbers()
    .sort((left, right) => (values[right - 1] - values[left - 1]) || (left - right))
    .slice(0, count)
);

const posteriorFrequencyProbabilities = (counts: readonly number[], trials: number, priorStrength: number): number[] => {
  const logits = allNumbers().map((number) => logit(smoothedRate(counts[number], trials, priorStrength)));
  return budgetProbabilities(logits, DRAW_SIZE);
};

const intersectionCount = (left: readonly number[], right: ReadonlySet<number>): number => (
  left.reduce((count, number) => count + (right.has(number) ? 1 : 0), 0)
);

const brierScore = (probabilities: readonly number[], actual: ReadonlySet<number>): number => {
  let sum = 0;
  for (let number = NUMBER_MIN; number <= NUMBER_MAX; number += 1) {
    const residual = probabilities[number - 1] - (actual.has(number) ? 1 : 0);
    sum += residual * residual;
  }
  return sum / NUMBER_MAX;
};

const buildRoleEvidence = (draws: readonly Draw[], endExclusive: number): RoleEvidence => {
  const mainCounts = Array(NUMBER_MAX + 1).fill(0);
  const suppCounts = Array(NUMBER_MAX + 1).fill(0);
  const pairExposure = buildMatrix();
  const suppPairCounts = buildMatrix();

  for (let index = 0; index < endExclusive; index += 1) {
    const draw = draws[index];
    const numbers = drawNumbers(draw);
    for (const number of draw.main) mainCounts[number] += 1;
    for (const number of draw.supp) suppCounts[number] += 1;
    for (let left = 0; left < numbers.length; left += 1) {
      for (let right = left + 1; right < numbers.length; right += 1) {
        const a = numbers[left];
        const b = numbers[right];
        pairExposure[a][b] += 1;
        pairExposure[b][a] += 1;
      }
    }
    const [a, b] = draw.supp;
    suppPairCounts[a][b] += 1;
    suppPairCounts[b][a] += 1;
  }

  return { mainCounts, suppCounts, pairExposure, suppPairCounts };
};

export function rankSupplementaryPairs(
  selectedEight: readonly number[],
  priorDraws: readonly Draw[],
): NextDrawEvidenceSupplementaryPair[] {
  const selected = sortedNumbers(Array.from(new Set(selectedEight))).filter((number) => number >= 1 && number <= 45);
  if (selected.length !== DRAW_SIZE) return [];
  const evidence = buildRoleEvidence(priorDraws, priorDraws.length);
  const rows: NextDrawEvidenceSupplementaryPair[] = [];

  for (let left = 0; left < selected.length; left += 1) {
    for (let right = left + 1; right < selected.length; right += 1) {
      const a = selected[left];
      const b = selected[right];
      const aAppearances = evidence.mainCounts[a] + evidence.suppCounts[a];
      const bAppearances = evidence.mainCounts[b] + evidence.suppCounts[b];
      const aSuppRate = (evidence.suppCounts[a] + (16 * (SUPP_SIZE / DRAW_SIZE))) / (aAppearances + 16);
      const bSuppRate = (evidence.suppCounts[b] + (16 * (SUPP_SIZE / DRAW_SIZE))) / (bAppearances + 16);
      const pairExposure = evidence.pairExposure[a][b];
      const pairSuppHits = evidence.suppPairCounts[a][b];
      const pairRate = (pairSuppHits + (56 * RANDOM_EXACT_SUPP_PAIR_RATE)) / (pairExposure + 56);
      const individualSupport = (Math.log(aSuppRate / (SUPP_SIZE / DRAW_SIZE)) + Math.log(bSuppRate / (SUPP_SIZE / DRAW_SIZE))) / 2;
      const pairSupport = Math.log(pairRate / RANDOM_EXACT_SUPP_PAIR_RATE);
      rows.push({
        numbers: [a, b],
        score: individualSupport + (0.25 * pairSupport),
        individualSupport,
        pairSupport,
        pairSuppHits,
        pairExposure,
      });
    }
  }

  return rows.sort((left, right) => (
    (right.score - left.score)
    || (right.pairSuppHits - left.pairSuppHits)
    || (left.numbers[0] - right.numbers[0])
    || (left.numbers[1] - right.numbers[1])
  ));
}

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
};

const percentile = (sorted: readonly number[], quantile: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(quantile * (sorted.length - 1))));
  return sorted[index];
};

const movingBlockBootstrapCi = (differences: readonly number[]): [number, number] | null => {
  if (differences.length < BOOTSTRAP_BLOCK_SIZE) return null;
  const random = seededRandom(0x57464e44);
  const estimates: number[] = [];
  const maxStart = Math.max(0, differences.length - BOOTSTRAP_BLOCK_SIZE);
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    let total = 0;
    let sampled = 0;
    while (sampled < differences.length) {
      const start = Math.floor(random() * (maxStart + 1));
      for (let offset = 0; offset < BOOTSTRAP_BLOCK_SIZE && sampled < differences.length; offset += 1) {
        total += differences[start + offset];
        sampled += 1;
      }
    }
    estimates.push(total / sampled);
  }
  estimates.sort((left, right) => left - right);
  return [percentile(estimates, 0.025), percentile(estimates, 0.975)];
};

const buildValidation = (draws: readonly Draw[], frames: readonly FeatureFrame[]): NextDrawEvidenceValidation => {
  if (draws.length <= VALIDATION_MIN_TRAINING_DRAWS) {
    return {
      drawsEvaluated: 0,
      model: { meanHits: 0, brier: 0 },
      fullFrequency: { meanHits: 0, brier: 0 },
      recent13Frequency: { meanHits: 0, brier: 0 },
      randomExpectedHits: RANDOM_TOP_EIGHT_OVERLAP,
      modelVsFullFrequencyCi: null,
      modelVsRecent13Ci: null,
      modelVsRandomCi: null,
      oracleSuppMeanHits: 0,
      oracleSuppExactRate: 0,
      randomOracleSuppMeanHits: RANDOM_SUPP_HITS_FROM_KNOWN_EIGHT,
      randomOracleSuppExactRate: RANDOM_EXACT_SUPP_PAIR_RATE,
      status: "insufficient",
      statusLabel: `Need more than ${VALIDATION_MIN_TRAINING_DRAWS} valid real draws for block walk-forward validation.`,
      latestRows: [],
    };
  }

  const rows: NextDrawEvidenceValidationRow[] = [];
  const modelHits: number[] = [];
  const fullHits: number[] = [];
  const recentHits: number[] = [];
  const modelBriers: number[] = [];
  const fullBriers: number[] = [];
  const recentBriers: number[] = [];

  for (let blockStart = VALIDATION_MIN_TRAINING_DRAWS; blockStart < draws.length; blockStart += VALIDATION_BLOCK_SIZE) {
    const model = fitModel(frames, draws, blockStart);
    if (!model) continue;
    const blockEnd = Math.min(draws.length, blockStart + VALIDATION_BLOCK_SIZE);
    for (let targetIndex = blockStart; targetIndex < blockEnd; targetIndex += 1) {
      const frame = frames[targetIndex];
      const prediction = predictFrame(model, frame);
      const modelNumbers = topNumbers(prediction.probabilities);
      const fullProbabilities = posteriorFrequencyProbabilities(frame.counts, targetIndex, 16);
      const recentTrials = Math.min(13, targetIndex);
      const recentProbabilities = posteriorFrequencyProbabilities(frame.recent13Counts, recentTrials, 8);
      const fullNumbers = topNumbers(fullProbabilities);
      const recentNumbers = topNumbers(recentProbabilities);
      const actualNumbers = drawNumbers(draws[targetIndex]);
      const actual = new Set(actualNumbers);
      const suppPair = rankSupplementaryPairs(actualNumbers, draws.slice(0, targetIndex))[0]?.numbers ?? [];
      const actualSupp = new Set(draws[targetIndex].supp);
      const oracleSuppHits = intersectionCount(suppPair, actualSupp);
      const oracleSuppExact = oracleSuppHits === SUPP_SIZE;

      modelHits.push(intersectionCount(modelNumbers, actual));
      fullHits.push(intersectionCount(fullNumbers, actual));
      recentHits.push(intersectionCount(recentNumbers, actual));
      modelBriers.push(brierScore(prediction.probabilities, actual));
      fullBriers.push(brierScore(fullProbabilities, actual));
      recentBriers.push(brierScore(recentProbabilities, actual));
      rows.push({
        drawDate: draws[targetIndex].date,
        modelHits: modelHits[modelHits.length - 1],
        fullFrequencyHits: fullHits[fullHits.length - 1],
        recent13Hits: recentHits[recentHits.length - 1],
        modelNumbers,
        actualNumbers: sortedNumbers(actualNumbers),
        oracleSuppHits,
        oracleSuppExact,
      });
    }
  }

  const modelVsFull = modelHits.map((value, index) => value - fullHits[index]);
  const modelVsRecent = modelHits.map((value, index) => value - recentHits[index]);
  const modelVsRandom = modelHits.map((value) => value - RANDOM_TOP_EIGHT_OVERLAP);
  const modelVsFullFrequencyCi = movingBlockBootstrapCi(modelVsFull);
  const modelVsRecent13Ci = movingBlockBootstrapCi(modelVsRecent);
  const modelVsRandomCi = movingBlockBootstrapCi(modelVsRandom);
  const supported = Boolean(
    modelVsFullFrequencyCi
    && modelVsRecent13Ci
    && modelVsRandomCi
    && modelVsFullFrequencyCi[0] > 0
    && modelVsRecent13Ci[0] > 0
    && modelVsRandomCi[0] > 0
  );

  return {
    drawsEvaluated: rows.length,
    firstTargetDate: rows[0]?.drawDate,
    lastTargetDate: rows[rows.length - 1]?.drawDate,
    model: { meanHits: mean(modelHits), brier: mean(modelBriers) },
    fullFrequency: { meanHits: mean(fullHits), brier: mean(fullBriers) },
    recent13Frequency: { meanHits: mean(recentHits), brier: mean(recentBriers) },
    randomExpectedHits: RANDOM_TOP_EIGHT_OVERLAP,
    modelVsFullFrequencyCi,
    modelVsRecent13Ci,
    modelVsRandomCi,
    oracleSuppMeanHits: mean(rows.map((row) => row.oracleSuppHits)),
    oracleSuppExactRate: mean(rows.map((row) => row.oracleSuppExact ? 1 : 0)),
    randomOracleSuppMeanHits: RANDOM_SUPP_HITS_FROM_KNOWN_EIGHT,
    randomOracleSuppExactRate: RANDOM_EXACT_SUPP_PAIR_RATE,
    status: supported ? "supported-lift" : "no-validated-lift",
    statusLabel: supported
      ? "Walk-forward lift cleared the fixed random, all-history frequency, and recent-13 frequency comparisons."
      : "No reliable lift over all fixed baselines was established; treat the forecast as an evidence-ranked experiment.",
    latestRows: rows.slice(-20).reverse(),
  };
};

const emptyResult = (prepared: PreparedHistory, targetDate?: string): NextDrawEvidenceResult => ({
  modelVersion: NEXT_DRAW_EVIDENCE_MODEL_VERSION,
  cutoffDate: prepared.draws[prepared.draws.length - 1]?.date,
  targetDate,
  validDraws: prepared.draws.length,
  ignoredSimulatedRows: prepared.ignoredSimulatedRows,
  ignoredInvalidRows: prepared.ignoredInvalidRows,
  ignoredDuplicateRows: prepared.ignoredDuplicateRows,
  ignoredConflictingDateRows: prepared.ignoredConflictingDateRows,
  main: [],
  supp: [],
  topEight: [],
  alternates: [],
  supplementaryPairs: [],
  numberRows: [],
  validation: buildValidation(prepared.draws, buildFeatureFrames(prepared.draws, targetDate)),
  warnings: [...prepared.warnings, `Need at least ${FEATURE_WARMUP_DRAWS + 1} valid real draws to fit the evidence ensemble.`],
  methodology: [],
});

export function runNextDrawEvidenceEnsemble(
  history: readonly Draw[],
  options: { targetDate?: string } = {},
): NextDrawEvidenceResult {
  const prepared = prepareNextDrawEvidenceHistory(history);
  const cutoffDate = prepared.draws[prepared.draws.length - 1]?.date;
  const targetDate = options.targetDate ?? deriveNextScheduledDrawDateAfterCutoff(cutoffDate);
  if (prepared.draws.length <= FEATURE_WARMUP_DRAWS) return emptyResult(prepared, targetDate);

  const frames = buildFeatureFrames(prepared.draws, targetDate);
  const model = fitModel(frames, prepared.draws, prepared.draws.length);
  if (!model) return emptyResult(prepared, targetDate);
  const forecastFrame = frames[prepared.draws.length];
  const prediction = predictFrame(model, forecastFrame);
  const ranked = topNumbers(prediction.probabilities, NUMBER_MAX);
  const topEight = ranked.slice(0, DRAW_SIZE);
  const supplementaryPairs = rankSupplementaryPairs(topEight, prepared.draws);
  const supp = sortedNumbers(supplementaryPairs[0]?.numbers ?? topEight.slice(MAIN_SIZE));
  const suppSet = new Set(supp);
  const main = sortedNumbers(topEight.filter((number) => !suppSet.has(number)).slice(0, MAIN_SIZE));
  const topEightSet = new Set(topEight);
  const validation = buildValidation(prepared.draws, frames);

  const numberRows = ranked.map((number, index): NextDrawEvidenceNumberRow => {
    const vector = forecastFrame.vectors[number];
    const contributions = NEXT_DRAW_EVIDENCE_FEATURES.map((feature, featureIndex) => {
      const standardized = (vector[featureIndex] - model.means[featureIndex]) / model.standardDeviations[featureIndex];
      return {
        key: feature.key,
        label: feature.label,
        value: vector[featureIndex],
        contribution: standardized * model.weights[featureIndex],
      };
    }).sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution));
    return {
      number,
      rank: index + 1,
      inclusionEstimate: prediction.probabilities[number - 1],
      rawScore: prediction.logits[number - 1],
      selectedRole: suppSet.has(number) ? "supp" : topEightSet.has(number) ? "main" : "alternate",
      features: Object.fromEntries(
        NEXT_DRAW_EVIDENCE_FEATURES.map((feature, featureIndex) => [feature.key, vector[featureIndex]]),
      ) as Record<NextDrawEvidenceFeatureKey, number>,
      contributions,
    };
  });

  return {
    modelVersion: NEXT_DRAW_EVIDENCE_MODEL_VERSION,
    cutoffDate,
    targetDate,
    validDraws: prepared.draws.length,
    ignoredSimulatedRows: prepared.ignoredSimulatedRows,
    ignoredInvalidRows: prepared.ignoredInvalidRows,
    ignoredDuplicateRows: prepared.ignoredDuplicateRows,
    ignoredConflictingDateRows: prepared.ignoredConflictingDateRows,
    main,
    supp,
    topEight,
    alternates: ranked.slice(DRAW_SIZE, DRAW_SIZE + 8),
    supplementaryPairs: supplementaryPairs.slice(0, 6),
    numberRows,
    validation,
    warnings: prepared.warnings,
    methodology: [
      "Every historical target draw is represented only by evidence available before that draw.",
      `The fixed ${NEXT_DRAW_EVIDENCE_FEATURES.length}-feature ridge-logistic model is retrained in ${VALIDATION_BLOCK_SIZE}-draw blocks after ${VALIDATION_MIN_TRAINING_DRAWS} prior draws.`,
      "The 45 marginal inclusion estimates are intercept-shifted to sum to eight; they are model estimates, not calibrated lottery probabilities.",
      "Supplementary roles use shrunk individual role history plus a lightly weighted exact-pair tie-breaker across the 28 pairs inside the selected eight.",
      "Validation compares top-eight overlap with fixed random expectation, all-history frequency, and recent-13 frequency; moving-block bootstrap intervals preserve short-range draw ordering.",
    ],
  };
}
