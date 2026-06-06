import { describe, expect, it } from "vitest";
import { buildDemoDrawHistory } from "../src/lib/fetchDraws";

describe("buildDemoDrawHistory", () => {
  it("marks fallback rows as simulated and prevents main/supp overlap", () => {
    const rng = (n: number, min: number, max: number, exclude: number[] = []) => {
      const values: number[] = [];
      for (let x = min; x <= max && values.length < n; x += 1) {
        if (!exclude.includes(x)) values.push(x);
      }
      return values;
    };

    const rows = buildDemoDrawHistory(3, 6, 1, 45, rng, Date.UTC(2026, 0, 3));

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.isSimulated).toBe(true);
      expect(row.main).toHaveLength(6);
      expect(row.supp).toHaveLength(2);
      expect(new Set([...row.main, ...row.supp]).size).toBe(8);
    }
  });
});
