import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  runPortfolioCompressionBacktest,
  selectCompressedStructuralNumbers,
  selectSimpleFrequencyNumbers,
} from "./portfolioBacktest";

const draw = (main: number[], index: number): Draw => ({
  main,
  supp: [],
  date: `2026-01-${String(index + 1).padStart(2, "0")}`,
});

describe("portfolioBacktest", () => {
  it("rejects invalid 6/45 main draw rows before backtesting", () => {
    const result = runPortfolioCompressionBacktest([
      draw([1, 2, 3, 4, 5, 6], 0),
      draw([1, 1, 3, 4, 5, 46], 1),
      draw([7, 8, 9, 10, 11, 12], 2),
    ], { minTrainingDraws: 1, monteCarloIterations: 16, seed: 7 });

    expect(result.valid).toBe(false);
    expect(result.drawsEvaluated).toBe(0);
    expect(result.errors.join(" ")).toContain("row 2");
    expect(result.errors.join(" ")).toContain("six unique main numbers between 1 and 45");
  });

  it("does not let future-only numbers leak into walk-forward selections", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6], 0),
      draw([7, 8, 9, 10, 11, 12], 1),
      draw([1, 2, 3, 4, 5, 6], 2),
      draw([7, 8, 9, 10, 11, 12], 3),
      draw([1, 2, 3, 4, 5, 6], 4),
      draw([7, 8, 9, 10, 11, 12], 5),
      draw([40, 41, 42, 43, 44, 45], 6),
    ];

    const result = runPortfolioCompressionBacktest(history, {
      minTrainingDraws: 6,
      monteCarloIterations: 16,
      seed: 11,
    });

    expect(result.valid).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.compressed.selection).not.toContain(45);
    expect(result.records[0]?.simpleFrequency.selection).not.toContain(45);
  });

  it("uses compressed structural transitions instead of raw frequency when the latest state supports it", () => {
    const lowRun = [1, 2, 3, 4, 5, 6];
    const highRun = [40, 41, 42, 43, 44, 45];
    const training = [
      draw(lowRun, 0),
      draw(highRun, 1),
      draw(lowRun, 2),
      draw(highRun, 3),
      draw(lowRun, 4),
    ];

    expect(selectSimpleFrequencyNumbers(training)).toEqual(lowRun);
    expect(selectCompressedStructuralNumbers(training)).toEqual(highRun);
  });

  it("reports tier scoring, risk diagnostics, and bounded significance estimates", () => {
    const lowRun = [1, 2, 3, 4, 5, 6];
    const highRun = [40, 41, 42, 43, 44, 45];
    const history = Array.from({ length: 24 }, (_, index) => (
      draw(index % 2 === 0 ? lowRun : highRun, index)
    ));

    const result = runPortfolioCompressionBacktest(history, {
      minTrainingDraws: 5,
      monteCarloIterations: 64,
      seed: 19,
    });

    expect(result.valid).toBe(true);
    expect(result.drawsEvaluated).toBe(19);
    expect(result.records).toHaveLength(19);
    expect(result.strategies.compressed.equityCurve).toHaveLength(20);
    expect(result.strategies.compressed.drawdownCurve).toHaveLength(20);
    expect(result.strategies.compressed.risk.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.strategies.compressed.risk.sharpe).not.toBeNull();
    expect(result.compressedVsSimple.pValue).toBeGreaterThanOrEqual(0);
    expect(result.compressedVsSimple.pValue).toBeLessThanOrEqual(1);
    expect(result.monteCarlo.compressedPValue).toBeGreaterThanOrEqual(0);
    expect(result.monteCarlo.compressedPValue).toBeLessThanOrEqual(1);
    expect(result.strategies.compressed.hitCounts[6]).toBeGreaterThan(0);
  });
});
