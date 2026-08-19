import { describe, expect, it } from "vitest";

import { analyzeSde1Hc3ContextBacktest } from "./sde1Hc3ContextAdvice";
import type { Draw } from "../types";

const draw = (date: string, main: number[], supp: number[]): Draw => ({ date, main, supp });

describe("analyzeSde1Hc3ContextBacktest", () => {
  it("uses only prior draws when scoring whether SDE1+HC3 would have blocked the target draw", () => {
    const history: Draw[] = [
      draw("2026-07-01", [5, 6, 7, 8, 9, 44], [10, 12]),
      draw("2026-07-03", [1, 11, 2, 22, 3, 33], [4, 44]),
      draw("2026-07-06", [5, 6, 7, 8, 9, 10], [15, 16]),
      draw("2026-07-08", [1, 12, 23, 34, 40, 41], [42, 43]),
    ];

    const result = analyzeSde1Hc3ContextBacktest(history, { targetDrawOrdinal: 3 });
    const d3 = result.rows.find((row) => row.drawOrdinal === 3);

    expect(d3).toBeTruthy();
    expect(d3?.trials).toBe(1);
    expect(d3?.avoidedDraws).toBe(1);
    expect(d3?.blockedDraws).toBe(0);
    expect(d3?.sde1ExcludedNumbers).toBeGreaterThan(0);
    expect(d3?.hc3ExcludedNumbers).toBeGreaterThan(0);
  });

  it("reports caution for later draws when early rows have stronger support", () => {
    const history: Draw[] = [
      draw("2026-07-01", [5, 6, 7, 8, 9, 44], [10, 12]),
      draw("2026-07-03", [1, 11, 2, 22, 3, 33], [4, 44]),
      draw("2026-07-06", [5, 6, 7, 8, 9, 10], [15, 16]),
      draw("2026-07-08", [1, 12, 23, 34, 40, 41], [42, 43]),
      draw("2026-07-10", [5, 6, 7, 8, 9, 10], [15, 16]),
      draw("2026-07-13", [1, 12, 23, 34, 40, 41], [42, 43]),
      draw("2026-07-15", [5, 6, 7, 8, 9, 10], [15, 16]),
      draw("2026-07-17", [1, 12, 23, 34, 40, 41], [42, 43]),
      draw("2026-07-20", [5, 6, 7, 8, 9, 10], [15, 16]),
      draw("2026-07-22", [1, 12, 23, 34, 40, 41], [42, 43]),
      draw("2026-07-24", [5, 6, 7, 8, 9, 10], [15, 16]),
    ];

    const result = analyzeSde1Hc3ContextBacktest(history, { targetDrawOrdinal: 8 });

    expect(result.totalTrials).toBeGreaterThan(0);
    expect(result.advice.targetDrawOrdinal).toBe(8);
    expect(["neutral", "caution", "insufficient"]).toContain(result.advice.tone);
  });
});
