import type { Draw } from "../types";

const NUMBER_MIN = 1;
const NUMBER_MAX = 45;
const CORE_SIZE = 6;
const TOP_COMBO_COUNT = 5;

export type PortfolioComboCohesionStatus = "strong" | "mixed" | "thin";
export type PortfolioComboSwapDirection = "improve" | "neutral" | "weaker";

export interface PortfolioComboSummary {
  key: string;
  numbers: number[];
  size: 2 | 3;
  count: number;
  longestRun: number;
  currentStreak: number;
  meanGap: number | null;
  drawsSinceSeen: number | null;
  score: number;
}

export interface PortfolioComboCohesionSummary {
  status: PortfolioComboCohesionStatus;
  score: number;
  supportedPairs: number;
  totalPairs: number;
  supportedTriples: number;
  totalTriples: number;
  weakPairCount: number;
  weakPairs: string[];
  topPairs: PortfolioComboSummary[];
  topTriples: PortfolioComboSummary[];
}

export interface PortfolioComboSwapInsight {
  alternateNumber: number;
  removedNumber: number;
  direction: PortfolioComboSwapDirection;
  scoreDelta: number;
  pairDelta: number;
  tripleDelta: number;
  candidateScore: number;
  candidateNumbers: number[];
}

export interface PortfolioAdjacentComboEvidence {
  available: boolean;
  reason?: string;
  totalDraws: number;
  coreNumbers: number[];
  summary: PortfolioComboCohesionSummary | null;
  bestSwaps: PortfolioComboSwapInsight[];
}

interface PortfolioAdjacentComboOptions {
  includeSupp?: boolean;
  maxAlternates?: number;
}

interface ComboStats {
  key: string;
  numbers: number[];
  size: 2 | 3;
  indices: number[];
  count: number;
  longestRun: number;
  currentStreak: number;
  meanGap: number | null;
  drawsSinceSeen: number | null;
  score: number;
}

interface CandidateCohesion {
  score: number;
  pairScore: number;
  tripleScore: number;
  supportedPairs: number;
  totalPairs: number;
  supportedTriples: number;
  totalTriples: number;
  weakPairs: string[];
  pairCombos: PortfolioComboSummary[];
  tripleCombos: PortfolioComboSummary[];
}

const validNumber = (value: number): boolean => (
  Number.isInteger(value) && value >= NUMBER_MIN && value <= NUMBER_MAX
);

const normalizeNumbers = (numbers: readonly number[]): number[] => (
  Array.from(new Set(numbers.filter(validNumber))).sort((left, right) => left - right)
);

const parseDate = (date: string): number => {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : 0;
};

const chronologicalDraws = (history: readonly Draw[]): Draw[] => (
  [...history].sort((left, right) => parseDate(left.date) - parseDate(right.date))
);

const drawNumbers = (draw: Draw, includeSupp: boolean): number[] => (
  normalizeNumbers(includeSupp ? [...draw.main, ...draw.supp] : draw.main)
);

const comboKey = (numbers: readonly number[]): string => numbers.join("-");

const combinations = (numbers: readonly number[], size: 2 | 3): number[][] => {
  const output: number[][] = [];
  if (size === 2) {
    for (let left = 0; left < numbers.length; left += 1) {
      for (let right = left + 1; right < numbers.length; right += 1) {
        output.push([numbers[left], numbers[right]]);
      }
    }
    return output;
  }

  for (let left = 0; left < numbers.length; left += 1) {
    for (let middle = left + 1; middle < numbers.length; middle += 1) {
      for (let right = middle + 1; right < numbers.length; right += 1) {
        output.push([numbers[left], numbers[middle], numbers[right]]);
      }
    }
  }
  return output;
};

