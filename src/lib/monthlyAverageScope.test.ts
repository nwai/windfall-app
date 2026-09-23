import { describe, expect, it } from "vitest";

import {
  filterRowsForHistoryBaselines,
  getExcludedMonthLabelsForHistoryBaselines,
  isMonthExcludedFromHistoryBaselines,
} from "./monthlyAverageScope";

describe("monthlyAverageScope", () => {
  it("marks the opening partial month as excluded from history baselines", () => {
    expect(isMonthExcludedFromHistoryBaselines("2024-05", "5/20/24")).toBe(true);
    expect(isMonthExcludedFromHistoryBaselines("2024-05", "5/1/24")).toBe(false);
    expect(isMonthExcludedFromHistoryBaselines("2024-06", "6/3/24")).toBe(false);
    expect(isMonthExcludedFromHistoryBaselines("2024-06", "6/5/24")).toBe(true);
    expect(isMonthExcludedFromHistoryBaselines(undefined, undefined)).toBe(false);
    expect(isMonthExcludedFromHistoryBaselines("2024-06", "invalid")).toBe(false);
  });

  it("filters baseline rows while keeping the opening partial month visible elsewhere", () => {
    const rows = [
      { monthLabel: "2024-05", firstDate: "5/20/24", value: 1 },
      { monthLabel: "2024-06", firstDate: "6/3/24", value: 2 },
      { monthLabel: "2024-07", firstDate: "7/1/24", value: 3 },
    ];

    expect(filterRowsForHistoryBaselines(rows, row => row.monthLabel, row => row.firstDate)).toEqual(rows.slice(1));
    expect(rows).toHaveLength(3);
    expect(getExcludedMonthLabelsForHistoryBaselines(rows, row => row.monthLabel, row => row.firstDate)).toEqual(["2024-05"]);
  });

  it("does not exclude 2024-05 when earlier months are present in the analysed dataset", () => {
    const rows = [
      { monthLabel: "2024-04", firstDate: "4/1/24", value: 1 },
      { monthLabel: "2024-05", firstDate: "5/20/24", value: 2 },
      { monthLabel: "2024-06", firstDate: "6/3/24", value: 3 },
    ];

    expect(filterRowsForHistoryBaselines(rows, row => row.monthLabel, row => row.firstDate)).toEqual(rows);
    expect(getExcludedMonthLabelsForHistoryBaselines(rows, row => row.monthLabel, row => row.firstDate)).toEqual([]);
  });

  it("handles other opening months, reversed input and repaired coverage", () => {
    const rows = [{ month: "2026-08", date: "8/7/26" }, { month: "2026-08", date: "8/5/26" }, { month: "2026-09", date: "9/2/26" }];
    const excluded = (items: typeof rows) => getExcludedMonthLabelsForHistoryBaselines(items, row => row.month, row => row.date);
    expect(excluded(rows)).toEqual(["2026-08"]);
    expect(excluded([...rows].reverse())).toEqual(["2026-08"]);
    expect(excluded([...rows, { month: "2026-08", date: "8/3/26" }])).toEqual([]);
    expect(excluded([])).toEqual([]);
  });
});
