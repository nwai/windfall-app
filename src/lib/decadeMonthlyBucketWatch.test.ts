import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { analyzeDecadeMonthlyBuckets, DECADE_BUCKET_REFERENCE_RATE } from "./decadeMonthlyBucketWatch";

const draw = (date: string, numbers = [1, 2, 3, 4, 5, 6, 7, 8]): Draw => ({ date, main: numbers.slice(0, 6), supp: numbers.slice(6) });
const d1 = draw("2024-06-03");
const d2 = draw("2024-06-05", [1, 10, 11, 12, 13, 14, 15, 16]);
const all = { ordinal: "all", now: "2024-06-06" } as const;

describe("decade monthly bucket watch", () => {
  it("counts all eight balls in non-overlapping, capacity-aware groups", () => {
    const result = analyzeDecadeMonthlyBuckets([d2, d1], all);
    expect(result.cells).toHaveLength(45);
    expect(result.matchedDraws).toBe(2);
    expect(result.cells.reduce((sum, cell) => sum + cell.opportunities, 0)).toBe(90);
    expect(result.cells.reduce((sum, cell) => sum + cell.hits, 0)).toBe(16);
    expect(result.cells.find(cell => cell.group === 4 && cell.bucket === 0)).toMatchObject({ opportunities: 12, hits: 0 });
    expect(result.cells.find(cell => cell.group === 4 && cell.bucket === 0)?.expectedHits).toBeCloseTo(12 * DECADE_BUCKET_REFERENCE_RATE);
  });

  it("uses origin buckets before the draw, not the after-draw bucket", () => {
    const result = analyzeDecadeMonthlyBuckets([d1, d2], { ...all, ordinal: 2 });
    expect(result.cells.find(cell => cell.group === 0 && cell.bucket === 1)).toMatchObject({ hits: 1, opportunities: 8, draws: 1, months: 1, sample: "Thin" });
    expect(result.cells.find(cell => cell.group === 0 && cell.bucket === 2)).toMatchObject({ hits: 0, opportunities: 0, observedRate: null, sample: "No sample" });
    expect(result.cells.find(cell => cell.group === 0 && cell.bucket === 1)?.currentNumbers).not.toContain(1);
    expect(result.cells.find(cell => cell.group === 0 && cell.bucket === 2)?.currentNumbers).toEqual([1]);
  });

  it("uses the planning ordinal and exact month length without fallback", () => {
    const result = analyzeDecadeMonthlyBuckets([d1, d2], { now: "2024-06-06" });
    expect(result.ordinal).toBe(3);
    expect(result.target).toMatchObject({ date: "2024-06-07", ordinal: 3, length: 12, prefixComplete: true });
    expect(result.matchedDraws).toBe(0);
    expect(analyzeDecadeMonthlyBuckets([d1, d2], { ...all, monthLength: 13 }).matchedDraws).toBe(0);
  });

  it("excludes the partial opening month, malformed, off-schedule and simulated rows", () => {
    const result = analyzeDecadeMonthlyBuckets([
      draw("2024-05-31"), d1, d2,
      draw("2024-06-04"),
      { ...draw("2024-06-07"), isSimulated: true },
      draw("2024-06-10", [1, 1, 2, 3, 4, 5, 6, 7]),
    ], all);
    expect(result.excludedOpeningMonths).toEqual(["2024-05"]);
    expect(result.simulatedRows).toBe(1);
    expect(result.invalidRows).toBe(2);
    expect(result.baselineDraws).toBe(2);
    expect(result.matchedDraws).toBe(2);
  });

  it("deduplicates exact dates but omits every conflicting record instead of choosing a winner", () => {
    const duplicate = analyzeDecadeMonthlyBuckets([d1, { ...d1 }, d2], all);
    expect(duplicate.duplicateRows).toBe(1);
    expect(duplicate.matchedDraws).toBe(2);
    const conflict = analyzeDecadeMonthlyBuckets([d1, d2, draw(d2.date, [20, 21, 22, 23, 24, 25, 26, 27]), draw("2024-06-07")], all);
    expect(conflict.conflictingRows).toBe(2);
    expect(conflict.matchedDraws).toBe(1);
    expect(conflict.incompletePrefixDraws).toBe(1);
  });

  it("does not mislabel a calendar D3 as D2 or invent current bucket origins after a gap", () => {
    const result = analyzeDecadeMonthlyBuckets([d1, draw("2024-06-07")], { ...all, now: "2024-06-08" });
    expect(result.matchedDraws).toBe(1);
    expect(result.incompletePrefixDraws).toBe(1);
    expect(result.target).toMatchObject({ ordinal: 4, prefixComplete: false });
    expect(result.cells.every(cell => cell.currentNumbers.length === 0)).toBe(true);
    expect(analyzeDecadeMonthlyBuckets([d1, draw("2024-06-07")], { ...all, ordinal: 2 }).matchedDraws).toBe(0);
  });

  it("resets the planning buckets at a new month, retains zero samples and does not mutate history", () => {
    const history = [d1, d2];
    const before = JSON.stringify(history);
    const result = analyzeDecadeMonthlyBuckets(history, { ...all, now: "2024-07-01" });
    expect(result.target).toMatchObject({ month: "2024-07", ordinal: 1, prefixComplete: true });
    expect(result.cells.filter(cell => cell.bucket === 0).flatMap(cell => cell.currentNumbers)).toHaveLength(45);
    expect(JSON.stringify(history)).toBe(before);
    const empty = analyzeDecadeMonthlyBuckets([], all);
    expect(empty.target).toBeNull();
    expect(empty.cells.every(cell => cell.observedRate === null)).toBe(true);
  });

  it("updates raw evidence only after real draws are appended and splits matching targets chronologically", () => {
    const before = analyzeDecadeMonthlyBuckets([d1, d2], { ...all, ordinal: 1 });
    const result = analyzeDecadeMonthlyBuckets([d1, d2, draw("2024-07-01", [40, 41, 42, 43, 44, 45, 10, 20])], { ...all, ordinal: 1 });
    const cell = result.cells.find(cell => cell.group === 4 && cell.bucket === 0)!;
    expect(before.cells.find(cell => cell.group === 4 && cell.bucket === 0)?.hits).toBe(0);
    expect(cell).toMatchObject({ hits: 6, opportunities: 12, early: { hits: 0, opportunities: 6 }, later: { hits: 6, opportunities: 6 } });
  });

  it("retains observations beyond eight monthly hits in the 8x+ origin bucket", () => {
    const dates = ["01", "03", "05", "08", "10", "12", "15", "17", "19", "22"];
    const result = analyzeDecadeMonthlyBuckets(dates.map(day => draw(`2024-07-${day}`)), { ordinal: "all", now: "2024-07-23" });
    expect(result.cells.find(cell => cell.group === 0 && cell.bucket === 8)).toMatchObject({ hits: 16, opportunities: 16, draws: 2 });
  });
});
