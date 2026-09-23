const LOTTERY_MIN = 1;
const LOTTERY_MAX = 45;
const DEFAULT_FAMILY_CAP = 1;

export type SignalConfluenceFamilyKey =
  | "latest-neighbour"
  | "drought"
  | "shared-selection"
  | "active-frequency"
  | "terminal-bucket"
  | "temperature"
  | "scoring-numbers"
  | "selection-insights"
  | "next-draw-evidence"
  | "weekday-neighbour"
  | "user-state";

export type SignalConfluenceMentionTone = "support" | "caution" | "state";

export interface SignalConfluenceMention {
  number: number;
  family: SignalConfluenceFamilyKey;
  source: string;
  label: string;
  strength?: number;
  detail?: string;
  tone?: SignalConfluenceMentionTone;
}

export interface SignalConfluenceRow {
  number: number;
  rank: number;
  familyScore: number;
  familyCount: number;
  rawMentionCount: number;
  supportMentions: SignalConfluenceMention[];
  cautionMentions: SignalConfluenceMention[];
  stateMentions: SignalConfluenceMention[];
  isExcluded: boolean;
  isForced: boolean;
  isUserSelected: boolean;
}

export interface BuildSignalConfluenceRowsOptions {
  familyCap?: number;
  excludedNumbers?: readonly unknown[];
  forcedNumbers?: readonly unknown[];
  userSelectedNumbers?: readonly unknown[];
}

export type SignalConfluenceSortKey = "rank" | "support";
export type SignalConfluenceSortDirection = "ascending" | "descending";
export type SignalConfluenceVisibilityMode = "supported-only" | "all-45";

export function isValidSignalConfluenceNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= LOTTERY_MIN &&
    value <= LOTTERY_MAX
  );
}

export function normalizeSignalConfluenceNumbers(values: readonly unknown[] | null | undefined): number[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter(isValidSignalConfluenceNumber))).sort((left, right) => left - right);
}

export function buildRankedSignalConfluenceMentions(
  numbers: readonly unknown[] | null | undefined,
  family: SignalConfluenceFamilyKey,
  source: string,
  labelPrefix: string,
  limit = 8,
): SignalConfluenceMention[] {
  if (!Array.isArray(numbers)) return [];

  const safeLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 0));
  if (safeLimit === 0) return [];
  const seen = new Set<number>();
  const rankedNumbers: number[] = [];

  for (const value of numbers) {
    if (!isValidSignalConfluenceNumber(value) || seen.has(value)) continue;
    seen.add(value);
    rankedNumbers.push(value);
    if (rankedNumbers.length >= safeLimit) break;
  }

  return rankedNumbers.map((number, index) => ({
    number,
    family,
    source,
    label: `${labelPrefix} #${index + 1}`,
    strength: rankedStrength(index, rankedNumbers.length),
  }));
}

export function filterSignalConfluenceRows(
  rows: readonly SignalConfluenceRow[],
  visibilityMode: SignalConfluenceVisibilityMode,
): SignalConfluenceRow[] {
  if (visibilityMode === "all-45") return rows.slice();
  return rows.filter((row) => (
    row.rawMentionCount > 0
    || row.isForced
    || row.isUserSelected
    || row.isExcluded
  ));
}

export function rankedStrength(rankIndex: number, total: number, floor = 0.35): number {
  if (!Number.isFinite(rankIndex) || rankIndex < 0 || total <= 1) return 1;
  const safeFloor = Math.max(0, Math.min(1, floor));
  const span = 1 - safeFloor;
  return safeFloor + span * ((total - 1 - Math.min(rankIndex, total - 1)) / (total - 1));
}

const clampStrength = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
};

const compareRows = (left: SignalConfluenceRow, right: SignalConfluenceRow): number => {
  if (left.isExcluded !== right.isExcluded) return left.isExcluded ? 1 : -1;
  return (
    right.familyScore - left.familyScore ||
    right.familyCount - left.familyCount ||
    right.rawMentionCount - left.rawMentionCount ||
    Number(right.isForced) - Number(left.isForced) ||
    Number(right.isUserSelected) - Number(left.isUserSelected) ||
    left.number - right.number
  );
};

export function sortSignalConfluenceRows(
  rows: readonly SignalConfluenceRow[],
  sortKey: SignalConfluenceSortKey,
  direction: SignalConfluenceSortDirection = "ascending",
): SignalConfluenceRow[] {
  const directionMultiplier = direction === "ascending" ? 1 : -1;
  return rows.slice().sort((left, right) => {
    if (left.isExcluded !== right.isExcluded) return left.isExcluded ? 1 : -1;

    if (sortKey === "support") {
      return (
        directionMultiplier * (left.rawMentionCount - right.rawMentionCount) ||
        directionMultiplier * (left.familyCount - right.familyCount) ||
        directionMultiplier * (left.familyScore - right.familyScore) ||
        left.rank - right.rank ||
        left.number - right.number
      );
    }

    return left.rank - right.rank || left.number - right.number;
  });
}

export function buildSignalConfluenceRows(
  mentions: readonly SignalConfluenceMention[],
  options: BuildSignalConfluenceRowsOptions = {},
): SignalConfluenceRow[] {
  const familyCap = Math.max(0, Math.min(1, options.familyCap ?? DEFAULT_FAMILY_CAP));
  const excludedSet = new Set(normalizeSignalConfluenceNumbers(options.excludedNumbers));
  const forcedSet = new Set(normalizeSignalConfluenceNumbers(options.forcedNumbers));
  const userSelectedSet = new Set(normalizeSignalConfluenceNumbers(options.userSelectedNumbers));
  const mentionsByNumber = new Map<number, SignalConfluenceMention[]>();

  for (const mention of mentions) {
    if (!isValidSignalConfluenceNumber(mention.number)) continue;
    const safeMention: SignalConfluenceMention = {
      ...mention,
      strength: clampStrength(mention.strength),
      tone: mention.tone ?? "support",
    };
    const current = mentionsByNumber.get(safeMention.number) ?? [];
    current.push(safeMention);
    mentionsByNumber.set(safeMention.number, current);
  }

  const rows = Array.from({ length: LOTTERY_MAX }, (_, index): SignalConfluenceRow => {
    const number = index + 1;
    const numberMentions = mentionsByNumber.get(number) ?? [];
    const supportMentions = numberMentions.filter((mention) => (mention.tone ?? "support") === "support");
    const cautionMentions = numberMentions.filter((mention) => mention.tone === "caution");
    const stateMentions = numberMentions.filter((mention) => mention.tone === "state");
    const familyStrengths = new Map<SignalConfluenceFamilyKey, number>();

    for (const mention of supportMentions) {
      familyStrengths.set(
        mention.family,
        Math.max(familyStrengths.get(mention.family) ?? 0, Math.min(familyCap, clampStrength(mention.strength))),
      );
    }

    return {
      number,
      rank: 0,
      familyScore: Array.from(familyStrengths.values()).reduce((sum, value) => sum + value, 0),
      familyCount: familyStrengths.size,
      rawMentionCount: supportMentions.length,
      supportMentions,
      cautionMentions,
      stateMentions,
      isExcluded: excludedSet.has(number),
      isForced: forcedSet.has(number),
      isUserSelected: userSelectedSet.has(number),
    };
  }).sort(compareRows);

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
