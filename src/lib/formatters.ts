import type { Draw } from "../types";

/**
 * Format a single draw line with Odd/Even ratio and OGA score.
 * Ensures a stable, single-line representation that’s easy to reuse.
 */
export function formatDrawLine(d: Draw, idx: number, pastOGAScores: Array<number | null | undefined>): string {
  const nums = [...d.main, ...d.supp];
  const odd = nums.filter((n) => n % 2 === 1).length;
  const even = nums.length - odd;
  const ogaVal = pastOGAScores[idx];
  const parts: string[] = [
    `${d.date}: [${d.main.join(", ")}]`,
    `Sup: [${d.supp.join(", ")}]`,
    `Odd/Even=${odd}:${even}`,
  ];
  if (typeof ogaVal === "number" && isFinite(ogaVal)) parts.push(`OGA=${ogaVal.toFixed(2)}`);
  return parts.join(" | ");
}
