import type { Draw } from "../types";
import { sortDrawsChronologically } from "./recentDraws";

const MIN_NUMBER = 1;
const MAX_NUMBER = 45;
const MAIN_COUNT = 6;
const DEFAULT_MIN_TRAINING_DRAWS = 24;
const DEFAULT_MONTE_CARLO_ITERATIONS = 10_000;
const DEFAULT_STAKE = 1;
const DEFAULT_SEED = 20260608;
const EPSILON = 1e-12;

type StrategyKey = "compressed" | "simpleFrequency" | "random";

export interface PortfolioBacktestOptions {
  minTrainingDraws?: number;
  monteCarloIterations?: number;
  seed?: number;
  stakePerDraw?: number;
  prizeTable?: Partial<Record<number, number>>;
}

export interface PortfolioStrategyRecord {
  selection: number[];
  matches: number;
  prizeScore: number;
  netScore: number;
}

export interface PortfolioBacktestRecord {
  drawIndex: number;
  date: string;
  actual: number[];
  compressed: PortfolioStrategyRecord;
  simpleFrequency: PortfolioStrategyRecord;
  random: PortfolioStrategyRecord;
}

export interface PortfolioRiskMetrics {
  meanNetPerDraw: number;
  standardDeviation: number;
  downsideDeviation: number;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  calmar: number | null;
  finalEquity: number;
  totalReturnPct: number;
}

export interface PortfolioStrategySummary {
  label: string;
  totalPrizeScore: number;
  totalNetScore: number;
  meanPrizeScore: number;
  meanMatches: number;
  hitCounts: number[];
  hitRate3Plus: number;
  risk: PortfolioRiskMetrics;
  equityCurve: number[];
  drawdownCurve: number[];
}

export interface PortfolioBacktestResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  drawsEvaluated: number;
  minTrainingDraws: number;
  monteCarloIterations: number;
  prizeTable: Record<number, number>;
  stakePerDraw: number;
  records: PortfolioBacktestRecord[];
  strategies: Record<StrategyKey, PortfolioStrategySummary>;
  compressedVsSimple: {
    totalPrizeDelta: number;
    meanNetDelta: number;
    pValue: number;
    bootstrapMeanNetDeltaCI: [number, number];
  };
  monteCarlo: {
    iterations: number;
    compressedPValue: number;
    simpleFrequencyPValue: number;
    randomStrategyPValue: number;
    randomHistoryMeanPrizeScore: number;
  };
  methodology: string[];
}

interface StructuralProfile {
  oddCount: number;
  lowCount: number;
  sumBand: number;
  deltaBands: number[];
  decadeCounts: number[];
  mod3Counts: number[];
  endingCounts: number[];
}

interface StrategyScore {
  selection: number[];
  matches: number;
  prizeScore: number;
  netScore: number;
}

const DEFAULT_PRIZE_TABLE: Record<number, number> = {
  0: 0,
  1: 0,
  2: 0,
  3: 5,
  4: 50,
  5: 1000,
  6: 100000,
};

const emptyRisk: PortfolioRiskMetrics = {
  meanNetPerDraw: 0,
  standardDeviation: 0,
  downsideDeviation: 0,
  sharpe: null,
  sortino: null,
  maxDrawdown: 0,
  maxDrawdownPct: 0,
  calmar: null,
  finalEquity: 0,
  totalReturnPct: 0,
};

const emptySummary = (label: string): PortfolioStrategySummary => ({
  label,
  totalPrizeScore: 0,
  totalNetScore: 0,
  meanPrizeScore: 0,
  meanMatches: 0,
  hitCounts: Array.from({ length: MAIN_COUNT + 1 }, () => 0),
  hitRate3Plus: 0,
  risk: emptyRisk,
  equityCurve: [],
  drawdownCurve: [],
});

