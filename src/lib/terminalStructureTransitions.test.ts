import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzeTerminalStructureTransitions } from "./terminalStructureTransitions";

const transitionHistory = (): Draw[] => [
  {
    date: "9/2/26",
    main: [1, 11, 22, 33, 45, 37],
    supp: [8, 40],
  },
  {
    date: "9/4/26",
    main: [21, 12, 23, 34, 36, 38],
    supp: [5, 30],
  },
  {
    date: "9/7/26",
    main: [2, 13, 24, 36, 38, 5],
    supp: [7, 30],
  },
];

const completeMonth = (year: number, month: number): Draw[] => {
  const draws: Draw[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) break;
    if (![1, 3, 5].includes(date.getDay())) continue;
    draws.push({
      date: `${month}/${day}/${String(year).slice(-2)}`,
      main: [1, 11, 22, 33, 45, 37],
      supp: [8, 40],
    });
  }
  return draws;
};

describe("terminal structure transitions", () => {
  it("keeps terminal families separate from exact sequence motifs", () => {
    const history = transitionHistory();
    const result = analyzeTerminalStructureTransitions(history, {
      contextDraws: history,
      historyScope: "wfmqyh",
      includeSupp: true,
      motifLength: 3,
    });

    const familyOne = result.familyRuns.rows.find((row) => row.digit === 1);
    const motif123 = result.motifs.rows.find((row) => row.digits.join("-") === "1-2-3");

    expect(result.familyRuns.testableDrawCount).toBe(2);
    expect(familyOne?.trials).toBe(1);
    expect(familyOne?.hits).toBe(1);
    expect(motif123?.trials).toBe(2);
    expect(motif123?.hits).toBe(1);
    expect(motif123?.expectedRate).toBeGreaterThan(0);
    expect(motif123?.expectedRate).toBeLessThan(1);
  });

  it("records exact, shifted, expanded, and contracted motif responses independently", () => {
    const history = transitionHistory();
    const result = analyzeTerminalStructureTransitions(history, {
      contextDraws: history,
      historyScope: "wfmqyh",
      includeSupp: true,
      motifLength: 3,
    });

    const exact = result.movements.rows.find((row) => row.kind === "exact");
    const shiftedForward = result.movements.rows.find((row) => row.kind === "shift-forward");
    const contraction = result.movements.rows.find((row) => row.kind === "contract");

    expect(exact?.trials).toBeGreaterThan(0);
    expect(shiftedForward?.hits).toBeGreaterThan(0);
    expect(contraction?.available).toBe(true);
    expect(contraction?.expectedRate).toBeGreaterThan(0);
  });

  it("labels the latest family state without confirming a seed from the same draw", () => {
    const history = transitionHistory();
    const result = analyzeTerminalStructureTransitions(history, {
      contextDraws: history,
      historyScope: "wfmqyh",
      includeSupp: true,
    });
    const familyOne = result.familyRuns.currentRows.find((row) => row.digit === 1);

    expect(familyOne?.status).toBe("ended");
    expect(result.currentDrawOrdinal).toBe(3);
    expect(result.previousDrawOrdinal).toBe(2);
  });

  it("ignores simulated and malformed rows instead of inventing transition evidence", () => {
    const history: Draw[] = [
      ...transitionHistory(),
      { date: "9/9/26", main: [1, 2, 3, 4, 5, 6], supp: [7, 8], isSimulated: true },
      { date: "not-a-date", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
    ];
    const result = analyzeTerminalStructureTransitions(history, {
      contextDraws: history,
      historyScope: "wfmqyh",
      includeSupp: true,
    });

    expect(result.evidenceDrawCount).toBe(3);
    expect(result.warnings.some((warning) => warning.includes("simulated"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("invalid"))).toBe(true);
  });

  it("keeps an incomplete current month out of the completed-month baseline", () => {
    const completed = completeMonth(2026, 8);
    const current: Draw[] = [
      { date: "9/2/26", main: [2, 12, 23, 34, 36, 38], supp: [5, 30] },
    ];
    const history = [...completed, ...current];
    const result = analyzeTerminalStructureTransitions(history, {
      contextDraws: history,
      historyScope: "all-baseline",
      includeSupp: true,
    });

    expect(result.evidenceMonthCount).toBe(1);
    expect(result.evidenceDrawCount).toBe(completed.length);
    expect(result.currentMonthKey).toBe("2026-09");
    expect(result.currentDrawOrdinal).toBe(1);
  });
});
