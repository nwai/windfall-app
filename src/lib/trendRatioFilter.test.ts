import { describe, expect, it } from "vitest";
import { buildTrendRatioFilterModel } from "./trendRatioFilter";
import type { TrendRatioStat } from "./computeHistoricalTrendRatios";

describe("buildTrendRatioFilterModel", () => {
  it("summarizes selected historical coverage and drops unsupported selections", () => {
    const stats: TrendRatioStat[] = [
      { tag: "4-2-2", count: 10, percent: 66.67, up: 40, down: 20, flat: 20 },
      { tag: "2-3-3", count: 5, percent: 33.33, up: 10, down: 15, flat: 15 },
    ];

    const model = buildTrendRatioFilterModel(stats, ["4-2-2", "9-0-0", "bad"]);

    expect(model.summary.eligibleDraws).toBe(15);
    expect(model.summary.selectedDraws).toBe(10);
    expect(model.summary.coveragePercent).toBe(66.67);
    expect(model.summary.selectedRatioCount).toBe(1);
    expect(model.cleanedAllowedRatios).toEqual(["4-2-2"]);
    expect(model.rows.find((row) => row.tag === "4-2-2")?.selected).toBe(true);
  });

  it("computes robust row diagnostics without trusting malformed ratio tags", () => {
    const stats: TrendRatioStat[] = [
      { tag: "8-0-0", count: 1, percent: 50, up: 8, down: 0, flat: 0 },
      { tag: "0-4-4", count: 1, percent: 50, up: 0, down: 4, flat: 4 },
      { tag: "4-4-4", count: 99, percent: 99, up: 4, down: 4, flat: 4 },
    ];

    const model = buildTrendRatioFilterModel(stats, ["0-4-4"]);

    expect(model.rows.map((row) => row.tag)).toEqual(["0-4-4", "8-0-0"]);
    expect(model.summary.eligibleDraws).toBe(2);
    expect(model.summary.pUp).toBeCloseTo(0.5, 5);
    expect(model.rows.every((row) => Number.isFinite(row.posteriorMean))).toBe(true);
    expect(model.rows.every((row) => row.up + row.down + row.flat === 8)).toBe(true);
  });
});
