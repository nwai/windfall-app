import { Draw } from "./types";

/**
 * Returns only valid draws:
 * - All main and supp numbers must be integers in [1, 45]
 * - No duplicates within main or supp for each draw
 * - main must be length 6
 * - supp must be length 2
 */
export function strictValidateDraws(draws: Draw[]): Draw[] {
  return draws.filter((draw, idx) => {
    // Check main and supp length
    if (!Array.isArray(draw.main) || !Array.isArray(draw.supp)) return false;
    if (draw.main.length !== 6 || draw.supp.length !== 2) return false;

    // Check all numbers are in the allowed range and integers
    const allNumbers = [...draw.main, ...draw.supp];
    if (!allNumbers.every(
      n => typeof n === "number" && n >= 1 && n <= 45 && Number.isInteger(n)
    )) return false;

    // Check no duplicates within main or supp
    const hasDupes = (arr: number[]) => new Set(arr).size !== arr.length;
    if (hasDupes(draw.main) || hasDupes(draw.supp)) return false;

    // Check no overlap between main and supp
    if (draw.supp.some(n => draw.main.includes(n))) return false;

    // If date is missing, try to set it to string
    if (!draw.date) draw.date = "unknown";

    return true;
  });
}