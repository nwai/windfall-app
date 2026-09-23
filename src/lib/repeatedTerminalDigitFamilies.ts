export type RepeatedTerminalDigitFamilyScope = "main" | "mainAndSupp";
export type RepeatedTerminalDigitFamilyMode = "atLeast" | "exactly" | "atMost";

export interface RepeatedTerminalDigitFamilyOptions {
  enabled?: boolean;
  scope?: RepeatedTerminalDigitFamilyScope;
  mode?: RepeatedTerminalDigitFamilyMode;
  count?: number;
}

export interface NormalizedRepeatedTerminalDigitFamilyRule {
  scope: RepeatedTerminalDigitFamilyScope;
  mode: RepeatedTerminalDigitFamilyMode;
  count: number;
}

export interface RepeatedTerminalDigitFamilySummary {
  repeatedDigits: number[];
  countsByDigit: number[];
  repeatedCount: number;
}

const REPEATED_TERMINAL_DIGIT_MODES = new Set<RepeatedTerminalDigitFamilyMode>([
  "atLeast",
  "exactly",
  "atMost",
]);

export const repeatedTerminalDigitFamilyMaxForScope = (
  scope: RepeatedTerminalDigitFamilyScope,
): number => (scope === "main" ? 3 : 4);

export const normalizeRepeatedTerminalDigitFamilyScope = (
  value: unknown,
): RepeatedTerminalDigitFamilyScope => (
  value === "main" ? "main" : "mainAndSupp"
);

export const normalizeRepeatedTerminalDigitFamilyMode = (
  value: unknown,
): RepeatedTerminalDigitFamilyMode => (
  REPEATED_TERMINAL_DIGIT_MODES.has(value as RepeatedTerminalDigitFamilyMode)
    ? value as RepeatedTerminalDigitFamilyMode
    : "atLeast"
);

export const normalizeRepeatedTerminalDigitFamilyRule = (
  options?: RepeatedTerminalDigitFamilyOptions,
): NormalizedRepeatedTerminalDigitFamilyRule | null => {
  if (!options?.enabled) return null;
  const scope = normalizeRepeatedTerminalDigitFamilyScope(options.scope);
  const mode = normalizeRepeatedTerminalDigitFamilyMode(options.mode);
  const rawCount = Number(options.count);
  const count = Math.max(
    0,
    Math.min(
      repeatedTerminalDigitFamilyMaxForScope(scope),
      Math.round(Number.isFinite(rawCount) ? rawCount : 0),
    ),
  );
  return { scope, mode, count };
};

export const summarizeRepeatedTerminalDigitFamilies = (
  numbers: readonly number[],
): RepeatedTerminalDigitFamilySummary => {
  const countsByDigit = Array(10).fill(0) as number[];
  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1 || number > 45) continue;
    countsByDigit[number % 10] += 1;
  }
  const repeatedDigits = countsByDigit
    .map((count, digit) => ({ count, digit }))
    .filter(({ count }) => count >= 2)
    .map(({ digit }) => digit);
  return {
    repeatedDigits,
    countsByDigit,
    repeatedCount: repeatedDigits.length,
  };
};

export const violatesRepeatedTerminalDigitFamilyRule = (
  repeatedFamilyCount: number,
  rule: NormalizedRepeatedTerminalDigitFamilyRule,
): boolean => {
  if (rule.mode === "exactly") return repeatedFamilyCount !== rule.count;
  if (rule.mode === "atMost") return repeatedFamilyCount > rule.count;
  return repeatedFamilyCount < rule.count;
};

export const formatRepeatedTerminalDigitFamilyRule = (
  rule: NormalizedRepeatedTerminalDigitFamilyRule,
): string => {
  const modeLabel = rule.mode === "exactly"
    ? "exactly"
    : rule.mode === "atMost"
      ? "at most"
      : "at least";
  const scopeLabel = rule.scope === "main" ? "mains only" : "mains + supps";
  return `${modeLabel} ${rule.count} repeated terminal digit famil${rule.count === 1 ? "y" : "ies"} (${scopeLabel})`;
};
