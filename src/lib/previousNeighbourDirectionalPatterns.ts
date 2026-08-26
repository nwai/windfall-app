import type { Draw } from "../types";
import {
  buildPreviousNeighbourDirectionalTargetCloud,
  buildPreviousNeighbourShapeProfile,
  type PreviousNeighbourShapeOffsetLabel,
  type PreviousNeighbourShapeScope,
} from "./previousNeighbourShapeGuard";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";

export interface PreviousNeighbourDirectionalPatternTransition {
  previousDateLabel: string;
  currentDate: string;
  monthLabel: string;
  weekdayLabel: string;
  drawOrdinal: number;
  pattern: string;
  uniqueHitCount: number;
  duplicateHitCount: number;
  directionalHitTotal: number;
  targetCount: number;
  expectedUniqueHits: number;
}

export interface PreviousNeighbourDirectionalPatternDistributionRow {
  pattern: string;
  observed: number;
  percent: number;
}

export interface PreviousNeighbourDirectionalPatternGroupRow {
  label: string;
  transitions: number;
  averageUniqueHits: number;
  averageDirectionalHits: number;
  averageExpectedUniqueHits: number;
  lift: number | null;
  atLeastThreeRate: number;
  topPattern: string;
  topPatternCount: number;
}

export interface PreviousNeighbourDirectionalSelectionHelper {
  sourceDateLabel: string;
  targetCount: number;
  singletonTargets: number[];
  duplicateTargets: number[];
  targetsByOffset: Record<PreviousNeighbourShapeOffsetLabel, number[]>;
}

export interface PreviousNeighbourDirectionalPatternAnalysis {
  scope: PreviousNeighbourShapeScope;
  lookbackDraws: 1 | 2;
  validDraws: number;
  transitionCount: number;
  averageUniqueHits: number;
  averageExpectedUniqueHits: number;
  lift: number | null;
  averageDirectionalHits: number;
  topPatterns: PreviousNeighbourDirectionalPatternDistributionRow[];
  byDrawOrdinal: PreviousNeighbourDirectionalPatternGroupRow[];
  byWeekday: PreviousNeighbourDirectionalPatternGroupRow[];
  byMonth: PreviousNeighbourDirectionalPatternGroupRow[];
  latestTransition: PreviousNeighbourDirectionalPatternTransition | null;
  selectionHelper: PreviousNeighbourDirectionalSelectionHelper | null;
  warnings: string[];
}

export type PreviousNeighbourHandoffWinner = "hit-side" | "miss-side" | "tie";

export interface PreviousNeighbourHandoffRow {
  previousDate: string;
  hitDate: string;
  nextDate: string;
  hitSourceNumbers: number[];
  missedSourceCount: number;
  missedSourcePreview: number[];
  hitSideTargetCount: number;
  missSideTargetCount: number;
  hitSideNextHits: number[];
  missSideNextHits: number[];
  hitSideExclusiveTargetCount: number;
  missSideExclusiveTargetCount: number;
  hitSideExclusiveNextHits: number[];
  missSideExclusiveNextHits: number[];
  hitSourceExactRepeats: number[];
  delayedMissedTargets: number[];
  exclusiveRateDelta: number;
  cleanWinner: PreviousNeighbourHandoffWinner;
}

export interface PreviousNeighbourMissedSideHelper {
  previousDate: string;
  latestDate: string;
  oldNeighbourTargetCount: number;
  hitSourceNumbers: number[];
  missedSourceNumbers: number[];
  targetCount: number;
  singletonTargets: number[];
  duplicateTargets: number[];
  targetsByOffset: Record<PreviousNeighbourShapeOffsetLabel, number[]>;
}

export interface PreviousNeighbourHandoffAnalysis {
  scope: PreviousNeighbourShapeScope;
  validDraws: number;
  testedTriples: number;
  drawSize: 6 | 8;
  randomTargetHitRate: number;
  averageHitSourceCount: number;
  averageMissedSourceCount: number;
  averageHitSideNextHits: number;
  averageMissSideNextHits: number;
  hitSideTargetHitRate: number;
  missSideTargetHitRate: number;
  hitSideTargetLift: number | null;
  missSideTargetLift: number | null;
  hitSideExclusiveTargetHitRate: number;
  missSideExclusiveTargetHitRate: number;
  exclusiveRateDelta: number;
  hitSideWins: number;
  missSideWins: number;
  ties: number;
  signTestPValue: number;
  averageHitSourceExactRepeats: number;
  averageDelayedMissedTargets: number;
  currentMissedSideHelper: PreviousNeighbourMissedSideHelper | null;
  latestRows: PreviousNeighbourHandoffRow[];
  antiLookaheadNote: string;
  warnings: string[];
}

