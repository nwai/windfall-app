import { describe, expect, it } from "vitest";

import { parsePastedCandidateNumbers } from "./pasteWeightedCandidates";
import { buildCoreAndHedgePortfolio } from "./portfolioConcentration";

const sourceRows = [
  "1,2,3,4,5,6,20,21",
  "1,2,3,4,5,7,20,22",
  "1,2,3,4,6,8,21,23",
  "1,2,3,5,7,9,22,24",
  "1,2,4,6,8,10,23,25",
  "1,3,5,7,9,11,24,26",
].join("\n");

describe("buildCoreAndHedgePortfolio", () => {
  it("builds one count-derived primary line and unique controlled hedge lines", () => {
    const parsed = parsePastedCandidateNumbers(sourceRows);
    const result = buildCoreAndHedgePortfolio(parsed.rows, {
      lineCount: 6,
      coreRetention: 4,
    });

    expect(result.available).toBe(true);
    expect(result.validSourceRows).toBe(6);
    expect(result.primaryCore).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.lines).toHaveLength(6);
    expect(result.lines[0]).toMatchObject({
      role: "primary",
      numbers: [1, 2, 3, 4, 5, 6],
      coreNumbers: [1, 2, 3, 4, 5, 6],
      alternateNumbers: [],
    });

    const signatures = new Set(result.lines.map((line) => line.numbers.join(",")));
    expect(signatures.size).toBe(result.lines.length);
    result.lines.slice(1).forEach((line) => {
      expect(line.role).toBe("hedge");
      expect(line.coreNumbers).toHaveLength(4);
      expect(line.alternateNumbers).toHaveLength(2);
      expect(line.rowCountSupport).toBeGreaterThan(0);
      expect(line.pairCooccurrenceSupport).toBeGreaterThanOrEqual(0);
    });
    expect(result.outputUniqueNumbers.length).toBeGreaterThan(6);
  });

  it("uses only valid six-number and eight-number rows", () => {
    const parsed = parsePastedCandidateNumbers([
      "1,2,3,4,5,6",
      "1,2,3,4,5",
      "1,2,3,4,5,6,7,8",
      "1,2,3,4,5,6,6",
    ].join("\n"));
    const result = buildCoreAndHedgePortfolio(parsed.rows, { lineCount: 4 });

    expect(result.validSourceRows).toBe(2);
    expect(result.excludedSourceRows).toBe(2);
    expect(result.warnings.join(" ")).toContain("2 malformed source rows were excluded");
  });

  it("returns an explicit empty state instead of seeded or fallback numbers", () => {
    const result = buildCoreAndHedgePortfolio([], { lineCount: 6 });

    expect(result.available).toBe(false);
    expect(result.lines).toEqual([]);
    expect(result.primaryCore).toEqual([]);
    expect(result.reason).toContain("Add at least one valid");
  });

  it("is deterministic for identical source rows and settings", () => {
    const parsed = parsePastedCandidateNumbers(sourceRows);
    const first = buildCoreAndHedgePortfolio(parsed.rows, { lineCount: 8, coreRetention: 5 });
    const second = buildCoreAndHedgePortfolio(parsed.rows, { lineCount: 8, coreRetention: 5 });

    expect(second).toEqual(first);
  });
});
