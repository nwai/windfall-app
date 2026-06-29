import { describe, expect, it } from "vitest";

import {
  buildOddEvenRatioQuotas,
  oddEvenRatioForNumbers,
} from "./oddEvenRatios";

describe("odd/even ratio helpers", () => {
  it("counts ratios for the supplied number set without assuming supplementary numbers", () => {
    expect(oddEvenRatioForNumbers([1, 3, 5, 2, 4, 6])).toBe("3:3");
    expect(oddEvenRatioForNumbers([1, 3, 5, 7, 2, 4])).toBe("4:2");
  });

  it("allocates quotas by relative ratio evidence", () => {
    expect(buildOddEvenRatioQuotas(
      500,
      ["4:4", "5:3", "3:5", "6:2", "2:6"],
      [
        { ratio: "4:4", count: 33 },
        { ratio: "5:3", count: 25 },
        { ratio: "3:5", count: 17 },
        { ratio: "6:2", count: 17 },
        { ratio: "2:6", count: 8 },
      ],
    )).toEqual({
      "4:4": 165,
      "5:3": 125,
      "3:5": 85,
      "6:2": 85,
      "2:6": 40,
    });
  });

  it("allocates selected eight-number ratios from active WFMQYH counts", () => {
    expect(buildOddEvenRatioQuotas(
      500,
      ["5:3", "4:4", "3:5", "6:2", "2:6", "7:1"],
      [
        { ratio: "5:3", count: 7, percent: 30 },
        { ratio: "4:4", count: 6, percent: 26 },
        { ratio: "3:5", count: 4, percent: 17 },
        { ratio: "6:2", count: 3, percent: 13 },
        { ratio: "2:6", count: 2, percent: 9 },
        { ratio: "7:1", count: 1, percent: 4 },
      ],
    )).toEqual({
      "5:3": 152,
      "4:4": 130,
      "3:5": 87,
      "6:2": 65,
      "2:6": 44,
      "7:1": 22,
    });
  });
});
