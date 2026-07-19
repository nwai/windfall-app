import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { getLatestObservedMonthDrawCount } from "./repeatWindowDefault";

const draw = (date: string, isSimulated = false): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
  isSimulated,
});

describe("getLatestObservedMonthDrawCount", () => {
  it("counts draws in the latest observed month even when history is unsorted", () => {
    const result = getLatestObservedMonthDrawCount([
      draw("2026-06-03"),
      draw("2026-07-01"),
      draw("2026-06-05"),
      draw("2026-07-03"),
      draw("2026-05-29"),
    ]);

    expect(result).toEqual({ monthLabel: "2026-07", drawCount: 2 });
  });

  it("accepts lottolyzer slash dates", () => {
    const result = getLatestObservedMonthDrawCount([
      draw("6/29/26"),
      draw("7/1/26"),
      draw("7/3/26"),
    ]);

    expect(result).toEqual({ monthLabel: "2026-07", drawCount: 2 });
  });

  it("ignores simulated and unparseable rows", () => {
    const result = getLatestObservedMonthDrawCount([
      draw("not-a-date"),
      draw("2026-06-29"),
      draw("2026-07-01", true),
    ]);

    expect(result).toEqual({ monthLabel: "2026-06", drawCount: 1 });
  });

  it("returns null when no real dated draw exists", () => {
    expect(getLatestObservedMonthDrawCount([draw("2026-07-01", true), draw("")])).toBeNull();
  });
});
