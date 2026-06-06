import { describe, expect, it } from "vitest";

import {
  normalizeDgaSelectedNumbers,
  summarizeDgaSelectedNumbers,
} from "./dgaSelectedNumbers";

describe("dgaSelectedNumbers", () => {
  it("normalizes strip selections to unique ascending valid numbers", () => {
    expect(
      normalizeDgaSelectedNumbers([12, 5, 12, 0, 45, 46, 8.5, 1, -3, 5]),
    ).toEqual([1, 5, 12, 45]);
  });

  it("handles empty or missing selections", () => {
    expect(normalizeDgaSelectedNumbers()).toEqual([]);
    expect(normalizeDgaSelectedNumbers(null)).toEqual([]);
    expect(summarizeDgaSelectedNumbers([])).toBe("");
  });

  it("summarizes the normalized strip selections", () => {
    expect(summarizeDgaSelectedNumbers([9, 3, 9, 2])).toBe("2, 3, 9");
  });
});
