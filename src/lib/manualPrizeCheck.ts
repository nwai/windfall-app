import {
  MAX_USER_SELECTED_NUMBER,
  MIN_USER_SELECTED_NUMBER,
} from "./userSelectedNumbers";
import { normalizeUserExclusionLocks } from "./userExclusionLocks";

export const MANUAL_PRIZE_CHECK_NUMBER_LIMIT = 8;

export function normalizeManualPrizeCheckNumbers(
  values: readonly unknown[] | null | undefined,
  excludedNumbers: readonly unknown[] | null | undefined = [],
  limit = MANUAL_PRIZE_CHECK_NUMBER_LIMIT,
): number[] {
  const excludedSet = new Set(normalizeUserExclusionLocks(excludedNumbers));
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const value of values ?? []) {
    const numeric = typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

    if (!Number.isInteger(numeric)) continue;
    if (numeric < MIN_USER_SELECTED_NUMBER || numeric > MAX_USER_SELECTED_NUMBER) continue;
    if (excludedSet.has(numeric) || seen.has(numeric)) continue;

    seen.add(numeric);
    normalized.push(numeric);
    if (normalized.length >= limit) break;
  }

  return normalized;
}
