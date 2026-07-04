const MIN_NUMBER = 1;
const MAX_NUMBER = 45;

export type NumberConflictKind =
  | "hardInclude"
  | "hardExclude"
  | "softInclude"
  | "softExclude"
  | "simulation";

export type NumberConflictSeverity = "error" | "warning";

export interface NumberConflictSource {
  kind: NumberConflictKind;
  label: string;
  numbers: readonly unknown[] | null | undefined;
}

export interface NumberConflictEntry {
  number: number;
  hardIncludeSources: string[];
  hardExcludeSources: string[];
  softIncludeSources: string[];
  softExcludeSources: string[];
  simulationSources: string[];
  hasHardConflict: boolean;
  hasSoftConflict: boolean;
}

export interface NumberConflict {
  number: number;
  severity: NumberConflictSeverity;
  includeSources: string[];
  excludeSources: string[];
  message: string;
}

export interface NumberConflictLedger {
  byNumber: Record<number, NumberConflictEntry>;
  conflicts: NumberConflict[];
}

export interface NumberRangeDescriptor {
  start: number;
  end: number;
  label?: string;
}

export interface NumberRangeConflictSummary {
  label: string;
  numbers: number[];
  hardIncludedNumbers: number[];
  hardExcludedNumbers: number[];
  softIncludedNumbers: number[];
  softExcludedNumbers: number[];
  simulationNumbers: number[];
  canApplyHardExclude: boolean;
  blockingReason: string;
}

export const emptyNumberConflictEntry = (number: number): NumberConflictEntry => ({
  number,
  hardIncludeSources: [],
  hardExcludeSources: [],
  softIncludeSources: [],
  softExcludeSources: [],
  simulationSources: [],
  hasHardConflict: false,
  hasSoftConflict: false,
});

const isValidNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= MIN_NUMBER &&
  value <= MAX_NUMBER
);

const normalizeNumbers = (numbers: readonly unknown[] | null | undefined): number[] => (
  Array.from(new Set((numbers ?? []).filter(isValidNumber))).sort((left, right) => left - right)
);

const addSourceLabel = (labels: string[], label: string): void => {
  const trimmed = label.trim();
  if (!trimmed || labels.includes(trimmed)) return;
  labels.push(trimmed);
};

const sourceBucketForKind = (
  entry: NumberConflictEntry,
  kind: NumberConflictKind,
): string[] => {
  if (kind === "hardInclude") return entry.hardIncludeSources;
  if (kind === "hardExclude") return entry.hardExcludeSources;
  if (kind === "softInclude") return entry.softIncludeSources;
  if (kind === "softExclude") return entry.softExcludeSources;
  return entry.simulationSources;
};

const makeEntryConflict = (entry: NumberConflictEntry): NumberConflict[] => {
  const conflicts: NumberConflict[] = [];

  if (entry.hardIncludeSources.length && entry.hardExcludeSources.length) {
    conflicts.push({
      number: entry.number,
      severity: "error",
      includeSources: entry.hardIncludeSources,
      excludeSources: entry.hardExcludeSources,
      message: `Number ${entry.number} is hard-included by ${entry.hardIncludeSources.join(", ")} but hard-excluded by ${entry.hardExcludeSources.join(", ")}.`,
    });
  }

  if (entry.softIncludeSources.length && entry.hardExcludeSources.length) {
    conflicts.push({
      number: entry.number,
      severity: "warning",
      includeSources: entry.softIncludeSources,
      excludeSources: entry.hardExcludeSources,
      message: `Number ${entry.number} is softly included by ${entry.softIncludeSources.join(", ")} but hard-excluded by ${entry.hardExcludeSources.join(", ")}.`,
    });
  }

  if (entry.hardIncludeSources.length && entry.softExcludeSources.length) {
    conflicts.push({
      number: entry.number,
      severity: "warning",
      includeSources: entry.hardIncludeSources,
      excludeSources: entry.softExcludeSources,
      message: `Number ${entry.number} is hard-included by ${entry.hardIncludeSources.join(", ")} but softly excluded by ${entry.softExcludeSources.join(", ")}.`,
    });
  }

  return conflicts;
};

