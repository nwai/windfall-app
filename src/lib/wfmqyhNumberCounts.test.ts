import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildWfmqyhNumberCounts } from "./wfmqyhNumberCounts";

describe("buildWfmqyhNumberCounts", () => {
  const history: Draw[] = [
    { date: "2024-01-01", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
    { date: "2024-01-08", main: [1, 9, 10, 11, 12, 13], supp: [2, 14] },
    { date: "2024-01-15", main: [15, 16, 17, 18, 19, 20], supp: [1, 21] },
  ];

  it("counts only main numbers by default", () => {
    const counts = buildWfmqyhNumberCounts(history);

    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(7)).toBeUndefined();
    expect(counts.get(21)).toBeUndefined();
  });

  it("includes supplementary numbers when requested", () => {
    const counts = buildWfmqyhNumberCounts(history, { includeSupp: true });

    expect(counts.get(1)).toBe(3);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(7)).toBe(1);
    expect(counts.get(21)).toBe(1);
  });

  it("ignores out-of-range values and handles empty history", () => {
    const noisyHistory: Draw[] = [
      { date: "2024-02-01", main: [0, 1, 2, 46, 3, 4], supp: [-1, 5] },
    ];

    expect(buildWfmqyhNumberCounts([]).size).toBe(0);

    const counts = buildWfmqyhNumberCounts(noisyHistory, { includeSupp: true });
    expect(counts.get(1)).toBe(1);
    expect(counts.get(5)).toBe(1);
    expect(counts.has(0)).toBe(false);
    expect(counts.has(46)).toBe(false);
    expect(counts.has(-1)).toBe(false);
  });
});
