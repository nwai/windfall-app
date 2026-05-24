import type { Draw } from "../types";

export interface WfmqyhNumberCountsOptions {
  includeSupp?: boolean;
}

/**
 * Builds per-number frequency counts across the active WFMQYH draw window.
 *
 * By default only main numbers are counted. When includeSupp is enabled,
 * supplementary numbers are folded into the same per-number tally.
 */
export const buildWfmqyhNumberCounts = (
  history: Draw[] | undefined,
  options: WfmqyhNumberCountsOptions = {},
): Map<number, number> => {
  const counts = new Map<number, number>();
  if (!history || history.length === 0) {
    return counts;
  }

  const { includeSupp = false } = options;

  history.forEach((draw) => {
    const numbers = includeSupp ? [...draw.main, ...draw.supp] : draw.main;
    numbers.forEach((n) => {
      if (!Number.isInteger(n) || n < 1 || n > 45) {
        return;
      }
      counts.set(n, (counts.get(n) ?? 0) + 1);
    });
  });

  return counts;
};
