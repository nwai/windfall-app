import type { Draw } from "../types";
import {
  buildPreviousNeighbourDirectionalTargetCloud,
  buildPreviousNeighbourShapeProfile,
  type PreviousNeighbourShapeOffsetLabel,
  type PreviousNeighbourShapeScope,
} from "./previousNeighbourShapeGuard";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

const LOTTERY_SIZE = 45;
const OFFSET_LABELS: readonly PreviousNeighbourShapeOffsetLabel[] = ["-2", "-1", "+1", "+2"];

export type PreviousNeighbourAtlasSampleQuality = "Broad" | "Limited" | "Thin";

export interface PreviousNeighbourAtlasTransition {
  previousDateLabel: string;
  currentDate: string;
  monthLabel: string;
  monthDrawCount: number;
  weekdayLabel: string;
  drawOrdinal: number;
  crossMonth: boolean;
  sourceNumbers: number[];
  currentNumbers: number[];
  targetNumbers: number[];
  hitNumbers: number[];
  targetCount: number;
  uniqueHitCount: number;
  expectedUniqueHits: number;
  duplicateHitCount: number;
  directionalHitTotal: number;
  directionalPattern: string;
  oddHitCount: number;
  evenHitCount: number;
  oneDigitHitCount: number;
  twoDigitHitCount: number;
  expectedOddHits: number;
  expectedEvenHits: number;
  expectedOneDigitHits: number;
  expectedTwoDigitHits: number;
}

export interface PreviousNeighbourAtlasCountCell {
  count: number;
  observed: number;
  rate: number;
}

export interface PreviousNeighbourAtlasOrdinalRow {
  drawOrdinal: number;
  label: string;
  trials: number;
  sampleQuality: PreviousNeighbourAtlasSampleQuality;
  countDistribution: PreviousNeighbourAtlasCountCell[];
  averageTargetCount: number;
  averageFieldCoverage: number;
  averageUniqueHits: number;
  averageExpectedUniqueHits: number;
  lift: number | null;
  atLeastOneRate: number;
  atLeastThreeRate: number;
  atLeastFourRate: number;
  oddHitCount: number;
  evenHitCount: number;
  oneDigitHitCount: number;
  twoDigitHitCount: number;
  expectedOddHits: number;
  expectedEvenHits: number;
  expectedOneDigitHits: number;
  expectedTwoDigitHits: number;
  topPattern: string;
  topPatternCount: number;
}

export interface PreviousNeighbourAtlasCloudSizeRow {
  drawOrdinal: number;
  drawLabel: string;
  bandMinimum: number;
  bandMaximum: number;
  bandLabel: string;
  trials: number;
  sampleQuality: PreviousNeighbourAtlasSampleQuality;
  averageTargetCount: number;
  averageFieldCoverage: number;
  averageUniqueHits: number;
  averageExpectedUniqueHits: number;
  averageExcessHits: number;
  excessHitsCiLow: number | null;
  excessHitsCiHigh: number | null;
  lift: number | null;
}

export interface PreviousNeighbourAtlasCompositionRow {
  key: "odd" | "even" | "one-digit" | "two-digit";
  label: string;
  observed: number;
  expected: number;
  observedShare: number;
  lift: number | null;
}

export interface PreviousNeighbourAtlasPatternRow {
  pattern: string;
  observed: number;
  rate: number;
}

export interface PreviousNeighbourAtlasPlanningCloud {
  sourceDateLabel: string;
  sourceNumbers: number[];
  targetNumbers: number[];
  singletonTargetNumbers: number[];
  duplicateTargetNumbers: number[];
  targetCount: number;
  singletonTargetCount: number;
  duplicateTargetCount: number;
  oddTargetCount: number;
  evenTargetCount: number;
  oneDigitTargetCount: number;
  twoDigitTargetCount: number;
  targetsByOffset: Record<PreviousNeighbourShapeOffsetLabel, number[]>;
}

export interface PreviousNeighbourCountShapeAtlasAnalysis {
  scope: PreviousNeighbourShapeScope;
  lookbackDraws: 1 | 2;
  drawSize: 6 | 8;
  validDraws: number;
  transitionCount: number;
  excludedTargetDraws: number;
  excludedTargetMonthLabels: string[];
  transitions: PreviousNeighbourAtlasTransition[];
  countDistribution: PreviousNeighbourAtlasCountCell[];
  byDrawOrdinal: PreviousNeighbourAtlasOrdinalRow[];
  byDrawOrdinalAndCloudSize: PreviousNeighbourAtlasCloudSizeRow[];
  parity: PreviousNeighbourAtlasCompositionRow[];
  digitWidth: PreviousNeighbourAtlasCompositionRow[];
  averageUniqueHits: number;
  averageExpectedUniqueHits: number;
  averageDirectionalHits: number;
  lift: number | null;
  directionalPatterns: PreviousNeighbourAtlasPatternRow[];
  planningCloud: PreviousNeighbourAtlasPlanningCloud | null;
  warnings: string[];
}

