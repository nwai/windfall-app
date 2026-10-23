import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { buildMlndRiskRows } from "./mlndExclusionRisk";
import {
  applyMlndCalibration, buildMlndCalibratedAnalysis, fitMlndCalibration,
  MLND_CALIBRATION_WARMUP, selectMlndCalibrationBudget,
} from "./mlndCalibration";

// Deterministic unit fixtures, never published as draw evidence.
const history = (count: number): Draw[] => {
  const date = new Date("2024-06-03T12:00:00Z");
  return Array.from({ length: count }, (_, index) => {
    if (index) do { date.setUTCDate(date.getUTCDate() + 1); } while (![1, 3, 5].includes(date.getUTCDay()));
    const numbers = Array.from({ length: 8 }, (_value, offset) => ((index * 7 + offset * 3) % 45) + 1);
    return { date: date.toISOString().slice(0, 10), main: numbers.slice(0, 6), supp: numbers.slice(6) };
  });
};
const options = { minTrainingDraws: 20, asOfDate: "2026-10-20" };

describe("MLND sequential calibration", () => {
  it("pools adjacent violations with the declared neutral regularisation, not invented observations", () => {
    const counters = [80, 20, 40, 50, 60].map(hits => ({ trials: 100, hits }));
    const fitted = fitMlndCalibration(counters, 8 / 45);
    expect(fitted[0].fittedRate).toBeCloseTo(164 / 435, 12);
    expect(fitted[0].block).toBe(fitted[1].block);
    expect(fitted[1].block).toBe(fitted[2].block);
    expect(fitted.every((row, index) => !index || row.fittedRate >= fitted[index - 1].fittedRate)).toBe(true);
    expect(fitted.reduce((sum, row) => sum + row.trials, 0)).toBe(500);
    expect(counters[0]).toEqual({ trials: 100, hits: 80 });
  });

  it("returns equal-chance risk when the fitted map has no distinctions", () => {
    const fitted = fitMlndCalibration(Array.from({ length: 5 }, () => ({ trials: 100, hits: 20 })), 8 / 45);
    const rates = applyMlndCalibration(Array.from({ length: 45 }, (_, index) => index / 45), fitted, 8);
    expect(rates).toEqual(Array(45).fill(8 / 45));
    expect(new Set(rates).size).toBe(1);
  });

  it.each([6, 8])("preserves monotone order and ties while matching a %i-ball marginal total", drawSize => {
    const fitted = fitMlndCalibration([5, 10, 20, 30, 40].map(hits => ({ trials: 100, hits })), drawSize / 45);
    const raw = Array.from({ length: 45 }, (_, index) => index / 50);
    const adjusted = applyMlndCalibration(raw, fitted, drawSize);
    expect(adjusted.reduce((sum, value) => sum + value, 0)).toBeCloseTo(drawSize, 10);
    expect(adjusted.every(value => value > 0 && value < 1 && Number.isFinite(value))).toBe(true);
    expect(adjusted.every((value, index) => !index || value >= adjusted[index - 1])).toBe(true);
    expect(adjusted[0]).toBe(adjusted[4]);
  });

  it("rejects invalid calibration counts and inputs", () => {
    expect(() => fitMlndCalibration([{ trials: 1, hits: 2 }], 8 / 45)).toThrow();
    const counters = Array.from({ length: 5 }, () => ({ trials: 10, hits: 2 }));
    expect(() => fitMlndCalibration([{ trials: 10, hits: 11 }, ...counters.slice(1)], 8 / 45)).toThrow();
    const fitted = fitMlndCalibration(counters, 8 / 45);
    expect(() => applyMlndCalibration([Number.NaN, ...Array(44).fill(0.2)], fitted, 8)).toThrow();
    expect(() => applyMlndCalibration(Array(45).fill(0.2), fitted, 7)).toThrow();
  });

  it("trains correction only on earlier out-of-sample forecasts", () => {
    const source = history(100);
    const result = buildMlndCalibratedAnalysis(source, options);
    expect(result.records).toHaveLength(80);
    expect(result.evaluationDraws).toBe(50);
    result.records.forEach((record, index) => {
      expect(record.trainingThrough < record.date).toBe(true);
      expect(record.calibrationDrawsBefore).toBe(index);
      expect(record.adjustedBrier == null).toBe(index < MLND_CALIBRATION_WARMUP);
      expect(record.points.filter(point => point.hit)).toHaveLength(8);
      if (record.adjustedBrier != null) expect(record.points.reduce((sum, point) => sum + point.adjusted!, 0)).toBeCloseTo(8, 10);
    });
    expect(result.status).toBe("learning");
    expect(result.reliability.reduce((sum, row) => sum + row.cases, 0)).toBe(50 * 45);
  });

  it("does not revise old predictions when future draws are appended or changed", () => {
    const source = history(110);
    const prefix = buildMlndCalibratedAnalysis(source.slice(0, 100), options);
    const full = buildMlndCalibratedAnalysis(source, options);
    expect(full.records.slice(0, prefix.records.length)).toEqual(prefix.records);
    const next = full.records[prefix.records.length];
    next.points.forEach(point => expect(point.adjusted).toBe(prefix.rows.find(row => row.number === point.number)!.adjustedRisk));
    const changed = source.map((draw, index) => index < 100 ? draw : { ...draw, main: [1, 2, 3, 4, 5, 6], supp: [7, 8] });
    expect(buildMlndCalibratedAnalysis(changed, options).records.slice(0, prefix.records.length)).toEqual(prefix.records);
  });

  it("preserves the original raw model for diagnostic comparisons", () => {
    const source = history(100);
    const raw = buildMlndRiskRows(source, "mainAndSupp");
    const result = buildMlndCalibratedAnalysis(source, options);
    expect(result.rows.map(({ adjustedRisk: _adjustedRisk, ...row }) => row)).toEqual(raw);
    const budget = selectMlndCalibrationBudget(result, 37);
    expect(budget.rawExcluded).toEqual(raw.slice(0, 37).map(row => row.number));
    expect(new Set([...budget.rawExcluded, ...budget.rawAllowed]).size).toBe(45);
    expect(budget.calibratedExcluded).toEqual([]);
    expect(budget.fairFalseExcluded).toBeCloseTo(37 * 8 / 45);
  });

  it("never manufactures a safest set by splitting equal calibrated risks", () => {
    const result = buildMlndCalibratedAnalysis(history(100), options);
    const tied = { ...result, status: "supported" as const, rows: result.rows.map(row => ({ ...row, adjustedRisk: 8 / 45 })) };
    const selection = selectMlndCalibrationBudget(tied, 37);
    expect(selection.tiedBoundary).toBe(true);
    expect(selection.supported).toBe(false);
    expect(selection.calibratedExcluded).toEqual([]);
    expect(selection.reason).toContain("equal calibrated risk");
  });

  it("filters bad evidence and resets calibration across missing scheduled draws", () => {
    const source = history(110);
    const bad = [
      ...source, { ...source[5], isSimulated: true }, { ...source[6], main: [1, 1, 2, 3, 4, 5] },
      { ...source[0], date: "2024-06-04" }, { ...source[0], date: "2027-01-01" }, { ...source[10] },
    ];
    const result = buildMlndCalibratedAnalysis(bad, options);
    expect(result.ignored).toEqual({ simulated: 1, malformed: 1, offSchedule: 1, future: 1, duplicateDateRows: 2, gapResets: 1 });
    expect(result.currentTrainingDraws).toBe(99);
    expect(result.records[0].trainingFrom).toBe(source[11].date);
  });

  it("uses separate six-ball outcomes in mains-only mode", () => {
    const result = buildMlndCalibratedAnalysis(history(100), { ...options, scope: "mains" });
    expect(result.baseline).toBe(6 / 45);
    expect(result.records.every(record => record.points.filter(point => point.hit).length === 6)).toBe(true);
    expect(result.rows.reduce((sum, row) => sum + row.adjustedRisk!, 0)).toBeCloseTo(6, 10);
  });

  it("shows unavailable calibration rather than fabricated results with insufficient history", () => {
    const empty = buildMlndCalibratedAnalysis([], options);
    expect(empty.evaluationDraws).toBe(0);
    expect(empty.rawBrier).toBeNull();
    expect(empty.adjustedBrier).toBeNull();
    expect(empty.calibrationGap).toBeNull();
    expect(empty.rows.every(row => row.adjustedRisk === null)).toBe(true);
    expect(selectMlndCalibrationBudget(empty, 37).supported).toBe(false);
  });
});
