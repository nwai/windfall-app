import { describe, expect, it } from "vitest";

import { compressPortfolioCandidates } from "./portfolioCompression";

describe("compressPortfolioCandidates", () => {
  it("ranks numbers by how many portfolio rows contain them", () => {
    const result = compressPortfolioCandidates([
      "1,2,3,4,5,6,7,8",
      "1,2,3,4,5,9,10,11",
      "1,2,3,4,12,13,14,15",
      "1,2,3,16,17,18,19,20",
      "1,2,21,22,23,24,25,26",
      "1,27,28,29,30,31,32,33",
    ].join("\n"));

    expect(result.acceptedRows).toBe(6);
    expect(result.uniqueNumbers).toBe(33);
    expect(result.coreNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.rankedNumbers.slice(0, 6).map((row) => row.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.rankedNumbers[0]).toMatchObject({
      number: 1,
      gameCount: 6,
      rowShare: 1,
      role: "core",
    });
    expect(result.rankedNumbers[5]).toMatchObject({
      number: 6,
      gameCount: 1,
      role: "core",
    });
  });

  it("ignores numbered-list labels and does not double-count duplicates in one row", () => {
    const result = compressPortfolioCandidates([
      "1",
      "32 4 12 8 19 27 32",
      "2",
      "12 5 6 23 30 31",
      "3",
      "12,4,6,8,19,30",
    ].join("\n"));

    const countByNumber = new Map(result.rankedNumbers.map((row) => [row.number, row.gameCount]));

    expect(result.acceptedRows).toBe(3);
    expect(countByNumber.get(12)).toBe(3);
    expect(countByNumber.get(32)).toBe(1);
    expect(result.rows.map((row) => row.lineNumber)).toEqual([2, 4, 6]);
    expect(result.rows[0].duplicateNumbers).toEqual([32]);
  });

  it("flags suspicious row sizes without blocking count compression", () => {
    const result = compressPortfolioCandidates([
      "1,2,3,4,5",
      "1,2,3,4,5,6,7,8,9",
      "1,2,3,4,5,6",
    ].join("\n"));

    expect(result.acceptedRows).toBe(3);
    expect(result.validGameRows).toBe(1);
    expect(result.rowIssueCount).toBe(2);
    expect(result.warnings).toContain("2 rows do not look like a 6-number or 8-number game; they were counted but should be reviewed.");
  });

  it("identifies duplicate games while preserving them as repeated evidence", () => {
    const result = compressPortfolioCandidates([
      "1,2,3,4,5,6",
      "6,5,4,3,2,1",
      "1,2,3,4,5,7",
    ].join("\n"));

    expect(result.acceptedRows).toBe(3);
    expect(result.duplicateGameCount).toBe(1);
    expect(result.duplicateGames).toEqual([
      { signature: "1,2,3,4,5,6", lineNumbers: [1, 2] },
    ]);
    expect(result.rankedNumbers.find((row) => row.number === 6)?.gameCount).toBe(2);
  });

  it("returns no core when fewer than six unique numbers are available", () => {
    const result = compressPortfolioCandidates("1,2,3\n1,2,4");

    expect(result.coreNumbers).toEqual([]);
    expect(result.warnings).toContain("Paste at least six distinct valid numbers before compressing to a six-number core.");
  });
});
