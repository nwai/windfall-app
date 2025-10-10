import { Draw } from "./types";

/**
 * Returns a filtered main pool, the excluded numbers, and a trace string that logs:
 * - the most recent draw's main and supp numbers
 * - per-number last digit mapping
 * - the counted occurrences of each last digit
 * - the excluded digits (those with count > 1)
 * - the excluded numbers
 */
export function getSDE1FilteredPool(history: Draw[]): { pool: number[], trace: string, excludedNumbers: number[] } {
  if (!history.length) {
    return {
      pool: Array.from({ length: 45 }, (_, i) => i + 1),
      trace: "No SDE1 exclusion",
      excludedNumbers: []
    };
  }
  // Use the most recent draw (last in array)
  const mostRecentDraw = history[history.length - 1];
  const mostRecentNumbers = [...mostRecentDraw.main, ...mostRecentDraw.supp];

  // Map each number to its last digit
  const lastDigits = mostRecentNumbers.map(n => {
    const d = String(n).padStart(2, "0")[1];
    return `${n}→${d}`;
  });

  // Count occurrences of each last digit
  const digitCount: Record<string, number> = {};
  for (const n of mostRecentNumbers) {
    const d = String(n).padStart(2, "0")[1];
    digitCount[d] = (digitCount[d] || 0) + 1;
  }
  // Exclude only digits that appear more than once
  const excludedDigits = Object.entries(digitCount)
    .filter(([_, count]) => count > 1)
    .map(([d]) => d);

  // Build pool and excluded numbers
  const pool: number[] = [];
  const excludedNumbers: number[] = [];
  for (let n = 1; n <= 45; ++n) {
    const lastDigit = String(n).padStart(2, "0")[1];
    if (!excludedDigits.includes(lastDigit)) {
      pool.push(n);
    } else {
      excludedNumbers.push(n);
    }
  }

  // Detailed trace output
  const traceLines = [
    `SDE1: Most recent draw numbers (main+supp): [${mostRecentNumbers.join(", ")}]`,
    `SDE1: Last digit mapping: [${lastDigits.join(", ")}]`,
    `SDE1: Last digit counts: ${JSON.stringify(digitCount)}`,
    excludedDigits.length
      ? `SDE1: Excluded last digits [${excludedDigits.join(", ")}] (numbers: [${excludedNumbers.join(", ")}])`
      : "No SDE1 exclusion"
  ];

  return {
    pool,
    trace: traceLines.join("\n"),
    excludedNumbers
  };
}