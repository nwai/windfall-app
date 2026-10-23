import { describe, expect, it } from "vitest";

import {
  buildHistoricalPrizeBacktest,
  candidateTerminalComposition,
  formatCandidateRowsForPasteWeightedGenerator,
  selectRowsForCandidateExport,
  type GeneratedCandidateViewRow,
} from "./generatedCandidates";
import type { CandidateSet, Draw } from "../types";

const candidate = (main: number[], supp: number[] = [44, 45]): CandidateSet => ({ main, supp });
const draw = (date: string, main: number[], supp: number[] = [40, 41]): Draw => ({ date, main, supp });

describe("candidateTerminalComposition", () => {
  it("derives the full eight-number shape and separate maximal runs without changing the candidate", () => {
    const row = candidate([2, 12, 3, 4, 6, 16], [7, 8]);
    const original = structuredClone(row);
    expect(candidateTerminalComposition(row)).toEqual({
      shape: "2+2+1+1+1+1", runs: ["2-3-4", "6-7-8"], assignedRun: null,
    });
    expect(row).toEqual(original);
  });

  it("merges adjacent digits and preserves circular runs", () => {
    expect(candidateTerminalComposition(candidate([9, 10, 11, 19, 20, 21], [30, 31]))).toEqual({
      shape: "3+3+2", runs: ["9-0-1"], assignedRun: null,
    });
    expect(candidateTerminalComposition(candidate([2, 12, 3, 4, 5, 15], [22, 25])).runs).toEqual(["2-3-4-5"]);
  });

  it("records only an assigned quota that is an actual maximal run in that candidate", () => {
    const row = candidate([2, 12, 3, 4, 6, 16], [7, 8]);
    expect(candidateTerminalComposition({ ...row, terminalRunQuota: "6-7-8" }).assignedRun).toBe("6-7-8");
    expect(candidateTerminalComposition({ ...row, terminalRunQuota: "2-3" }).assignedRun).toBeNull();
    expect(candidateTerminalComposition({ ...row, terminalRunQuota: "9-0-1" }).assignedRun).toBeNull();
  });

  it("distinguishes a valid candidate with no adjacent digits from unavailable composition", () => {
    expect(candidateTerminalComposition(candidate([2, 12, 22, 32, 7, 17], [27, 37]))).toEqual({
      shape: "4+4", runs: [], assignedRun: null,
    });
    for (const row of [
      candidate([1, 2, 3, 4, 5], [7, 8]),
      candidate([1, 2, 3, 4, 5, 6], [6, 8]),
      candidate([1, 2, 3, 4, 5, 46], [7, 8]),
      candidate([1, 2, 3, 4, 5, 6, 7], [8]),
    ]) {
      expect(candidateTerminalComposition({ ...row, terminalRunQuota: "2-3-4" })).toEqual({
        shape: null, runs: [], assignedRun: null,
      });
    }
  });
});

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

describe("formatCandidateRowsForPasteWeightedGenerator", () => {
  it("exports generated rows as mains plus supplementary values when available", () => {
    const rows: GeneratedCandidateViewRow<CandidateSet>[] = [
      { c: candidate([1, 2, 3, 4, 5, 6], [22, 28]), origIdx: 0 },
      { c: candidate([7, 8, 9, 10, 11, 12], []), origIdx: 1 },
    ];

    expect(formatCandidateRowsForPasteWeightedGenerator(rows)).toBe(
      "1,2,3,4,5,6,22,28\n7,8,9,10,11,12",
    );
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
