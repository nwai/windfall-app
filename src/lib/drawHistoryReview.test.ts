import { describe, expect, it } from "vitest";
import type { DrawRow } from "./drawHistory";
import {
  addSourceRowIfMissing,
  analyzeDrawHistoryRows,
  applyAutomaticHistoryCorrections,
  applySafeOfficialSourceCorrections,
  compareOfficialSourceRows,
  keepOnlyDateVersion,
  keepOnlyNumbersVersion,
  normalizeHistoryDate,
  replaceLocalDateWithSourceRow,
} from "./drawHistoryReview";

const baseRow: DrawRow = {
  date: "10/27/25",
  mains: [1, 2, 3, 4, 5, 6],
  supps: [7, 8],
};

describe("drawHistoryReview", () => {
  it("normalizes short CSV dates to ISO keys", () => {
    expect(normalizeHistoryDate("10/27/25")).toBe("2025-10-27");
    expect(normalizeHistoryDate("2025-10-27")).toBe("2025-10-27");
  });

  it("detects exact duplicates and auto-drops later copies", () => {
    const rows: DrawRow[] = [
      baseRow,
      { ...baseRow, date: "2025-10-27" },
      { date: "10/28/25", mains: [9, 10, 11, 12, 13, 14], supps: [15, 16] },
    ];

    const review = analyzeDrawHistoryRows(rows);
    expect(review.exactDuplicateIssues).toHaveLength(1);
    expect(review.autoDropIndices).toEqual([1]);

    const corrected = applyAutomaticHistoryCorrections(rows, review);
    expect(corrected).toEqual([
      baseRow,
      { date: "10/28/25", mains: [9, 10, 11, 12, 13, 14], supps: [15, 16] },
    ]);
  });

  it("flags conflicting rows on the same draw date when only one number differs", () => {
    const rows: DrawRow[] = [
      baseRow,
      { date: "2025-10-27", mains: [1, 2, 3, 4, 5, 9], supps: [7, 8] },
      { date: "10/28/25", mains: [9, 10, 11, 12, 13, 14], supps: [15, 16] },
    ];

    const review = analyzeDrawHistoryRows(rows);
    expect(review.sameDateConflictIssues).toHaveLength(1);
    expect(review.sameDateConflictIssues[0]?.differingValueCount).toBe(2);
    expect(review.sameDateConflictIssues[0]?.description).toContain("Only one number differs");

    expect(keepOnlyDateVersion(rows, 1)).toEqual([
      { date: "2025-10-27", mains: [1, 2, 3, 4, 5, 9], supps: [7, 8] },
      { date: "10/28/25", mains: [9, 10, 11, 12, 13, 14], supps: [15, 16] },
    ]);
  });

  it("flags repeated number sets on different dates and lets one version win", () => {
    const rows: DrawRow[] = [
      { date: "10/27/25", mains: [2, 4, 6, 8, 10, 12], supps: [14, 16] },
      { date: "10/29/25", mains: [2, 4, 6, 8, 10, 12], supps: [14, 16] },
      { date: "10/30/25", mains: [1, 3, 5, 7, 9, 11], supps: [13, 15] },
    ];

    const review = analyzeDrawHistoryRows(rows);
    expect(review.sameNumbersDifferentDateIssues).toHaveLength(1);
    expect(keepOnlyNumbersVersion(rows, 1)).toEqual([
      { date: "10/29/25", mains: [2, 4, 6, 8, 10, 12], supps: [14, 16] },
      { date: "10/30/25", mains: [1, 3, 5, 7, 9, 11], supps: [13, 15] },
    ]);
  });

  it("compares official source rows against local history by date", () => {
    const localRows: DrawRow[] = [
      { date: "10/27/25", mains: [1, 2, 3, 4, 5, 6], supps: [7, 8] },
      { date: "10/28/25", mains: [9, 10, 11, 12, 13, 14], supps: [15, 16] },
      { date: "10/29/25", mains: [17, 18, 19, 20, 21, 22], supps: [23, 24] },
    ];
    const sourceRows: DrawRow[] = [
      { date: "2025-10-27", mains: [1, 2, 3, 4, 5, 6], supps: [7, 8] },
      { date: "2025-10-28", mains: [9, 10, 11, 12, 13, 99], supps: [15, 16] },
      { date: "2025-10-30", mains: [25, 26, 27, 28, 29, 30], supps: [31, 32] },
    ];

    const comparison = compareOfficialSourceRows(localRows, sourceRows);
    expect(comparison.exactMatchCount).toBe(1);
    expect(comparison.conflictingDates).toHaveLength(1);
    expect(comparison.conflictingDates[0]?.normalizedDate).toBe("2025-10-28");
    expect(comparison.missingInLocal).toHaveLength(1);
    expect(comparison.missingInLocal[0]?.normalizedDate).toBe("2025-10-30");
    expect(comparison.extraInLocal).toHaveLength(1);
    expect(comparison.extraInLocal[0]?.normalizedDate).toBe("2025-10-29");
  });

  it("can add missing source rows and replace conflicting local dates safely", () => {
    const localRows: DrawRow[] = [
      { date: "10/27/25", mains: [1, 2, 3, 4, 5, 6], supps: [7, 8] },
      { date: "10/28/25", mains: [9, 10, 11, 12, 13, 14], supps: [15, 16] },
    ];
    const sourceRows: DrawRow[] = [
      { date: "2025-10-28", mains: [9, 10, 11, 12, 13, 17], supps: [15, 16] },
      { date: "2025-10-29", mains: [18, 19, 20, 21, 22, 23], supps: [24, 25] },
    ];

    const comparison = compareOfficialSourceRows(localRows, sourceRows);
    const applied = applySafeOfficialSourceCorrections(localRows, comparison);
    expect(applied).toEqual([
      { date: "2025-10-29", mains: [18, 19, 20, 21, 22, 23], supps: [24, 25] },
      { date: "2025-10-28", mains: [9, 10, 11, 12, 13, 17], supps: [15, 16] },
      { date: "10/27/25", mains: [1, 2, 3, 4, 5, 6], supps: [7, 8] },
    ]);

    expect(addSourceRowIfMissing(localRows, sourceRows[1])).toHaveLength(3);
    expect(replaceLocalDateWithSourceRow(localRows, sourceRows[0])[0]).toEqual(sourceRows[0]);
  });
});
