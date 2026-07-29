import { describe, expect, it } from "vitest";

import { buildTrendValueSeries, type TrendValueDraw } from "./trendValueSeries";

const draw = (main: number[], supp: number[]): TrendValueDraw => ({ main, supp });

describe("buildTrendValueSeries", () => {
  it("keeps prefix values identical when future draws are appended", () => {
    const prefix = [
      draw([1, 2, 3, 4, 5, 6], [7, 8]),
      draw([9, 10, 11, 12, 13, 14], [15, 16]),
      draw([17, 18, 19, 20, 21, 22], [23, 24]),
    ];
    const extended = [
      ...prefix,
      draw([25, 26, 27, 28, 29, 30], [31, 32]),
      draw([33, 34, 35, 36, 37, 38], [39, 40]),
    ];

    const prefixSeries = buildTrendValueSeries(prefix);
    const extendedSeries = buildTrendValueSeries(extended);

    for (let n = 0; n < 45; n += 1) {
      expect(extendedSeries[n].slice(0, prefix.length)).toEqual(prefixSeries[n]);
    }
  });

  it("ignores invalid draw numbers without changing the 45-row output shape", () => {
    const series = buildTrendValueSeries([
      draw([1, 2, 3, 4, 5, 99], [7, 8]),
      draw([9, 10, 11, 12, 13, 14], [15, 16]),
    ]);

    expect(series).toHaveLength(45);
    expect(series.every((row) => row.length === 2)).toBe(true);
    expect(series[98]).toBeUndefined();
  });
});
