import { describe, expect, it } from "vitest";
import {
  AUSTRALIAN_POWERBALL_CONFIG,
  buildPowerballEntryProfile,
  clampPowerballEntryCount,
  formatPowerballEntriesCsv,
  generatePowerballEntries,
} from "../src/lottery/powerball";

const deterministicSource = () => {
  let value = 0;
  return {
    nextInt(maxExclusive: number) {
      value += 7;
      return value % maxExclusive;
    },
  };
};

describe("Powerball generator", () => {
  it("clamps generated entry counts to the supported UI range", () => {
    expect(clampPowerballEntryCount(-1)).toBe(1);
    expect(clampPowerballEntryCount(3.4)).toBe(3);
    expect(clampPowerballEntryCount(999)).toBe(AUSTRALIAN_POWERBALL_CONFIG.maxGeneratedEntries);
  });

  it("generates Australian Powerball-shaped entries", () => {
    const entries = generatePowerballEntries(5, deterministicSource());

    expect(entries).toHaveLength(5);
    for (const entry of entries) {
      expect(entry.main).toHaveLength(7);
      expect(new Set(entry.main).size).toBe(7);
      expect(entry.main).toEqual([...entry.main].sort((left, right) => left - right));
      expect(entry.main.every((number) => number >= 1 && number <= 35)).toBe(true);
      expect(entry.powerball).toBeGreaterThanOrEqual(1);
      expect(entry.powerball).toBeLessThanOrEqual(20);
    }
  });

  it("profiles generated entries without treating the Powerball as a main number", () => {
    const profile = buildPowerballEntryProfile({
      id: "example",
      main: [1, 2, 3, 18, 19, 31, 35],
      powerball: 1,
    });

    expect(profile.sum).toBe(109);
    expect(profile.odd).toBe(5);
    expect(profile.even).toBe(2);
    expect(profile.low).toBe(3);
    expect(profile.high).toBe(4);
    expect(profile.bandCounts.map((band) => band.count)).toEqual([3, 2, 0, 2]);
  });

  it("formats generated entries as CSV for export/copy", () => {
    expect(formatPowerballEntriesCsv([
      { id: "one", main: [1, 2, 3, 4, 5, 6, 7], powerball: 8 },
    ])).toBe("Entry,Main 1,Main 2,Main 3,Main 4,Main 5,Main 6,Main 7,Powerball\n1,1,2,3,4,5,6,7,8");
  });
});