const emptyResult = (
  errors: string[],
  warnings: string[],
  options: Required<Pick<PortfolioBacktestOptions, "minTrainingDraws" | "monteCarloIterations" | "stakePerDraw">>,
  prizeTable: Record<number, number>,
): PortfolioBacktestResult => ({
  valid: errors.length === 0,
  errors,
  warnings,
  drawsEvaluated: 0,
  minTrainingDraws: options.minTrainingDraws,
  monteCarloIterations: options.monteCarloIterations,
  prizeTable,
  stakePerDraw: options.stakePerDraw,
  records: [],
  strategies: {
    compressed: emptySummary("Compressed structural pattern"),
    simpleFrequency: emptySummary("Simple historical frequency"),
    random: emptySummary("Seeded random ticket"),
  },
  compressedVsSimple: {
    totalPrizeDelta: 0,
    meanNetDelta: 0,
    pValue: 1,
    bootstrapMeanNetDeltaCI: [0, 0],
  },
  monteCarlo: {
    iterations: options.monteCarloIterations,
    compressedPValue: 1,
    simpleFrequencyPValue: 1,
    randomStrategyPValue: 1,
    randomHistoryMeanPrizeScore: 0,
  },
  methodology: buildMethodology(options.monteCarloIterations),
});

const normalizeOptions = (options: PortfolioBacktestOptions = {}) => ({
  minTrainingDraws: Math.max(2, Math.floor(options.minTrainingDraws ?? DEFAULT_MIN_TRAINING_DRAWS)),
  monteCarloIterations: Math.max(0, Math.min(50_000, Math.floor(options.monteCarloIterations ?? DEFAULT_MONTE_CARLO_ITERATIONS))),
  seed: Math.floor(options.seed ?? DEFAULT_SEED),
  stakePerDraw: Math.max(EPSILON, Number.isFinite(options.stakePerDraw) ? options.stakePerDraw ?? DEFAULT_STAKE : DEFAULT_STAKE),
});

const buildPrizeTable = (override: PortfolioBacktestOptions["prizeTable"]): Record<number, number> => {
  const table: Record<number, number> = {};
  for (let matches = 0; matches <= MAIN_COUNT; matches += 1) {
    const value = Number(override?.[matches] ?? DEFAULT_PRIZE_TABLE[matches]);
    table[matches] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_PRIZE_TABLE[matches];
  }
  return table;
};

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const sortedUniqueMain = (numbers: readonly number[]): number[] => (
  [...new Set(numbers)]
    .filter((value) => Number.isInteger(value) && value >= MIN_NUMBER && value <= MAX_NUMBER)
    .sort((left, right) => left - right)
);

export function validatePortfolioBacktestHistory(history: readonly Draw[]): string[] {
  const errors: string[] = [];
  history.forEach((draw, index) => {
    const rowLabel = `row ${index + 1}`;
    if (draw.isSimulated) {
      errors.push(`${rowLabel} is simulated; portfolio backtests require real historical draws only.`);
    }
    if (!draw.date || typeof draw.date !== "string") {
      errors.push(`${rowLabel} has no usable date; chronological walk-forward order would be ambiguous.`);
    }
    if (!Array.isArray(draw.main)) {
      errors.push(`${rowLabel} does not have a main-number array.`);
      return;
    }
    const validUnique = sortedUniqueMain(draw.main);
    if (draw.main.length !== MAIN_COUNT || validUnique.length !== MAIN_COUNT) {
      errors.push(`${rowLabel} must contain exactly six unique main numbers between 1 and 45.`);
    }
  });
  return errors;
}

const numberStats = (training: readonly Draw[]) => {
  const counts = Array.from({ length: MAX_NUMBER + 1 }, () => 0);
  const recency = Array.from({ length: MAX_NUMBER + 1 }, () => 0);
  const lastSeen = Array.from({ length: MAX_NUMBER + 1 }, () => -1);
  const halfLife = Math.max(6, Math.min(32, training.length / 2));

  training.forEach((draw, drawIndex) => {
    const age = training.length - 1 - drawIndex;
    const recencyWeight = Math.exp(-age / halfLife);
    for (const number of sortedUniqueMain(draw.main)) {
      counts[number] += 1;
      recency[number] += recencyWeight;
      lastSeen[number] = drawIndex;
    }
  });

  return { counts, recency, lastSeen };
};

export function selectSimpleFrequencyNumbers(training: readonly Draw[]): number[] {
  const stats = numberStats(training);
  return Array.from({ length: MAX_NUMBER }, (_, index) => index + 1)
    .sort((left, right) => (
      stats.counts[right] - stats.counts[left]
      || stats.lastSeen[right] - stats.lastSeen[left]
      || left - right
    ))
    .slice(0, MAIN_COUNT)
    .sort((left, right) => left - right);
}

