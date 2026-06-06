import type { Draw } from "../types";

export const TOTAL_LOTTERY_NUMBERS = 45;
const TOTAL_ODD_NUMBERS = 23;
const DEFAULT_TOP_NUMBERS = 10;
const DEFAULT_TOP_PAIRS = 8;
const WILSON_Z_95 = 1.96;

export type UndrawnPatternMode = "mains" | "all";
export type InsightSeverity = "info" | "watch";

export interface AnalyzeUndrawnPatternsOptions {
  includeSupp: boolean;
  topNumbers?: number;
  topPairs?: number;
}

export interface UndrawnNumberStat {
  number: number;
  drawnCount: number;
  undrawnCount: number;
  absenceRate: number;
  expectedCount: number;
  residual: number;
  zScore: number;
  wilson95: [number, number];
}

export interface UndrawnGroupStat {
  label: string;
  low: number;
  high: number;
  size: number;
  average: number;
  expectedAverage: number;
  residualAverage: number;
  zScore: number;
  observedRange95: [number, number];
}

export interface UndrawnPairStat {
  numbers: [number, number];
  coUndrawnCount: number;
  expectedCount: number;
  lift: number;
  residual: number;
  zScore: number;
}

export interface UndrawnOddEvenStats {
  averageOdds: number;
  averageEvens: number;
  expectedAverageOdds: number;
  medianOdds: number;
  madOdds: number;
  observedOddsRange95: [number, number];
  oddsZScore: number;
}

export interface UndrawnPersistenceStats {
  transitions: number;
  medianOverlap: number;
  medianJaccard: number;
  expectedOverlap: number;
  overlapRange95: [number, number];
}

export interface UndrawnDataQuality {
  drawsRead: number;
  drawsWithInvalidNumbers: number;
  invalidNumberEntries: number;
  drawsWithDuplicateNumbers: number;
  duplicateNumberEntries: number;
  drawsWithShortSelection: number;
  drawsWithLongSelection: number;
}

export interface UndrawnInsight {
  title: string;
  detail: string;
  severity: InsightSeverity;
}

export interface UndrawnPatternSummary {
  draws: number;
  mode: UndrawnPatternMode;
  pickScope: string;
  expectedPickCount: number;
  meanSelected: number;
  meanUndrawn: number;
  medianUndrawn: number;
  undrawnRange95: [number, number];
}

export interface UndrawnPatternAnalysis {
  summary: UndrawnPatternSummary;
  coldNumbers: UndrawnNumberStat[];
  hotNumbers: UndrawnNumberStat[];
  groups: UndrawnGroupStat[];
  pairs: UndrawnPairStat[];
  oddEven: UndrawnOddEvenStats;
  persistence: UndrawnPersistenceStats;
  insights: UndrawnInsight[];
  quality: UndrawnDataQuality;
  caveats: string[];
}

interface NumberGroup {
  label: string;
  low: number;
  high: number;
}

interface CleanDraw {
  date: string;
  selected: Set<number>;
  undrawn: Set<number>;
}

const NUMBER_GROUPS: NumberGroup[] = [
  { label: "1-9", low: 1, high: 9 },
  { label: "10-18", low: 10, high: 18 },
  { label: "19-27", low: 19, high: 27 },
  { label: "28-36", low: 28, high: 36 },
  { label: "37-45", low: 37, high: 45 },
];

export const UNDRAWN_NUMBER_GROUPS = NUMBER_GROUPS.map((group) => ({ ...group }));

const isValidLotteryNumber = (value: number): boolean => (
  Number.isInteger(value) && value >= 1 && value <= TOTAL_LOTTERY_NUMBERS
);

const mean = (values: number[]): number => (
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length
);

const sortedNumbers = (values: number[]): number[] => [...values].sort((a, b) => a - b);

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = sortedNumbers(values);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const medianAbsoluteDeviation = (values: number[]): number => {
  if (values.length === 0) return 0;
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
};

