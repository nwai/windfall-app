import { describe, expect, it } from "vitest";

import {
  selectDroughtBacktestDisplayRecords,
  type DroughtBacktestDisplayRecord,
} from "../src/components/DroughtBacktestPanel";

const record = (predictDate: string, nextDate: string): DroughtBacktestDisplayRecord => ({
  indexAtPrediction: 0,
  predictDate,
  nextIndex: 1,
  nextDate,
  topK: [],
  hits: [],
});

describe("DroughtBacktestPanel display ordering", () => {
  it("shows latest prediction records first without mutating the calculated records", () => {
    const records = [
      record("2026-04-01", "2026-04-03"),
      record("2026-05-01", "2026-05-03"),
      record("2026-06-01", "2026-06-03"),
    ];

    const displayRecords = selectDroughtBacktestDisplayRecords(records, 2);

    expect(displayRecords.map((row) => row.nextDate)).toEqual(["2026-06-03", "2026-05-03"]);
    expect(records.map((row) => row.nextDate)).toEqual(["2026-04-03", "2026-05-03", "2026-06-03"]);
  });
});
