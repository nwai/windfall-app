import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildHC3PenaltyWeights } from "./numberBiases";
import { getHC3OverlapNumbers, getMostRecentDraw, getMostRecentDrawPair, sortDrawsChronologically } from "./recentDraws";

function buildDraw(date: string, main: number[], supp: number[]): Draw {
  return { date, main, supp };
}

describe("recentDraws helpers", () => {
  const ascendingHistory = [
    buildDraw("2026-05-01", [1, 11, 20, 30, 40, 45], [6, 7]),
    buildDraw("2026-05-08", [4, 12, 18, 25, 32, 44], [6, 9]),
    buildDraw("2026-05-10", [2, 12, 19, 25, 34, 41], [6, 7]),
  ];
  const newestFirstHistory = ascendingHistory.slice().reverse();

  it("finds the most recent draw by date regardless of input order", () => {
    expect(getMostRecentDraw(ascendingHistory)?.date).toBe("2026-05-10");
    expect(getMostRecentDraw(newestFirstHistory)?.date).toBe("2026-05-10");
  });

  it("finds the two most recent draws by date regardless of input order", () => {
    expect(getMostRecentDrawPair(ascendingHistory)).toMatchObject({
      latest: { date: "2026-05-10" },
      previous: { date: "2026-05-08" },
    });
    expect(getMostRecentDrawPair(newestFirstHistory)).toMatchObject({
      latest: { date: "2026-05-10" },
      previous: { date: "2026-05-08" },
    });
  });

  it("sorts draws chronologically regardless of input order", () => {
    expect(sortDrawsChronologically(newestFirstHistory).map((draw) => draw.date)).toEqual([
      "2026-05-01",
      "2026-05-08",
      "2026-05-10",
    ]);
  });

  it("derives HC3 overlap numbers from the two most recent draws by date", () => {
    expect(getHC3OverlapNumbers(ascendingHistory)).toEqual([12, 25, 6]);
    expect(getHC3OverlapNumbers(newestFirstHistory)).toEqual([12, 25, 6]);
  });

  it("builds HC3 penalty weights from the hardened recent-draw overlap", () => {
    const weights = buildHC3PenaltyWeights(newestFirstHistory, 0.4);

    expect(weights[12]).toBe(0.4);
    expect(weights[25]).toBe(0.4);
    expect(weights[6]).toBe(0.4);
    expect(weights[1]).toBe(1);
    expect(weights[44]).toBe(1);
  });
});
