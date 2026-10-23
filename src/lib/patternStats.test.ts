import { Draw } from "../types";
import {
  computePatternFeaturesForHistory,
  perNumberFrequency,
  getTopNumbers,
  getBottomNumbers,
  createHistogram,
  compositionForNumbers,
  compositionSelectionComparison,
  compositionSumDistribution,
  exactCountDistribution,
  historicalDrawComposition,
} from "./patternStats";

describe("patternStats", () => {
  const mockDraws: Draw[] = [
    {
      main: [1, 2, 10, 20, 30, 40],
      supp: [5, 15],
      date: "2025-01-01",
    },
    {
      main: [3, 4, 5, 22, 35, 45],
      supp: [10, 25],
      date: "2025-01-02",
    },
    {
      main: [2, 8, 14, 21, 28, 42],
      supp: [7, 35],
      date: "2025-01-03",
    },
  ];

  describe("computePatternFeaturesForHistory", () => {
    it("should compute consecutive pairs correctly", () => {
      const features = computePatternFeaturesForHistory(mockDraws);
      expect(features.consecPairs).toEqual([1, 2, 0]); // [1,2], [3,4,5], none
    });

    it("should compute even counts correctly", () => {
      const features = computePatternFeaturesForHistory(mockDraws);
      expect(features.evenCounts).toEqual([5, 2, 5]); // 2,10,20,30,40 | 4,22 | 2,8,14,28,42
    });

    it("should compute low counts correctly", () => {
      const features = computePatternFeaturesForHistory(mockDraws);
      expect(features.lowCounts).toEqual([4, 4, 4]); // 1,2,10,20 | 3,4,5,22 | 2,8,14,21
    });

    it("should compute sums correctly", () => {
      const features = computePatternFeaturesForHistory(mockDraws);
      expect(features.sums).toEqual([103, 114, 115]); // sum of main numbers: 1+2+10+20+30+40=103, 3+4+5+22+35+45=114, 2+8+14+21+28+42=115
    });
  });

  describe("perNumberFrequency", () => {
    it("should count main numbers only by default", () => {
      const freq = perNumberFrequency(mockDraws);
      expect(freq[1]).toBe(1);
      expect(freq[2]).toBe(2); // appears in draws 0 and 2
      expect(freq[5]).toBe(1); // main in draw 1, not counted as supp in draw 0
      expect(freq[10]).toBe(1); // main in draw 0, not counted as supp in draw 1
    });

    it("should include supplementary numbers when requested", () => {
      const freq = perNumberFrequency(mockDraws, true);
      expect(freq[5]).toBe(2); // main in draw 1, supp in draw 0
      expect(freq[10]).toBe(2); // main in draw 0, supp in draw 1
      expect(freq[15]).toBe(1); // supp in draw 0
    });

    it("should initialize all numbers 1-45", () => {
      const freq = perNumberFrequency(mockDraws);
      expect(Object.keys(freq).length).toBe(45);
      expect(freq[43]).toBe(0); // number not in any draw
    });
  });

  describe("getTopNumbers", () => {
    it("should return top N numbers by frequency", () => {
      const freq = { 1: 5, 2: 10, 3: 3, 4: 8, 5: 1 };
      const top = getTopNumbers(freq, 3);
      expect(top).toEqual([
        [2, 10],
        [4, 8],
        [1, 5],
      ]);
    });

    it("should break ties by number value (lower number first)", () => {
      const freq = { 1: 5, 2: 5, 3: 5 };
      const top = getTopNumbers(freq, 2);
      expect(top).toEqual([
        [1, 5],
        [2, 5],
      ]);
    });
  });

  describe("getBottomNumbers", () => {
    it("should return bottom N numbers by frequency", () => {
      const freq = { 1: 5, 2: 10, 3: 3, 4: 8, 5: 1 };
      const bottom = getBottomNumbers(freq, 3);
      expect(bottom).toEqual([
        [5, 1],
        [3, 3],
        [1, 5],
      ]);
    });
  });

  describe("createHistogram", () => {
    it("should create bins for a distribution", () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const histogram = createHistogram(values, 5);
      expect(histogram.length).toBe(5);
      expect(histogram[0].count).toBe(2); // 1, 2
      expect(histogram[4].count).toBe(2); // 9, 10
    });

    it("should handle empty array", () => {
      const histogram = createHistogram([], 10);
      expect(histogram).toEqual([]);
    });

    it("should handle single value", () => {
      const histogram = createHistogram([5], 3);
      expect(histogram).toEqual([{ min: 5, max: 5, count: 1 }]);
      expect(createHistogram([5, 5, 5], 10)).toEqual([{ min: 5, max: 5, count: 3 }]);
    });

    it("ignores non-finite values and bounds invalid bin counts", () => {
      expect(createHistogram([NaN, Infinity, -Infinity])).toEqual([]);
      expect(createHistogram([1, NaN, 2, Infinity], 0)).toEqual([{ min: 1, max: 2, count: 2 }]);
      for (const requested of [-4, 1.5, NaN, Infinity, 200]) {
        const rows = createHistogram([1, 2, 3], requested);
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.length).toBeLessThanOrEqual(100);
        expect(rows.every(row => row.min <= row.max)).toBe(true);
        expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(3);
      }
    });
  });
});