const quantile = (values: number[], probability: number): number => {
  if (values.length === 0) return 0;
  const sorted = sortedNumbers(values);
  const clamped = Math.min(1, Math.max(0, probability));
  const index = clamped * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const quantileRange95 = (values: number[]): [number, number] => [
  quantile(values, 0.025),
  quantile(values, 0.975),
];

const safeZScore = (observed: number, expected: number, variance: number): number => {
  if (!Number.isFinite(variance) || variance <= 0) return 0;
  return (observed - expected) / Math.sqrt(variance);
};

const wilsonInterval = (successes: number, trials: number): [number, number] => {
  if (trials <= 0) return [0, 0];
  const p = successes / trials;
  const z2 = WILSON_Z_95 * WILSON_Z_95;
  const denominator = 1 + z2 / trials;
  const center = p + z2 / (2 * trials);
  const spread = WILSON_Z_95 * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return [
    Math.max(0, (center - spread) / denominator),
    Math.min(1, (center + spread) / denominator),
  ];
};

const hypergeometricVariance = (population: number, successes: number, draws: number): number => {
  if (population <= 1 || draws <= 0 || successes <= 0 || successes >= population) return 0;
  return draws
    * (successes / population)
    * (1 - successes / population)
    * ((population - draws) / (population - 1));
};

const pairKey = (a: number, b: number): string => `${a},${b}`;

const parsePairKey = (key: string): [number, number] => {
  const [a, b] = key.split(",").map(Number);
  return [a, b];
};

const countIntersection = (a: Set<number>, b: Set<number>): number => {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const value of smaller) {
    if (larger.has(value)) count += 1;
  }
  return count;
};

const cleanDraw = (
  draw: Draw,
  includeSupp: boolean,
): { clean: CleanDraw; invalidEntries: number; duplicateEntries: number } => {
  const source = includeSupp ? [...draw.main, ...draw.supp] : [...draw.main];
  const selected = new Set<number>();
  let invalidEntries = 0;
  let duplicateEntries = 0;

  for (const value of source) {
    if (!isValidLotteryNumber(value)) {
      invalidEntries += 1;
      continue;
    }
    if (selected.has(value)) {
      duplicateEntries += 1;
      continue;
    }
    selected.add(value);
  }

  const undrawn = new Set<number>();
  for (let number = 1; number <= TOTAL_LOTTERY_NUMBERS; number += 1) {
    if (!selected.has(number)) undrawn.add(number);
  }

  return {
    clean: { date: draw.date, selected, undrawn },
    invalidEntries,
    duplicateEntries,
  };
};

const emptyAnalysis = (includeSupp: boolean): UndrawnPatternAnalysis => {
  const mode = includeSupp ? "all" : "mains";
  const expectedPickCount = includeSupp ? 8 : 6;
  return {
    summary: {
      draws: 0,
      mode,
      pickScope: includeSupp ? "mains + supplementary" : "mains only",
      expectedPickCount,
      meanSelected: 0,
      meanUndrawn: 0,
      medianUndrawn: 0,
      undrawnRange95: [0, 0],
    },
    coldNumbers: [],
    hotNumbers: [],
    groups: NUMBER_GROUPS.map((group) => ({
      ...group,
      size: group.high - group.low + 1,
      average: 0,
      expectedAverage: 0,
      residualAverage: 0,
      zScore: 0,
      observedRange95: [0, 0],
    })),
    pairs: [],
    oddEven: {
      averageOdds: 0,
      averageEvens: 0,
      expectedAverageOdds: 0,
      medianOdds: 0,
      madOdds: 0,
      observedOddsRange95: [0, 0],
      oddsZScore: 0,
    },
    persistence: {
      transitions: 0,
      medianOverlap: 0,
      medianJaccard: 0,
      expectedOverlap: 0,
      overlapRange95: [0, 0],
    },
    insights: [],
    quality: {
      drawsRead: 0,
      drawsWithInvalidNumbers: 0,
      invalidNumberEntries: 0,
      drawsWithDuplicateNumbers: 0,
      duplicateNumberEntries: 0,
      drawsWithShortSelection: 0,
      drawsWithLongSelection: 0,
    },
    caveats: ["No draw history is available for undrawn-pattern analysis."],
  };
};

