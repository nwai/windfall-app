import { describe, expect, it } from "vitest";

import { analyzeHistoricalPrizeCollision } from "./historicalPrizeCollision";
import type { Draw } from "../types";

const draw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("analyzeHistoricalPrizeCollision", () => {
  it("finds stored-line Division 1 and selected-set collisions from real valid history only", () => {
    const result = analyzeHistoricalPrizeCollision(
      [
        draw("6/1/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/3/26", [10, 11, 12, 13, 14, 15], [16, 17]),
        draw("6/5/26", [1, 2, 3, 4, 5, 6], [9], true),
        draw("6/7/26", [1, 2, 3], [4, 5]),
      ],
      [1, 2, 3, 4, 5, 6, 7, 8],
    );

    expect(result.checkedDraws).toBe(2);
    expect(result.skippedDraws).toBe(2);
    expect(result.hasRarePrizeCollision).toBe(true);
    expect(result.bestDivision).toBe("Div1");
    expect(result.storedLineHits).toHaveLength(1);
    expect(result.storedLineHits[0]).toMatchObject({
      date: "6/1/26",
      division: "Div1",
      kind: "stored-line",
      mainHits: 6,
    });
    expect(result.selectedSetHits).toHaveLength(1);
    expect(result.selectedSetHits[0]).toMatchObject({
      date: "6/1/26",
      division: "Div1",
      kind: "selected-set",
    });
  });

  it("finds selected-set Division 2 when an unordered selection contains five mains plus a supp", () => {
    const result = analyzeHistoricalPrizeCollision(
      [
        draw("7/1/26", [1, 2, 3, 4, 5, 30], [9, 10]),
      ],
      [1, 2, 3, 4, 5, 9, 20, 21],
    );

    expect(result.storedLineHits).toHaveLength(0);
    expect(result.selectedSetHits).toHaveLength(1);
    expect(result.selectedSetHits[0]).toMatchObject({
      date: "7/1/26",
      division: "Div2",
      mainHits: 5,
      suppHits: 1,
    });
  });

  it("returns a no-collision result when selected numbers never reach Division 1 or Division 2", () => {
    const result = analyzeHistoricalPrizeCollision(
      [
        draw("8/1/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("8/3/26", [10, 11, 12, 13, 14, 15], [16, 17]),
      ],
      [20, 21, 22, 23, 24, 25, 26, 27],
    );

    expect(result.checkedDraws).toBe(2);
    expect(result.hasRarePrizeCollision).toBe(false);
    expect(result.bestDivision).toBeNull();
    expect(result.storedLineHits).toEqual([]);
    expect(result.selectedSetHits).toEqual([]);
  });
});