const decadeBucket = (number: number): number => {
  if (number <= 9) return 0;
  if (number <= 19) return 1;
  if (number <= 29) return 2;
  if (number <= 39) return 3;
  return 4;
};

const profileForNumbers = (numbers: readonly number[]): StructuralProfile => {
  const sorted = sortedUniqueMain(numbers);
  const deltaBands: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const delta = sorted[index] - sorted[index - 1];
    deltaBands.push(delta <= 3 ? 0 : delta <= 7 ? 1 : 2);
  }

  const decadeCounts = Array.from({ length: 5 }, () => 0);
  const mod3Counts = Array.from({ length: 3 }, () => 0);
  const endingCounts = Array.from({ length: 10 }, () => 0);
  let oddCount = 0;
  let lowCount = 0;
  let sum = 0;

  for (const number of sorted) {
    if (number % 2 !== 0) oddCount += 1;
    if (number <= 22) lowCount += 1;
    sum += number;
    decadeCounts[decadeBucket(number)] += 1;
    mod3Counts[number % 3] += 1;
    endingCounts[number % 10] += 1;
  }

  return {
    oddCount,
    lowCount,
    sumBand: Math.floor(sum / 30),
    deltaBands,
    decadeCounts,
    mod3Counts,
    endingCounts,
  };
};

const profileForDraw = (draw: Draw): StructuralProfile => profileForNumbers(draw.main);

const structuralKey = (profile: StructuralProfile): string => (
  [
    `O${profile.oddCount}`,
    `L${profile.lowCount}`,
    `S${profile.sumBand}`,
    `D${profile.deltaBands.join("")}`,
    `Q${profile.decadeCounts.join("")}`,
    `M${profile.mod3Counts.join("")}`,
  ].join("|")
);

const l1Distance = (left: readonly number[], right: readonly number[]): number => {
  const length = Math.max(left.length, right.length);
  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    distance += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return distance;
};

const hammingDistance = (left: readonly number[], right: readonly number[]): number => {
  const length = Math.max(left.length, right.length);
  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    if ((left[index] ?? -1) !== (right[index] ?? -1)) distance += 1;
  }
  return distance;
};

const profileDistance = (left: StructuralProfile, right: StructuralProfile): number => (
  Math.abs(left.oddCount - right.oddCount) * 0.55
  + Math.abs(left.lowCount - right.lowCount) * 0.7
  + Math.abs(left.sumBand - right.sumBand) * 0.5
  + hammingDistance(left.deltaBands, right.deltaBands) * 0.45
  + l1Distance(left.decadeCounts, right.decadeCounts) * 0.22
  + l1Distance(left.mod3Counts, right.mod3Counts) * 0.16
  + l1Distance(left.endingCounts, right.endingCounts) * 0.04
);

const normalizeScores = (scores: readonly number[]): number[] => {
  const max = Math.max(...scores.slice(1), 0);
  if (max <= EPSILON) return scores.map(() => 0);
  return scores.map((score) => score / max);
};

const integerQuota = (weightedValues: readonly number[], totalWeight: number, total = MAIN_COUNT): number => {
  if (totalWeight <= EPSILON) return 0;
  return Math.max(0, Math.min(total, Math.round(weightedValues.reduce((sum, value) => sum + value, 0) / totalWeight)));
};

const allocateBucketQuotas = (weightedCounts: readonly number[], totalWeight: number, total = MAIN_COUNT): number[] => {
  if (totalWeight <= EPSILON) return Array.from({ length: weightedCounts.length }, () => 0);
  const raw = weightedCounts.map((count) => count / totalWeight);
  const quotas = raw.map((value) => Math.floor(value));
  let remaining = total - quotas.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const entry of order) {
    if (remaining <= 0) break;
    quotas[entry.index] += 1;
    remaining -= 1;
  }
  return quotas;
};

const countSelected = (numbers: readonly number[], predicate: (number: number) => boolean): number => (
  numbers.reduce((total, number) => total + (predicate(number) ? 1 : 0), 0)
);