const buildInsights = (
  draws: number,
  coldNumbers: UndrawnNumberStat[],
  hotNumbers: UndrawnNumberStat[],
  groups: UndrawnGroupStat[],
  pairs: UndrawnPairStat[],
  oddEven: UndrawnOddEvenStats,
  persistence: UndrawnPersistenceStats,
): UndrawnInsight[] => {
  if (draws === 0) return [];

  const insights: UndrawnInsight[] = [];
  const strongestCold = coldNumbers[0];
  const strongestHot = hotNumbers[0];
  const strongestGroup = groups.reduce<UndrawnGroupStat | null>((best, group) => (
    best === null || Math.abs(group.zScore) > Math.abs(best.zScore) ? group : best
  ), null);
  const strongestPair = pairs[0];

  if (strongestCold) {
    insights.push({
      title: "Largest absence surplus",
      detail: `Number ${strongestCold.number} was undrawn ${strongestCold.undrawnCount}/${draws} times, ${strongestCold.residual.toFixed(1)} above the random baseline (z ${strongestCold.zScore.toFixed(2)}).`,
      severity: Math.abs(strongestCold.zScore) >= 1.96 ? "watch" : "info",
    });
  }

  if (strongestHot) {
    insights.push({
      title: "Largest absence deficit",
      detail: `Number ${strongestHot.number} was undrawn ${strongestHot.undrawnCount}/${draws} times, ${Math.abs(strongestHot.residual).toFixed(1)} below the random baseline (z ${strongestHot.zScore.toFixed(2)}).`,
      severity: Math.abs(strongestHot.zScore) >= 1.96 ? "watch" : "info",
    });
  }

  if (strongestGroup) {
    insights.push({
      title: "Strongest range deviation",
      detail: `${strongestGroup.label} averaged ${strongestGroup.average.toFixed(2)} undrawn numbers versus ${strongestGroup.expectedAverage.toFixed(2)} expected under the same draw sizes (z ${strongestGroup.zScore.toFixed(2)}).`,
      severity: Math.abs(strongestGroup.zScore) >= 1.96 ? "watch" : "info",
    });
  }

  insights.push({
    title: "Odd-number balance",
    detail: `Undrawn odd numbers averaged ${oddEven.averageOdds.toFixed(2)} versus ${oddEven.expectedAverageOdds.toFixed(2)} expected; the observed median was ${oddEven.medianOdds.toFixed(1)} with MAD ${oddEven.madOdds.toFixed(1)}.`,
    severity: Math.abs(oddEven.oddsZScore) >= 1.96 ? "watch" : "info",
  });

  if (strongestPair) {
    insights.push({
      title: "Most enriched co-absence pair",
      detail: `${strongestPair.numbers[0]}-${strongestPair.numbers[1]} was co-undrawn ${strongestPair.coUndrawnCount} times versus ${strongestPair.expectedCount.toFixed(1)} expected (lift ${strongestPair.lift.toFixed(2)}, z ${strongestPair.zScore.toFixed(2)}).`,
      severity: Math.abs(strongestPair.zScore) >= 1.96 ? "watch" : "info",
    });
  }

  if (persistence.transitions > 0) {
    insights.push({
      title: "Draw-to-draw persistence",
      detail: `Consecutive undrawn sets shared a median ${persistence.medianOverlap.toFixed(1)} numbers; the median Jaccard overlap was ${persistence.medianJaccard.toFixed(2)}.`,
      severity: "info",
    });
  }

  return insights;
};