interface ValidDrawRow {
  draw: Draw;
  numbers: number[];
  monthLabel: string;
  weekdayLabel: string;
  drawOrdinal: number;
  monthDrawCount: number;
}

const isValidLotteryNumber = (value: unknown): value is number => (
  typeof value === "number"
  && Number.isInteger(value)
  && Number.isFinite(value)
  && value >= 1
  && value <= LOTTERY_SIZE
);

const uniqueSortedNumbers = (numbers: readonly number[]): number[] => (
  Array.from(new Set(numbers.filter(isValidLotteryNumber))).sort((left, right) => left - right)
);

const numbersForScope = (draw: Draw, scope: PreviousNeighbourShapeScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const expectedDrawSizeForScope = (scope: PreviousNeighbourShapeScope): 6 | 8 => (
  scope === "mains" ? 6 : 8
);

const dateForDraw = (draw: Draw): Date | null => {
  const epoch = parseDrawDateToEpoch(draw.date);
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  const date = new Date(epoch);
  return Number.isNaN(date.getTime()) ? null : date;
};

const monthLabelForDraw = (draw: Draw): string | null => {
  const date = dateForDraw(draw);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const weekdayLabelForDraw = (draw: Draw): string => {
  const date = dateForDraw(draw);
  return date ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()] : "Unknown";
};

const sourceDateLabel = (rows: readonly ValidDrawRow[]): string => {
  if (rows.length === 0) return "none";
  if (rows.length === 1) return rows[0].draw.date || "Unknown";
  return `${rows[0].draw.date || "Unknown"}..${rows[rows.length - 1].draw.date || "Unknown"}`;
};

const sum = <T,>(rows: readonly T[], getter: (row: T) => number): number => (
  rows.reduce((total, row) => total + getter(row), 0)
);

const average = <T,>(rows: readonly T[], getter: (row: T) => number): number => (
  rows.length ? sum(rows, getter) / rows.length : 0
);

const ratio = (observed: number, expected: number): number | null => (
  expected > 0 ? observed / expected : null
);

const meanConfidenceInterval = (
  values: readonly number[],
): { low: number | null; high: number | null } => {
  if (values.length < 2) return { low: null, high: null };
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + ((value - mean) ** 2), 0) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return { low: mean - margin, high: mean + margin };
};

const sampleQualityFor = (trials: number): PreviousNeighbourAtlasSampleQuality => {
  if (trials >= 20) return "Broad";
  if (trials >= 10) return "Limited";
  return "Thin";
};

const buildValidRows = (
  draws: readonly Draw[],
  scope: PreviousNeighbourShapeScope,
): ValidDrawRow[] => {
  const expectedSize = expectedDrawSizeForScope(scope);
  const chronological = sortDrawsChronologically([...draws])
    .map((draw) => ({
      draw,
      numbers: uniqueSortedNumbers(numbersForScope(draw, scope)),
      monthLabel: monthLabelForDraw(draw),
    }))
    .filter((row): row is { draw: Draw; numbers: number[]; monthLabel: string } => (
      row.numbers.length === expectedSize && Boolean(row.monthLabel)
    ));

  const monthDrawCounts = new Map<string, number>();
  for (const row of chronological) {
    monthDrawCounts.set(row.monthLabel, (monthDrawCounts.get(row.monthLabel) ?? 0) + 1);
  }

  const ordinals = new Map<string, number>();
  return chronological.map((row) => {
    const drawOrdinal = (ordinals.get(row.monthLabel) ?? 0) + 1;
    ordinals.set(row.monthLabel, drawOrdinal);
    return {
      ...row,
      weekdayLabel: weekdayLabelForDraw(row.draw),
      drawOrdinal,
      monthDrawCount: monthDrawCounts.get(row.monthLabel) ?? drawOrdinal,
    };
  });
};

const countDistribution = (
  transitions: readonly PreviousNeighbourAtlasTransition[],
  drawSize: 6 | 8,
): PreviousNeighbourAtlasCountCell[] => (
  Array.from({ length: drawSize + 1 }, (_, count) => {
    const observed = transitions.filter((row) => row.uniqueHitCount === count).length;
    return {
      count,
      observed,
      rate: transitions.length ? observed / transitions.length : 0,
    };
  })
);

