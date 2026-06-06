import { describe, expect, it } from "vitest";

import type { Draw } from "../src/types";
import { getSDE1FilteredPool } from "../src/sde1";

function buildDraw(date: string, main: number[], supp: number[]): Draw {
  return { date, main, supp };
}

describe("getSDE1FilteredPool", () => {
  it("returns the full pool when history is empty", () => {
    const result = getSDE1FilteredPool([]);

    expect(result.excludedNumbers).toEqual([]);
    expect(result.pool).toHaveLength(45);
    expect(result.trace).toContain("No SDE1 exclusion");
  });

  it("uses the latest draw by date when history is chronological", () => {
    const history = [
      buildDraw("5/01/26", [1, 11, 20, 30, 40, 45], [6, 7]),
      buildDraw("5/10/26", [2, 12, 19, 25, 34, 41], [6, 7]),
    ];

    const result = getSDE1FilteredPool(history);

    expect(result.excludedNumbers).toEqual([2, 12, 22, 32, 42]);
    expect(result.trace).toContain("SDE1: Most recent draw date: 5/10/26");
  });

  it("uses the latest draw by date even when history is newest-first", () => {
    const history = [
      buildDraw("2026-05-10", [2, 12, 19, 25, 34, 41], [6, 7]),
      buildDraw("2026-05-01", [1, 11, 20, 30, 40, 45], [6, 7]),
    ];

    const result = getSDE1FilteredPool(history);

    expect(result.excludedNumbers).toEqual([2, 12, 22, 32, 42]);
    expect(result.pool).not.toContain(2);
    expect(result.pool).not.toContain(12);
    expect(result.pool).toContain(1);
    expect(result.trace).toContain("SDE1: Most recent draw date: 2026-05-10");
  });
});
