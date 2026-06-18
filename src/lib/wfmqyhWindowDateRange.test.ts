import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { formatWfmqyhDateRange } from "./wfmqyhWindowDateRange";

const draw = (date: string): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
});

describe("formatWfmqyhDateRange", () => {
  it("reports the first and latest dates in the active custom window", () => {
    expect(formatWfmqyhDateRange([draw("5/20/26"), draw("6/17/26")])).toBe("Custom date range: 5/20/26 to 6/17/26");
  });

  it("reports a single active draw without inventing a range", () => {
    expect(formatWfmqyhDateRange([draw("6/17/26")])).toBe("Custom date range: 6/17/26 only");
  });

  it("is explicit when no draw dates are available", () => {
    expect(formatWfmqyhDateRange([])).toBe("Custom date range: no active draws");
  });
});
