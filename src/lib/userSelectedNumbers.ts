export const MIN_USER_SELECTED_NUMBER = 1;
export const MAX_USER_SELECTED_NUMBER = 45;
export const MIN_SIMULATION_MAIN_COUNT = 6;
export const MAX_SIMULATION_NUMBER_COUNT = 8;

export interface UserSelectionSimulation {
  ready: boolean;
  numbers: number[];
  main: number[];
  supp: number[];
  reason: string;
}

function coerceSelectionNumber(value: unknown): number | null {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;

  if (!Number.isInteger(numeric)) return null;
  if (numeric < MIN_USER_SELECTED_NUMBER || numeric > MAX_USER_SELECTED_NUMBER) return null;
  return numeric;
}

export function normalizeUserSelectedNumbers(values: readonly unknown[] | undefined): number[] {
  if (!Array.isArray(values)) return [];

  const unique = new Set<number>();
  for (const value of values) {
    const number = coerceSelectionNumber(value);
    if (number !== null) unique.add(number);
  }

  return Array.from(unique).sort((left, right) => left - right);
}

export function areUserSelectedNumberListsEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  const normalizedLeft = normalizeUserSelectedNumbers(left);
  const normalizedRight = normalizeUserSelectedNumbers(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function toggleUserSelectedNumber(current: readonly unknown[], value: unknown): number[] {
  const selectedNumber = coerceSelectionNumber(value);
  const selected = new Set(normalizeUserSelectedNumbers(current));
  if (selectedNumber === null) return Array.from(selected);

  if (selected.has(selectedNumber)) {
    selected.delete(selectedNumber);
  } else {
    selected.add(selectedNumber);
  }

  return Array.from(selected).sort((left, right) => left - right);
}

export function buildUserSelectionSimulation(values: readonly unknown[]): UserSelectionSimulation {
  const normalized = normalizeUserSelectedNumbers(values);
  if (normalized.length < MIN_SIMULATION_MAIN_COUNT) {
    return {
      ready: false,
      numbers: [],
      main: [],
      supp: [],
      reason: `Select at least ${MIN_SIMULATION_MAIN_COUNT} numbers to simulate (${normalized.length}/${MIN_SIMULATION_MAIN_COUNT}).`,
    };
  }

  const numbers = normalized.slice(0, MAX_SIMULATION_NUMBER_COUNT);
  const main = numbers.slice(0, MIN_SIMULATION_MAIN_COUNT);
  const supp = numbers.slice(MIN_SIMULATION_MAIN_COUNT, MAX_SIMULATION_NUMBER_COUNT);

  return {
    ready: true,
    numbers,
    main,
    supp,
    reason: supp.length === 0
      ? "Simulating six main numbers; add up to two more selections for supplementary positions."
      : "Ready to simulate the selected numbers.",
  };
}

export function buildAutoExcludedFromUserSelection(values: readonly unknown[], enabled: boolean): number[] {
  if (!enabled) return [];

  const selectedNumbers = normalizeUserSelectedNumbers(values);
  if (selectedNumbers.length === 0) return [];

  const selected = new Set(selectedNumbers);
  const excluded: number[] = [];
  for (let number = MIN_USER_SELECTED_NUMBER; number <= MAX_USER_SELECTED_NUMBER; number += 1) {
    if (!selected.has(number)) excluded.push(number);
  }
  return excluded;
}
