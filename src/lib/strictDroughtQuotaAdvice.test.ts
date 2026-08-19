import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  buildStrictDroughtQuotaAdvice,
  buildStrictDroughtQuotaShortlist,
} from "./strictDroughtQuotaAdvice";

const draw = (main: number[], supp: number[], date: string): Draw => ({ main, supp, date });

function monthRows(year: number, month: number, offset: number): Draw[] {
  return Array.from({ length: 5 }, (_, index) => {
    const start = ((offset + index * 8) % 45) + 1;
    const numbers = Array.from({ length: 8 }, (_value, nIndex) => ((start + nIndex - 1) % 45) + 1);
    return draw(
      numbers.slice(0, 6),
      numbers.slice(6, 8),
      `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
    );
  });
}

describe("strict drought quota advice", () => {
  it("summarizes the live strict drought shortlist with rank multipliers", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], [7, 8], "2026-01-01"),
      draw([9, 10, 11, 12, 13, 14], [15, 16], "2026-01-02"),
      draw([17, 18, 19, 20, 21, 22], [23, 24], "2026-01-03"),
      draw([25, 26, 27, 28, 29, 30], [31, 32], "2026-01-04"),
    ];

    const shortlist = buildStrictDroughtQuotaShortlist(history, history, { threshold: 2, topK: 4 });

    expect(shortlist.numbers).toHaveLength(4);
    expect(Object.keys(shortlist.rankMultipliers)).toHaveLength(4);
    expect(Math.max(...Object.values(shortlist.rankMultipliers))).toBeGreaterThan(1);
  });

  it("prefers an exact month-length and draw-ordinal replay slice when enough rows exist", () => {
    const history = [
      ...monthRows(2026, 1, 0),
      ...monthRows(2026, 2, 3),
      ...monthRows(2026, 3, 6),
      ...monthRows(2026, 4, 9),
      ...monthRows(2026, 5, 12),
      ...monthRows(2026, 6, 15),
      ...monthRows(2026, 7, 18),
      ...monthRows(2026, 8, 21),
      ...monthRows(2026, 9, 24),
    ];

    const advice = buildStrictDroughtQuotaAdvice(history, {
      minHistory: 5,
      threshold: 2,
      topK: 8,
      targetMonthExpectedDrawCount: 5,
      targetDrawOrdinal: 3,
      currentShortlistSize: 8,
    });

    expect(advice.source).toBe("exact-stage");
    expect(advice.sourceLabel).toBe("5D month D3");
    expect(advice.trials).toBeGreaterThanOrEqual(6);
    expect(advice.expectedRandomOneToThreeHitRate).toBeGreaterThan(0);
    expect(advice.distribution["0"] + advice.distribution["1"] + advice.distribution["2"] + advice.distribution["3"] + advice.distribution["4+"]).toBe(advice.trials);
  });
});
