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
});
