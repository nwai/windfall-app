import type { Draw } from "../types";
import type { PreviousNeighbourScope } from "./previousNeighbourBacktest";

const LOTTERY_MIN = 1;
const LOTTERY_MAX = 45;

export interface PreviousNeighbourConstraintRow {
  source: number;
  minusTwo: number | null;
  minusOne: number | null;
  plusOne: number | null;
  plusTwo: number | null;
  targetOptions: PreviousNeighbourConstraintTargetOption[];
  targets: number[];
  duplicateTargets: number[];
}

export interface PreviousNeighbourConstraintTargetOption {
  label: "-2" | "-1" | "+1" | "+2";
  offset: -2 | -1 | 1 | 2;
  value: number | null;
}

const isValidLotteryNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= LOTTERY_MIN &&
  value <= LOTTERY_MAX
);

const numbersForScope = (draw: Draw, scope: PreviousNeighbourScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const TARGET_OFFSETS: readonly PreviousNeighbourConstraintTargetOption["offset"][] = [-2, -1, 1, 2];

const targetOptionLabel = (offset: PreviousNeighbourConstraintTargetOption["offset"]): PreviousNeighbourConstraintTargetOption["label"] => {
  switch (offset) {
    case -2:
      return "-2";
    case -1:
      return "-1";
    case 1:
      return "+1";
    case 2:
      return "+2";
  }
};

export function normalizePreviousNeighbourConstraintNumbers(values: readonly unknown[]): number[] {
  const unique = new Set<number>();
  for (const value of values) {
    if (isValidLotteryNumber(value)) {
      unique.add(value);
    }
  }
  return Array.from(unique).sort((left, right) => left - right);
}

export function buildPreviousNeighbourConstraintRows(
  latestDraw: Draw | null | undefined,
  scope: PreviousNeighbourScope = "mains-plus-supps",
): PreviousNeighbourConstraintRow[] {
  if (!latestDraw) return [];

  const sources = normalizePreviousNeighbourConstraintNumbers(numbersForScope(latestDraw, scope));
  const targetSources = new Map<number, number[]>();

  for (const source of sources) {
    for (const offset of TARGET_OFFSETS) {
      const target = source + offset;
      if (!isValidLotteryNumber(target)) continue;
      const existing = targetSources.get(target) ?? [];
      existing.push(source);
      targetSources.set(target, existing);
    }
  }

  return sources.map((source) => {
    const targetOptions = TARGET_OFFSETS.map((offset) => {
      const value = source + offset;
      return {
        label: targetOptionLabel(offset),
        offset,
        value: isValidLotteryNumber(value) ? value : null,
      };
    });
    const targets = normalizePreviousNeighbourConstraintNumbers(targetOptions.map((option) => option.value));
    const duplicateTargets = targets.filter((target) => (targetSources.get(target)?.length ?? 0) > 1);

    return {
      source,
      minusTwo: targetOptions[0].value,
      minusOne: targetOptions[1].value,
      plusOne: targetOptions[2].value,
      plusTwo: targetOptions[3].value,
      targetOptions,
      targets,
      duplicateTargets,
    };
  });
}

export function togglePreviousNeighbourConstraintNumber(
  current: readonly number[],
  target: number,
): number[] {
  const normalized = normalizePreviousNeighbourConstraintNumbers(current);
  if (!isValidLotteryNumber(target)) return normalized;

  if (normalized.includes(target)) {
    return normalized.filter((number) => number !== target);
  }
  return normalizePreviousNeighbourConstraintNumbers([...normalized, target]);
}
