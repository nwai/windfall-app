import { describe, expect, it } from "vitest";
import { computeWeekdayWindfallPrizeDivision } from "./prizeDivisions";

describe("computeWeekdayWindfallPrizeDivision", () => {
  const drawMain = new Set([10, 11, 12, 13, 14, 15]);
  const drawSupp = new Set([20, 21]);

  it("matches the Weekday Windfall prize ladder, including inclusive Div6 coverage", () => {
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 14, 15], [20, 21], drawMain, drawSupp)
    ).toBe("Div1");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 14, 20], [1, 2], drawMain, drawSupp)
    ).toBe("Div2");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 14, 30], [31, 32], drawMain, drawSupp)
    ).toBe("Div3");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 30, 31], [32, 33], drawMain, drawSupp)
    ).toBe("Div4");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 20, 30, 31], [1, 2], drawMain, drawSupp)
    ).toBe("Div5");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 20, 21, 30, 31, 32], [1, 2], drawMain, drawSupp)
    ).toBe("Div6");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 20, 21, 31, 32], [1, 2], drawMain, drawSupp)
    ).toBe("Div6");
  });

  it("counts supplementary hits from the player's six main numbers", () => {
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 14, 20], [1, 2], drawMain, drawSupp)
    ).toBe("Div2");
  });

  it("counts the player's supplementary slots as part of the selected 8-number candidate", () => {
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 30, 31], [14, 40], drawMain, drawSupp)
    ).toBe("Div3");
    expect(
      computeWeekdayWindfallPrizeDivision([10, 11, 12, 30, 31, 32], [20, 21], drawMain, drawSupp)
    ).toBe("Div5");
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
