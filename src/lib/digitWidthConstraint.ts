export type DigitWidthConstraintScope = "main" | "mainAndSupp";

export interface DigitWidthConstraintConfig {
  enabled?: boolean;
  singleDigitPercent?: number;
  scope?: DigitWidthConstraintScope;
}

export interface DigitWidthConstraintTargets {
  enabled: boolean;
  scope: DigitWidthConstraintScope;
  countedSlots: number;
  singleDigitPercent: number;
  twoDigitPercent: number;
  singleDigitCount: number;
  twoDigitCount: number;
}

export const DIGIT_WIDTH_PERCENT_OPTIONS: number[] = Array.from({ length: 21 }, (_, idx) => idx * 5);

export const clampDigitWidthPercent = (value: number): number => {
  const numericValue = Number.isFinite(value) ? value : Number(value);
  const steppedValue = Math.round((Number.isFinite(numericValue) ? numericValue : 0) / 5) * 5;
  return Math.max(0, Math.min(100, steppedValue));
};

export const getDigitWidthCountedSlots = (scope: DigitWidthConstraintScope): number => (
  scope === "mainAndSupp" ? 8 : 6
);

export const countSingleDigitNumbers = (numbers: number[]): number => numbers.filter((n) => n >= 1 && n <= 9).length;

export const countTwoDigitNumbers = (numbers: number[]): number => numbers.filter((n) => n >= 10 && n <= 45).length;

export const deriveDigitWidthTargets = (
  config: DigitWidthConstraintConfig | undefined,
): DigitWidthConstraintTargets => {
  const scope: DigitWidthConstraintScope = config?.scope === "mainAndSupp" ? "mainAndSupp" : "main";
  const countedSlots = getDigitWidthCountedSlots(scope);
  const singleDigitPercent = clampDigitWidthPercent(config?.singleDigitPercent ?? 0);
  const twoDigitPercent = 100 - singleDigitPercent;
  const singleDigitCount = Math.floor((countedSlots * singleDigitPercent) / 100);
  const twoDigitCount = countedSlots - singleDigitCount;

  return {
    enabled: !!config?.enabled,
    scope,
    countedSlots,
    singleDigitPercent,
    twoDigitPercent,
    singleDigitCount,
    twoDigitCount,
  };
};

export const formatDigitWidthScopeLabel = (scope: DigitWidthConstraintScope): string => (
  scope === "mainAndSupp" ? "main + supp" : "mains only"
);
