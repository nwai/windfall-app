import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { buildPortfolioAdjacentComboEvidence } from "./portfolioAdjacentCombos";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("buildPortfolioAdjacentComboEvidence", () => {
  it("summarises core pair and triple cohesion from observed draw history", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-01-03", [1, 2, 3, 4, 5, 6]),
      draw("2026-01-05", [1, 2, 3, 4, 5, 6]),
    ];

    const evidence = buildPortfolioAdjacentComboEvidence(history, [1, 2, 3, 4, 5, 6], []);

    expect(evidence.available).toBe(true);
    expect(evidence.summary).toMatchObject({
      status: "strong",
      supportedPairs: 15,
      totalPairs: 15,
      supportedTriples: 20,
      totalTriples: 20,
      weakPairCount: 0,
    });
    expect(evidence.summary?.topPairs[0]).toMatchObject({
      key: "1-2",
      count: 3,
      currentStreak: 3,
      drawsSinceSeen: 0,
    });
    expect(evidence.summary?.topTriples[0]).toMatchObject({
      key: "1-2-3",
      count: 3,
    });
  });

  it("identifies the best alternate swap without mutating the core", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-01-03", [1, 2, 3, 4, 5, 7]),
      draw("2026-01-05", [1, 2, 3, 4, 5, 7]),
      draw("2026-01-07", [1, 2, 3, 4, 5, 7]),
    ];

    const evidence = buildPortfolioAdjacentComboEvidence(
      history,
      [1, 2, 3, 4, 5, 6],
      [7, 8],
    );

    expect(evidence.available).toBe(true);
    expect(evidence.bestSwaps[0]).toMatchObject({
      alternateNumber: 7,
      removedNumber: 6,
      direction: "improve",
    });
    expect(evidence.bestSwaps[0]?.scoreDelta ?? 0).toBeGreaterThan(0);
    expect(evidence.bestSwaps.find((swap) => swap.alternateNumber === 8)?.direction).toBe("weaker");
    expect(evidence.coreNumbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reports unavailable evidence honestly when history or core is missing", () => {
    const noHistory = buildPortfolioAdjacentComboEvidence([], [1, 2, 3, 4, 5, 6], [7]);
    const noCore = buildPortfolioAdjacentComboEvidence([draw("2026-01-01", [1, 2, 3, 4, 5, 6])], [1, 2, 3], [7]);

    expect(noHistory.available).toBe(false);
    expect(noHistory.reason).toBe("Needs active draw history.");
    expect(noCore.available).toBe(false);
    expect(noCore.reason).toBe("Needs a six-number core.");
  });
});