const canAddWithQuotas = (
  selected: readonly number[],
  candidate: number,
  targetOdd: number,
  targetLow: number,
  targetDecades: readonly number[],
  enforceDecades: boolean,
): boolean => {
  if (selected.includes(candidate)) return false;
  const next = [...selected, candidate];
  if (countSelected(next, (number) => number % 2 !== 0) > targetOdd) return false;
  if (countSelected(next, (number) => number <= 22) > targetLow) return false;
  if (enforceDecades) {
    const bucket = decadeBucket(candidate);
    if (countSelected(next, (number) => decadeBucket(number) === bucket) > (targetDecades[bucket] ?? MAIN_COUNT)) {
      return false;
    }
  }

  const remainingSlots = MAIN_COUNT - next.length;
  const oddDeficit = targetOdd - countSelected(next, (number) => number % 2 !== 0);
  const lowDeficit = targetLow - countSelected(next, (number) => number <= 22);
  return oddDeficit <= remainingSlots && lowDeficit <= remainingSlots;
};

export function selectCompressedStructuralNumbers(training: readonly Draw[]): number[] {
  if (training.length < 2) return selectSimpleFrequencyNumbers(training);

  const stats = numberStats(training);
  const currentProfile = profileForDraw(training[training.length - 1]);
  const currentKey = structuralKey(currentProfile);
  const conditionalScores = Array.from({ length: MAX_NUMBER + 1 }, () => 0);
  const weightedOddTargets: number[] = [];
  const weightedLowTargets: number[] = [];
  const weightedDecadeTargets = Array.from({ length: 5 }, () => 0);
  let totalTransitionWeight = 0;

  for (let nextIndex = 1; nextIndex < training.length; nextIndex += 1) {
    const previousProfile = profileForDraw(training[nextIndex - 1]);
    const nextProfile = profileForDraw(training[nextIndex]);
    const distance = profileDistance(previousProfile, currentProfile);
    const exactStateBonus = structuralKey(previousProfile) === currentKey ? 2.25 : 1;
    const recencyWeight = 0.55 + 0.45 * (nextIndex / Math.max(1, training.length - 1));
    const weight = Math.exp(-distance) * exactStateBonus * recencyWeight;
    if (weight <= EPSILON) continue;

    totalTransitionWeight += weight;
    weightedOddTargets.push(nextProfile.oddCount * weight);
    weightedLowTargets.push(nextProfile.lowCount * weight);
    nextProfile.decadeCounts.forEach((count, bucket) => {
      weightedDecadeTargets[bucket] += count * weight;
    });
    for (const number of sortedUniqueMain(training[nextIndex].main)) {
      conditionalScores[number] += weight;
    }
  }

  if (totalTransitionWeight <= EPSILON) return selectSimpleFrequencyNumbers(training);

  const normalizedCounts = normalizeScores(stats.counts);
  const normalizedRecency = normalizeScores(stats.recency);
  const normalizedConditional = normalizeScores(conditionalScores);
  const rankedNumbers = Array.from({ length: MAX_NUMBER }, (_, index) => index + 1)
    .sort((left, right) => {
      const leftScore = normalizedConditional[left] * 0.48 + normalizedCounts[left] * 0.32 + normalizedRecency[left] * 0.2;
      const rightScore = normalizedConditional[right] * 0.48 + normalizedCounts[right] * 0.32 + normalizedRecency[right] * 0.2;
      return rightScore - leftScore || stats.lastSeen[right] - stats.lastSeen[left] || left - right;
    });

  const targetOdd = integerQuota(weightedOddTargets, totalTransitionWeight);
  const targetLow = integerQuota(weightedLowTargets, totalTransitionWeight);
  const targetDecades = allocateBucketQuotas(weightedDecadeTargets, totalTransitionWeight);
  const selected: number[] = [];

  for (const enforceDecades of [true, false]) {
    for (const number of rankedNumbers) {
      if (selected.length >= MAIN_COUNT) break;
      if (canAddWithQuotas(selected, number, targetOdd, targetLow, targetDecades, enforceDecades)) {
        selected.push(number);
      }
    }
    if (selected.length >= MAIN_COUNT) break;
  }

  for (const number of rankedNumbers) {
    if (selected.length >= MAIN_COUNT) break;
    if (!selected.includes(number)) selected.push(number);
  }

  return selected.slice(0, MAIN_COUNT).sort((left, right) => left - right);
}

