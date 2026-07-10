import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildMonthlyBucketTimeline } from "./monthlyBucketTimeline";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("buildMonthlyBucketTimeline", () => {
  it("builds month-end bucket states in chronological order using main and supp numbers", () => {
    const timeline = buildMonthlyBucketTimeline([
      draw("2026-05-20", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-04-03", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-05-27", [1, 9, 10, 11, 12, 13], [14, 15]),
      draw("2026-04-10", [1, 2, 3, 4, 5, 6], [7, 8]),
    ]);

    expect(timeline.map((entry) => entry.monthLabel)).toEqual(["2026-04", "2026-05"]);
    expect(timeline[0].drawCount).toBe(2);
    expect(timeline[1].drawCount).toBe(2);
    expect(timeline[0].totalDrawCount).toBe(13);
    expect(timeline[0].drawStates).toHaveLength(2);
    expect(timeline[0].drawStates[0]).toMatchObject({
      drawOrdinal: 1,
      drawDate: "2026-04-03",
      isSimulated: false,
    });
    expect(timeline[0].drawStates[1]).toMatchObject({
      drawOrdinal: 2,
      drawDate: "2026-04-10",
      isSimulated: false,
    });
    expect(timeline[0].drawStates[0].bucketSets.times1.has(1)).toBe(true);
    expect(timeline[0].drawStates[0].bucketSets.undrawn.has(2)).toBe(true);
    expect(timeline[0].drawStates[1].bucketSets.times2.has(1)).toBe(true);
    expect(timeline[0].drawStates[1].bucketSets.times1.has(2)).toBe(true);

    expect([...timeline[0].bucketSets.times2]).toEqual([1]);
    expect([...timeline[0].bucketSets.times1]).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(timeline[0].bucketSets.undrawn.has(16)).toBe(true);

    expect([...timeline[1].bucketSets.times2]).toEqual([1]);
    expect([...timeline[1].bucketSets.times1]).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(timeline[1].bucketSets.undrawn.has(16)).toBe(true);
  });

  it("ignores invalid dates and duplicate values within the same draw", () => {
    const timeline = buildMonthlyBucketTimeline([
      draw("invalid-date", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("5/27/26", [1, 1, 2, 3, 4, 5], [5, 6]),
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].monthLabel).toBe("2026-05");
    expect([...timeline[0].bucketSets.times1]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(timeline[0].drawStates.map((state) => state.drawOrdinal)).toEqual([1]);
    expect(timeline[0].bucketSets.undrawn.has(7)).toBe(true);
  });
});
