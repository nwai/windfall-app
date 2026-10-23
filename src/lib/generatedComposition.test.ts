import { describe, expect, it } from "vitest";
import { captureRwR45Composition, generatedCompositionTrace } from "./generatedComposition";
import { generateRwR45Candidates } from "./rwr45Candidates";
import { seededRandom } from "./settingsTransparency";
import { createEmptyMonthlyBucketSets } from "./monthlyDrawSummary";

describe("actual RwR45 output snapshots", () => {
  it("calculates shapes, maximal runs, terminal counts and digit widths from returned rows only", () => {
    const result = captureRwR45Composition([{ main: [2,12,7,17,21,33], supp: [34,40] }], null, "before D4");
    expect(result.rows[0]).toMatchObject({ shape: "2+2+1+1+1+1", runs: ["0-1-2-3-4"], ratio: "4:4", singleDigits: 2, twoDigits: 6, monthlyCounts: null });
    expect(result.shapeCounts).toEqual({ "2+2+1+1+1+1": 1 });
    expect(result.ratioCounts).toEqual({ "4:4": 1 });
    expect(result.terminalHits.reduce((a, b) => a + b, 0)).toBe(8);
    expect(result.terminalRows[2]).toBe(1);
    expect(generatedCompositionTrace(result)[0]).toContain("settings unchanged");
  });
  it("freezes bucket origins without inventing absent or ambiguous state", () => {
    const buckets = createEmptyMonthlyBucketSets();
    buckets.undrawn = new Set([1,2,3,4,5,6]); buckets.times1 = new Set([7,8]);
    const candidate = { main: [1,2,3,4,5,6], supp: [7,8] };
    const result = captureRwR45Composition([candidate], buckets, "2026-10 before D2");
    expect(result.rows[0].monthlyCounts).toEqual([6,2,0,0,0,0,0,0,0]);
    buckets.times1.add(1); buckets.undrawn.delete(2);
    expect(result.rows[0].monthlyCounts).toEqual([6,2,0,0,0,0,0,0,0]);
    expect(captureRwR45Composition([candidate], buckets, "changed").rows[0].monthlyCounts).toBeNull();
  });
  it("rejects malformed rows without substituting eight-number data", () => {
    const result = captureRwR45Composition([{ main: [1,2,3,4,5,6], supp: [6,7] }], null, "test");
    expect(result.rows).toEqual([]); expect(result.invalidRows).toBe(1);
    expect(result.terminalHits).toEqual(Array(10).fill(0));
  });
  it("can produce different shapes and runs on separate random-coverage runs", () => {
    const snapshots = [11,12,13].map((seed) => captureRwR45Composition(generateRwR45Candidates(seededRandom(seed)).candidates, null, "test run"));
    expect(new Set(snapshots.map((snapshot) => JSON.stringify(snapshot.rows.map(({ shape, runs }) => ({ shape, runs }))))).size).toBeGreaterThan(1);
    snapshots.forEach((snapshot) => expect(snapshot.rows).toHaveLength(7));
  });
});