const sampleSix = (rng: () => number): number[] => {
  const pool = Array.from({ length: MAX_NUMBER }, (_, index) => index + 1);
  for (let index = 0; index < MAIN_COUNT; index += 1) {
    const swapIndex = index + Math.floor(rng() * (pool.length - index));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, MAIN_COUNT).sort((left, right) => left - right);
};

const countMatches = (selection: readonly number[], actual: readonly number[]): number => {
  const actualSet = new Set(actual);
  return selection.reduce((total, number) => total + (actualSet.has(number) ? 1 : 0), 0);
};

const scoreSelection = (
  selection: readonly number[],
  actual: readonly number[],
  prizeTable: Record<number, number>,
  stakePerDraw: number,
): StrategyScore => {
  const normalizedSelection = sortedUniqueMain(selection).slice(0, MAIN_COUNT);
  const matches = countMatches(normalizedSelection, actual);
  const prizeScore = prizeTable[matches] ?? 0;
  return {
    selection: normalizedSelection,
    matches,
    prizeScore,
    netScore: prizeScore - stakePerDraw,
  };
};

const average = (values: readonly number[]): number => (
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
);

const standardDeviation = (values: readonly number[]): number => {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
};

const safeRatio = (numerator: number, denominator: number): number | null => {
  if (Math.abs(denominator) > EPSILON) return numerator / denominator;
  if (Math.abs(numerator) <= EPSILON) return 0;
  return numerator > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
};

const buildRiskMetrics = (netScores: readonly number[], stakePerDraw: number): {
  risk: PortfolioRiskMetrics;
  equityCurve: number[];
  drawdownCurve: number[];
} => {
  if (netScores.length === 0) {
    return { risk: emptyRisk, equityCurve: [], drawdownCurve: [] };
  }

  const initialEquity = Math.max(stakePerDraw * netScores.length, stakePerDraw);
  const equityCurve = [initialEquity];
  for (const net of netScores) {
    equityCurve.push(equityCurve[equityCurve.length - 1] + net);
  }

  let peak = equityCurve[0];
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const drawdownCurve = equityCurve.map((equity) => {
    peak = Math.max(peak, equity);
    const drawdown = Math.max(0, peak - equity);
    const drawdownPct = peak > EPSILON ? drawdown / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    return drawdownPct;
  });

  const meanNetPerDraw = average(netScores);
  const sd = standardDeviation(netScores);
  const downsideValues = netScores.map((value) => Math.min(0, value));
  const downsideDeviation = Math.sqrt(average(downsideValues.map((value) => value ** 2)));
  const finalEquity = equityCurve[equityCurve.length - 1];
  const totalReturnPct = initialEquity > EPSILON ? (finalEquity - initialEquity) / initialEquity : 0;

  return {
    equityCurve,
    drawdownCurve,
    risk: {
      meanNetPerDraw,
      standardDeviation: sd,
      downsideDeviation,
      sharpe: safeRatio(meanNetPerDraw, sd),
      sortino: safeRatio(meanNetPerDraw, downsideDeviation),
      maxDrawdown,
      maxDrawdownPct,
      calmar: maxDrawdownPct > EPSILON ? totalReturnPct / maxDrawdownPct : safeRatio(totalReturnPct, maxDrawdownPct),
      finalEquity,
      totalReturnPct,
    },
  };
};

const buildStrategySummary = (
  records: readonly PortfolioBacktestRecord[],
  key: StrategyKey,
  label: string,
  stakePerDraw: number,
): PortfolioStrategySummary => {
  if (records.length === 0) return emptySummary(label);
  const strategyRows = records.map((record) => record[key]);
  const prizeScores = strategyRows.map((row) => row.prizeScore);
  const netScores = strategyRows.map((row) => row.netScore);
  const matchCounts = strategyRows.map((row) => row.matches);
  const hitCounts = Array.from({ length: MAIN_COUNT + 1 }, () => 0);
  for (const matches of matchCounts) {
    hitCounts[matches] += 1;
  }

  const riskOutput = buildRiskMetrics(netScores, stakePerDraw);
  return {
    label,
    totalPrizeScore: prizeScores.reduce((sum, value) => sum + value, 0),
    totalNetScore: netScores.reduce((sum, value) => sum + value, 0),
    meanPrizeScore: average(prizeScores),
    meanMatches: average(matchCounts),
    hitCounts,
    hitRate3Plus: matchCounts.filter((matches) => matches >= 3).length / records.length,
    risk: riskOutput.risk,
    equityCurve: riskOutput.equityCurve,
    drawdownCurve: riskOutput.drawdownCurve,
  };
};

