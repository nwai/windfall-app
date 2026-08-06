import type { Draw } from "../types";
import { buildPlanningDrawContext } from "./planningDrawContext";
import { parseDrawDateToEpoch, sortDrawsChronologically } from "./recentDraws";
import type { MonthlyBucketKey } from "./monthlyDrawSummary";

export const LATEST_NEIGHBOUR_SUPPORT_TRACE_TAG = "LD±1";

type TerminalCoordinationDigit = 0 | 5;

export interface LatestNeighbourMonthlyBucketSets {
  undrawn: Set<number>;
  times1: Set<number>;
  times2: Set<number>;
  times3: Set<number>;
  times4: Set<number>;
  times5: Set<number>;
  times6: Set<number>;
  times7: Set<number>;
  times8: Set<number>;
}

export interface LatestNeighbourSupportOptions {
  enabled?: boolean;
  recentWindow?: number;
  maxRecentConsecutiveHits?: number;
  droughtDisqualifyThreshold?: number;
  supportBoostFactor?: number;
  terminalRuleActive?: Partial<Record<TerminalCoordinationDigit, boolean>>;
  excludedNumbers?: readonly number[];
  planningLastDrawOverride?: boolean;
  planningNow?: Date | string;
}

export interface LatestNeighbourSupportTarget {
  number: number;
  terminalDigit: number;
  sourceNumbers: number[];
  offsets: Array<-1 | 1>;
  recentConsecutiveHits: number;
  droughtLength: number;
  bucketLabel: string | null;
  terminalBucketLabels: string[];
  sameTerminalUndrawnNumbers: number[];
  score: number;
  notes: string[];
}

export interface LatestNeighbourSupportDisqualification {
  number: number;
  reason: string;
}

export interface LatestNeighbourSupportAnalysis {
  enabled: boolean;
  active: boolean;
  latestDrawDate: string | null;
  latestDrawNumbers: number[];
  targetNumbers: number[];
  targets: LatestNeighbourSupportTarget[];
  disqualified: LatestNeighbourSupportDisqualification[];
  warnings: string[];
  recentWindow: number;
  maxRecentConsecutiveHits: number;
  droughtDisqualifyThreshold: number;
  supportBoostFactor: number;
  isPlanningLastDraw: boolean;
  traceSummary: string;
}

const LOTTERY_MIN = 1;
const LOTTERY_MAX = 45;
const DEFAULT_RECENT_WINDOW = 10;
const DEFAULT_MAX_RECENT_CONSECUTIVE_HITS = 7;
const DEFAULT_DROUGHT_DISQUALIFY_THRESHOLD = 6;
const DEFAULT_SUPPORT_BOOST_FACTOR = 3;
const BUCKET_KEYS: MonthlyBucketKey[] = [
  "undrawn",
  "times1",
  "times2",
  "times3",
  "times4",
  "times5",
  "times6",
  "times7",
  "times8",
];
const BUCKET_LABELS: Record<MonthlyBucketKey, string> = {
  undrawn: "0x",
  times1: "1x",
  times2: "2x",
  times3: "3x",
  times4: "4x",
  times5: "5x",
  times6: "6x",
  times7: "7x",
  times8: "8x+",
};

const isValidLotteryNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= LOTTERY_MIN &&
  value <= LOTTERY_MAX
);

const numbersForDraw = (draw: Draw | null | undefined): number[] => {
  if (!draw) return [];
  const unique = new Set<number>();
  for (const number of [...(draw.main ?? []), ...(draw.supp ?? [])]) {
    if (isValidLotteryNumber(number)) unique.add(number);
  }
  return [...unique].sort((left, right) => left - right);
};

const numberAppearsInDraw = (draw: Draw, number: number): boolean => (
  (draw.main ?? []).includes(number) || (draw.supp ?? []).includes(number)
);

const normalizePositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.floor(numeric));
};

const normalizeNonNegativeInteger = (value: unknown, fallback: number): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
};

const normalizeBoostFactor = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SUPPORT_BOOST_FACTOR;
  return Math.max(1, Math.min(10, numeric));
};

