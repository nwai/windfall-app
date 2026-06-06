import { describe, expect, it } from "vitest";
import { computeWeekdayWindfallPrizeDivision } from "./prizeDivisions";

describe("computeWeekdayWindfallPrizeDivision", () => {
  const drawMain = new Set([10, 11, 12, 13, 14, 15]);
  const drawSupp = new Set([20, 21]);

  it("counts supplementary hits from the player's six main numbers", () => {
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 14, 20], [1, 2], drawMain, drawSupp)
    ).toBe("Div2");
  });

  it("awards Div6 for one or two main numbers plus both supplementaries", () => {
    expect(
      computeWeekdayWindfallPrizeDivision([10, 20, 21, 30, 31, 32], [1, 2], drawMain, drawSupp)
    ).toBe("Div6");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 20, 21, 31, 32], [1, 2], drawMain, drawSupp)
    ).toBe("Div6");
  });
});
