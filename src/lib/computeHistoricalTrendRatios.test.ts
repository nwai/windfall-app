import { describe, expect, it } from "vitest";

import { computeHistoricalTrendRatios } from "./computeHistoricalTrendRatios";

function draw(main: number[], supp: number[]) {
  return { main, supp };
}

function buildFlatSeries(length: number): number[][] {
  return Array.from({ length: 45 }, () => Array(length).fill(0.2));
}

function allTrendRatioTags(): string[] {
  const tags: string[] = [];
  for (let up = 0; up <= 8; up += 1) {
    for (let down = 0; down <= 8 - up; down += 1) {
      const flat = 8 - up - down;
      tags.push(`${up}-${down}-${flat}`);
    }
  }
  return tags;
}

describe("computeHistoricalTrendRatios", () => {
  it("returns the complete 45-row UP-DOWN-FLAT ratio space, including zero-observed rows", () => {
    const valueSeries = buildFlatSeries(3);
    const stats = computeHistoricalTrendRatios({
      lookback: 1,
      threshold: 0.05,
      valueSeries,
      historyDraws: [
        draw([1, 2, 3, 4, 5, 6], [7, 8]),
        draw([9, 10, 11, 12, 13, 14], [15, 16]),
        draw([17, 18, 19, 20, 21, 22], [23, 24]),
      ],
    });

    expect(stats).toHaveLength(45);
    expect(stats.map((row) => row.tag).sort()).toEqual(allTrendRatioTags().sort());
    expect(stats.reduce((sum, row) => sum + row.count, 0)).toBe(1);
    expect(stats.find((row) => row.tag === "0-0-8")?.count).toBe(1);
    expect(stats.find((row) => row.tag === "8-0-0")?.count).toBe(0);
  });

  it("classifies draw t using only trend values available before draw t", () => {
    const valueSeries = buildFlatSeries(3);
    for (let n = 1; n <= 8; n += 1) {
      valueSeries[n - 1] = [0.1, 0.3, 0.0];
    }

    const stats = computeHistoricalTrendRatios({
      lookback: 1,
      threshold: 0.05,
      valueSeries,
      historyDraws: [
        draw([30, 31, 32, 33, 34, 35], [36, 37]),
        draw([20, 21, 22, 23, 24, 25], [26, 27]),
        draw([1, 2, 3, 4, 5, 6], [7, 8]),
      ],
    });

    expect(stats.reduce((sum, row) => sum + row.count, 0)).toBe(1);
    expect(stats.find((row) => row.tag === "8-0-0")?.count).toBe(1);
    expect(stats.find((row) => row.tag === "0-8-0")?.count).toBe(0);
  });
});