const LOTTERY_MIN = 1;
const LOTTERY_MAX = 45;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const isValidLotteryNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= LOTTERY_MIN &&
  value <= LOTTERY_MAX
);

const numbersForScope = (draw: Draw, scope: PreviousNeighbourShapeScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const uniqueSortedNumbers = (numbers: readonly number[]): number[] => (
  Array.from(new Set(numbers.filter(isValidLotteryNumber))).sort((left, right) => left - right)
);

const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

const expectedDrawSizeForScope = (scope: PreviousNeighbourShapeScope): 6 | 8 => (
  scope === "mains" ? 6 : 8
);

const validScopedDraws = (draws: readonly Draw[], scope: PreviousNeighbourShapeScope) => {
  const expectedSize = expectedDrawSizeForScope(scope);
  return sortDrawsChronologically([...draws])
    .map((draw, index) => {
      const numbers = uniqueSortedNumbers(numbersForScope(draw, scope));
      return { draw, index, numbers };
    })
    .filter((row) => row.numbers.length === expectedSize);
};

const dateForDraw = (draw: Draw): Date | null => {
  const epoch = parseDrawDateToEpoch(draw.date);
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  const date = new Date(epoch);
  return Number.isNaN(date.getTime()) ? null : date;
};

const monthLabelForDraw = (draw: Draw): string => {
  const date = dateForDraw(draw);
  if (!date) return "Unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const weekdayLabelForDraw = (draw: Draw): string => {
  const date = dateForDraw(draw);
  return date ? WEEKDAY_LABELS[date.getDay()] : "Unknown";
};

const drawOrdinals = (rows: ReturnType<typeof validScopedDraws>): number[] => {
  const monthCounts = new Map<string, number>();
  return rows.map((row) => {
    const label = monthLabelForDraw(row.draw);
    const next = (monthCounts.get(label) ?? 0) + 1;
    monthCounts.set(label, next);
    return next;
  });
};

const sourceDateLabel = (draws: readonly Draw[]): string => {
  if (draws.length === 0) return "none";
  if (draws.length === 1) return draws[0].date || "Unknown";
  return `${draws[0].date || "Unknown"}..${draws[draws.length - 1].date || "Unknown"}`;
};

const average = <T,>(items: readonly T[], getter: (item: T) => number): number => (
  items.length ? items.reduce((sum, item) => sum + getter(item), 0) / items.length : 0
);

const targetSetFromSources = (sources: readonly number[]): Set<number> => {
  if (sources.length === 0) return new Set<number>();
  const cloud = buildPreviousNeighbourDirectionalTargetCloud(uniqueSortedNumbers(sources));
  return new Set([...cloud.singletonTargets, ...cloud.duplicateTargets]);
};

const buildMissedSideHelper = (
  rows: ReturnType<typeof validScopedDraws>,
): PreviousNeighbourMissedSideHelper | null => {
  if (rows.length < 2) return null;
  const previous = rows[rows.length - 2];
  const latest = rows[rows.length - 1];
  const oldTargetSet = targetSetFromSources(previous.numbers);
  const latestSet = new Set(latest.numbers);
  const hitSourceNumbers = intersectWithSet(latest.numbers, oldTargetSet);
  const missedSourceNumbers = sortedFromSet(differenceSet(oldTargetSet, latestSet));
  const missedCloud = buildPreviousNeighbourDirectionalTargetCloud(missedSourceNumbers);

  return {
    previousDate: previous.draw.date || `Draw ${rows.length - 1}`,
    latestDate: latest.draw.date || `Draw ${rows.length}`,
    oldNeighbourTargetCount: oldTargetSet.size,
    hitSourceNumbers,
    missedSourceNumbers,
    targetCount: missedCloud.targetCount,
    singletonTargets: missedCloud.singletonTargets,
    duplicateTargets: missedCloud.duplicateTargets,
    targetsByOffset: missedCloud.targetsByOffset,
  };
};

const sortedFromSet = (set: ReadonlySet<number>): number[] => (
  Array.from(set).sort((left, right) => left - right)
);

const intersectWithSet = (numbers: readonly number[], set: ReadonlySet<number>): number[] => (
  uniqueSortedNumbers(numbers.filter((number) => set.has(number)))
);

const differenceSet = (left: ReadonlySet<number>, right: ReadonlySet<number>): Set<number> => {
  const output = new Set<number>();
  for (const value of left) {
    if (!right.has(value)) output.add(value);
  }
  return output;
};

const targetRate = (hitCount: number, targetCount: number): number => (
  targetCount > 0 ? hitCount / targetCount : 0
);

const twoSidedSignTestPValue = (positive: number, negative: number): number => {
  const trials = positive + negative;
  if (trials === 0) return 1;
  const smallerSide = Math.min(positive, negative);
  let probability = Math.pow(0.5, trials);
  let cumulative = probability;
  for (let k = 1; k <= smallerSide; k += 1) {
    probability *= (trials - k + 1) / k;
    cumulative += probability;
  }
  return Math.min(1, 2 * cumulative);
};

const patternDistribution = (
  transitions: readonly PreviousNeighbourDirectionalPatternTransition[],
  limit = 12,
): PreviousNeighbourDirectionalPatternDistributionRow[] => {
  const counts = new Map<string, number>();
  for (const transition of transitions) {
    counts.set(transition.pattern, (counts.get(transition.pattern) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([pattern, observed]) => ({
      pattern,
      observed,
      percent: transitions.length ? (observed / transitions.length) * 100 : 0,
    }));
};

const groupRows = (
  transitions: readonly PreviousNeighbourDirectionalPatternTransition[],
  labelFor: (transition: PreviousNeighbourDirectionalPatternTransition) => string,
  labelSorter?: (left: string, right: string) => number,
): PreviousNeighbourDirectionalPatternGroupRow[] => {
  const groups = new Map<string, PreviousNeighbourDirectionalPatternTransition[]>();
  for (const transition of transitions) {
    const label = labelFor(transition);
    groups.set(label, [...(groups.get(label) ?? []), transition]);
  }

  return Array.from(groups.entries())
    .map(([label, rows]) => {
      const top = patternDistribution(rows, 1)[0];
      const averageExpected = average(rows, (row) => row.expectedUniqueHits);
      const averageUnique = average(rows, (row) => row.uniqueHitCount);
      return {
        label,
        transitions: rows.length,
        averageUniqueHits: averageUnique,
        averageDirectionalHits: average(rows, (row) => row.directionalHitTotal),
        averageExpectedUniqueHits: averageExpected,
        lift: averageExpected > 0 ? averageUnique / averageExpected : null,
        atLeastThreeRate: rows.filter((row) => row.uniqueHitCount >= 3).length / rows.length,
        topPattern: top?.pattern ?? "none",
        topPatternCount: top?.observed ?? 0,
      };
    })
    .sort((left, right) => (
      labelSorter
        ? labelSorter(left.label, right.label)
        : left.label.localeCompare(right.label, undefined, { numeric: true })
    ));
};

export function analyzePreviousNeighbourDirectionalPatterns(
  draws: readonly Draw[],
  options: { scope?: PreviousNeighbourShapeScope; lookbackDraws?: 1 | 2 } = {},
): PreviousNeighbourDirectionalPatternAnalysis {
  const scope = options.scope ?? "mains-plus-supps";
  const lookbackDraws = options.lookbackDraws ?? 1;
  const drawSize = expectedDrawSizeForScope(scope);
  const rows = validScopedDraws(draws, scope);
  const ordinals = drawOrdinals(rows);
  const warnings: string[] = [];

  if (rows.length <= lookbackDraws) {
    warnings.push("Not enough valid real draws to build previous-draw directional neighbour diagnostics.");
  }

  const transitions: PreviousNeighbourDirectionalPatternTransition[] = [];
  for (let index = lookbackDraws; index < rows.length; index += 1) {
    const previousRows = rows.slice(index - lookbackDraws, index);
    const previousNumbers = uniqueSortedNumbers(previousRows.flatMap((row) => row.numbers));
    const current = rows[index];
    const profile = buildPreviousNeighbourShapeProfile(previousNumbers, current.numbers);

    transitions.push({
      previousDateLabel: sourceDateLabel(previousRows.map((row) => row.draw)),
      currentDate: current.draw.date || `Draw ${index + 1}`,
      monthLabel: monthLabelForDraw(current.draw),
      weekdayLabel: weekdayLabelForDraw(current.draw),
      drawOrdinal: ordinals[index],
      pattern: profile.directionalPattern,
      uniqueHitCount: profile.totalHits,
      duplicateHitCount: profile.duplicateHits,
      directionalHitTotal: profile.directionalHitTotal,
      targetCount: profile.targetCount,
      expectedUniqueHits: (profile.targetCount / 45) * drawSize,
    });
  }

  const latestSourceRows = rows.slice(Math.max(0, rows.length - lookbackDraws));
  const latestSourceNumbers = uniqueSortedNumbers(latestSourceRows.flatMap((row) => row.numbers));
  const cloud = latestSourceNumbers.length
    ? buildPreviousNeighbourDirectionalTargetCloud(latestSourceNumbers)
    : null;
  const averageExpected = average(transitions, (row) => row.expectedUniqueHits);
  const averageUnique = average(transitions, (row) => row.uniqueHitCount);

  return {
    scope,
    lookbackDraws,
    validDraws: rows.length,
    transitionCount: transitions.length,
    averageUniqueHits: averageUnique,
    averageExpectedUniqueHits: averageExpected,
    lift: averageExpected > 0 ? averageUnique / averageExpected : null,
    averageDirectionalHits: average(transitions, (row) => row.directionalHitTotal),
    topPatterns: patternDistribution(transitions),
    byDrawOrdinal: groupRows(transitions, (row) => `D${row.drawOrdinal}`, (left, right) => Number(left.slice(1)) - Number(right.slice(1))),
    byWeekday: groupRows(transitions, (row) => row.weekdayLabel, (left, right) => WEEKDAY_LABELS.indexOf(left as typeof WEEKDAY_LABELS[number]) - WEEKDAY_LABELS.indexOf(right as typeof WEEKDAY_LABELS[number])),
    byMonth: groupRows(transitions, (row) => row.monthLabel),
    latestTransition: transitions[transitions.length - 1] ?? null,
    selectionHelper: cloud ? {
      sourceDateLabel: sourceDateLabel(latestSourceRows.map((row) => row.draw)),
      targetCount: cloud.targetCount,
      singletonTargets: cloud.singletonTargets,
      duplicateTargets: cloud.duplicateTargets,
      targetsByOffset: cloud.targetsByOffset,
    } : null,
    warnings,
  };
}

export function analyzePreviousNeighbourHandoff(
  draws: readonly Draw[],
  options: { scope?: PreviousNeighbourShapeScope; latestRows?: number } = {},
): PreviousNeighbourHandoffAnalysis {
  const scope = options.scope ?? "mains-plus-supps";
  const drawSize = expectedDrawSizeForScope(scope);
  const rows = validScopedDraws(draws, scope);
  const warnings: string[] = [];
  const latestRowCount = Math.max(1, Math.floor(options.latestRows ?? 24));

  if (rows.length < 3) {
    warnings.push("At least three valid real draws are needed to test hit-side versus missed-side neighbour hand-off.");
  }

  const handoffRows: PreviousNeighbourHandoffRow[] = [];

  for (let index = 1; index < rows.length - 1; index += 1) {
    const previous = rows[index - 1];
    const hitDraw = rows[index];
    const next = rows[index + 1];
    const previousTargetSet = targetSetFromSources(previous.numbers);
    const hitDrawSet = new Set(hitDraw.numbers);
    const hitSourceNumbers = intersectWithSet(hitDraw.numbers, previousTargetSet);
    const missedSourceNumbers = sortedFromSet(differenceSet(previousTargetSet, hitDrawSet));
    const hitSideTargets = targetSetFromSources(hitSourceNumbers);
    const missSideTargets = targetSetFromSources(missedSourceNumbers);
    const hitSideExclusiveTargets = differenceSet(hitSideTargets, missSideTargets);
    const missSideExclusiveTargets = differenceSet(missSideTargets, hitSideTargets);
    const hitSideNextHits = intersectWithSet(next.numbers, hitSideTargets);
    const missSideNextHits = intersectWithSet(next.numbers, missSideTargets);
    const hitSideExclusiveNextHits = intersectWithSet(next.numbers, hitSideExclusiveTargets);
    const missSideExclusiveNextHits = intersectWithSet(next.numbers, missSideExclusiveTargets);
    const hitSourceSet = new Set(hitSourceNumbers);
    const missedSourceSet = new Set(missedSourceNumbers);
    const hitExclusiveRate = targetRate(hitSideExclusiveNextHits.length, hitSideExclusiveTargets.size);
    const missExclusiveRate = targetRate(missSideExclusiveNextHits.length, missSideExclusiveTargets.size);
    const exclusiveRateDelta = hitExclusiveRate - missExclusiveRate;

    handoffRows.push({
      previousDate: previous.draw.date || `Draw ${index}`,
      hitDate: hitDraw.draw.date || `Draw ${index + 1}`,
      nextDate: next.draw.date || `Draw ${index + 2}`,
      hitSourceNumbers,
      missedSourceCount: missedSourceNumbers.length,
      missedSourcePreview: missedSourceNumbers.slice(0, 12),
      hitSideTargetCount: hitSideTargets.size,
      missSideTargetCount: missSideTargets.size,
      hitSideNextHits,
      missSideNextHits,
      hitSideExclusiveTargetCount: hitSideExclusiveTargets.size,
      missSideExclusiveTargetCount: missSideExclusiveTargets.size,
      hitSideExclusiveNextHits,
      missSideExclusiveNextHits,
      hitSourceExactRepeats: intersectWithSet(next.numbers, hitSourceSet),
      delayedMissedTargets: intersectWithSet(next.numbers, missedSourceSet),
      exclusiveRateDelta,
      cleanWinner: exclusiveRateDelta > 0 ? "hit-side" : exclusiveRateDelta < 0 ? "miss-side" : "tie",
    });
  }

  const sum = (getter: (row: PreviousNeighbourHandoffRow) => number): number => (
    handoffRows.reduce((total, row) => total + getter(row), 0)
  );
  const hitSideTargetTotal = sum((row) => row.hitSideTargetCount);
  const missSideTargetTotal = sum((row) => row.missSideTargetCount);
  const hitSideHitTotal = sum((row) => row.hitSideNextHits.length);
  const missSideHitTotal = sum((row) => row.missSideNextHits.length);
  const hitExclusiveTargetTotal = sum((row) => row.hitSideExclusiveTargetCount);
  const missExclusiveTargetTotal = sum((row) => row.missSideExclusiveTargetCount);
  const hitExclusiveHitTotal = sum((row) => row.hitSideExclusiveNextHits.length);
  const missExclusiveHitTotal = sum((row) => row.missSideExclusiveNextHits.length);
  const hitSideWins = handoffRows.filter((row) => row.cleanWinner === "hit-side").length;
  const missSideWins = handoffRows.filter((row) => row.cleanWinner === "miss-side").length;
  const ties = handoffRows.length - hitSideWins - missSideWins;
  const randomTargetHitRate = drawSize / LOTTERY_MAX;
  const hitSideTargetHitRate = targetRate(hitSideHitTotal, hitSideTargetTotal);
  const missSideTargetHitRate = targetRate(missSideHitTotal, missSideTargetTotal);
  const hitSideExclusiveTargetHitRate = targetRate(hitExclusiveHitTotal, hitExclusiveTargetTotal);
  const missSideExclusiveTargetHitRate = targetRate(missExclusiveHitTotal, missExclusiveTargetTotal);
  const currentMissedSideHelper = buildMissedSideHelper(rows);

  return {
    scope,
    validDraws: rows.length,
    testedTriples: handoffRows.length,
    drawSize,
    randomTargetHitRate: round(randomTargetHitRate),
    averageHitSourceCount: round(average(handoffRows, (row) => row.hitSourceNumbers.length)),
    averageMissedSourceCount: round(average(handoffRows, (row) => row.missedSourceCount)),
    averageHitSideNextHits: round(average(handoffRows, (row) => row.hitSideNextHits.length)),
    averageMissSideNextHits: round(average(handoffRows, (row) => row.missSideNextHits.length)),
    hitSideTargetHitRate: round(hitSideTargetHitRate),
    missSideTargetHitRate: round(missSideTargetHitRate),
    hitSideTargetLift: randomTargetHitRate > 0 ? round(hitSideTargetHitRate / randomTargetHitRate) : null,
    missSideTargetLift: randomTargetHitRate > 0 ? round(missSideTargetHitRate / randomTargetHitRate) : null,
    hitSideExclusiveTargetHitRate: round(hitSideExclusiveTargetHitRate),
    missSideExclusiveTargetHitRate: round(missSideExclusiveTargetHitRate),
    exclusiveRateDelta: round(average(handoffRows, (row) => row.exclusiveRateDelta)),
    hitSideWins,
    missSideWins,
    ties,
    signTestPValue: twoSidedSignTestPValue(hitSideWins, missSideWins),
    averageHitSourceExactRepeats: round(average(handoffRows, (row) => row.hitSourceExactRepeats.length)),
    averageDelayedMissedTargets: round(average(handoffRows, (row) => row.delayedMissedTargets.length)),
    currentMissedSideHelper,
    latestRows: [...handoffRows].reverse().slice(0, latestRowCount),
    antiLookaheadNote: "For each A -> B -> C triple, A and B split the neighbour cloud into hit-side and missed-side sources; C is used only after that split to score the next draw.",
    warnings,
  };
}