const topPatternFor = (rows: readonly PreviousNeighbourAtlasTransition[]): { pattern: string; count: number } => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.directionalPattern, (counts.get(row.directionalPattern) ?? 0) + 1);
  const top = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  return top ? { pattern: top[0], count: top[1] } : { pattern: "none", count: 0 };
};

const patternDistribution = (
  transitions: readonly PreviousNeighbourAtlasTransition[],
): PreviousNeighbourAtlasPatternRow[] => {
  const counts = new Map<string, number>();
  for (const transition of transitions) {
    counts.set(transition.directionalPattern, (counts.get(transition.directionalPattern) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([pattern, observed]) => ({
      pattern,
      observed,
      rate: transitions.length ? observed / transitions.length : 0,
    }));
};

const buildOrdinalRows = (
  transitions: readonly PreviousNeighbourAtlasTransition[],
  drawSize: 6 | 8,
): PreviousNeighbourAtlasOrdinalRow[] => {
  const grouped = new Map<number, PreviousNeighbourAtlasTransition[]>();
  for (const transition of transitions) {
    grouped.set(transition.drawOrdinal, [...(grouped.get(transition.drawOrdinal) ?? []), transition]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([drawOrdinal, rows]) => {
      const observed = average(rows, (row) => row.uniqueHitCount);
      const expected = average(rows, (row) => row.expectedUniqueHits);
      const topPattern = topPatternFor(rows);
      return {
        drawOrdinal,
        label: `D${drawOrdinal}`,
        trials: rows.length,
        sampleQuality: sampleQualityFor(rows.length),
        countDistribution: countDistribution(rows, drawSize),
        averageTargetCount: average(rows, (row) => row.targetCount),
        averageFieldCoverage: average(rows, (row) => row.targetCount / LOTTERY_SIZE),
        averageUniqueHits: observed,
        averageExpectedUniqueHits: expected,
        lift: ratio(observed, expected),
        atLeastOneRate: rows.filter((row) => row.uniqueHitCount >= 1).length / rows.length,
        atLeastThreeRate: rows.filter((row) => row.uniqueHitCount >= 3).length / rows.length,
        atLeastFourRate: rows.filter((row) => row.uniqueHitCount >= 4).length / rows.length,
        oddHitCount: sum(rows, (row) => row.oddHitCount),
        evenHitCount: sum(rows, (row) => row.evenHitCount),
        oneDigitHitCount: sum(rows, (row) => row.oneDigitHitCount),
        twoDigitHitCount: sum(rows, (row) => row.twoDigitHitCount),
        expectedOddHits: sum(rows, (row) => row.expectedOddHits),
        expectedEvenHits: sum(rows, (row) => row.expectedEvenHits),
        expectedOneDigitHits: sum(rows, (row) => row.expectedOneDigitHits),
        expectedTwoDigitHits: sum(rows, (row) => row.expectedTwoDigitHits),
        topPattern: topPattern.pattern,
        topPatternCount: topPattern.count,
      };
    });
};

const cloudSizeBandFor = (targetCount: number): { minimum: number; maximum: number; label: string } => {
  if (targetCount <= 1) return { minimum: 0, maximum: 1, label: "0-1" };
  const minimum = 2 + (Math.floor((targetCount - 2) / 3) * 3);
  const maximum = Math.min(LOTTERY_SIZE, minimum + 2);
  return { minimum, maximum, label: `${minimum}-${maximum}` };
};

const buildOrdinalCloudSizeRows = (
  transitions: readonly PreviousNeighbourAtlasTransition[],
): PreviousNeighbourAtlasCloudSizeRow[] => {
  const grouped = new Map<string, {
    drawOrdinal: number;
    minimum: number;
    maximum: number;
    label: string;
    rows: PreviousNeighbourAtlasTransition[];
  }>();

  for (const transition of transitions) {
    const band = cloudSizeBandFor(transition.targetCount);
    const key = `${transition.drawOrdinal}:${band.minimum}`;
    const existing = grouped.get(key);
    if (existing) existing.rows.push(transition);
    else {
      grouped.set(key, {
        drawOrdinal: transition.drawOrdinal,
        minimum: band.minimum,
        maximum: band.maximum,
        label: band.label,
        rows: [transition],
      });
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.drawOrdinal - right.drawOrdinal || left.minimum - right.minimum)
    .map((group) => {
      const observed = average(group.rows, (row) => row.uniqueHitCount);
      const expected = average(group.rows, (row) => row.expectedUniqueHits);
      const deltas = group.rows.map((row) => row.uniqueHitCount - row.expectedUniqueHits);
      const interval = meanConfidenceInterval(deltas);
      return {
        drawOrdinal: group.drawOrdinal,
        drawLabel: `D${group.drawOrdinal}`,
        bandMinimum: group.minimum,
        bandMaximum: group.maximum,
        bandLabel: group.label,
        trials: group.rows.length,
        sampleQuality: sampleQualityFor(group.rows.length),
        averageTargetCount: average(group.rows, (row) => row.targetCount),
        averageFieldCoverage: average(group.rows, (row) => row.targetCount / LOTTERY_SIZE),
        averageUniqueHits: observed,
        averageExpectedUniqueHits: expected,
        averageExcessHits: observed - expected,
        excessHitsCiLow: interval.low,
        excessHitsCiHigh: interval.high,
        lift: ratio(observed, expected),
      };
    });
};

const compositionRows = (
  transitions: readonly PreviousNeighbourAtlasTransition[],
  definitions: ReadonlyArray<{
    key: PreviousNeighbourAtlasCompositionRow["key"];
    label: string;
    observed: (row: PreviousNeighbourAtlasTransition) => number;
    expected: (row: PreviousNeighbourAtlasTransition) => number;
  }>,
): PreviousNeighbourAtlasCompositionRow[] => {
  const totalObserved = sum(transitions, (row) => row.uniqueHitCount);
  return definitions.map((definition) => {
    const observed = sum(transitions, definition.observed);
    const expected = sum(transitions, definition.expected);
    return {
      key: definition.key,
      label: definition.label,
      observed,
      expected,
      observedShare: totalObserved ? observed / totalObserved : 0,
      lift: ratio(observed, expected),
    };
  });
};

const planningCloudFromRows = (
  rows: readonly ValidDrawRow[],
  lookbackDraws: 1 | 2,
): PreviousNeighbourAtlasPlanningCloud | null => {
  const sourceRows = rows.slice(Math.max(0, rows.length - lookbackDraws));
  if (sourceRows.length < lookbackDraws) return null;
  const sourceNumbers = uniqueSortedNumbers(sourceRows.flatMap((row) => row.numbers));
  const cloud = buildPreviousNeighbourDirectionalTargetCloud(sourceNumbers);
  const targetNumbers = uniqueSortedNumbers([...cloud.singletonTargets, ...cloud.duplicateTargets]);
  return {
    sourceDateLabel: sourceDateLabel(sourceRows),
    sourceNumbers,
    targetNumbers,
    singletonTargetNumbers: [...cloud.singletonTargets],
    duplicateTargetNumbers: [...cloud.duplicateTargets],
    targetCount: targetNumbers.length,
    singletonTargetCount: cloud.singletonTargets.length,
    duplicateTargetCount: cloud.duplicateTargets.length,
    oddTargetCount: targetNumbers.filter((number) => number % 2 !== 0).length,
    evenTargetCount: targetNumbers.filter((number) => number % 2 === 0).length,
    oneDigitTargetCount: targetNumbers.filter((number) => number < 10).length,
    twoDigitTargetCount: targetNumbers.filter((number) => number >= 10).length,
    targetsByOffset: cloud.targetsByOffset,
  };
};

export function analyzePreviousNeighbourCountShapeAtlas(
  draws: readonly Draw[],
  options: {
    scope?: PreviousNeighbourShapeScope;
    lookbackDraws?: 1 | 2;
    excludedTargetMonthLabels?: readonly string[];
  } = {},
): PreviousNeighbourCountShapeAtlasAnalysis {
  const scope = options.scope ?? "mains-plus-supps";
  const lookbackDraws = options.lookbackDraws ?? 1;
  const drawSize = expectedDrawSizeForScope(scope);
  const excludedTargetMonthLabels = Array.from(new Set(options.excludedTargetMonthLabels ?? [])).sort();
  const excludedTargetMonths = new Set(excludedTargetMonthLabels);
  const rows = buildValidRows(draws, scope);
  const transitions: PreviousNeighbourAtlasTransition[] = [];
  let excludedTargetDraws = 0;

  for (let index = lookbackDraws; index < rows.length; index += 1) {
    const current = rows[index];
    if (excludedTargetMonths.has(current.monthLabel)) {
      excludedTargetDraws += 1;
      continue;
    }

    const sourceRows = rows.slice(index - lookbackDraws, index);
    const sourceNumbers = uniqueSortedNumbers(sourceRows.flatMap((row) => row.numbers));
    const cloud = buildPreviousNeighbourDirectionalTargetCloud(sourceNumbers);
    const targetNumbers = uniqueSortedNumbers([...cloud.singletonTargets, ...cloud.duplicateTargets]);
    const profile = buildPreviousNeighbourShapeProfile(sourceNumbers, current.numbers);
    const hitNumbers = uniqueSortedNumbers([...profile.singletonHitNumbers, ...profile.duplicateHitNumbers]);
    const oddTargetCount = targetNumbers.filter((number) => number % 2 !== 0).length;
    const evenTargetCount = targetNumbers.length - oddTargetCount;
    const oneDigitTargetCount = targetNumbers.filter((number) => number < 10).length;
    const twoDigitTargetCount = targetNumbers.length - oneDigitTargetCount;
    const lastSource = sourceRows[sourceRows.length - 1];

    transitions.push({
      previousDateLabel: sourceDateLabel(sourceRows),
      currentDate: current.draw.date || `Draw ${index + 1}`,
      monthLabel: current.monthLabel,
      monthDrawCount: current.monthDrawCount,
      weekdayLabel: current.weekdayLabel,
      drawOrdinal: current.drawOrdinal,
      crossMonth: lastSource.monthLabel !== current.monthLabel,
      sourceNumbers,
      currentNumbers: current.numbers,
      targetNumbers,
      hitNumbers,
      targetCount: targetNumbers.length,
      uniqueHitCount: profile.totalHits,
      expectedUniqueHits: (targetNumbers.length / LOTTERY_SIZE) * drawSize,
      duplicateHitCount: profile.duplicateHits,
      directionalHitTotal: profile.directionalHitTotal,
      directionalPattern: profile.directionalPattern,
      oddHitCount: hitNumbers.filter((number) => number % 2 !== 0).length,
      evenHitCount: hitNumbers.filter((number) => number % 2 === 0).length,
      oneDigitHitCount: hitNumbers.filter((number) => number < 10).length,
      twoDigitHitCount: hitNumbers.filter((number) => number >= 10).length,
      expectedOddHits: (oddTargetCount / LOTTERY_SIZE) * drawSize,
      expectedEvenHits: (evenTargetCount / LOTTERY_SIZE) * drawSize,
      expectedOneDigitHits: (oneDigitTargetCount / LOTTERY_SIZE) * drawSize,
      expectedTwoDigitHits: (twoDigitTargetCount / LOTTERY_SIZE) * drawSize,
    });
  }

  const averageUniqueHits = average(transitions, (row) => row.uniqueHitCount);
  const averageExpectedUniqueHits = average(transitions, (row) => row.expectedUniqueHits);
  const warnings: string[] = [];
  if (rows.length <= lookbackDraws) warnings.push("Not enough valid real draws to construct a previous-neighbour transition ledger.");
  if (transitions.length > 0 && transitions.length < 20) warnings.push("This source has fewer than 20 tested transitions; treat grouped patterns as thin evidence.");

  return {
    scope,
    lookbackDraws,
    drawSize,
    validDraws: rows.length,
    transitionCount: transitions.length,
    excludedTargetDraws,
    excludedTargetMonthLabels,
    transitions,
    countDistribution: countDistribution(transitions, drawSize),
    byDrawOrdinal: buildOrdinalRows(transitions, drawSize),
    byDrawOrdinalAndCloudSize: buildOrdinalCloudSizeRows(transitions),
    parity: compositionRows(transitions, [
      { key: "odd", label: "Odd", observed: (row) => row.oddHitCount, expected: (row) => row.expectedOddHits },
      { key: "even", label: "Even", observed: (row) => row.evenHitCount, expected: (row) => row.expectedEvenHits },
    ]),
    digitWidth: compositionRows(transitions, [
      { key: "one-digit", label: "1 digit (1-9)", observed: (row) => row.oneDigitHitCount, expected: (row) => row.expectedOneDigitHits },
      { key: "two-digit", label: "2 digits (10-45)", observed: (row) => row.twoDigitHitCount, expected: (row) => row.expectedTwoDigitHits },
    ]),
    averageUniqueHits,
    averageExpectedUniqueHits,
    averageDirectionalHits: average(transitions, (row) => row.directionalHitTotal),
    lift: ratio(averageUniqueHits, averageExpectedUniqueHits),
    directionalPatterns: patternDistribution(transitions),
    planningCloud: planningCloudFromRows(rows, lookbackDraws),
    warnings,
  };
}

export const previousNeighbourAtlasOffsetLabels = OFFSET_LABELS;
