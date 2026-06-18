import { describe, expect, it } from "vitest";

import {
  generatePasteWeightedCandidates,
  parsePastedCandidateNumbers,
  reconcileStageIdmTargetCounts,
} from "./pasteWeightedCandidates";
import type { MonthlyBucketSets } from "./monthlyDrawSummary";

const seededRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const monthlyBuckets = (bucketNumbers: Partial<Record<keyof MonthlyBucketSets, number[]>>): MonthlyBucketSets => ({
  undrawn: new Set(bucketNumbers.undrawn ?? []),
  times1: new Set(bucketNumbers.times1 ?? []),
  times2: new Set(bucketNumbers.times2 ?? []),
  times3: new Set(bucketNumbers.times3 ?? []),
  times4: new Set(bucketNumbers.times4 ?? []),
  times5: new Set(bucketNumbers.times5 ?? []),
  times6: new Set(bucketNumbers.times6 ?? []),
  times7: new Set(bucketNumbers.times7 ?? []),
  times8: new Set(bucketNumbers.times8 ?? []),
});

const countCandidateBuckets = (numbers: number[], buckets: MonthlyBucketSets): number[] => {
  const counts = new Array(9).fill(0);
  for (const number of numbers) {
    if (buckets.undrawn.has(number)) counts[0] += 1;
    else if (buckets.times1.has(number)) counts[1] += 1;
    else if (buckets.times2.has(number)) counts[2] += 1;
    else if (buckets.times3.has(number)) counts[3] += 1;
    else if (buckets.times4.has(number)) counts[4] += 1;
    else if (buckets.times5.has(number)) counts[5] += 1;
    else if (buckets.times6.has(number)) counts[6] += 1;
    else if (buckets.times7.has(number)) counts[7] += 1;
    else if (buckets.times8.has(number)) counts[8] += 1;
  }
  return counts;
};

describe("parsePastedCandidateNumbers", () => {
  it("treats punctuation typos as separators and ranks counts from highest first", () => {
    const parsed = parsePastedCandidateNumbers([
      "3,12,14,28,29,30",
      "13,16.19,22,27,41",
      "1,3,12,14,27,40",
    ].join("\n"));

    expect(parsed.acceptedRows).toBe(3);
    expect(parsed.totalCountedNumbers).toBe(18);
    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.counts.slice(0, 5)).toEqual([
      { number: 3, count: 2, share: 2 / 18 },
      { number: 12, count: 2, share: 2 / 18 },
      { number: 14, count: 2, share: 2 / 18 },
      { number: 27, count: 2, share: 2 / 18 },
      { number: 1, count: 1, share: 1 / 18 },
    ]);
  });

  it("counts duplicate values only once per pasted row and reports row issues", () => {
    const parsed = parsePastedCandidateNumbers("4,4,4,5,46,abc\n1,2,3,4,5,6");

    expect(parsed.acceptedRows).toBe(2);
    expect(parsed.totalCountedNumbers).toBe(8);
    expect(parsed.invalidTokens).toEqual(["46"]);
    expect(parsed.rows[0]).toMatchObject({
      lineNumber: 1,
      numbers: [4, 5],
      duplicateNumbers: [4],
      outOfRangeNumbers: [46],
      expectedSixNumbers: false,
    });
  });

  it("ignores standalone numbered-list labels before candidate rows", () => {
    const parsed = parsePastedCandidateNumbers([
      "1",
      "32 4 12 8 19 27",
      "2",
      "12 5 6 23 30 31",
    ].join("\n"));

    expect(parsed.acceptedRows).toBe(2);
    expect(parsed.totalCountedNumbers).toBe(12);
    expect(parsed.rows.map((row) => row.numbers)).toEqual([
      [32, 4, 12, 8, 19, 27],
      [12, 5, 6, 23, 30, 31],
    ]);
    expect(parsed.counts.find((item) => item.number === 12)).toMatchObject({ count: 2 });
    expect(parsed.counts.some((item) => item.number === 1)).toBe(false);
    expect(parsed.counts.some((item) => item.number === 2)).toBe(false);
  });

  it("derives odd/even ratio evidence from exact six-number pasted main rows", () => {
    const parsed = parsePastedCandidateNumbers([
      "1,3,5,2,4,6",
      "1,3,5,7,2,4",
      "2,4,6,8,10,12",
      "1,2,3,4,5",
    ].join("\n"));

    expect(parsed.oddEvenRatios).toEqual([
      { ratio: "0:6", count: 1, percent: 33 },
      { ratio: "3:3", count: 1, percent: 33 },
      { ratio: "4:2", count: 1, percent: 33 },
    ]);
  });
});

