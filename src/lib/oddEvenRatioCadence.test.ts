import { describe, expect, it } from "vitest";

import { analyzeOddEvenRatioCadence, oddEvenCombinationProbability } from "./oddEvenRatioCadence";
import type { Draw } from "../types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("odd/even ratio cadence", () => {
  it("builds mains plus supps cadence rows with all 8-number ratios", () => {
    const result = analyzeOddEvenRatioCadence([
      draw("2026-01-01", [1, 3, 5, 7, 9, 11], [2, 4]),
      draw("2026-01-02", [2, 4, 6, 8, 10, 12], [1, 3]),
    ]);

    expect(result.totalNumbers).toBe(8);
    expect(result.validDraws).toBe(2);
    expect(result.timeline.map((row) => row.ratio)).toEqual(["6:2", "2:6"]);
    expect(result.ratios.map((row) => row.ratio)).toEqual([
      "8:0",
      "7:1",
      "6:2",
      "5:3",
      "4:4",
      "3:5",
      "2:6",
      "1:7",
      "0:8",
    ]);
  });

  it("supports mains-only six-number ratios", () => {
    const result = analyzeOddEvenRatioCadence([
      draw("2026-01-01", [1, 3, 5, 2, 4, 6], [7, 9]),
    ], { scope: "mains" });

    expect(result.totalNumbers).toBe(6);
    expect(result.timeline[0].ratio).toBe("3:3");
    expect(result.ratios.map((row) => row.ratio)).toEqual([
      "6:0",
      "5:1",
      "4:2",
      "3:3",
      "2:4",
      "1:5",
      "0:6",
    ]);
  });

  it("computes exact combination baseline probabilities", () => {
    const probs = Array.from({ length: 9 }, (_, odd) => oddEvenCombinationProbability(odd, 8));

    expect(probs.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
    expect(oddEvenCombinationProbability(8, 8)).toBeGreaterThan(0);
    expect(oddEvenCombinationProbability(9, 8)).toBe(0);
  });

  it("computes interval and current-gap diagnostics", () => {
    const result = analyzeOddEvenRatioCadence([
      draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
      draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D3", [1, 3, 5, 7, 9, 11], [2, 4]),
      draw("D4", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D5", [1, 3, 5, 7, 9, 11], [2, 4]),
    ]);

    const sixTwo = result.ratios.find((row) => row.ratio === "6:2");

    expect(sixTwo?.count).toBe(3);
    expect(sixTwo?.intervals).toEqual([2, 2]);
    expect(sixTwo?.currentGap).toBe(0);
    expect(sixTwo?.meanGap).toBe(2);
    expect(sixTwo?.medianGap).toBe(2);
    expect(sixTwo?.longestGap).toBe(2);
  });

  it("distinguishes never-seen and rare observed ratios using the selected threshold", () => {
    const result = analyzeOddEvenRatioCadence([
      draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
      draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D3", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D4", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D5", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D6", [1, 3, 5, 7, 2, 4], [6, 8]),
    ], { rarePercentThreshold: 20 });

    expect(result.ratios.find((row) => row.ratio === "6:2")?.isRare).toBe(true);
    expect(result.ratios.find((row) => row.ratio === "6:2")?.isNeverSeen).toBe(false);
    expect(result.ratios.find((row) => row.ratio === "8:0")?.isRare).toBe(true);
    expect(result.ratios.find((row) => row.ratio === "8:0")?.isNeverSeen).toBe(true);
  });

  it("skips invalid draws without silently changing the denominator", () => {
    const result = analyzeOddEvenRatioCadence([
      draw("bad", [1, 1, 2, 3, 4, 5], [6, 7]),
      draw("good", [1, 3, 5, 7, 9, 11], [2, 4]),
    ]);

    expect(result.validDraws).toBe(1);
    expect(result.skippedDraws).toBe(1);
    expect(result.timeline[0].dateLabel).toBe("good");
  });
});