export const buildNumberConflictLedger = (
  sources: readonly NumberConflictSource[],
): NumberConflictLedger => {
  const byNumber: Record<number, NumberConflictEntry> = {};
  for (let number = MIN_NUMBER; number <= MAX_NUMBER; number += 1) {
    byNumber[number] = emptyNumberConflictEntry(number);
  }

  sources.forEach((source) => {
    normalizeNumbers(source.numbers).forEach((number) => {
      addSourceLabel(sourceBucketForKind(byNumber[number], source.kind), source.label);
    });
  });

  const conflicts: NumberConflict[] = [];
  Object.values(byNumber).forEach((entry) => {
    entry.hasHardConflict = entry.hardIncludeSources.length > 0 && entry.hardExcludeSources.length > 0;
    entry.hasSoftConflict = (
      (entry.softIncludeSources.length > 0 && entry.hardExcludeSources.length > 0) ||
      (entry.hardIncludeSources.length > 0 && entry.softExcludeSources.length > 0)
    );
    conflicts.push(...makeEntryConflict(entry));
  });

  conflicts.sort((left, right) => left.number - right.number || left.severity.localeCompare(right.severity));

  return { byNumber, conflicts };
};

export const getConflictLedgerNumbers = (
  ledger: NumberConflictLedger | null | undefined,
  key: keyof Pick<NumberConflictEntry, "hardIncludeSources" | "hardExcludeSources" | "softIncludeSources" | "softExcludeSources" | "simulationSources">,
): number[] => {
  if (!ledger) return [];
  return Object.values(ledger.byNumber)
    .filter((entry) => entry[key].length > 0)
    .map((entry) => entry.number)
    .sort((left, right) => left - right);
};

const sourceSummaryForNumbers = (
  ledger: NumberConflictLedger,
  numbers: number[],
  key: keyof Pick<NumberConflictEntry, "hardIncludeSources" | "hardExcludeSources" | "softIncludeSources" | "softExcludeSources" | "simulationSources">,
): string => (
  numbers
    .map((number) => {
      const sources = ledger.byNumber[number]?.[key] ?? [];
      return sources.length ? `${number} (${sources.join(", ")})` : String(number);
    })
    .join(", ")
);

export const summarizeNumberRangeConflicts = (
  ledger: NumberConflictLedger | null | undefined,
  range: NumberRangeDescriptor,
): NumberRangeConflictSummary => {
  const start = Math.max(MIN_NUMBER, Math.min(MAX_NUMBER, Math.round(range.start)));
  const end = Math.max(start, Math.min(MAX_NUMBER, Math.round(range.end)));
  const label = range.label ?? `${start}-${end}`;
  const numbers = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  if (!ledger) {
    return {
      label,
      numbers,
      hardIncludedNumbers: [],
      hardExcludedNumbers: [],
      softIncludedNumbers: [],
      softExcludedNumbers: [],
      simulationNumbers: [],
      canApplyHardExclude: true,
      blockingReason: "",
    };
  }

  const numbersWithSources = (
    key: keyof Pick<NumberConflictEntry, "hardIncludeSources" | "hardExcludeSources" | "softIncludeSources" | "softExcludeSources" | "simulationSources">,
  ): number[] => numbers.filter((number) => (ledger.byNumber[number]?.[key]?.length ?? 0) > 0);

  const hardIncludedNumbers = numbersWithSources("hardIncludeSources");
  const hardExcludedNumbers = numbersWithSources("hardExcludeSources");
  const softIncludedNumbers = numbersWithSources("softIncludeSources");
  const softExcludedNumbers = numbersWithSources("softExcludeSources");
  const simulationNumbers = numbersWithSources("simulationSources");
  const canApplyHardExclude = hardIncludedNumbers.length === 0;
  const blockingReason = canApplyHardExclude
    ? ""
    : `Cannot exclude ${label} because it contains forced inclusion ${sourceSummaryForNumbers(ledger, hardIncludedNumbers, "hardIncludeSources")}. Remove that inclusion first.`;

  return {
    label,
    numbers,
    hardIncludedNumbers,
    hardExcludedNumbers,
    softIncludedNumbers,
    softExcludedNumbers,
    simulationNumbers,
    canApplyHardExclude,
    blockingReason,
  };
};
