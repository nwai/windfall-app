import type { Draw } from "../types";

export type OddEvenCadenceScope = "mains-plus-supps" | "mains";

export type OddEvenRegularityLabel =
  | "no observations"
  | "single observation"
  | "steady cadence"
  | "uneven cadence"
  | "limited evidence";

export interface OddEvenRatioCadenceOptions {
  scope?: OddEvenCadenceScope;
  recentWindow?: number;
  rarePercentThreshold?: number;
}

export interface OddEvenRatioTimelineRow {
  drawIndex: number;
  originalIndex: number;
  dateLabel: string;
  odd: number;
  even: number;
  ratio: string;
}

export interface OddEvenRatioCadenceRow {
  ratio: string;
  odd: number;
  even: number;
  count: number;
  percent: number;
  expectedPercent: number;
  expectedCount: number;
  observedMinusExpected: number;
  lastSeenIndex: number | null;
  lastSeenDate: string | null;
  currentGap: number;
  intervals: number[];
  meanGap: number | null;
  medianGap: number | null;
  longestGap: number | null;
  intervalCv: number | null;
  recentCount: number;
  isRare: boolean;
  isNeverSeen: boolean;
  regularityLabel: OddEvenRegularityLabel;
}

export interface OddEvenRatioCadenceResult {
  validDraws: number;
  skippedDraws: number;
  totalNumbers: 6 | 8;
  scope: OddEvenCadenceScope;
  recentWindow: number;
  rarePercentThreshold: number;
  timeline: OddEvenRatioTimelineRow[];
  ratios: OddEvenRatioCadenceRow[];
}

const ODD_COUNT = 23;
const EVEN_COUNT = 22;
const TOTAL_COUNT = 45;

const isValidNumber = (value: unknown): value is number => (
  typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 1 && value <= TOTAL_COUNT
);

const combination = (n: number, k: number): number => {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0;
  const effectiveK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= effectiveK; i += 1) {
    result = (result * (n - effectiveK + i)) / i;
  }
  return result;
};

export const oddEvenCombinationProbability = (odd: number, totalNumbers: number): number => {
  if (!Number.isInteger(odd) || !Number.isInteger(totalNumbers)) return 0;
  if (totalNumbers < 0 || totalNumbers > TOTAL_COUNT || odd < 0 || odd > totalNumbers) return 0;
  const even = totalNumbers - odd;
  return (
    combination(ODD_COUNT, odd) *
    combination(EVEN_COUNT, even)
  ) / combination(TOTAL_COUNT, totalNumbers);
};

const formatPercent = (value: number): number => Number(value.toFixed(2));

const normalizePositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.floor(numeric));
};

const normalizeThreshold = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(0, numeric);
};

const numbersForScope = (draw: Draw, scope: OddEvenCadenceScope): number[] => (
  scope === "mains"
    ? draw.main
    : [...draw.main, ...(draw.supp ?? [])]
);

