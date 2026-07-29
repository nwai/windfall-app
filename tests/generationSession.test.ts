import { describe, expect, it } from "vitest";

import {
  buildGenerationSessionMainKeySet,
  filterCandidatesForGenerationSession,
  generationSessionMainKeyFromNumbers,
} from "../src/lib/generationSession";
import type { CandidateSet, KeptGeneratedCandidateRow } from "../src/types";

const candidate = (main: number[], supp: number[] = [44, 45]): CandidateSet => ({
  main,
  supp,
});

const keptRow = (main: number[], id = main.join("-")): KeptGeneratedCandidateRow => ({
  id,
  sourceIndex: 0,
  main,
  supp: [44, 45],
});

describe("generation session de-duplication", () => {
  it("uses a sorted six-main-number key so supplementary changes do not bypass uniqueness", () => {
    expect(generationSessionMainKeyFromNumbers([6, 1, 5, 4, 3, 2])).toBe("1-2-3-4-5-6");
    expect(generationSessionMainKeyFromNumbers([1, 2, 3, 4, 5, 5])).toBeNull();
    expect(generationSessionMainKeyFromNumbers([1, 2, 3, 4, 5])).toBeNull();
  });

  it("rejects candidates whose six mains already exist in the active session", () => {
    const existingKeys = buildGenerationSessionMainKeySet([
      keptRow([1, 2, 3, 4, 5, 6]),
    ]);

    const result = filterCandidatesForGenerationSession([
      candidate([6, 5, 4, 3, 2, 1], [7, 8]),
      candidate([7, 8, 9, 10, 11, 12], [1, 2]),
      candidate([7, 8, 9, 10, 11, 12], [3, 4]),
      candidate([1, 2, 3, 4, 5, 5], [6, 7]),
    ], existingKeys);

    expect(result.candidates.map((row) => row.main)).toEqual([[7, 8, 9, 10, 11, 12]]);
    expect(result.duplicateRejects).toBe(2);
    expect(result.invalidRejects).toBe(1);
  });
});
