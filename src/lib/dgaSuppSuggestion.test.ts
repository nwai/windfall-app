import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildDgaSuppSuggestion } from "./dgaSuppSuggestion";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("buildDgaSuppSuggestion", () => {
  it("uses active WFMQYH supplementary counts before full-history counts", () => {
    const selected = [1, 2, 3, 4, 5, 6, 7, 8];
    const activeHistory = [
      draw("2026-06-01", [10, 11, 12, 13, 14, 15], [3, 5]),
      draw("2026-06-03", [10, 11, 12, 13, 14, 15], [3, 9]),
    ];
    const fullHistory = [
      draw("2025-01-01", [10, 11, 12, 13, 14, 15], [7, 8]),
      draw("2025-01-03", [10, 11, 12, 13, 14, 15], [7, 8]),
      draw("2025-01-05", [10, 11, 12, 13, 14, 15], [7, 8]),
      ...activeHistory,
    ];

    const suggestion = buildDgaSuppSuggestion(selected, activeHistory, fullHistory);

    expect(suggestion?.supp).toEqual([3, 5]);
    expect(suggestion?.main).toEqual([1, 2, 4, 6, 7, 8]);
    expect(suggestion?.evidence.slice(0, 3).map((row) => row.number)).toEqual([3, 5, 7]);
    expect(suggestion?.reason).toContain("not a probability");
  });

  it("uses full real-history supplementary counts to break active-window ties", () => {
    const selected = [1, 2, 3, 4, 5, 6, 7, 8];
    const activeHistory = [
      draw("2026-06-01", [10, 11, 12, 13, 14, 15], [3, 5]),
    ];
    const fullHistory = [
      draw("2025-01-01", [10, 11, 12, 13, 14, 15], [5, 8]),
      draw("2025-01-03", [10, 11, 12, 13, 14, 15], [5, 8]),
      draw("2025-01-05", [10, 11, 12, 13, 14, 15], [3, 8]),
      ...activeHistory,
    ];

    const suggestion = buildDgaSuppSuggestion(selected, activeHistory, fullHistory);

    expect(suggestion?.supp).toEqual([3, 5]);
    expect(suggestion?.evidence.slice(0, 3).map((row) => row.number)).toEqual([5, 3, 8]);
  });

  it("uses exact supplementary-pair history as a tie-breaker when individual evidence is tied", () => {
    const selected = [1, 2, 3, 4, 5, 6, 7, 8];
    const activeHistory = [
      draw("2026-06-01", [10, 11, 12, 13, 14, 15], [1, 9]),
      draw("2026-06-03", [10, 11, 12, 13, 14, 15], [2, 9]),
      draw("2026-06-05", [10, 11, 12, 13, 14, 15], [3, 4]),
    ];

    const suggestion = buildDgaSuppSuggestion(selected, activeHistory, activeHistory);

    expect(suggestion?.supp).toEqual([3, 4]);
    expect(suggestion?.selectedPair).toEqual([3, 4]);
    expect(suggestion?.selectedPairEvidence.activePairSuppCount).toBe(1);
    expect(suggestion?.pairCoverage.activeObservedPairs).toBe(1);
    expect(suggestion?.pairCoverage.totalPairs).toBe(28);
    expect(suggestion?.reason).toContain("tie-breaker");
  });

  it("returns null unless exactly eight unique selected numbers are available", () => {
    const history = [draw("2026-06-01", [1, 2, 3, 4, 5, 6], [7, 8])];

    expect(buildDgaSuppSuggestion([1, 2, 3, 4, 5, 6, 7], history, history)).toBeNull();
    expect(buildDgaSuppSuggestion([1, 2, 3, 4, 5, 6, 7, 8, 9], history, history)).toBeNull();
  });

  it("returns null rather than inventing a recommendation when no selected number has supplementary evidence", () => {
    const history = [draw("2026-06-01", [1, 2, 3, 4, 5, 6], [44, 45])];

    expect(buildDgaSuppSuggestion([7, 8, 9, 10, 11, 12, 13, 14], history, history)).toBeNull();
  });
});
