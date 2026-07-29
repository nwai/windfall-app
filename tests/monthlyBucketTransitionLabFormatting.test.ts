import { describe, expect, it } from "vitest";

import { formatWholeAwareNumber } from "../src/components/MonthlyBucketTransitionLabPanel";

describe("Monthly Bucket Transition Lab formatting", () => {
  it("omits unnecessary decimal places for whole-number count and draw-index values", () => {
    expect(formatWholeAwareNumber(4)).toBe("4");
    expect(`D${formatWholeAwareNumber(4)}`).toBe("D4");
    expect(formatWholeAwareNumber(12)).toBe("12");
  });

  it("keeps a decimal place when a median genuinely lands between whole values", () => {
    expect(formatWholeAwareNumber(4.5)).toBe("4.5");
    expect(`D${formatWholeAwareNumber(4.5)}`).toBe("D4.5");
  });
});
