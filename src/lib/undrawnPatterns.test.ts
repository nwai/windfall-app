import { describe, expect, it } from "vitest";
import { analyzeUndrawnPatterns } from "./undrawnPatterns";
import type { Draw } from "../types";

const draw = (main: number[], supp: number[] = [44, 45], date = "2026-01-01"): Draw => ({
  date,
  main,
  supp,
});

describe("analyzeUndrawnPatterns", () => {
  it("uses five equal nine-number groups with exact hypergeometric expectations", () => {
    const analysis = analyzeUndrawnPatterns([draw([1, 10, 19, 28, 37, 45])], { includeSupp: false });

    expect(analysis.groups.map((group) => group.label)).toEqual(["1-9", "10-18", "19-27", "28-36", "37-45"]);
    expect(analysis.groups.map((group) => group.size)).toEqual([9, 9, 9, 9, 9]);
    for (const group of analysis.groups) {
      expect(group.expectedAverage).toBeCloseTo(7.8, 10);
    }
  });

  it("sanitizes invalid and duplicate draw entries instead of overcounting them", () => {
    const analysis = analyzeUndrawnPatterns([
      draw([1, 1, 0, 46, 2, 3], [4, 4, 99]),
    ], { includeSupp: true });

    expect(analysis.summary.meanUndrawn).toBe(41);
    expect(analysis.quality.drawsWithInvalidNumbers).toBe(1);
    expect(analysis.quality.invalidNumberEntries).toBe(3);
    expect(analysis.quality.drawsWithDuplicateNumbers).toBe(1);
    expect(analysis.quality.duplicateNumberEntries).toBe(2);
    expect(analysis.quality.drawsWithShortSelection).toBe(1);
  });

  it("ranks co-undrawn pairs by enrichment against a random-without-replacement baseline", () => {
    const history: Draw[] = Array.from({ length: 43 }, (_, idx) => {
      const start = idx * 3 + 1;
      const main = Array.from({ length: 6 }, (__, offset) => ((start + offset - 1) % 43) + 1);
      return draw(main, [((start + 6 - 1) % 43) + 1, ((start + 7 - 1) % 43) + 1], `2026-01-${String(idx + 1).padStart(2, "0")}`);
    });

    const analysis = analyzeUndrawnPatterns(history, { includeSupp: true });

    expect(analysis.pairs[0].numbers).toEqual([44, 45]);
    expect(analysis.pairs[0].coUndrawnCount).toBe(43);
    expect(analysis.pairs[0].expectedCount).toBeCloseTo(28.9, 1);
    expect(analysis.pairs[0].lift).toBeGreaterThan(1.4);
  });

  it("does not emit canned predictions when there is no draw history", () => {
    const analysis = analyzeUndrawnPatterns([], { includeSupp: false });

    expect(analysis.summary.draws).toBe(0);
    expect(analysis.insights).toEqual([]);
    expect(analysis.pairs).toEqual([]);
    expect(analysis.caveats).toContain("No draw history is available for undrawn-pattern analysis.");
  });
});
