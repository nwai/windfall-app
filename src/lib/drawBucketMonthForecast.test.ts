import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { forecastDrawBucketMonth } from "./drawBucketMonthForecast";

const buildDraw = (date: string, main: number[], supp: number[] = [], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("forecastDrawBucketMonth", () => {
  it("forecasts blank current-month slots from similar historical month progress", () => {
    const history: Draw[] = [
      buildDraw("2026-01-01", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-01-08", [11, 12, 13, 14, 16, 17]),
      buildDraw("2026-01-15", [5, 10, 15, 20, 21, 31]),
      buildDraw("2026-02-05", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-02-12", [11, 12, 13, 14, 16, 17]),
      buildDraw("2026-02-19", [5, 10, 15, 20, 21, 31]),
      buildDraw("2026-03-05", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-03-12", [11, 12, 13, 14, 16, 17]),
    ];

    const forecast = forecastDrawBucketMonth(history, {
      includeSupp: false,
      currentMonthKey: "2026-03",
      targetSlotCount: 3,
    });

    expect(forecast.currentMonthKey).toBe("2026-03");
    expect(forecast.observedDrawCount).toBe(2);
    expect(forecast.forecastSlotCount).toBe(1);
    expect(forecast.slotForecasts).toHaveLength(1);

    const slot3 = forecast.slotForecasts[0];
    expect(slot3.slotIndex).toBe(3);
    expect(slot3.bucketForecasts.div5).toBeUndefined();
    expect(slot3.bucketForecasts.end0.predictedHits).toBe(2);
    expect(slot3.bucketForecasts.end0.support).toBe(2);
    expect(slot3.bucketForecasts.end5.predictedHits).toBe(2);
    expect(slot3.bucketForecasts.end5.support).toBe(2);
    expect(slot3.bucketForecasts.end5.topMatches.map((match) => match.monthKey)).toEqual(["2026-01", "2026-02"]);
    expect(slot3.bucketForecasts.end1.predictedHits).toBe(2);
    expect(slot3.bucketForecasts.end1.confidence).toBeGreaterThan(0.99);
  });

  it("returns no future forecasts when the current month already fills the target slot count", () => {
    const history: Draw[] = [
      buildDraw("2026-01-01", [1, 2, 3, 4, 5, 6]),
      buildDraw("2026-01-08", [7, 8, 9, 10, 11, 12]),
      buildDraw("2026-01-15", [13, 14, 15, 16, 17, 18]),
    ];

    const forecast = forecastDrawBucketMonth(history, {
      includeSupp: false,
      currentMonthKey: "2026-01",
      targetSlotCount: 3,
    });

    expect(forecast.forecastSlotCount).toBe(0);
    expect(forecast.slotForecasts).toEqual([]);
  });

  it("can forecast multiple future month slots when historical months run longer", () => {
    const history: Draw[] = [
      buildDraw("2025-11-01", [1, 2, 3, 4, 6, 7]),
      buildDraw("2025-11-08", [11, 12, 13, 14, 16, 17]),
      buildDraw("2025-11-15", [5, 10, 15, 20, 21, 31]),
      buildDraw("2025-11-22", [9, 19, 29, 39, 8, 18]),
      buildDraw("2025-12-03", [1, 2, 3, 4, 6, 7]),
      buildDraw("2025-12-10", [11, 12, 13, 14, 16, 17]),
      buildDraw("2025-12-17", [5, 10, 15, 20, 21, 31]),
      buildDraw("2025-12-24", [9, 19, 29, 39, 8, 18]),
      buildDraw("2026-01-07", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-01-14", [11, 12, 13, 14, 16, 17]),
    ];

    const forecast = forecastDrawBucketMonth(history, {
      includeSupp: false,
      currentMonthKey: "2026-01",
      targetSlotCount: 4,
    });

    expect(forecast.forecastSlotCount).toBe(2);
    expect(forecast.slotForecasts.map((slot) => slot.slotIndex)).toEqual([3, 4]);
    expect(forecast.slotForecasts[1].bucketForecasts.end9.predictedHits).toBe(4);
  });

  it("ignores simulated fallback rows instead of counting them as observed current-month slots", () => {
    const history: Draw[] = [
      buildDraw("2026-01-01", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-01-08", [11, 12, 13, 14, 16, 17]),
      buildDraw("2026-01-15", [5, 10, 15, 20, 21, 31]),
      buildDraw("2026-02-05", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-02-12", [11, 12, 13, 14, 16, 17]),
      buildDraw("2026-02-19", [5, 10, 15, 20, 21, 31]),
      buildDraw("2026-03-05", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-03-12", [11, 12, 13, 14, 16, 17]),
      buildDraw("2026-03-19", [45, 44, 43, 42, 41, 40], [], true),
    ];

    const forecast = forecastDrawBucketMonth(history, {
      includeSupp: false,
      currentMonthKey: "2026-03",
      targetSlotCount: 3,
    });

    expect(forecast.observedDrawCount).toBe(2);
    expect(forecast.forecastSlotCount).toBe(1);
    expect(forecast.warnings).toContain("Ignored 1 simulated fallback draw row; draw-bucket month forecasts use real historical draws only.");
  });

  it("does not fall back to raw simulated rows when no separate training months exist", () => {
    const history: Draw[] = [
      buildDraw("2026-03-05", [1, 2, 3, 4, 6, 7]),
      buildDraw("2026-03-12", [11, 12, 13, 14, 16, 17]),
      buildDraw("2026-03-19", [40, 41, 42, 43, 44, 45], [], true),
    ];

    const forecast = forecastDrawBucketMonth(history, {
      includeSupp: false,
      currentMonthKey: "2026-03",
      targetSlotCount: 3,
    });

    expect(forecast.warnings).toContain("Ignored 1 simulated fallback draw row; draw-bucket month forecasts use real historical draws only.");
    expect(forecast.observedDrawCount).toBe(2);
    expect(forecast.slotForecasts[0]?.bucketForecasts.div5).toBeUndefined();
    expect(forecast.slotForecasts[0]?.bucketForecasts.end0.support).toBe(0);
    expect(forecast.slotForecasts[0]?.bucketForecasts.end5.support).toBe(0);
  });
});