export function analyzeUndrawnPatterns(
  history: Draw[],
  options: AnalyzeUndrawnPatternsOptions,
): UndrawnPatternAnalysis {
  const includeSupp = options.includeSupp;
  const topNumbers = Math.max(1, Math.floor(options.topNumbers ?? DEFAULT_TOP_NUMBERS));
  const topPairs = Math.max(1, Math.floor(options.topPairs ?? DEFAULT_TOP_PAIRS));
  const expectedPickCount = includeSupp ? 8 : 6;

  if (history.length === 0) return emptyAnalysis(includeSupp);

  const quality: UndrawnDataQuality = {
    drawsRead: history.length,
    drawsWithInvalidNumbers: 0,
    invalidNumberEntries: 0,
    drawsWithDuplicateNumbers: 0,
    duplicateNumberEntries: 0,
    drawsWithShortSelection: 0,
    drawsWithLongSelection: 0,
  };

  const cleaned = history.map((draw) => {
    const result = cleanDraw(draw, includeSupp);
    if (result.invalidEntries > 0) quality.drawsWithInvalidNumbers += 1;
    if (result.duplicateEntries > 0) quality.drawsWithDuplicateNumbers += 1;
    if (result.clean.selected.size < expectedPickCount) quality.drawsWithShortSelection += 1;
    if (result.clean.selected.size > expectedPickCount) quality.drawsWithLongSelection += 1;
    quality.invalidNumberEntries += result.invalidEntries;
    quality.duplicateNumberEntries += result.duplicateEntries;
    return result.clean;
  });

  const draws = cleaned.length;
  const selectedCounts = cleaned.map((draw) => draw.selected.size);
  const undrawnCounts = cleaned.map((draw) => draw.undrawn.size);
  const absenceCounts = Array.from({ length: TOTAL_LOTTERY_NUMBERS + 1 }, () => 0);
  const oddUndrawnCounts: number[] = [];
  const evenUndrawnCounts: number[] = [];
  const pairCounts = new Map<string, number>();

  let expectedAbsenceCount = 0;
  let absenceVariance = 0;
  let expectedPairCount = 0;
  let pairVariance = 0;
  let expectedOddTotal = 0;
  let oddVarianceTotal = 0;

  for (const draw of cleaned) {
    const selectedCount = draw.selected.size;
    const absenceProbability = (TOTAL_LOTTERY_NUMBERS - selectedCount) / TOTAL_LOTTERY_NUMBERS;
    const pairAbsenceProbability = selectedCount >= TOTAL_LOTTERY_NUMBERS - 1
      ? 0
      : ((TOTAL_LOTTERY_NUMBERS - selectedCount) * (TOTAL_LOTTERY_NUMBERS - selectedCount - 1))
        / (TOTAL_LOTTERY_NUMBERS * (TOTAL_LOTTERY_NUMBERS - 1));

    expectedAbsenceCount += absenceProbability;
    absenceVariance += absenceProbability * (1 - absenceProbability);
    expectedPairCount += pairAbsenceProbability;
    pairVariance += pairAbsenceProbability * (1 - pairAbsenceProbability);
    expectedOddTotal += TOTAL_ODD_NUMBERS * absenceProbability;
    oddVarianceTotal += hypergeometricVariance(TOTAL_LOTTERY_NUMBERS, TOTAL_ODD_NUMBERS, selectedCount);

    let oddCount = 0;
    let evenCount = 0;
    for (let number = 1; number <= TOTAL_LOTTERY_NUMBERS; number += 1) {
      if (!draw.undrawn.has(number)) continue;
      absenceCounts[number] += 1;
      if (number % 2 === 1) oddCount += 1;
      else evenCount += 1;
    }
    oddUndrawnCounts.push(oddCount);
    evenUndrawnCounts.push(evenCount);

    for (let a = 1; a < TOTAL_LOTTERY_NUMBERS; a += 1) {
      if (!draw.undrawn.has(a)) continue;
      for (let b = a + 1; b <= TOTAL_LOTTERY_NUMBERS; b += 1) {
        if (!draw.undrawn.has(b)) continue;
        const key = pairKey(a, b);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const allNumberStats: UndrawnNumberStat[] = Array.from({ length: TOTAL_LOTTERY_NUMBERS }, (_, index) => {
    const number = index + 1;
    const undrawnCount = absenceCounts[number];
    const expectedCount = expectedAbsenceCount;
    const residual = undrawnCount - expectedCount;
    return {
      number,
      drawnCount: draws - undrawnCount,
      undrawnCount,
      absenceRate: undrawnCount / draws,
      expectedCount,
      residual,
      zScore: safeZScore(undrawnCount, expectedCount, absenceVariance),
      wilson95: wilsonInterval(undrawnCount, draws),
    };
  });

  const coldNumbers = [...allNumberStats]
    .sort((a, b) => b.undrawnCount - a.undrawnCount || b.zScore - a.zScore || a.number - b.number)
    .slice(0, topNumbers);

  const hotNumbers = [...allNumberStats]
    .sort((a, b) => a.undrawnCount - b.undrawnCount || a.zScore - b.zScore || a.number - b.number)
    .slice(0, topNumbers);

  const groups: UndrawnGroupStat[] = NUMBER_GROUPS.map((group) => {
    const counts: number[] = [];
    let observedTotal = 0;
    let expectedTotal = 0;
    let varianceTotal = 0;
    const size = group.high - group.low + 1;

    for (const draw of cleaned) {
      let groupCount = 0;
      for (let number = group.low; number <= group.high; number += 1) {
        if (draw.undrawn.has(number)) groupCount += 1;
      }
      counts.push(groupCount);
      observedTotal += groupCount;
      expectedTotal += size * ((TOTAL_LOTTERY_NUMBERS - draw.selected.size) / TOTAL_LOTTERY_NUMBERS);
      varianceTotal += hypergeometricVariance(TOTAL_LOTTERY_NUMBERS, size, draw.selected.size);
    }

    const average = observedTotal / draws;
    const expectedAverage = expectedTotal / draws;
    return {
      ...group,
      size,
      average,
      expectedAverage,
      residualAverage: average - expectedAverage,
      zScore: safeZScore(observedTotal, expectedTotal, varianceTotal),
      observedRange95: quantileRange95(counts),
    };
  });

  const pairs = Array.from(pairCounts.entries())
    .map(([key, coUndrawnCount]): UndrawnPairStat => {
      const numbers = parsePairKey(key);
      const residual = coUndrawnCount - expectedPairCount;
      return {
        numbers,
        coUndrawnCount,
        expectedCount: expectedPairCount,
        lift: expectedPairCount > 0 ? coUndrawnCount / expectedPairCount : 0,
        residual,
        zScore: safeZScore(coUndrawnCount, expectedPairCount, pairVariance),
      };
    })
    .sort((a, b) => b.zScore - a.zScore || b.coUndrawnCount - a.coUndrawnCount || a.numbers[0] - b.numbers[0] || a.numbers[1] - b.numbers[1])
    .slice(0, topPairs);

  const totalObservedOdds = oddUndrawnCounts.reduce((total, count) => total + count, 0);
  const oddEven: UndrawnOddEvenStats = {
    averageOdds: mean(oddUndrawnCounts),
    averageEvens: mean(evenUndrawnCounts),
    expectedAverageOdds: expectedOddTotal / draws,
    medianOdds: median(oddUndrawnCounts),
    madOdds: medianAbsoluteDeviation(oddUndrawnCounts),
    observedOddsRange95: quantileRange95(oddUndrawnCounts),
    oddsZScore: safeZScore(totalObservedOdds, expectedOddTotal, oddVarianceTotal),
  };

  const overlaps: number[] = [];
  const jaccards: number[] = [];
  const expectedOverlaps: number[] = [];
  for (let index = 1; index < cleaned.length; index += 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const overlap = countIntersection(previous.undrawn, current.undrawn);
    const union = previous.undrawn.size + current.undrawn.size - overlap;
    overlaps.push(overlap);
    jaccards.push(union > 0 ? overlap / union : 0);
    expectedOverlaps.push(
      TOTAL_LOTTERY_NUMBERS
        * (previous.undrawn.size / TOTAL_LOTTERY_NUMBERS)
        * (current.undrawn.size / TOTAL_LOTTERY_NUMBERS),
    );
  }

  const persistence: UndrawnPersistenceStats = {
    transitions: overlaps.length,
    medianOverlap: median(overlaps),
    medianJaccard: median(jaccards),
    expectedOverlap: mean(expectedOverlaps),
    overlapRange95: quantileRange95(overlaps),
  };

  const caveats = ["Descriptive only: this panel reports observed absence structure and random-baseline deviations, not a claim that future lottery draws are predictable."];
  if (quality.drawsWithInvalidNumbers > 0 || quality.drawsWithDuplicateNumbers > 0) {
    caveats.push("Some draw rows contained invalid or duplicate numbers; those entries were ignored before analysis.");
  }
  if (quality.drawsWithShortSelection > 0 || quality.drawsWithLongSelection > 0) {
    caveats.push("Some rows did not contain the expected number of unique selections for the chosen mode; expected baselines were adjusted to each row's observed valid selection count.");
  }

  return {
    summary: {
      draws,
      mode: includeSupp ? "all" : "mains",
      pickScope: includeSupp ? "mains + supplementary" : "mains only",
      expectedPickCount,
      meanSelected: mean(selectedCounts),
      meanUndrawn: mean(undrawnCounts),
      medianUndrawn: median(undrawnCounts),
      undrawnRange95: quantileRange95(undrawnCounts),
    },
    coldNumbers,
    hotNumbers,
    groups,
    pairs,
    oddEven,
    persistence,
    insights: buildInsights(draws, coldNumbers, hotNumbers, groups, pairs, oddEven, persistence),
    quality,
    caveats,
  };
}
