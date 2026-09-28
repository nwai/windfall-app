import { describe, expect, it } from "vitest";
import {
  auditSignalConfluenceIndependence,
  hypergeometricUpperTail,
} from "../src/lib/signalConfluenceIndependence";
import {
  buildSignalConfluenceRows,
  type SignalConfluenceFamilyKey,
  type SignalConfluenceMention,
} from "../src/lib/signalConfluence";

const mentionsFor = (
  family: SignalConfluenceFamilyKey,
  numbers: readonly number[],
): SignalConfluenceMention[] => numbers.map((number) => ({
  number,
  family,
  source: family,
  label: `${family} ${number}`,
  strength: 1,
}));

describe("Signal Confluence independence audit", () => {
  it("flags identical concentrated family sets as unusually overlapping", () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
    const rows = buildSignalConfluenceRows([
      ...mentionsFor("drought", numbers),
      ...mentionsFor("latest-neighbour", numbers),
    ]);

    const audit = auditSignalConfluenceIndependence(rows);

    expect(audit.activeFamilyCount).toBe(2);
    expect(audit.pairCount).toBe(1);
    expect(audit.flaggedPairCount).toBe(1);
    expect(audit.pairRows[0]).toMatchObject({
      observedOverlap: 8,
      sharedNumbers: numbers,
      flagged: true,
    });
    expect(audit.pairRows[0].expectedOverlap).toBeCloseTo(64 / 45);
    expect(audit.pairRows[0].adjustedPValue).toBeLessThan(0.001);
  });

  it("does not flag disjoint families", () => {
    const rows = buildSignalConfluenceRows([
      ...mentionsFor("drought", [1, 2, 3, 4, 5, 6, 7, 8]),
      ...mentionsFor("temperature", [20, 21, 22, 23, 24, 25, 26, 27]),
    ]);

    const audit = auditSignalConfluenceIndependence(rows);
    const pair = audit.pairRows[0];

    expect(pair.observedOverlap).toBe(0);
    expect(pair.sharedNumbers).toEqual([]);
    expect(pair.pValue).toBe(1);
    expect(pair.adjustedPValue).toBe(1);
    expect(pair.flagged).toBe(false);
  });

  it("reduces duplicate mentions within a family to one supported-number set", () => {
    const rows = buildSignalConfluenceRows([
      ...mentionsFor("drought", [3, 3, 3, 7, 7]),
      ...mentionsFor("scoring-numbers", [3, 7, 11]),
      {
        number: 3,
        family: "user-state",
        source: "User state",
        label: "Selected",
        tone: "state",
      },
    ]);

    const audit = auditSignalConfluenceIndependence(rows);
    const drought = audit.familyRows.find((row) => row.family === "drought");

    expect(drought?.numbers).toEqual([3, 7]);
    expect(audit.familyRows.some((row) => row.family === "user-state")).toBe(false);
    expect(audit.pairRows[0].sharedNumbers).toEqual([3, 7]);
  });

  it("keeps exact upper-tail probabilities bounded at edge cases", () => {
    expect(hypergeometricUpperTail(45, 8, 8, 0)).toBe(1);
    expect(hypergeometricUpperTail(45, 8, 8, 9)).toBe(0);
    expect(hypergeometricUpperTail(45, 45, 8, 8)).toBeCloseTo(1);
  });

  it("applies multiple-comparison correction across every active pair", () => {
    const rows = buildSignalConfluenceRows([
      ...mentionsFor("drought", [1, 2, 3, 4, 5, 6]),
      ...mentionsFor("latest-neighbour", [1, 2, 3, 4, 5, 6]),
      ...mentionsFor("temperature", [1, 2, 3, 20, 21, 22]),
    ]);

    const audit = auditSignalConfluenceIndependence(rows);

    expect(audit.pairCount).toBe(3);
    for (const pair of audit.pairRows) {
      expect(pair.adjustedPValue).toBeGreaterThanOrEqual(pair.pValue);
      expect(pair.adjustedPValue).toBeGreaterThanOrEqual(0);
      expect(pair.adjustedPValue).toBeLessThanOrEqual(1);
    }
  });
});
