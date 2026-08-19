import { describe, expect, it } from "vitest";

import {
  selectDroughtBacktestDisplayRecords,
  type DroughtBacktestDisplayRecord,
} from "../src/components/DroughtBacktestPanel";

const record = (nextDate: string): DroughtBacktestDisplayRecord => ({
  targetIndex: 1,
  targetDrawNumber: 2,
  targetDate: nextDate,
  targetMonthComplete: true,
  trainingDraws: 1,
  shortlist: [],
  actualNumbers: [],
  shortlistBucketCountsBefore: {
    Undrawn: 0,
    "1x": 0,
    "2x": 0,
    "3x": 0,
    "4x": 0,
    "5x": 0,
    "6x": 0,
    "7x": 0,
    "8x+": 0,
  },
  actualOriginBucketCounts: {
    Undrawn: 0,
    "1x": 0,
    "2x": 0,
    "3x": 0,
    "4x": 0,
    "5x": 0,
    "6x": 0,
    "7x": 0,
    "8x+": 0,
  },
  hits: [],
  hitCount: 0,
  inObservedBand: false,
});

describe("DroughtBacktestPanel display ordering", () => {
  it("shows latest prediction records first without mutating the calculated records", () => {
    const records = [
      record("2026-04-03"),
      record("2026-05-03"),
      record("2026-06-03"),
    ];

    const displayRecords = selectDroughtBacktestDisplayRecords(records, 2);

    expect(displayRecords.map((row) => row.targetDate)).toEqual(["2026-06-03", "2026-05-03"]);
    expect(records.map((row) => row.targetDate)).toEqual(["2026-04-03", "2026-05-03", "2026-06-03"]);
  });
});
