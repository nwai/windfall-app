import { describe, expect, it } from "vitest";

import {
  buildHistoricalPrizeBacktest,
  selectRowsForCandidateExport,
  type GeneratedCandidateViewRow,
} from "./generatedCandidates";
import type { CandidateSet, Draw } from "../types";

const candidate = (main: number[], supp: number[] = [44, 45]): CandidateSet => ({ main, supp });
const draw = (date: string, main: number[], supp: number[] = [40, 41]): Draw => ({ date, main, supp });

describe("selectRowsForCandidateExport", () => {
  const rows: GeneratedCandidateViewRow<CandidateSet>[] = [
    { c: candidate([1, 2, 3, 4, 5, 6]), origIdx: 0, matched: true },
    { c: candidate([7, 8, 9, 10, 11, 12]), origIdx: 1, matched: false },
    { c: candidate([13, 14, 15, 16, 17, 18]), origIdx: 2, matched: true },
  ];

  it("exports only matched rows when candidate filtering is active", () => {
    expect(selectRowsForCandidateExport(rows, true).map((row) => row.origIdx)).toEqual([0, 2]);
  });

  it("exports all visible rows when candidate filtering is inactive", () => {
    expect(selectRowsForCandidateExport(rows, false).map((row) => row.origIdx)).toEqual([0, 1, 2]);
  });
});

describe("buildHistoricalPrizeBacktest", () => {
  it("sorts historical draw checks newest-first by concrete draw date", () => {
    const rows = buildHistoricalPrizeBacktest({
      history: [
        draw("2024-01-01", [1, 2, 3, 4, 5, 6]),
        draw("2024-03-01", [10, 11, 12, 13, 14, 15]),
        draw("2024-02-01", [1, 2, 3, 10, 11, 12]),
      ],
      manualSelection: [1, 2, 3, 4, 5, 6, 40, 41],
    });

    expect(rows.map((row) => row.draw.date)).toEqual(["2024-03-01", "2024-02-01", "2024-01-01"]);
    expect(rows[2].bestDiv).toBe("Div1");
  });

  it("returns no rows until manual simulation has six mains and two supplementary values", () => {
    const rows = buildHistoricalPrizeBacktest({
      history: [draw("2024-01-01", [1, 2, 3, 4, 5, 6])],
      manualSelection: [1, 2, 3, 4, 5, 6, 40],
    });

    expect(rows).toEqual([]);
  });
});
