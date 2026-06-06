import { describe, expect, it } from "vitest";

import { generateExhaustiveCombos } from "./exhaustiveGenerator";

describe("generateExhaustiveCombos", () => {
  it("generates every 6-main split from an 8-number pool", () => {
    const result = generateExhaustiveCombos([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(result.total).toBe(28);
    expect(result.capped).toBe(false);
    expect(result.combos).toHaveLength(28);

    const uniqueKeys = new Set(result.combos.map((combo) => `${combo.main.join(",")};${combo.supp.join(",")}`));
    expect(uniqueKeys.size).toBe(28);
    expect(result.combos.every((combo) => combo.main.length === 6 && combo.supp.length === 2)).toBe(true);
    expect(result.combos.every((combo) => new Set([...combo.main, ...combo.supp]).size === 8)).toBe(true);
  });

  it("honours cap without lying about the true total", () => {
    const result = generateExhaustiveCombos([1, 2, 3, 4, 5, 6, 7, 8], { cap: 5 });

    expect(result.total).toBe(28);
    expect(result.capped).toBe(true);
    expect(result.combos).toHaveLength(5);
  });
});
