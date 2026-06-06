import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import type { DrawRow } from "./drawHistory";
import {
  buildDrawHistorySummary,
  parseReferenceDrawRows,
  validateDrawEntry,
} from "./drawHistoryValidation";
import { drawsFromRows, rowsFromDraws } from "./drawHistoryReview";

describe("drawHistoryValidation", () => {
  it("rejects blank number slots before treating them as zero", () => {
    const result = validateDrawEntry(
      {
        date: "2026-05-26",
        mains: ["1", "2", "", "4", "5", "6"],
        supps: ["7", "8"],
      },
      { mainCount: 6, suppCount: 2, minNumber: 1, maxNumber: 45, outputDateFormat: "mdyy" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Main slot 3");
    }
  });

  it("validates a complete row and preserves the requested date format", () => {
    const result = validateDrawEntry(
      {
        date: "2026-05-26",
        mains: ["1", "2", "3", "4", "5", "6"],
        supps: ["7", "8"],
      },
      { mainCount: 6, suppCount: 2, minNumber: 1, maxNumber: 45, outputDateFormat: "mdyy" },
    );

    expect(result).toEqual({
      ok: true,
      row: { date: "5/26/26", mains: [1, 2, 3, 4, 5, 6], supps: [7, 8] },
    });
  });

  it("parses reference rows and reports rejected malformed rows", () => {
    const source = [
      "date,main1,main2,main3,main4,main5,main6,supp1,supp2",
      "2026-05-26,1,2,3,4,5,6,7,8",
      "2026-05-27,1,2,3,4,5,6,7,99",
    ].join("\n");

    const result = parseReferenceDrawRows(source, {
      mainCount: 6,
      suppCount: 2,
      minNumber: 1,
      maxNumber: 45,
      outputDateFormat: "iso",
    });

    expect(result.rows).toEqual([{ date: "2026-05-26", mains: [1, 2, 3, 4, 5, 6], supps: [7, 8] }]);
    expect(result.rejectedRowCount).toBe(1);
  });

  it("preserves simulated history flags across row conversion and summaries", () => {
    const draws: Draw[] = [
      { date: "2026-05-25", main: [1, 2, 3, 4, 5, 6], supp: [7, 8], isSimulated: true },
      { date: "2026-05-26", main: [9, 10, 11, 12, 13, 14], supp: [15, 16] },
    ];

    const rows = rowsFromDraws(draws);
    expect(rows[0]?.isSimulated).toBe(true);
    expect(drawsFromRows(rows)[0]?.isSimulated).toBe(true);

    const summary = buildDrawHistorySummary(rows as DrawRow[]);
    expect(summary.simulatedRows).toBe(1);
    expect(summary.latestDate).toBe("2026-05-26");
    expect(summary.earliestDate).toBe("2026-05-25");
  });
});
