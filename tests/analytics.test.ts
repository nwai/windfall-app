import { describe, expect, it } from "vitest";
import {
  maxJaccard,
  maxJaccardBit,
  minHamming,
  minHammingBit,
  precomputeHistoryBitmasks,
  toBitmask,
} from "../src/analytics";
import type { CandidateSet, Draw } from "../src/types";

function draw(main: number[], supp: number[] = []): Draw {
  return { main, supp, date: "2026-01-01" };
}

describe("analytics bitmask helpers", () => {
  it("keeps high lottery numbers distinct instead of wrapping at 32 bits", () => {
    expect(toBitmask([1])).not.toEqual(toBitmask([33]));
    expect(toBitmask([9])).not.toEqual(toBitmask([41]));
  });

  it("matches set-based Hamming and Jaccard calculations for numbers above 31", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6]),
      draw([33, 34, 35, 36, 37, 38]),
      draw([9, 10, 11, 12, 13, 14]),
    ];
    const candidate: CandidateSet = {
      main: [33, 34, 35, 36, 37, 38],
      supp: [39, 40],
    };
    const masks = precomputeHistoryBitmasks(history);
    const candidateMask = toBitmask(candidate.main);

    expect(minHammingBit(candidateMask, candidate.main.length, masks)).toBe(
      minHamming(candidate, history)
    );
    expect(maxJaccardBit(candidateMask, candidate.main.length, masks)).toBe(
      maxJaccard(candidate, history)
    );
  });
});