const monthLabelForEpoch = (epoch: number): string | null => {
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  const date = new Date(epoch);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const countMatchingWeekdaysInMonth = (monthLabel: string, weekdays: ReadonlySet<number>): number | null => {
  const [yearRaw, monthRaw] = monthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12 || weekdays.size === 0) return null;

  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) break;
    if (weekdays.has(date.getDay())) count += 1;
  }
  return count > 0 ? count : null;
};

const inferExpectedDrawCountForLatestMonth = (history: Draw[], latestDraw: Draw): number | null => {
  const latestEpoch = parseDrawDateToEpoch(latestDraw.date);
  const latestMonthLabel = monthLabelForEpoch(latestEpoch);
  if (!latestMonthLabel) return null;

  const dated = history
    .map((draw) => ({ draw, epoch: parseDrawDateToEpoch(draw.date) }))
    .filter((item) => Number.isFinite(item.epoch) && item.epoch > 0);
  const latestMonthDraws = dated.filter((item) => monthLabelForEpoch(item.epoch) === latestMonthLabel);
  const weekdaySource = latestMonthDraws.length >= 3 ? latestMonthDraws : dated.slice(-30);
  const weekdays = new Set<number>();
  for (const item of weekdaySource) {
    const date = new Date(item.epoch);
    if (!Number.isNaN(date.getTime())) weekdays.add(date.getDay());
  }
  return countMatchingWeekdaysInMonth(latestMonthLabel, weekdays);
};

const isPlanningLastDraw = (
  history: Draw[],
  latestDraw: Draw,
  override: boolean | undefined,
  planningNow: Date | string | undefined,
): boolean => {
  if (typeof override === "boolean") return override;
  if (!latestDraw.date) return false;
  return buildPlanningDrawContext(history, { now: planningNow }).isPlanningLastDraw;
};

const trailingHitStreak = (chronologicalHistory: Draw[], number: number, recentWindow: number): number => {
  let streak = 0;
  const start = Math.max(0, chronologicalHistory.length - recentWindow);
  for (let index = chronologicalHistory.length - 1; index >= start; index -= 1) {
    if (!numberAppearsInDraw(chronologicalHistory[index], number)) break;
    streak += 1;
  }
  return streak;
};

const currentDroughtLength = (chronologicalHistory: Draw[], number: number): number => {
  let drought = 0;
  for (let index = chronologicalHistory.length - 1; index >= 0; index -= 1) {
    if (numberAppearsInDraw(chronologicalHistory[index], number)) return drought;
    drought += 1;
  }
  return chronologicalHistory.length;
};

const bucketLabelForNumber = (
  number: number,
  buckets: LatestNeighbourMonthlyBucketSets | null | undefined,
): string | null => {
  if (!buckets) return null;
  for (const key of BUCKET_KEYS) {
    if (buckets[key].has(number)) return BUCKET_LABELS[key];
  }
  return null;
};

const terminalBucketLabelsForNumber = (
  number: number,
  buckets: LatestNeighbourMonthlyBucketSets | null | undefined,
): string[] => {
  if (!buckets) return [];
  const digit = number % 10;
  const labels = new Set<string>();
  for (let candidate = LOTTERY_MIN; candidate <= LOTTERY_MAX; candidate += 1) {
    if (candidate % 10 !== digit) continue;
    const label = bucketLabelForNumber(candidate, buckets);
    if (label) labels.add(label);
  }
  return [...labels].sort((left, right) => {
    const leftIndex = Object.values(BUCKET_LABELS).indexOf(left);
    const rightIndex = Object.values(BUCKET_LABELS).indexOf(right);
    return leftIndex - rightIndex;
  });
};

const sameTerminalUndrawn = (
  number: number,
  buckets: LatestNeighbourMonthlyBucketSets | null | undefined,
): number[] => {
  if (!buckets) return [];
  const digit = number % 10;
  return [...buckets.undrawn].filter((candidate) => candidate % 10 === digit).sort((left, right) => left - right);
};