const normalizeDrawNumbers = (
  draw: Draw,
  scope: OddEvenCadenceScope,
  expectedCount: number,
): number[] | null => {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const value of numbersForScope(draw, scope)) {
    if (!isValidNumber(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized.length === expectedCount ? normalized : null;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const mean = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const coefficientOfVariation = (values: number[], meanValue: number | null): number | null => {
  if (values.length === 0 || meanValue == null || meanValue === 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length;
  return Math.sqrt(variance) / meanValue;
};

const regularityLabelFor = (
  count: number,
  intervals: number[],
  intervalCv: number | null,
): OddEvenRegularityLabel => {
  if (count === 0) return "no observations";
  if (count === 1) return "single observation";
  if (intervals.length >= 3 && intervalCv != null && intervalCv <= 0.5) return "steady cadence";
  if (intervals.length >= 2 && intervalCv != null && intervalCv > 0.5) return "uneven cadence";
  return "limited evidence";
};

const ratioRows = (totalNumbers: 6 | 8): Array<{ ratio: string; odd: number; even: number }> => (
  Array.from({ length: totalNumbers + 1 }, (_, index) => {
    const odd = totalNumbers - index;
    const even = index;
    return { odd, even, ratio: `${odd}:${even}` };
  })
);

export function analyzeOddEvenRatioCadence(
  draws: Draw[],
  options: OddEvenRatioCadenceOptions = {},
): OddEvenRatioCadenceResult {
  const scope = options.scope ?? "mains-plus-supps";
  const totalNumbers: 6 | 8 = scope === "mains" ? 6 : 8;
  const rarePercentThreshold = normalizeThreshold(options.rarePercentThreshold ?? 5);

  const timeline: OddEvenRatioTimelineRow[] = [];
  let skippedDraws = 0;

  for (let originalIndex = 0; originalIndex < draws.length; originalIndex += 1) {
    const draw = draws[originalIndex];
    const normalized = normalizeDrawNumbers(draw, scope, totalNumbers);
    if (!normalized) {
      skippedDraws += 1;
      continue;
    }

    const odd = normalized.filter((number) => number % 2 !== 0).length;
    const even = totalNumbers - odd;
    timeline.push({
      drawIndex: timeline.length + 1,
      originalIndex,
      dateLabel: draw.date || `Draw #${originalIndex + 1}`,
      odd,
      even,
      ratio: `${odd}:${even}`,
    });
  }

  const validDraws = timeline.length;
  const recentWindow = Math.min(validDraws, normalizePositiveInteger(options.recentWindow ?? 50, 50));
  const recentStartIndex = Math.max(0, validDraws - recentWindow);
  const rows = ratioRows(totalNumbers).map(({ ratio, odd, even }) => {
    const occurrenceIndices = timeline
      .map((row, index) => (row.ratio === ratio ? index : -1))
      .filter((index) => index >= 0);
    const count = occurrenceIndices.length;
    const percent = validDraws > 0 ? formatPercent((100 * count) / validDraws) : 0;
    const expectedProbability = oddEvenCombinationProbability(odd, totalNumbers);
    const expectedPercent = formatPercent(expectedProbability * 100);
    const expectedCount = Number((expectedProbability * validDraws).toFixed(2));
    const intervals = occurrenceIndices.slice(1).map((index, offset) => index - occurrenceIndices[offset]);
    const meanGap = mean(intervals);
    const medianGap = median(intervals);
    const longestGap = intervals.length ? Math.max(...intervals) : null;
    const intervalCv = coefficientOfVariation(intervals, meanGap);
    const lastOccurrenceIndex = occurrenceIndices.length ? occurrenceIndices[occurrenceIndices.length - 1] : null;
    const lastSeen = lastOccurrenceIndex == null ? null : timeline[lastOccurrenceIndex];
    const recentCount = occurrenceIndices.filter((index) => index >= recentStartIndex).length;
    const isNeverSeen = count === 0;

    return {
      ratio,
      odd,
      even,
      count,
      percent,
      expectedPercent,
      expectedCount,
      observedMinusExpected: Number((count - expectedCount).toFixed(2)),
      lastSeenIndex: lastOccurrenceIndex == null ? null : lastOccurrenceIndex + 1,
      lastSeenDate: lastSeen?.dateLabel ?? null,
      currentGap: lastOccurrenceIndex == null ? validDraws : validDraws - 1 - lastOccurrenceIndex,
      intervals,
      meanGap: meanGap == null ? null : Number(meanGap.toFixed(2)),
      medianGap: medianGap == null ? null : Number(medianGap.toFixed(2)),
      longestGap,
      intervalCv: intervalCv == null ? null : Number(intervalCv.toFixed(3)),
      recentCount,
      isRare: isNeverSeen || percent <= rarePercentThreshold,
      isNeverSeen,
      regularityLabel: regularityLabelFor(count, intervals, intervalCv),
    };
  });

  return {
    validDraws,
    skippedDraws,
    totalNumbers,
    scope,
    recentWindow,
    rarePercentThreshold,
    timeline,
    ratios: rows,
  };
}
