const MIN_NUMBER = 1;
const MAX_NUMBER = 45;

const isValidDrawNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= MIN_NUMBER &&
  value <= MAX_NUMBER
);

export const normalizeUserExclusionLocks = (
  values: readonly unknown[] | null | undefined,
): number[] => (
  Array.from(new Set((values ?? []).filter(isValidDrawNumber))).sort((left, right) => left - right)
);

export const removeUserExcludedNumbers = (
  values: readonly number[] | null | undefined,
  excludedNumbers: readonly unknown[] | null | undefined,
): number[] => {
  const excludedSet = new Set(normalizeUserExclusionLocks(excludedNumbers));
  return normalizeUserExclusionLocks(values).filter((number) => !excludedSet.has(number));
};

export const formatUserExclusionReminder = (
  excludedNumbers: readonly unknown[] | null | undefined,
  label = "Active exclusions",
): string => {
  const normalized = normalizeUserExclusionLocks(excludedNumbers);
  return normalized.length ? `${label}: ${normalized.join(", ")}` : "";
};