const mean = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const runStats = (
  indices: readonly number[],
  lastDrawIndex: number,
): Pick<ComboStats, "longestRun" | "currentStreak" | "meanGap" | "drawsSinceSeen"> => {
  if (indices.length === 0) {
    return {
      longestRun: 0,
      currentStreak: 0,
      meanGap: null,
      drawsSinceSeen: null,
    };
  }

  let longestRun = 1;
  let currentRun = 1;
  const gaps: number[] = [];

  for (let index = 1; index < indices.length; index += 1) {
    const gap = indices[index] - indices[index - 1];
    gaps.push(gap);
    if (gap === 1) {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const lastSeen = indices[indices.length - 1];
  let currentStreak = 0;
  for (let index = indices.length - 1; index >= 0; index -= 1) {
    const expected = lastDrawIndex - currentStreak;
    if (indices[index] !== expected) break;
    currentStreak += 1;
  }

  return {
    longestRun,
    currentStreak,
    meanGap: mean(gaps),
    drawsSinceSeen: lastDrawIndex - lastSeen,
  };
};

const scoreCombo = (
  stats: Pick<ComboStats, "count" | "longestRun" | "currentStreak" | "meanGap" | "drawsSinceSeen">,
  totalDraws: number,
): number => {
  if (totalDraws <= 0 || stats.count <= 0) return 0;
  const frequency = stats.count / totalDraws;
  const recency = stats.drawsSinceSeen === null ? 0 : 1 / (1 + stats.drawsSinceSeen);
  const streak = Math.min(1, stats.currentStreak / 3);
  const longest = Math.min(1, stats.longestRun / 4);
  const gapTightness = stats.meanGap === null ? 0 : 1 / Math.max(1, stats.meanGap);

  return Math.round((
    frequency * 45
    + recency * 25
    + streak * 15
    + longest * 10
    + gapTightness * 5
  ) * 10) / 10;
};

const buildComboStats = (
  history: readonly Draw[],
  includeSupp: boolean,
): {
  totalDraws: number;
  pairStats: Map<string, ComboStats>;
  tripleStats: Map<string, ComboStats>;
} => {
  const draws = chronologicalDraws(history);
  const pairIndices = new Map<string, { numbers: number[]; indices: number[] }>();
  const tripleIndices = new Map<string, { numbers: number[]; indices: number[] }>();

  draws.forEach((draw, drawIndex) => {
    const numbers = drawNumbers(draw, includeSupp);
    for (const combo of combinations(numbers, 2)) {
      const key = comboKey(combo);
      const existing = pairIndices.get(key) ?? { numbers: combo, indices: [] };
      existing.indices.push(drawIndex);
      pairIndices.set(key, existing);
    }
    for (const combo of combinations(numbers, 3)) {
      const key = comboKey(combo);
      const existing = tripleIndices.get(key) ?? { numbers: combo, indices: [] };
      existing.indices.push(drawIndex);
      tripleIndices.set(key, existing);
    }
  });

  const lastDrawIndex = draws.length - 1;
  const toStats = (
    source: Map<string, { numbers: number[]; indices: number[] }>,
    size: 2 | 3,
  ): Map<string, ComboStats> => {
    const output = new Map<string, ComboStats>();
    for (const [key, entry] of source) {
      const partialStats = runStats(entry.indices, lastDrawIndex);
      const stats: ComboStats = {
        key,
        numbers: entry.numbers,
        size,
        indices: entry.indices,
        count: entry.indices.length,
        ...partialStats,
        score: 0,
      };
      stats.score = scoreCombo(stats, draws.length);
      output.set(key, stats);
    }
    return output;
  };

  return {
    totalDraws: draws.length,
    pairStats: toStats(pairIndices, 2),
    tripleStats: toStats(tripleIndices, 3),
  };
};

const toComboSummary = (stats: ComboStats): PortfolioComboSummary => ({
  key: stats.key,
  numbers: stats.numbers,
  size: stats.size,
  count: stats.count,
  longestRun: stats.longestRun,
  currentStreak: stats.currentStreak,
  meanGap: stats.meanGap,
  drawsSinceSeen: stats.drawsSinceSeen,
  score: stats.score,
});

const comboSort = (left: PortfolioComboSummary, right: PortfolioComboSummary): number => (
  right.score - left.score
  || right.count - left.count
  || left.key.localeCompare(right.key, undefined, { numeric: true })
);

const evaluateCandidate = (
  numbers: readonly number[],
  pairStats: ReadonlyMap<string, ComboStats>,
  tripleStats: ReadonlyMap<string, ComboStats>,
): CandidateCohesion => {
  const normalized = normalizeNumbers(numbers);
  const pairKeys = combinations(normalized, 2);
  const tripleKeys = combinations(normalized, 3);
  const pairCombos = pairKeys
    .map((combo) => pairStats.get(comboKey(combo)))
    .filter((stats): stats is ComboStats => stats !== undefined)
    .map(toComboSummary)
    .sort(comboSort);
  const tripleCombos = tripleKeys
    .map((combo) => tripleStats.get(comboKey(combo)))
    .filter((stats): stats is ComboStats => stats !== undefined)
    .map(toComboSummary)
    .sort(comboSort);
  const weakPairs = pairKeys
    .map(comboKey)
    .filter((key) => !pairStats.has(key));

  const totalPairs = pairKeys.length;
  const totalTriples = tripleKeys.length;
  const pairCoverageScore = totalPairs > 0 ? (pairCombos.length / totalPairs) * 45 : 0;
  const tripleCoverageScore = totalTriples > 0 ? (tripleCombos.length / totalTriples) * 25 : 0;
  const pairStrengthScore = totalPairs > 0
    ? pairCombos.reduce((sum, combo) => sum + combo.score, 0) / totalPairs
    : 0;
  const tripleStrengthScore = totalTriples > 0
    ? tripleCombos.reduce((sum, combo) => sum + combo.score, 0) / totalTriples
    : 0;
  const score = Math.round(Math.min(
    100,
    pairCoverageScore
      + tripleCoverageScore
      + pairStrengthScore * 0.2
      + tripleStrengthScore * 0.1,
  ));

  return {
    score,
    pairScore: Math.round(pairCoverageScore + pairStrengthScore * 0.2),
    tripleScore: Math.round(tripleCoverageScore + tripleStrengthScore * 0.1),
    supportedPairs: pairCombos.length,
    totalPairs,
    supportedTriples: tripleCombos.length,
    totalTriples,
    weakPairs,
    pairCombos,
    tripleCombos,
  };
};

const statusForScore = (
  score: number,
  supportedPairs: number,
  totalPairs: number,
): PortfolioComboCohesionStatus => {
  if (score >= 70 && totalPairs > 0 && supportedPairs / totalPairs >= 0.75) return "strong";
  if (score >= 40) return "mixed";
  return "thin";
};

const directionForDelta = (delta: number): PortfolioComboSwapDirection => {
  if (delta >= 2) return "improve";
  if (delta <= -2) return "weaker";
  return "neutral";
};

const swapCandidate = (
  coreNumbers: readonly number[],
  removedNumber: number,
  alternateNumber: number,
): number[] => (
  normalizeNumbers(coreNumbers
    .filter((number) => number !== removedNumber)
    .concat(alternateNumber))
);

const buildSwapInsights = (
  coreNumbers: readonly number[],
  alternateNumbers: readonly number[],
  baseline: CandidateCohesion,
  pairStats: ReadonlyMap<string, ComboStats>,
  tripleStats: ReadonlyMap<string, ComboStats>,
  maxAlternates: number,
): PortfolioComboSwapInsight[] => {
  const insights: PortfolioComboSwapInsight[] = [];
  const normalizedAlternates = normalizeNumbers(alternateNumbers)
    .filter((number) => !coreNumbers.includes(number))
    .slice(0, maxAlternates);

  for (const alternateNumber of normalizedAlternates) {
    let best: PortfolioComboSwapInsight | null = null;
    for (const removedNumber of coreNumbers) {
      const candidateNumbers = swapCandidate(coreNumbers, removedNumber, alternateNumber);
      if (candidateNumbers.length !== CORE_SIZE) continue;
      const candidate = evaluateCandidate(candidateNumbers, pairStats, tripleStats);
      const scoreDelta = candidate.score - baseline.score;
      const insight: PortfolioComboSwapInsight = {
        alternateNumber,
        removedNumber,
        direction: directionForDelta(scoreDelta),
        scoreDelta,
        pairDelta: candidate.pairScore - baseline.pairScore,
        tripleDelta: candidate.tripleScore - baseline.tripleScore,
        candidateScore: candidate.score,
        candidateNumbers,
      };
      if (!best || insight.scoreDelta > best.scoreDelta || (
        insight.scoreDelta === best.scoreDelta && insight.removedNumber > best.removedNumber
      )) {
        best = insight;
      }
    }
    if (best) insights.push(best);
  }

  return insights.sort((left, right) => (
    right.scoreDelta - left.scoreDelta
    || left.alternateNumber - right.alternateNumber
  ));
};

export const buildPortfolioAdjacentComboEvidence = (
  history: readonly Draw[],
  coreNumbersInput: readonly number[],
  alternateNumbersInput: readonly number[],
  options: PortfolioAdjacentComboOptions = {},
): PortfolioAdjacentComboEvidence => {
  const coreNumbers = normalizeNumbers(coreNumbersInput);
  const includeSupp = options.includeSupp ?? false;
  const maxAlternates = Math.max(0, Math.floor(options.maxAlternates ?? 12));

  if (coreNumbers.length !== CORE_SIZE) {
    return {
      available: false,
      reason: "Needs a six-number core.",
      totalDraws: history.length,
      coreNumbers,
      summary: null,
      bestSwaps: [],
    };
  }
  if (history.length === 0) {
    return {
      available: false,
      reason: "Needs active draw history.",
      totalDraws: 0,
      coreNumbers,
      summary: null,
      bestSwaps: [],
    };
  }

  const { totalDraws, pairStats, tripleStats } = buildComboStats(history, includeSupp);
  const baseline = evaluateCandidate(coreNumbers, pairStats, tripleStats);
  const summary: PortfolioComboCohesionSummary = {
    status: statusForScore(baseline.score, baseline.supportedPairs, baseline.totalPairs),
    score: baseline.score,
    supportedPairs: baseline.supportedPairs,
    totalPairs: baseline.totalPairs,
    supportedTriples: baseline.supportedTriples,
    totalTriples: baseline.totalTriples,
    weakPairCount: baseline.weakPairs.length,
    weakPairs: baseline.weakPairs,
    topPairs: baseline.pairCombos.slice(0, TOP_COMBO_COUNT),
    topTriples: baseline.tripleCombos.slice(0, TOP_COMBO_COUNT),
  };

  return {
    available: true,
    totalDraws,
    coreNumbers,
    summary,
    bestSwaps: buildSwapInsights(
      coreNumbers,
      alternateNumbersInput,
      baseline,
      pairStats,
      tripleStats,
      maxAlternates,
    ),
  };
};
