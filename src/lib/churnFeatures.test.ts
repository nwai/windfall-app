import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { buildChurnDataset, extractFeaturesForNumber } from "./churnFeatures";

const draw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("churn feature provenance", () => {
  it("uses thirteen draws for month-frequency features", () => {
    const history = Array.from({ length: 13 }, (_, index) => (
      draw(`2026-01-${String(index + 1).padStart(2, "0")}`, index === 0 ? [45, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6])
    ));

    const rows = buildChurnDataset(history, { churnWindowK: 13 });
    const fortyFive = rows.find((row) => row.number === 45);
    const features = extractFeaturesForNumber(history, 45, { churnThreshold: 13 });

    expect(fortyFive?.freqMonth).toBe(1);
    expect(features.freqMonth).toBe(1);
  });

  it("ignores simulated fallback rows when building churn labels and recency features", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-01-08", [7, 8, 9, 10, 11, 12]),
      draw("2026-01-15", [13, 14, 15, 16, 17, 18]),
      draw("2026-01-22", [45, 44, 43, 42, 41, 40], [], true),
    ];

    const rows = buildChurnDataset(history, { churnWindowK: 1 });
    const fortyFive = rows.find((row) => row.number === 45);

    expect(fortyFive?.freqMonth).toBe(0);
    expect(fortyFive?.timeSinceLast).toBe(3);
    expect(fortyFive?.churnLabel).toBe(1);
  });

  it("ignores simulated fallback rows when extracting single-number churn features", () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6]),
      draw("2026-01-08", [7, 8, 9, 10, 11, 12]),
      draw("2026-01-15", [13, 14, 15, 16, 17, 18]),
      draw("2026-01-22", [45, 44, 43, 42, 41, 40], [], true),
    ];

    const features = extractFeaturesForNumber(history, 45, { churnThreshold: 1 });

    expect(features.freqMonth).toBe(0);
    expect(features.timeSinceLast).toBe(3);
    expect(features.isActive).toBe(false);
  });
});