describe("historical draw composition", () => {
  const draws: Draw[] = [
    { date: "1/1/25", main: [5, 6, 7, 18, 29, 40], supp: [2, 45] },
    { date: "1/3/25", main: [1, 10, 20, 30, 40, 45], supp: [2, 44] },
  ];

  it("counts adjacent whole-number pairs within runs without wrapping or mutating numbers", () => {
    const numbers = [40, 29, 18, 7, 6, 5];
    expect(compositionForNumbers(numbers)).toEqual({ consecPairs: 2, evenCounts: 3, lowCounts: 4, sums: 105 });
    expect(numbers).toEqual([40, 29, 18, 7, 6, 5]);
    expect(compositionForNumbers([1, 10, 20, 30, 40, 45]).consecPairs).toBe(0);
    expect(compositionForNumbers([1, 2, 3, 4, 5, 6, 7, 8]).consecPairs).toBe(7);
    expect(compositionForNumbers([1, 22, 23, 24, 44, 45]).lowCounts).toBe(2);
  });

  it("preserves mains-only defaults and uses all eight numbers only when requested", () => {
    expect(historicalDrawComposition(draws).features).toEqual({ consecPairs: [2, 0], evenCounts: [3, 4], lowCounts: [4, 3], sums: [105, 146] });
    const all = historicalDrawComposition(draws, true);
    expect(all.features).toEqual({ consecPairs: [2, 2], evenCounts: [4, 6], lowCounts: [5, 4], sums: [152, 192] });
    expect(all.distributions.consecPairs).toHaveLength(8);
    expect(all.distributions.evenCounts).toHaveLength(9);
    expect(all.distributions.lowCounts).toHaveLength(9);
  });

  it("uses whole count categories, retains zero observations, and uses draw denominators", () => {
    const rows = exactCountDistribution([0, 2, 2], 3);
    expect(rows.map(row => [row.min, row.max, row.count])).toEqual([[0, 0, 1], [1, 1, 0], [2, 2, 2], [3, 3, 0]]);
    expect(rows[2].percent).toBeCloseTo(200 / 3);
    expect(rows.reduce((sum, row) => sum + row.percent, 0)).toBeCloseTo(100);
    expect(exactCountDistribution([], 2).every(row => row.percent === 0)).toBe(true);
  });

  it("uses fixed 20-point sum bands, including gaps and possible-sum boundaries", () => {
    expect(compositionSumDistribution([105, 146], 6)).toEqual([
      { min: 100, max: 119, count: 1, percent: 50 },
      { min: 120, max: 139, count: 0, percent: 0 },
      { min: 140, max: 159, count: 1, percent: 50 },
    ]);
    for (const [count, min, max] of [[6, 21, 255], [8, 36, 332]] as const) {
      const rows = compositionSumDistribution([min, max], count);
      expect(rows[0].min).toBe(min);
      expect(rows.at(-1)?.max).toBe(max);
      expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(2);
      expect(rows.every(row => Number.isInteger(row.min) && Number.isInteger(row.max) && row.min <= row.max)).toBe(true);
    }
    expect(compositionSumDistribution([119, 120, 139, 140], 6).map(row => row.count)).toEqual([1, 2, 1]);
    expect(compositionSumDistribution([], 8)).toEqual([]);
  });

  it("excludes simulated, malformed and off-schedule rows even in mains-only mode", () => {
    const result = historicalDrawComposition([
      ...draws,
      { ...draws[0], date: "1/6/25", isSimulated: true },
      { ...draws[0], date: "1/8/25", supp: [5, 45] },
      { ...draws[0], date: "not a date" },
      { ...draws[0], date: "1/2/25" },
      { ...draws[0], date: "1/10/25", main: [1, 2, 3, 4, 5, 46] },
    ]);
    expect(result.drawCount).toBe(2);
    expect(result.ignored).toEqual({ simulated: 1, invalid: 3, offSchedule: 1, duplicate: 0, conflict: 0 });
  });

  it("deduplicates reordered copies but rejects every version of a conflicting date", () => {
    const result = historicalDrawComposition([
      ...draws,
      { ...draws[0], date: "2025-01-01", main: [...draws[0].main].reverse(), supp: [...draws[0].supp].reverse() },
      { ...draws[1], main: [1, 10, 20, 30, 40, 44], supp: [2, 45] },
    ]);
    expect(result.drawCount).toBe(1);
    expect(result.firstDate).toBe("2025-01-01");
    expect(result.latestDate).toBe("2025-01-01");
    expect(result.ignored.duplicate).toBe(1);
    expect(result.ignored.conflict).toBe(2);
  });

  it("keeps selected opening-month rows and is chronological regardless of input order", () => {
    const input = [{ ...draws[0], date: "5/22/24" }, ...draws];
    const saved = JSON.stringify(input);
    const forward = historicalDrawComposition(input);
    expect(historicalDrawComposition([...input].reverse())).toEqual(forward);
    expect(forward.drawCount).toBe(3);
    expect(forward.firstDate).toBe("2024-05-22");
    expect(forward.latestDate).toBe("2025-01-03");
    expect(JSON.stringify(input)).toBe(saved);
  });

  it("compares matching six/eight-number selections only and never infers roles", () => {
    const mains = historicalDrawComposition(draws);
    const eight = [...draws[0].main, ...draws[0].supp];
    expect(compositionSelectionComparison(eight, false, mains)).toMatchObject({ status: "incomplete", message: expect.stringContaining("No main or supplementary roles were inferred") });
    const compared = compositionSelectionComparison(draws[0].main, false, mains);
    expect(compared.status).toBe("complete");
    if (compared.status !== "complete") throw new Error("Expected complete comparison");
    expect(compared.values.consecPairs).toMatchObject({ value: 2, count: 1, percent: 50 });
    expect(compared.values.sums).toEqual({ value: 105, min: 100, max: 119, count: 1, percent: 50 });
    const all = compositionSelectionComparison(eight, true, historicalDrawComposition(draws, true));
    expect(all.status).toBe("complete");
    if (all.status !== "complete") throw new Error("Expected eight-number comparison");
    expect(all.values.consecPairs).toMatchObject({ value: 2, count: 2, percent: 100 });
    expect(eight).toEqual([5, 6, 7, 18, 29, 40, 2, 45]);
  });

  it("reports unobserved selection bands as zero without changing the band definition", () => {
    const history = historicalDrawComposition(draws);
    for (const [numbers, min, max] of [
      [[1, 2, 3, 4, 5, 6], 21, 39], [[40, 41, 42, 43, 44, 45], 240, 255],
    ] as const) {
      const compared = compositionSelectionComparison(numbers, false, history);
      expect(compared.status).toBe("complete");
      if (compared.status !== "complete") throw new Error("Expected complete comparison");
      expect(compared.values.sums).toMatchObject({ count: 0, percent: 0, min, max });
    }
  });

  it("distinguishes empty, partial, invalid and unavailable comparisons", () => {
    const analysis = historicalDrawComposition(draws);
    expect(compositionSelectionComparison([], false, analysis).status).toBe("incomplete");
    expect(compositionSelectionComparison([1, 2, 3], false, analysis).status).toBe("incomplete");
    for (const numbers of [[1, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 46], [1, 2, 3, 4, 5, 6.5]]) {
      expect(compositionSelectionComparison(numbers, false, analysis).status).toBe("invalid");
    }
    expect(compositionSelectionComparison(draws[0].main, false, historicalDrawComposition([])).status).toBe("unavailable");
  });
});
