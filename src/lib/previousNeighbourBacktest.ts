import type { Draw } from "../types";

export type PreviousNeighbourScope = "mains-plus-supps" | "mains";

export interface PreviousNeighbourTarget {
  target: number;
  sources: number[];
  multiplicity: number;
}

export interface PreviousNeighbourTransition {
  previousDate: string;
  currentDate: string;
  drawSize: 6 | 8;
  previousNumbers: number[];
  currentNumbers: number[];
  neighbourTargetCount: number;
  singletonTargetCount: number;
  duplicateTargetCount: number;
  totalHitCount: number;
  singletonHitCount: number;
  duplicateHitCount: number;
  directRepeatCount: number;
  expectedTotalHits: number;
  expectedSingletonHits: number;
  expectedDuplicateHits: number;
  singletonTargets: PreviousNeighbourTarget[];
  duplicateTargets: PreviousNeighbourTarget[];
  singletonHits: PreviousNeighbourTarget[];
  duplicateHits: PreviousNeighbourTarget[];
  directRepeats: number[];
}

export interface PreviousNeighbourCandidateBacktestOptions {
  warmupPairs?: number;
  candidatePoolSize?: number;
  selectedPerDraw?: number;
  permutationIterations?: number;
  seed?: number;
}

export interface PreviousNeighbourBacktestOptions extends PreviousNeighbourCandidateBacktestOptions {
  scope?: PreviousNeighbourScope;
}

export interface PreviousNeighbourDistributionRow {
  count: number;
  observed: number;
  percent: number;
}

export interface PreviousNeighbourCandidateEvaluation {
  targetTransitionIndex: number;
  previousDate: string;
  currentDate: string;
  calibrationPairCount: number;
}

export interface PreviousNeighbourCandidateBacktestResult {
  evaluatedDraws: number;
  warmupPairs: number;
  candidatePoolSize: number;
  selectedPerDraw: number;
  baselineAverageHits: number;
  softRuleAverageHits: number;
  meanDeltaHits: number;
  lift: number | null;
  baselineHit3PlusRate: number;
  softRuleHit3PlusRate: number;
  baselineHit4PlusRate: number;
  softRuleHit4PlusRate: number;
  pValueOneSidedImprovement: number;
  winningDraws: number;
  losingDraws: number;
  neutralDraws: number;
  firstEvaluation: PreviousNeighbourCandidateEvaluation | null;
  antiLookaheadNote: string;
  warnings: string[];
}

export interface PreviousNeighbourBacktestResult {
  scope: PreviousNeighbourScope;
  drawSize: 6 | 8;
  validDraws: number;
  skippedDraws: number;
  transitionCount: number;
  observedAverageHits: number;
  expectedAverageHits: number;
  lift: number | null;
  duplicateTargetHitRate: number;
  singletonTargetHitRate: number;
  randomTargetHitRate: number;
  duplicateLift: number | null;
  singletonLift: number | null;
  totalHitDistribution: PreviousNeighbourDistributionRow[];
  duplicateHitDistribution: PreviousNeighbourDistributionRow[];
  duplicateTargetDistribution: PreviousNeighbourDistributionRow[];
  transitions: PreviousNeighbourTransition[];
  latestTransition: PreviousNeighbourTransition | null;
  candidateBacktest: PreviousNeighbourCandidateBacktestResult;
  warnings: string[];
}

const LOTTERY_MIN = 1;
const LOTTERY_MAX = 45;
const DEFAULT_WARMUP_PAIRS = 50;
const DEFAULT_CANDIDATE_POOL_SIZE = 200;
const DEFAULT_SELECTED_PER_DRAW = 20;
const DEFAULT_PERMUTATION_ITERATIONS = 1000;
const DEFAULT_SEED = 20260613;

const isValidNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= LOTTERY_MIN &&
  value <= LOTTERY_MAX
);

const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

const normalizePositiveInteger = (value: unknown, fallback: number, min = 1): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.floor(numeric));
};

const parseDateToEpoch = (rawDate: string | undefined): number | null => {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yearRaw, monthRaw, dayRaw] = isoMatch;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime();
    }
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, monthRaw, dayRaw, yearRaw] = slashMatch;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime();
    }
  }

  return null;
};

