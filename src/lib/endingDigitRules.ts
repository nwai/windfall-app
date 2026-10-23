export type MainDigitCountMode = "atLeast" | "exactly" | "atMost";

export interface MainDigitConstraintOptions {
  maxCount?: number;
  countMode?: MainDigitCountMode;
  targetCount?: number;
  boost?: number;
  singleDigitBoost?: number;
  twoDigitBoost?: number;
}

const MAIN_DIGIT_COUNT_MODES = new Set<MainDigitCountMode>(["atLeast", "exactly", "atMost"]);

export interface NormalizedMainDigitCountRule {
  mode: MainDigitCountMode;
  count: number;
}

export const normalizeMainDigitCountRule = (options?: MainDigitConstraintOptions): NormalizedMainDigitCountRule | null => {
  const explicitMode = options?.countMode;
  if (explicitMode && MAIN_DIGIT_COUNT_MODES.has(explicitMode)) {
    const rawCount = options.targetCount ?? options.maxCount;
    const numericCount = typeof rawCount === "number" ? rawCount : Number(rawCount);
    return { mode: explicitMode, count: Math.max(0, Math.round(Number.isFinite(numericCount) ? numericCount : 0)) };
  }
  const legacyMaxCount = typeof options?.maxCount === "number" ? options.maxCount : Number(options?.maxCount);
  return Number.isFinite(legacyMaxCount) && legacyMaxCount >= 0
    ? { mode: "atMost", count: Math.max(0, Math.round(legacyMaxCount)) }
    : null;
};

export const violatesMainDigitCountRule = (digitCount: number, rule: NormalizedMainDigitCountRule): boolean => (
  rule.mode === "atLeast" ? digitCount < rule.count : rule.mode === "exactly" ? digitCount !== rule.count : digitCount > rule.count
);

export const formatMainDigitCountRule = (rule: NormalizedMainDigitCountRule): string => (
  rule.mode === "atLeast" ? `at least=${rule.count}` : rule.mode === "exactly" ? `exactly=${rule.count}` : `at most=${rule.count}`
);
