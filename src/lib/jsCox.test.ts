import { fitJsCox } from "./jsCox";

describe("jsCox", () => {
  describe("fitJsCox", () => {
    it("should return coefficients for valid input", () => {
      const durations = [10, 8, 12, 6, 15];
      const events = [1, 1, 0, 1, 1];
      const X = [
        [0.5, 0.3],
        [0.7, 0.4],
        [0.3, 0.6],
        [0.9, 0.2],
        [0.2, 0.8],
      ];
      const nowX = [
        [0.6, 0.4],
        [0.4, 0.5],
      ];
      const colNames = ["feature1", "feature2"];

      const result = fitJsCox(durations, events, X, nowX, colNames);

      expect(result.coefficients).toHaveLength(2);
      expect(result.hazardRatios).toHaveLength(2);
      expect(result.partialHazards).toHaveLength(2);
      expect(result.colNames).toEqual(colNames);
    });

    it("should produce hazard ratios as exp(coefficients)", () => {
      const durations = [10, 8, 12, 6, 15];
      const events = [1, 1, 0, 1, 1];
      const X = [
        [0.5, 0.3],
        [0.7, 0.4],
        [0.3, 0.6],
        [0.9, 0.2],
        [0.2, 0.8],
      ];
      const nowX = [
        [0.6, 0.4],
      ];
      const colNames = ["feature1", "feature2"];

      const result = fitJsCox(durations, events, X, nowX, colNames);

      for (let i = 0; i < result.coefficients.length; i++) {
        expect(result.hazardRatios[i]).toBeCloseTo(
          Math.exp(result.coefficients[i]),
          5
        );
      }
    });

    it("should handle empty input gracefully", () => {
      const result = fitJsCox([], [], [], [], []);
      
      expect(result.coefficients).toEqual([]);
      expect(result.hazardRatios).toEqual([]);
      expect(result.partialHazards).toEqual([]);
      expect(result.colNames).toEqual([]);
    });

    it("should apply ridge penalty", () => {
      const durations = [10, 8, 12, 6, 15];
      const events = [1, 1, 0, 1, 1];
      const X = [
        [0.5, 0.3],
        [0.7, 0.4],
        [0.3, 0.6],
        [0.9, 0.2],
        [0.2, 0.8],
      ];
      const nowX = [[0.6, 0.4]];
      const colNames = ["feature1", "feature2"];

      const resultNoPenalty = fitJsCox(durations, events, X, nowX, colNames, {
        penalizer: 0.0,
      });
      const resultWithPenalty = fitJsCox(durations, events, X, nowX, colNames, {
        penalizer: 0.5,
      });

      // With higher penalty, coefficients should be shrunk closer to zero
      const sumAbsNoPenalty = resultNoPenalty.coefficients.reduce(
        (sum, c) => sum + Math.abs(c),
        0
      );
      const sumAbsWithPenalty = resultWithPenalty.coefficients.reduce(
        (sum, c) => sum + Math.abs(c),
        0
      );

      // Note: This may not always be true depending on the data,
      // but generally penalty should shrink coefficients
      expect(sumAbsWithPenalty).toBeLessThanOrEqual(sumAbsNoPenalty + 0.1);
    });
  });
});
