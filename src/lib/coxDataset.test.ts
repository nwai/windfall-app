import { Draw } from "../types";
import { buildCoxDataset, buildNowDataset } from "./coxDataset";

describe("coxDataset", () => {
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
    {
      main: [1, 3, 11, 23, 33, 43],
      supp: [6, 16],
      date: "2025-01-04",
    },
  ];

  describe("buildCoxDataset", () => {
    it("should build dataset with correct number of rows", () => {
      const dataset = buildCoxDataset(mockDraws);
      expect(dataset.rows.length).toBe(45);
    });

    it("should normalize features correctly", () => {
      const dataset = buildCoxDataset(mockDraws);
      // All normalized values should be between 0 and 1
      for (const row of dataset.rows) {
        expect(row.freq_total_norm).toBeGreaterThanOrEqual(0);
        expect(row.freq_total_norm).toBeLessThanOrEqual(1);
        expect(row.time_since_last_norm).toBeGreaterThanOrEqual(0);
        expect(row.time_since_last_norm).toBeLessThanOrEqual(1);
        expect(row.tenure_norm).toBeGreaterThanOrEqual(0);
        expect(row.tenure_norm).toBeLessThanOrEqual(1);
      }
    });

    it("should set event=1 for numbers that appeared", () => {
      const dataset = buildCoxDataset(mockDraws);
      // Number 1 appeared in draw 0 and 3
      const num1Row = dataset.rows.find(r => r.number === 1);
      expect(num1Row?.event).toBe(1);
    });

    it("should set event=0 for numbers that never appeared", () => {
      const dataset = buildCoxDataset(mockDraws);
      // Number 44 never appeared
      const num44Row = dataset.rows.find(r => r.number === 44);
      expect(num44Row?.event).toBe(0);
    });

    it("should exclude specified numbers", () => {
      const dataset = buildCoxDataset(mockDraws, { excludeNumbers: [1, 2, 3] });
      expect(dataset.rows.length).toBe(42);
      expect(dataset.rows.find(r => r.number === 1)).toBeUndefined();
      expect(dataset.rows.find(r => r.number === 2)).toBeUndefined();
      expect(dataset.rows.find(r => r.number === 3)).toBeUndefined();
    });

    it("should include zone when requested", () => {
      const dataset = buildCoxDataset(mockDraws, { includeZone: true });
      for (const row of dataset.rows) {
        expect(row.zone).toBeDefined();
        expect(row.zone).toBeGreaterThanOrEqual(1);
        expect(row.zone).toBeLessThanOrEqual(9);
      }
    });
  });

  describe("buildNowDataset", () => {
    it("should build dataset for specified numbers", () => {
      const numbers = [1, 2, 3, 4, 5];
      const nowDataset = buildNowDataset(mockDraws, numbers);
      expect(nowDataset.length).toBe(5);
      expect(nowDataset.map(r => r.number).sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("should normalize features correctly", () => {
      const numbers = [1, 10, 20, 30, 40];
      const nowDataset = buildNowDataset(mockDraws, numbers);
      for (const row of nowDataset) {
        expect(row.freq_total_norm).toBeGreaterThanOrEqual(0);
        expect(row.freq_total_norm).toBeLessThanOrEqual(1);
        expect(row.time_since_last_norm).toBeGreaterThanOrEqual(0);
        expect(row.time_since_last_norm).toBeLessThanOrEqual(1);
      }
    });
  });
});