describe("generatePasteWeightedCandidates", () => {
  it("generates the selected number of sorted six-number candidates from paste-derived weights", () => {
    const input = [
      "1,2,3,4,5,6",
      "1,2,3,4,5,7",
      "1,2,3,4,8,9",
      "10,11,12,13,14,15",
    ].join("\n");

    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 12,
      rng: seededRng(1234),
    });

    expect(result.candidates).toHaveLength(12);
    for (const candidate of result.candidates) {
      expect(candidate.main).toHaveLength(6);
      expect(candidate.supp).toEqual([]);
      expect(candidate.main).toEqual([...candidate.main].sort((left, right) => left - right));
      expect(new Set(candidate.main).size).toBe(6);
    }
    expect(result.counts[0]).toMatchObject({ number: 1, count: 3 });
    expect(result.candidates.some((candidate) => candidate.main.includes(1))).toBe(true);
  });

  it("returns an honest warning when fewer than six unique pasted numbers are available", () => {
    const result = generatePasteWeightedCandidates("1,2,3,4,5", {
      candidateCount: 4,
      rng: seededRng(99),
    });

    expect(result.candidates).toEqual([]);
    expect(result.warnings).toContain("Paste at least six distinct valid numbers before generating candidates.");
  });

  it("requires an ending-5 number in every candidate when the ending-5 constraint is active", () => {
    const input = [
      "1,2,3,4,5,6,7,8,9,10",
      "11,12,13,14,15,16,17,18,19,20",
      "21,22,23,24,25,26,27,28,29,30",
      "31,32,33,34,35,36,37,38,39,40",
      "41,42,43,44,45",
    ].join("\n");
    const ending5Numbers = new Set([5, 15, 25, 35, 45]);

    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 16,
      rng: seededRng(2026),
      constraints: { ending5: "require" },
    });

    expect(result.candidates).toHaveLength(16);
    expect(result.candidates.every((candidate) => candidate.main.some((number) => ending5Numbers.has(number)))).toBe(true);
  });

  it("excludes ending-0 numbers from every candidate when the ending-0 constraint is active", () => {
    const input = [
      "1,2,3,4,5,6,7,8,9,10",
      "11,12,13,14,15,16,17,18,19,20",
      "21,22,23,24,25,26,27,28,29,30",
      "31,32,33,34,35,36,37,38,39,40",
      "41,42,43,44,45",
    ].join("\n");
    const ending0Numbers = new Set([10, 20, 30, 40]);

    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 16,
      rng: seededRng(3030),
      constraints: { ending0: "exclude" },
    });

    expect(result.candidates).toHaveLength(16);
    expect(result.candidates.every((candidate) => candidate.main.every((number) => !ending0Numbers.has(number)))).toBe(true);
  });

  it("enforces mains-only odd/even ratio quotas from selected paste-ratio evidence", () => {
    const input = Array.from({ length: 45 }, (_, index) => index + 1).join(",");

    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 12,
      rng: seededRng(4040),
      constraints: {
        oddEven: {
          enabled: true,
          selectedRatios: ["3:3", "4:2", "2:4"],
          ratioOptions: [
            { ratio: "3:3", count: 3 },
            { ratio: "4:2", count: 2 },
            { ratio: "2:4", count: 1 },
          ],
        },
      },
    });

    expect(result.candidates).toHaveLength(12);
    expect(result.oddEvenRatioSummary?.targetRatios).toEqual({
      "3:3": 6,
      "4:2": 4,
      "2:4": 2,
    });
    expect(result.oddEvenRatioSummary?.acceptedRatios).toEqual({
      "3:3": 6,
      "4:2": 4,
      "2:4": 2,
    });
  });

  it("rejects eight-number odd/even ratios as invalid for paste mains-only generation", () => {
    const input = Array.from({ length: 45 }, (_, index) => index + 1).join(",");

    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 4,
      rng: seededRng(5050),
      constraints: {
        oddEven: {
          enabled: true,
          selectedRatios: ["4:4"],
          ratioOptions: [{ ratio: "4:4", count: 10 }],
        },
      },
    });

    expect(result.candidates).toEqual([]);
    expect(result.warnings).toContain("Odd/even ratio 4:4 is not valid for six main numbers.");
  });

  it("enforces adaptive candidate-shape quotas when supplied by the evidence engine", () => {
    const input = Array.from({ length: 45 }, (_, index) => index + 1).join(",");

    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 10,
      rng: seededRng(6060),
      constraints: {
        adaptiveShape: {
          enabled: true,
          mode: "quota",
          profileOptions: [
            { ratio: "S1:0 D0:5", count: 6 },
            { ratio: "S0:0 D0:6", count: 4 },
          ],
        },
      },
    });

    expect(result.candidates).toHaveLength(10);
    expect(result.adaptiveShapeSummary?.targetRatios).toEqual({
      "S1:0 D0:5": 6,
      "S0:0 D0:6": 4,
    });
    expect(result.adaptiveShapeSummary?.acceptedRatios).toEqual({
      "S1:0 D0:5": 6,
      "S0:0 D0:6": 4,
    });
  });

  it("rescales an eight-slot Stage IDM mix into an exact six-main target", () => {
    expect(reconcileStageIdmTargetCounts([0, 2, 3, 2, 1, 0, 0, 0, 0], 6)).toEqual([
      0, 2, 2, 1, 1, 0, 0, 0, 0,
    ]);
  });

  it("enforces exact mains-only Stage IDM bucket composition when enabled", () => {
    const input = Array.from({ length: 45 }, (_, index) => index + 1).join(",");
    const buckets = monthlyBuckets({
      undrawn: [1, 2, 3, 4, 5, 6, 7, 8],
      times1: [9, 10, 11, 12, 13, 14, 15, 16],
      times2: [17, 18, 19, 20, 21, 22, 23, 24],
      times3: [25, 26, 27, 28, 29, 30, 31, 32],
      times4: [33, 34, 35, 36, 37, 38],
      times5: [39, 40, 41],
      times6: [42],
      times7: [43],
      times8: [44, 45],
    });
    const targetCounts = [1, 2, 2, 1, 0, 0, 0, 0, 0];

    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 8,
      rng: seededRng(7070),
      constraints: {
        stageIdm: {
          enabled: true,
          bucketSets: buckets,
          targetCounts,
        },
      },
    });

    expect(result.candidates).toHaveLength(8);
    expect(result.stageIdmSummary?.targetCounts).toEqual(targetCounts);
    expect(result.stageIdmSummary?.totalAccepted).toBe(8);
    for (const candidate of result.candidates) {
      expect(countCandidateBuckets(candidate.main, buckets)).toEqual(targetCounts);
    }
  });

  it("warns honestly when the Stage IDM target is not six mains", () => {
    const input = Array.from({ length: 45 }, (_, index) => index + 1).join(",");
    const result = generatePasteWeightedCandidates(input, {
      candidateCount: 4,
      rng: seededRng(8080),
      constraints: {
        stageIdm: {
          enabled: true,
          bucketSets: monthlyBuckets({ undrawn: [1, 2, 3, 4, 5, 6] }),
          targetCounts: [1, 1, 1, 0, 0, 0, 0, 0, 0],
        },
      },
    });

    expect(result.candidates).toEqual([]);
    expect(result.warnings).toContain("Stage IDM bucket mix must total exactly six mains before it can filter paste-weighted candidates.");
  });
});
