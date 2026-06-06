import { describe, expect, it } from "vitest";

import {
  MONTH_LABELS_EXCLUDED_FROM_HISTORY_BASELINES,
  filterRowsForHistoryBaselines,
  getExcludedMonthLabelsForHistoryBaselines,
  isMonthExcludedFromHistoryBaselines,
} from "./monthlyAverageScope";

describe("monthlyAverageScope", () => {
  it("marks the opening partial month as excluded from history baselines", () => {
    expect(MONTH_LABELS_EXCLUDED_FROM_HISTORY_BASELINES).toEqual(["2024-05"]);
    expect(isMonthExcludedFromHistoryBaselines("2024-05")).toBe(true);
    expect(isMonthExcludedFromHistoryBaselines("2024-06")).toBe(false);
    expect(isMonthExcludedFromHistoryBaselines(undefined)).toBe(false);
  });

  it("filters baseline rows while keeping the opening partial month visible elsewhere", () => {
    const rows = [
      { monthLabel: "2024-05", value: 1 },
      { monthLabel: "2024-06", value: 2 },
      { monthLabel: "2024-07", value: 3 },
    ];

    expect(filterRowsForHistoryBaselines(rows, (row) => row.monthLabel)).toEqual([
      { monthLabel: "2024-06", value: 2 },
      { monthLabel: "2024-07", value: 3 },
    ]);
    expect(getExcludedMonthLabelsForHistoryBaselines(rows, (row) => row.monthLabel)).toEqual(["2024-05"]);
  });

  it("does not exclude 2024-05 when earlier months are present in the analysed dataset", () => {
    const rows = [
      { monthLabel: "2024-04", value: 1 },
      { monthLabel: "2024-05", value: 2 },
      { monthLabel: "2024-06", value: 3 },
    ];

    expect(filterRowsForHistoryBaselines(rows, (row) => row.monthLabel)).toEqual(rows);
    expect(getExcludedMonthLabelsForHistoryBaselines(rows, (row) => row.monthLabel)).toEqual([]);
  });
});