const quantile = (values: readonly number[], probability: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(probability * sorted.length)));
  return sorted[index];
};

const pairedSignFlipPValue = (
  perDrawDiff: readonly number[],
  iterations: number,
  rng: () => number,
): { pValue: number; ci: [number, number] } => {
  if (perDrawDiff.length === 0 || iterations <= 0) {
    return { pValue: 1, ci: [0, 0] };
  }

  const observedMean = average(perDrawDiff);
  if (observedMean <= 0) {
    const bootMeans = Array.from({ length: iterations }, () => {
      let sum = 0;
      for (let draw = 0; draw < perDrawDiff.length; draw += 1) {
        sum += perDrawDiff[Math.floor(rng() * perDrawDiff.length)];
      }
      return sum / perDrawDiff.length;
    });
    return { pValue: 1, ci: [quantile(bootMeans, 0.025), quantile(bootMeans, 0.975)] };
  }

  let atLeastObserved = 0;
  const bootMeans: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let signFlipSum = 0;
    let bootstrapSum = 0;
    for (let draw = 0; draw < perDrawDiff.length; draw += 1) {
      const value = perDrawDiff[draw];
      signFlipSum += (rng() < 0.5 ? value : -value);
      bootstrapSum += perDrawDiff[Math.floor(rng() * perDrawDiff.length)];
    }
    if (signFlipSum / perDrawDiff.length >= observedMean) atLeastObserved += 1;
    bootMeans.push(bootstrapSum / perDrawDiff.length);
  }

  return {
    pValue: (atLeastObserved + 1) / (iterations + 1),
    ci: [quantile(bootMeans, 0.025), quantile(bootMeans, 0.975)],
  };
};

const randomHistoryPValues = (
  records: readonly PortfolioBacktestRecord[],
  iterations: number,
  prizeTable: Record<number, number>,
  stakePerDraw: number,
  rng: () => number,
  observed: Record<StrategyKey, PortfolioStrategySummary>,
) => {
  if (records.length === 0 || iterations <= 0) {
    return {
      compressedPValue: 1,
      simpleFrequencyPValue: 1,
      randomStrategyPValue: 1,
      randomHistoryMeanPrizeScore: 0,
    };
  }

  let compressedAtLeast = 0;
  let simpleAtLeast = 0;
  let randomAtLeast = 0;
  let randomHistoryTotalPrize = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let compressedTotal = 0;
    let simpleTotal = 0;
    let randomTotal = 0;

    for (const record of records) {
      const randomActual = sampleSix(rng);
      compressedTotal += scoreSelection(record.compressed.selection, randomActual, prizeTable, stakePerDraw).prizeScore;
      simpleTotal += scoreSelection(record.simpleFrequency.selection, randomActual, prizeTable, stakePerDraw).prizeScore;
      randomTotal += scoreSelection(record.random.selection, randomActual, prizeTable, stakePerDraw).prizeScore;
    }

    randomHistoryTotalPrize += compressedTotal;
    if (compressedTotal >= observed.compressed.totalPrizeScore) compressedAtLeast += 1;
    if (simpleTotal >= observed.simpleFrequency.totalPrizeScore) simpleAtLeast += 1;
    if (randomTotal >= observed.random.totalPrizeScore) randomAtLeast += 1;
  }

  return {
    compressedPValue: (compressedAtLeast + 1) / (iterations + 1),
    simpleFrequencyPValue: (simpleAtLeast + 1) / (iterations + 1),
    randomStrategyPValue: (randomAtLeast + 1) / (iterations + 1),
    randomHistoryMeanPrizeScore: randomHistoryTotalPrize / iterations,
  };
};

