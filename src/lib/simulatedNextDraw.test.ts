 import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildMonthlyBucketDrawSeries } from "./monthlyBucketDrawSeries";
import { buildSimulatedNextDraw, inferSimulatedNextDrawGapDays } from "./simulatedNextDraw";

const draw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("inferSimulatedNextDrawGapDays", () => {
  it("infers the usual Friday-to-Monday gap across a month boundary", () => {
    const history = [
      draw("5/27/26", [1, 2, 3, 4, 5, 6]),
      draw("5/29/26", [7, 8, 9, 10, 11, 12]),
      draw("5/25/26", [13, 14, 15, 16, 17, 18]),
    ];

    expect(inferSimulatedNextDrawGapDays(history)).toBe(3);

    const simulated = buildSimulatedNextDraw(history, draw("Simulated", [19, 20, 21, 22, 23, 24]));
    expect(simulated.date).toBe("2026-06-01");
  });

  it("uses weekday-specific evidence to infer the next Monday-to-Wednesday draw", () => {
    const history = [
      draw("6/1/26", [1, 2, 3, 4, 5, 6]),
      draw("5/29/26", [7, 8, 9, 10, 11, 12]),
      draw("5/27/26", [13, 14, 15, 16, 17, 18]),
      draw("5/25/26", [19, 20, 21, 22, 23, 24]),
    ];

    expect(inferSimulatedNextDrawGapDays(history)).toBe(2);

    const simulated = buildSimulatedNextDraw(history, draw("Simulated", [25, 26, 27, 28, 29, 30]));
    expect(simulated.date).toBe("2026-06-03");
  });

  it("ignores previously simulated rows when inferring the next date", () => {
    const history = [
      draw("5/29/26", [1, 2, 3, 4, 5, 6]),
      draw("5/27/26", [7, 8, 9, 10, 11, 12]),
      draw("2026-06-09", [13, 14, 15, 16, 17, 18], [], true),
      draw("5/25/26", [19, 20, 21, 22, 23, 24]),
    ];

    const simulated = buildSimulatedNextDraw(history, draw("Simulated", [31, 32, 33, 34, 35, 36]));
    expect(simulated.date).toBe("2026-06-01");
  });
});

describe("buildSimulatedNextDraw + monthly bucket state", () => {
  it("resets monthly bucket counts when the inferred simulated draw lands in a new month", () => {
    const history = [
      draw("5/27/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("5/29/26", [1, 9, 10, 11, 12, 13], [14, 15]),
    ];

    const simulated = buildSimulatedNextDraw(history, draw("Simulated", [1, 16, 17, 18, 19, 20], [21, 22]));
    const series = buildMonthlyBucketDrawSeries([...history, simulated]);

    expect(simulated.date).toBe("2026-06-01");
    expect(series.bucketIndexSeries[0]).toEqual([1, 2, 1]);
    expect(series.drawMonthLabels).toEqual(["2026-05", "2026-05", "2026-06"]);
  });
});