const emptyAnalysis = (
  options: Required<Pick<LatestNeighbourSupportAnalysis, "recentWindow" | "maxRecentConsecutiveHits" | "droughtDisqualifyThreshold" | "supportBoostFactor">>,
  enabled: boolean,
): LatestNeighbourSupportAnalysis => ({
  enabled,
  active: false,
  latestDrawDate: null,
  latestDrawNumbers: [],
  targetNumbers: [],
  targets: [],
  disqualified: [],
  warnings: [],
  recentWindow: options.recentWindow,
  maxRecentConsecutiveHits: options.maxRecentConsecutiveHits,
  droughtDisqualifyThreshold: options.droughtDisqualifyThreshold,
  supportBoostFactor: options.supportBoostFactor,
  isPlanningLastDraw: false,
  traceSummary: `${LATEST_NEIGHBOUR_SUPPORT_TRACE_TAG} ${enabled ? "skipped: no usable latest draw." : "OFF"}`,
});

export function analyzeLatestNeighbourSupport(
  history: Draw[],
  monthlyBuckets?: LatestNeighbourMonthlyBucketSets | null,
  options: LatestNeighbourSupportOptions = {},
): LatestNeighbourSupportAnalysis {
  const normalizedOptions = {
    recentWindow: normalizePositiveInteger(options.recentWindow, DEFAULT_RECENT_WINDOW),
    maxRecentConsecutiveHits: normalizeNonNegativeInteger(options.maxRecentConsecutiveHits, DEFAULT_MAX_RECENT_CONSECUTIVE_HITS),
    droughtDisqualifyThreshold: normalizeNonNegativeInteger(options.droughtDisqualifyThreshold, DEFAULT_DROUGHT_DISQUALIFY_THRESHOLD),
    supportBoostFactor: normalizeBoostFactor(options.supportBoostFactor),
  };
  const enabled = !!options.enabled;
  if (!enabled) return emptyAnalysis(normalizedOptions, false);

  const chronologicalHistory = sortDrawsChronologically(history.filter((draw) => !draw.isSimulated));
  const latestDraw = chronologicalHistory[chronologicalHistory.length - 1] ?? null;
  const latestDrawNumbers = numbersForDraw(latestDraw);
  if (!latestDraw || latestDrawNumbers.length === 0) {
    return emptyAnalysis(normalizedOptions, true);
  }

  const excludedSet = new Set((options.excludedNumbers ?? []).filter(isValidLotteryNumber));
  const sourceNumbersByTarget = new Map<number, { sources: Set<number>; offsets: Set<-1 | 1> }>();
  for (const source of latestDrawNumbers) {
    for (const offset of [-1, 1] as const) {
      const target = source + offset;
      if (!isValidLotteryNumber(target)) continue;
      const entry = sourceNumbersByTarget.get(target) ?? { sources: new Set<number>(), offsets: new Set<-1 | 1>() };
      entry.sources.add(source);
      entry.offsets.add(offset);
      sourceNumbersByTarget.set(target, entry);
    }
  }

  const planningLastDraw = isPlanningLastDraw(
    chronologicalHistory,
    latestDraw,
    options.planningLastDrawOverride,
    options.planningNow,
  );
  const targets: LatestNeighbourSupportTarget[] = [];
  const disqualified: LatestNeighbourSupportDisqualification[] = [];
  const warnings: string[] = [];

  for (const [target, sourceEntry] of [...sourceNumbersByTarget.entries()].sort(([left], [right]) => left - right)) {
    if (excludedSet.has(target)) {
      disqualified.push({ number: target, reason: "already hard-excluded" });
      continue;
    }

    const recentConsecutiveHits = trailingHitStreak(
      chronologicalHistory,
      target,
      normalizedOptions.recentWindow,
    );
    if (recentConsecutiveHits > normalizedOptions.maxRecentConsecutiveHits) {
      disqualified.push({
        number: target,
        reason: `appeared in ${recentConsecutiveHits} consecutive recent draws (> ${normalizedOptions.maxRecentConsecutiveHits})`,
      });
      continue;
    }

    const droughtLength = currentDroughtLength(chronologicalHistory, target);
    const terminalDigit = target % 10;
    const terminalBucketLabels = terminalBucketLabelsForNumber(target, monthlyBuckets);
    const sameTerminalUndrawnNumbers = sameTerminalUndrawn(target, monthlyBuckets);
    const otherSameTerminalUndrawn = sameTerminalUndrawnNumbers.filter((number) => number !== target);
    if (
      droughtLength > normalizedOptions.droughtDisqualifyThreshold &&
      !planningLastDraw &&
      otherSameTerminalUndrawn.length >= 2
    ) {
      disqualified.push({
        number: target,
        reason: `drought ${droughtLength} with terminal ${terminalDigit} still clustered in undrawn bucket (${sameTerminalUndrawnNumbers.join(", ")})`,
      });
      continue;
    }

    const notes: string[] = [];
    if ((terminalDigit === 0 || terminalDigit === 5) && options.terminalRuleActive?.[terminalDigit]) {
      notes.push(`terminal ${terminalDigit} also governed by active ending-digit rule`);
    }
    if (droughtLength <= normalizedOptions.droughtDisqualifyThreshold && terminalBucketLabels.length > 1) {
      notes.push(`terminal ${terminalDigit} is spread across ${terminalBucketLabels.join("/")}`);
    }

    const duplicateSourceBonus = sourceEntry.sources.size > 1 ? 10 : 0;
    const bucketSpreadBonus = terminalBucketLabels.length > 1 ? 15 : 0;
    const moderateDroughtBonus = droughtLength > 0 && droughtLength <= normalizedOptions.droughtDisqualifyThreshold ? 12 : 0;
    const recentStreakPenalty = Math.min(24, recentConsecutiveHits * 4);
    const score = 100 + duplicateSourceBonus + bucketSpreadBonus + moderateDroughtBonus - recentStreakPenalty;

    targets.push({
      number: target,
      terminalDigit,
      sourceNumbers: [...sourceEntry.sources].sort((left, right) => left - right),
      offsets: [...sourceEntry.offsets].sort((left, right) => left - right),
      recentConsecutiveHits,
      droughtLength,
      bucketLabel: bucketLabelForNumber(target, monthlyBuckets),
      terminalBucketLabels,
      sameTerminalUndrawnNumbers,
      score,
      notes,
    });
  }

  targets.sort((left, right) => right.score - left.score || left.number - right.number);
  const targetNumbers = targets.map((target) => target.number);
  if (!monthlyBuckets) warnings.push("monthly bucket state unavailable; terminal-family drought screen skipped");
  if (targetNumbers.length === 0) warnings.push("no eligible latest ±1 targets remained after exclusions/screens; hard rule skipped");

  const eligiblePreview = targets
    .slice(0, 12)
    .map((target) => `${target.number}(dr${target.droughtLength},st${target.recentConsecutiveHits},${target.bucketLabel ?? "no-bucket"})`)
    .join(", ");
  const disqualifiedPreview = disqualified
    .slice(0, 8)
    .map((item) => `${item.number}:${item.reason}`)
    .join(" | ");
  const traceSummary = [
    `${LATEST_NEIGHBOUR_SUPPORT_TRACE_TAG} ${targetNumbers.length > 0 ? "ON" : "skipped"}`,
    `latest ${latestDraw.date || "unknown"}`,
    `requires ≥1 eligible ±1 target`,
    `eligible ${targetNumbers.length}${eligiblePreview ? ` [${eligiblePreview}]` : ""}`,
    `disqualified ${disqualified.length}${disqualifiedPreview ? ` [${disqualifiedPreview}]` : ""}`,
    `recent streak cap ${normalizedOptions.maxRecentConsecutiveHits}/${normalizedOptions.recentWindow}`,
    planningLastDraw ? "planning last draw: terminal drought veto relaxed" : "planning not last draw",
  ].join(" · ");

  return {
    enabled,
    active: targetNumbers.length > 0,
    latestDrawDate: latestDraw.date || null,
    latestDrawNumbers,
    targetNumbers,
    targets,
    disqualified,
    warnings,
    recentWindow: normalizedOptions.recentWindow,
    maxRecentConsecutiveHits: normalizedOptions.maxRecentConsecutiveHits,
    droughtDisqualifyThreshold: normalizedOptions.droughtDisqualifyThreshold,
    supportBoostFactor: normalizedOptions.supportBoostFactor,
    isPlanningLastDraw: planningLastDraw,
    traceSummary,
  };
}

export function candidateSatisfiesLatestNeighbourSupport(
  candidateNumbers: readonly number[],
  analysis: LatestNeighbourSupportAnalysis,
): boolean {
  if (!analysis.enabled || !analysis.active) return true;
  const eligibleSet = new Set(analysis.targetNumbers);
  return candidateNumbers.some((number) => eligibleSet.has(number));
}
