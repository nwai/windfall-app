import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { buildPortfolioWindowShapeEvidence } from "./portfolioWindowShape";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("buildPortfolioWindowShapeEvidence", () => {
  it("derives per-number shape evidence from active-window low/mid/high, parity, and mean profile", () => {
    const history = [
      draw("2026-01-01", [1, 3, 5, 7, 9, 11]),
      draw("2026-01-03", [2, 4, 6, 8, 10, 12]),
      draw("2026-01-05", [31, 33, 35, 37, 39, 41]),
    ];

    const evidence = buildPortfolioWindowShapeEvidence(history);
    const one = evidence.rows.find((row) => row.number === 1);
    const sixteen = evidence.rows.find((row) => row.number === 16);

    expect(evidence.totalDraws).toBe(3);
    expect(evidence.averageNumber).toBeCloseTo(16.33, 2);
    expect(one).toMatchObject({
      band: "low",
      parity: "odd",
      bandLabel: "Low +33pp",
      parityLabel: "Odd +16pp",
      status: "fit",
    });
    expect(one?.meanLabel).toBe("Mean -15.3");
    expect(sixteen).toMatchObject({
      band: "mid",
      parity: "even",
      bandLabel: "Mid -33pp",
      parityLabel: "Even -16pp",
      status: "against",
    });
    expect((one?.fitScore ?? 0)).toBeGreaterThan(sixteen?.fitScore ?? 100);
  });
});
