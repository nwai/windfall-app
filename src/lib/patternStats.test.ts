import { Draw } from "../types";
import {
  computePatternFeaturesForHistory,
  perNumberFrequency,
  getTopNumbers,
  getBottomNumbers,
  createHistogram,
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
      expect(histogram.length).toBe(3);
      expect(histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
    });
  });
});