const numbersForScope = (draw: Draw, scope: PreviousNeighbourScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const expectedDrawSizeForScope = (scope: PreviousNeighbourScope): 6 | 8 => (
  scope === "mains" ? 6 : 8
);

const normalizeDrawNumbers = (draw: Draw, scope: PreviousNeighbourScope): number[] | null => {
  const expectedSize = expectedDrawSizeForScope(scope);
  const numbers = numbersForScope(draw, scope);
  if (numbers.length !== expectedSize) return null;

  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const number of numbers) {
    if (!isValidNumber(number) || seen.has(number)) return null;
    seen.add(number);
    normalized.push(number);
  }
  return normalized;
};

const normalizeDraws = (
  draws: Draw[],
  scope: PreviousNeighbourScope,
): { date: string; numbers: number[]; originalIndex: number; timestamp: number | null }[] => {
  const normalized = draws.flatMap((draw, originalIndex) => {
    const numbers = normalizeDrawNumbers(draw, scope);
    if (!numbers) return [];
    return [{
      date: draw.date || `Draw #${originalIndex + 1}`,
      numbers,
      originalIndex,
      timestamp: parseDateToEpoch(draw.date),
    }];
  });

  return normalized.sort((left, right) => {
    if (left.timestamp != null && right.timestamp != null && left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    if (left.timestamp != null && right.timestamp == null) return -1;
    if (left.timestamp == null && right.timestamp != null) return 1;
    return left.originalIndex - right.originalIndex;
  });
};

const buildNeighbourTargets = (numbers: number[]): PreviousNeighbourTarget[] => {
  const targetSources = new Map<number, number[]>();
  for (const source of numbers) {
    for (const target of [source - 1, source + 1]) {
      if (target < LOTTERY_MIN || target > LOTTERY_MAX) continue;
      const sources = targetSources.get(target) ?? [];
      sources.push(source);
      targetSources.set(target, sources);
    }
  }

  return Array.from(targetSources.entries())
    .map(([target, sources]) => {
      const sortedSources = [...sources].sort((left, right) => left - right);
      return {
        target,
        sources: sortedSources,
        multiplicity: sortedSources.length,
      };
    })
    .sort((left, right) => left.target - right.target);
};

const buildTransitionFromNumbers = (
  previousDate: string,
  currentDate: string,
  previousNumbers: number[],
  currentNumbers: number[],
  drawSize: 6 | 8,
): PreviousNeighbourTransition => {
  const targets = buildNeighbourTargets(previousNumbers);
  const currentSet = new Set(currentNumbers);
  const previousSet = new Set(previousNumbers);
  const singletonTargets = targets.filter((entry) => entry.multiplicity === 1);
  const duplicateTargets = targets.filter((entry) => entry.multiplicity >= 2);
  const singletonHits = singletonTargets.filter((entry) => currentSet.has(entry.target));
  const duplicateHits = duplicateTargets.filter((entry) => currentSet.has(entry.target));
  const directRepeats = currentNumbers
    .filter((number) => previousSet.has(number))
    .sort((left, right) => left - right);

  return {
    previousDate,
    currentDate,
    drawSize,
    previousNumbers: [...previousNumbers],
    currentNumbers: [...currentNumbers],
    neighbourTargetCount: targets.length,
    singletonTargetCount: singletonTargets.length,
    duplicateTargetCount: duplicateTargets.length,
    totalHitCount: singletonHits.length + duplicateHits.length,
    singletonHitCount: singletonHits.length,
    duplicateHitCount: duplicateHits.length,
    directRepeatCount: directRepeats.length,
    expectedTotalHits: (drawSize * targets.length) / LOTTERY_MAX,
    expectedSingletonHits: (drawSize * singletonTargets.length) / LOTTERY_MAX,
    expectedDuplicateHits: (drawSize * duplicateTargets.length) / LOTTERY_MAX,
    singletonTargets,
    duplicateTargets,
    singletonHits,
    duplicateHits,
    directRepeats,
  };
};

export const buildPreviousNeighbourTransition = (
  previous: Draw,
  current: Draw,
  scope: PreviousNeighbourScope = "mains-plus-supps",
): PreviousNeighbourTransition | null => {
  const previousNumbers = normalizeDrawNumbers(previous, scope);
  const currentNumbers = normalizeDrawNumbers(current, scope);
  if (!previousNumbers || !currentNumbers) return null;

  return buildTransitionFromNumbers(
    previous.date || "Previous draw",
    current.date || "Current draw",
    previousNumbers,
    currentNumbers,
    expectedDrawSizeForScope(scope),
  );
};

const distributionFrom = (
  transitions: PreviousNeighbourTransition[],
  selector: (transition: PreviousNeighbourTransition) => number,
): PreviousNeighbourDistributionRow[] => {
  const counts = new Map<number, number>();
  for (const transition of transitions) {
    const count = selector(transition);
    counts.set(count, (counts.get(count) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left - right)
    .map(([count, observed]) => ({
      count,
      observed,
      percent: transitions.length > 0 ? round((100 * observed) / transitions.length, 2) : 0,
    }));
};

const createPrng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const sampleCandidate = (drawSize: 6 | 8, rng: () => number): number[] => {
  const selected = new Set<number>();
  while (selected.size < drawSize) {
    selected.add(LOTTERY_MIN + Math.floor(rng() * LOTTERY_MAX));
  }
  return Array.from(selected).sort((left, right) => left - right);
};

const countMatches = (candidate: number[], actual: number[]): number => {
  const actualSet = new Set(actual);
  return candidate.reduce((count, number) => count + (actualSet.has(number) ? 1 : 0), 0);
};

const smoothedProbability = (
  transitions: PreviousNeighbourTransition[],
  selector: (transition: PreviousNeighbourTransition) => number,
  value: number,
  maxValue: number,
): number => {
  let observed = 0;
  for (const transition of transitions) {
    if (selector(transition) === value) observed += 1;
  }
  return (observed + 1) / (transitions.length + maxValue + 1);
};

const scoreCandidateShape = (
  profile: PreviousNeighbourTransition,
  trainingTransitions: PreviousNeighbourTransition[],
): number => {
  const totalProbability = smoothedProbability(
    trainingTransitions,
    (transition) => transition.totalHitCount,
    profile.totalHitCount,
    profile.drawSize,
  );
  const duplicateProbability = smoothedProbability(
    trainingTransitions,
    (transition) => transition.duplicateHitCount,
    profile.duplicateHitCount,
    profile.drawSize,
  );

  return Math.log(totalProbability) + (0.35 * Math.log(duplicateProbability));
};

const mean = (values: number[]): number => (
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
);

const permutationPValue = (
  deltas: number[],
  iterations: number,
  seed: number,
): number => {
  if (deltas.length === 0) return 1;
  const observed = mean(deltas);
  const rng = createPrng(seed);
  let atLeastObserved = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let permutedSum = 0;
    for (const delta of deltas) {
      permutedSum += rng() < 0.5 ? delta : -delta;
    }
    if ((permutedSum / deltas.length) >= observed) {
      atLeastObserved += 1;
    }
  }

  return (atLeastObserved + 1) / (iterations + 1);
};

const runCandidateBacktest = (
  normalizedDraws: { date: string; numbers: number[] }[],
  transitions: PreviousNeighbourTransition[],
  options: Required<PreviousNeighbourCandidateBacktestOptions>,
  drawSize: 6 | 8,
): PreviousNeighbourCandidateBacktestResult => {
  const warmupPairs = Math.min(options.warmupPairs, transitions.length);
  const candidatePoolSize = Math.max(options.selectedPerDraw, options.candidatePoolSize);
  const selectedPerDraw = Math.min(options.selectedPerDraw, candidatePoolSize);
  const warnings: string[] = [];
  const deltas: number[] = [];
  const baselineHits: number[] = [];
  const softRuleHits: number[] = [];
  const baselineCandidateHits: number[] = [];
  const softRuleCandidateHits: number[] = [];
  let firstEvaluation: PreviousNeighbourCandidateEvaluation | null = null;

  if (transitions.length <= warmupPairs) {
    warnings.push("Not enough transition history exists after the warm-up window, so the candidate soft-rule check is not evaluated.");
  }

  for (let transitionIndex = warmupPairs; transitionIndex < transitions.length; transitionIndex += 1) {
    const targetTransition = transitions[transitionIndex];
    const previousDraw = normalizedDraws[transitionIndex];
    const currentDraw = normalizedDraws[transitionIndex + 1];
    const trainingTransitions = transitions.slice(0, transitionIndex);
    if (!previousDraw || !currentDraw || trainingTransitions.length === 0) continue;

    if (!firstEvaluation) {
      firstEvaluation = {
        targetTransitionIndex: transitionIndex + 1,
        previousDate: targetTransition.previousDate,
        currentDate: targetTransition.currentDate,
        calibrationPairCount: trainingTransitions.length,
      };
    }

    const rng = createPrng(options.seed + (transitionIndex * 9973));
    const candidatePool = Array.from({ length: candidatePoolSize }, () => sampleCandidate(drawSize, rng));
    const scoredPool = candidatePool.map((candidate, poolIndex) => {
      const profile = buildTransitionFromNumbers(
        previousDraw.date,
        "candidate",
        previousDraw.numbers,
        candidate,
        drawSize,
      );
      return {
        candidate,
        poolIndex,
        shapeScore: scoreCandidateShape(profile, trainingTransitions),
      };
    });

    const baseline = scoredPool.slice(0, selectedPerDraw);
    const softRule = [...scoredPool]
      .sort((left, right) => right.shapeScore - left.shapeScore || left.poolIndex - right.poolIndex)
      .slice(0, selectedPerDraw);

    const baselineDrawHits = baseline.map((entry) => countMatches(entry.candidate, currentDraw.numbers));
    const softRuleDrawHits = softRule.map((entry) => countMatches(entry.candidate, currentDraw.numbers));
    baselineCandidateHits.push(...baselineDrawHits);
    softRuleCandidateHits.push(...softRuleDrawHits);

    const baselineAverage = mean(baselineDrawHits);
    const softRuleAverage = mean(softRuleDrawHits);
    baselineHits.push(baselineAverage);
    softRuleHits.push(softRuleAverage);
    deltas.push(softRuleAverage - baselineAverage);
  }

  const meanDeltaHits = mean(deltas);
  const baselineAverageHits = mean(baselineHits);
  const softRuleAverageHits = mean(softRuleHits);
  const winningDraws = deltas.filter((delta) => delta > 0).length;
  const losingDraws = deltas.filter((delta) => delta < 0).length;
  const neutralDraws = deltas.filter((delta) => delta === 0).length;
  const permutationIterations = Math.max(10, options.permutationIterations);

  return {
    evaluatedDraws: deltas.length,
    warmupPairs,
    candidatePoolSize,
    selectedPerDraw,
    baselineAverageHits: round(baselineAverageHits, 4),
    softRuleAverageHits: round(softRuleAverageHits, 4),
    meanDeltaHits: round(meanDeltaHits, 4),
    lift: baselineAverageHits > 0 ? round(softRuleAverageHits / baselineAverageHits, 4) : null,
    baselineHit3PlusRate: baselineCandidateHits.length > 0
      ? round(baselineCandidateHits.filter((hits) => hits >= 3).length / baselineCandidateHits.length, 4)
      : 0,
    softRuleHit3PlusRate: softRuleCandidateHits.length > 0
      ? round(softRuleCandidateHits.filter((hits) => hits >= 3).length / softRuleCandidateHits.length, 4)
      : 0,
    baselineHit4PlusRate: baselineCandidateHits.length > 0
      ? round(baselineCandidateHits.filter((hits) => hits >= 4).length / baselineCandidateHits.length, 4)
      : 0,
    softRuleHit4PlusRate: softRuleCandidateHits.length > 0
      ? round(softRuleCandidateHits.filter((hits) => hits >= 4).length / softRuleCandidateHits.length, 4)
      : 0,
    pValueOneSidedImprovement: round(permutationPValue(deltas, permutationIterations, options.seed + 4049), 4),
    winningDraws,
    losingDraws,
    neutralDraws,
    firstEvaluation,
    antiLookaheadNote: "For each target draw, the soft-rule shape model is calibrated from transitions up to the previous transition only.",
    warnings,
  };
};

export function analyzePreviousNeighbourBacktest(
  draws: Draw[],
  options: PreviousNeighbourBacktestOptions = {},
): PreviousNeighbourBacktestResult {
  const scope = options.scope ?? "mains-plus-supps";
  const drawSize = expectedDrawSizeForScope(scope);
  const normalizedDraws = normalizeDraws(draws, scope);
  const skippedDraws = Math.max(0, draws.length - normalizedDraws.length);

  const transitions: PreviousNeighbourTransition[] = [];
  for (let index = 1; index < normalizedDraws.length; index += 1) {
    const previous = normalizedDraws[index - 1];
    const current = normalizedDraws[index];
    transitions.push(buildTransitionFromNumbers(
      previous.date,
      current.date,
      previous.numbers,
      current.numbers,
      drawSize,
    ));
  }

  const observedTotalHits = transitions.reduce((sum, transition) => sum + transition.totalHitCount, 0);
  const expectedTotalHits = transitions.reduce((sum, transition) => sum + transition.expectedTotalHits, 0);
  const duplicateTargets = transitions.reduce((sum, transition) => sum + transition.duplicateTargetCount, 0);
  const singletonTargets = transitions.reduce((sum, transition) => sum + transition.singletonTargetCount, 0);
  const duplicateHits = transitions.reduce((sum, transition) => sum + transition.duplicateHitCount, 0);
  const singletonHits = transitions.reduce((sum, transition) => sum + transition.singletonHitCount, 0);
  const expectedDuplicateHits = transitions.reduce((sum, transition) => sum + transition.expectedDuplicateHits, 0);
  const expectedSingletonHits = transitions.reduce((sum, transition) => sum + transition.expectedSingletonHits, 0);
  const randomTargetHitRate = drawSize / LOTTERY_MAX;
  const candidateBacktestOptions: Required<PreviousNeighbourCandidateBacktestOptions> = {
    warmupPairs: normalizePositiveInteger(options.warmupPairs, DEFAULT_WARMUP_PAIRS, 1),
    candidatePoolSize: normalizePositiveInteger(options.candidatePoolSize, DEFAULT_CANDIDATE_POOL_SIZE, 20),
    selectedPerDraw: normalizePositiveInteger(options.selectedPerDraw, DEFAULT_SELECTED_PER_DRAW, 1),
    permutationIterations: normalizePositiveInteger(options.permutationIterations, DEFAULT_PERMUTATION_ITERATIONS, 10),
    seed: normalizePositiveInteger(options.seed, DEFAULT_SEED, 1),
  };

  const warnings: string[] = [];
  if (normalizedDraws.length < 2) {
    warnings.push("At least two valid draws are needed to analyse previous-draw ±1 neighbour behaviour.");
  }
  if (skippedDraws > 0) {
    warnings.push(`${skippedDraws} draw${skippedDraws === 1 ? "" : "s"} skipped because the selected scope did not contain unique valid numbers.`);
  }

  return {
    scope,
    drawSize,
    validDraws: normalizedDraws.length,
    skippedDraws,
    transitionCount: transitions.length,
    observedAverageHits: transitions.length > 0 ? round(observedTotalHits / transitions.length, 4) : 0,
    expectedAverageHits: transitions.length > 0 ? round(expectedTotalHits / transitions.length, 4) : 0,
    lift: expectedTotalHits > 0 ? round(observedTotalHits / expectedTotalHits, 4) : null,
    duplicateTargetHitRate: duplicateTargets > 0 ? round(duplicateHits / duplicateTargets, 4) : 0,
    singletonTargetHitRate: singletonTargets > 0 ? round(singletonHits / singletonTargets, 4) : 0,
    randomTargetHitRate: round(randomTargetHitRate, 4),
    duplicateLift: expectedDuplicateHits > 0 ? round(duplicateHits / expectedDuplicateHits, 4) : null,
    singletonLift: expectedSingletonHits > 0 ? round(singletonHits / expectedSingletonHits, 4) : null,
    totalHitDistribution: distributionFrom(transitions, (transition) => transition.totalHitCount),
    duplicateHitDistribution: distributionFrom(transitions, (transition) => transition.duplicateHitCount),
    duplicateTargetDistribution: distributionFrom(transitions, (transition) => transition.duplicateTargetCount),
    transitions,
    latestTransition: transitions[transitions.length - 1] ?? null,
    candidateBacktest: runCandidateBacktest(
      normalizedDraws,
      transitions,
      candidateBacktestOptions,
      drawSize,
    ),
    warnings,
  };
}