function buildMethodology(iterations: number): string[] {
  return [
    "Walk-forward only: every evaluated draw is selected using draws strictly before it.",
    "Compressed strategy maps draws into structural states: deltas, odd/even, low/high, decade, modulo-3, and ending-digit counts.",
    "Simple baseline ranks individual main numbers by historical frequency up to the previous draw.",
    "Random baseline is a seeded six-number ticket per evaluated draw.",
    `Monte Carlo null uses ${iterations.toLocaleString()} random 6/45 histories against the same walk-forward selections.`,
    "Risk ratios use synthetic prize-score units and one unit staked per draw; they are diagnostics, not financial return claims.",
  ];
}

export function runPortfolioCompressionBacktest(
  history: readonly Draw[],
  options: PortfolioBacktestOptions = {},
): PortfolioBacktestResult {
  const normalizedOptions = normalizeOptions(options);
  const prizeTable = buildPrizeTable(options.prizeTable);
  const errors = validatePortfolioBacktestHistory(history);
  const warnings: string[] = [];

  if (errors.length > 0) {
    return emptyResult(errors, warnings, normalizedOptions, prizeTable);
  }

  const orderedHistory = sortDrawsChronologically([...history]);
  if (orderedHistory.length <= normalizedOptions.minTrainingDraws) {
    warnings.push("Not enough valid historical draws to reserve a training window and still evaluate out-of-sample draws.");
    return emptyResult([], warnings, normalizedOptions, prizeTable);
  }
  if (normalizedOptions.monteCarloIterations < DEFAULT_MONTE_CARLO_ITERATIONS) {
    warnings.push("Monte Carlo p-values are lower precision because fewer than 10,000 null histories were requested.");
  }

  const rng = seededRng(normalizedOptions.seed);
  const records: PortfolioBacktestRecord[] = [];

  for (let drawIndex = normalizedOptions.minTrainingDraws; drawIndex < orderedHistory.length; drawIndex += 1) {
    const training = orderedHistory.slice(0, drawIndex);
    const actual = sortedUniqueMain(orderedHistory[drawIndex].main);
    const compressedSelection = selectCompressedStructuralNumbers(training);
    const simpleSelection = selectSimpleFrequencyNumbers(training);
    const randomSelection = sampleSix(rng);

    records.push({
      drawIndex,
      date: orderedHistory[drawIndex].date,
      actual,
      compressed: scoreSelection(compressedSelection, actual, prizeTable, normalizedOptions.stakePerDraw),
      simpleFrequency: scoreSelection(simpleSelection, actual, prizeTable, normalizedOptions.stakePerDraw),
      random: scoreSelection(randomSelection, actual, prizeTable, normalizedOptions.stakePerDraw),
    });
  }

  const strategies = {
    compressed: buildStrategySummary(records, "compressed", "Compressed structural pattern", normalizedOptions.stakePerDraw),
    simpleFrequency: buildStrategySummary(records, "simpleFrequency", "Simple historical frequency", normalizedOptions.stakePerDraw),
    random: buildStrategySummary(records, "random", "Seeded random ticket", normalizedOptions.stakePerDraw),
  };
  const inferenceRng = seededRng(normalizedOptions.seed ^ 0x9E3779B9);
  const perDrawNetDiff = records.map((record) => record.compressed.netScore - record.simpleFrequency.netScore);
  const pairedTest = pairedSignFlipPValue(perDrawNetDiff, normalizedOptions.monteCarloIterations, inferenceRng);
  const randomNull = randomHistoryPValues(
    records,
    normalizedOptions.monteCarloIterations,
    prizeTable,
    normalizedOptions.stakePerDraw,
    inferenceRng,
    strategies,
  );

  return {
    valid: true,
    errors: [],
    warnings,
    drawsEvaluated: records.length,
    minTrainingDraws: normalizedOptions.minTrainingDraws,
    monteCarloIterations: normalizedOptions.monteCarloIterations,
    prizeTable,
    stakePerDraw: normalizedOptions.stakePerDraw,
    records,
    strategies,
    compressedVsSimple: {
      totalPrizeDelta: strategies.compressed.totalPrizeScore - strategies.simpleFrequency.totalPrizeScore,
      meanNetDelta: average(perDrawNetDiff),
      pValue: pairedTest.pValue,
      bootstrapMeanNetDeltaCI: pairedTest.ci,
    },
    monteCarlo: {
      iterations: normalizedOptions.monteCarloIterations,
      ...randomNull,
    },
    methodology: buildMethodology(normalizedOptions.monteCarloIterations),
  };
}
