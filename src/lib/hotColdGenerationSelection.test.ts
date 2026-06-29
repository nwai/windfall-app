import { describe, expect, it } from "vitest";

import {
  toggleHotColdExcludeSelection,
  toggleHotColdIncludeSelection,
} from "./hotColdGenerationSelection";

describe("hot/cold generation row selection", () => {
  it("adds a hot/cold row number to forced inclusions and removes conflicting exclusions", () => {
    const next = toggleHotColdIncludeSelection({
      forcedNumbers: [4, 8],
      excludedNumbers: [12, 24],
    }, 12);

    expect(next.forcedNumbers).toEqual([4, 8, 12]);
    expect(next.excludedNumbers).toEqual([24]);
  });

  it("clicking an already forced hot/cold row deselects it without excluding it", () => {
    const next = toggleHotColdIncludeSelection({
      forcedNumbers: [4, 8, 12],
      excludedNumbers: [24],
    }, 8);

    expect(next.forcedNumbers).toEqual([4, 12]);
    expect(next.excludedNumbers).toEqual([24]);
  });

  it("adds a hot/cold row number to exclusions and removes conflicting forced inclusions", () => {
    const next = toggleHotColdExcludeSelection({
      forcedNumbers: [4, 8, 12],
      excludedNumbers: [24],
    }, 8);

    expect(next.forcedNumbers).toEqual([4, 12]);
    expect(next.excludedNumbers).toEqual([8, 24]);
  });

  it("clicking an already excluded hot/cold row deselects it without forcing it", () => {
    const next = toggleHotColdExcludeSelection({
      forcedNumbers: [4, 12],
      excludedNumbers: [8, 24],
    }, 24);

    expect(next.forcedNumbers).toEqual([4, 12]);
    expect(next.excludedNumbers).toEqual([8]);
  });

  it("ignores invalid row numbers and normalizes both lists", () => {
    const next = toggleHotColdIncludeSelection({
      forcedNumbers: [45, 4, 4, 0],
      excludedNumbers: [12, 47, 12],
    }, 99);

    expect(next.forcedNumbers).toEqual([4, 45]);
    expect(next.excludedNumbers).toEqual([12]);
  });
});
