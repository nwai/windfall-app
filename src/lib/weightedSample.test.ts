import { describe, expect, it } from "vitest";

import { weightedSampleWithoutReplacement } from "./weightedSample";

describe("weightedSampleWithoutReplacement", () => {
  it("selects the larger Efraimidis-Spirakis key so higher weights are favored", () => {
    const picked = weightedSampleWithoutReplacement([1, 2], [100, 1], 1, () => 0.5);

    expect(picked).toEqual([1]);
  });
});
