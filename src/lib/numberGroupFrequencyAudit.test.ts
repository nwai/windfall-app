import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { computeOGA } from "../utils/oga";
import {
  analyzeNumberGroupFrequencyAudit, numberGroupBrier, numberGroupForecast, NUMBER_GROUP_METHODS,
  NUMBER_GROUP_NEUTRAL_RATE, NUMBER_GROUP_SCALES, summarizeNumberGroupComparison,
} from "./numberGroupFrequencyAudit";

// Deterministic unit fixtures only; never used as published historical evidence.
function fixture(count = 140): Draw[] {
  const day = new Date(2024, 5, 3);
  return Array.from({ length: count }, (_, index) => {
    while (![1, 3, 5].includes(day.getDay())) day.setDate(day.getDate() + 1);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const numbers = Array.from({ length: 8 }, (_, j) => (index * 7 + j * 4) % 45 + 1);
    day.setDate(day.getDate() + 1);
    return { date, main: numbers.slice(0, 6), supp: numbers.slice(6) };
  });
}
const asOfDate = "2026-10-18";
const analyze = (history: readonly Draw[], window: "all" | 13 | 36 | 156 = "all") => analyzeNumberGroupFrequencyAudit(history, { window, asOfDate });

describe("number-group frequency audit", () => {
  it("partitions all 45 numbers evenly and conserves an eight-number expected draw", () => {
    const training = fixture(101);
    for (const scale of NUMBER_GROUP_SCALES) {
      const forecast = numberGroupForecast(training, scale);
      expect(forecast.ranges).toHaveLength(scale);
      expect(forecast.ranges[0][0]).toBe(1);
      expect(forecast.ranges.at(-1)![1]).toBe(45);
      forecast.ranges.forEach(([first, last], index) => {
        expect(last - first + 1).toBe(45 / scale);
        if (index) expect(first).toBe(forecast.ranges[index - 1][1] + 1);
      });
      expect(forecast.groupHits.reduce((a, b) => a + b, 0)).toBe(808);
      expect(forecast.predictedCounts.reduce((a, b) => a + b, 0)).toBeCloseTo(8, 12);
      for (const method of NUMBER_GROUP_METHODS) {
        const probabilities = forecast.probabilities[method];
        expect(probabilities).toHaveLength(45);
        expect(probabilities.every(p => p >= 0 && p <= 1)).toBe(true);
        expect(probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(8, 12);
      }
      expect(forecast.probabilities.group[0]).toBe(forecast.probabilities.group[1]);
      forecast.probabilities.blend.forEach((p, index) => expect(p).toBe((forecast.probabilities.individual[index] + forecast.probabilities.group[index]) / 2));
    }
  });

  it("discloses neutral pulls without adding observed hits", () => {
    const training = fixture(1);
    const forecast = numberGroupForecast(training, 9);
    expect(forecast.probabilities.individual[0]).toBeCloseTo((1 + 30 * 8 / 45) / 31);
    expect(forecast.probabilities.individual[44]).toBeCloseTo((30 * 8 / 45) / 31);
    expect(forecast.probabilities["individual-cautious"][0]).toBeCloseTo((1 + 60 * 8 / 45) / 61);
    expect(forecast.groupHits.reduce((a, b) => a + b, 0)).toBe(8);
    expect(() => numberGroupForecast([], 9)).toThrow();
    expect(() => numberGroupForecast(training, 7 as 9)).toThrow();
  });

  it("computes exact neutral Brier loss and checks legal outcomes", () => {
    const actual = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(numberGroupBrier(Array(45).fill(NUMBER_GROUP_NEUTRAL_RATE), actual)).toBeCloseTo((8 / 45) * (37 / 45), 12);
    expect(numberGroupBrier(Array.from({ length: 45 }, (_, i) => Number(i < 8)), actual)).toBe(0);
    expect(() => numberGroupBrier(Array(44).fill(0.2), actual)).toThrow();
    expect(() => numberGroupBrier(Array(45).fill(NaN), actual)).toThrow();
    expect(() => numberGroupBrier(Array(45).fill(1.1), actual)).toThrow();
    expect(() => numberGroupBrier(Array(45).fill(0.2), [1, 1, 2, 3, 4, 5, 6, 7])).toThrow();
    expect(() => numberGroupBrier(Array(45).fill(0.2), [0, 2, 3, 4, 5, 6, 7, 8])).toThrow();
  });

  it("uses identical target dates across all scales, chronological input and strict prior-only windows", () => {
    const history = fixture();
    const before = JSON.stringify(history);
    const audit = analyze([...history].reverse(), 13);
    expect(JSON.stringify(history)).toBe(before);
    expect(audit.targets).toBe(40);
    expect(audit.records).toHaveLength(160);
    expect(audit.ignored.warmupRows).toBe(100);
    expect(audit.firstTarget).toBe(history[100].date);
    expect(audit.lastTarget).toBe(history[139].date);
    for (const scale of NUMBER_GROUP_SCALES) {
      const rows = audit.records.filter(row => row.scale === scale);
      expect(rows.map(row => row.date)).toEqual(history.slice(100).map(draw => draw.date));
      rows.forEach((row, index) => {
        expect(row.trainingDraws).toBe(13);
        expect(row.trainingFrom).toBe(history[index + 87].date);
        expect(row.trainingThrough).toBe(history[index + 99].date);
        expect(row.trainingThrough < row.date).toBe(true);
        expect(row.predictedCounts.reduce((a, b) => a + b, 0)).toBeCloseTo(8);
        expect(row.actualCounts.reduce((a, b) => a + b, 0)).toBe(8);
      });
    }
    expect(audit.current?.trainingDraws).toBe(13);
    expect(audit.current?.trainingThrough).toBe(history[139].date);
    expect(audit.current!.date > history[139].date).toBe(true);
  });

  it("does not let a target outcome or later data change its own pre-draw estimate", () => {
    const history = fixture(120);
    const prefix = analyze(history.slice(0, 110));
    const full = analyze(history);
    expect(full.records.slice(0, prefix.records.length)).toEqual(prefix.records);
    const altered = history.map((draw, index) => index === 110 ? { ...draw, main: [1, 2, 3, 4, 5, 6], supp: [7, 8] } : draw);
    const changed = analyze(altered);
    for (const scale of NUMBER_GROUP_SCALES) {
      const original = full.records.find(row => row.date === history[110].date && row.scale === scale)!;
      const other = changed.records.find(row => row.date === history[110].date && row.scale === scale)!;
      expect(other.predictedCounts).toEqual(original.predictedCounts);
      expect(other.trainingThrough).toBe(original.trainingThrough);
      expect(other.fairOgaMean).toBe(original.fairOgaMean);
    }
    expect(prefix.current?.scales.map(row => row.predictedCounts)).toEqual(full.records.filter(row => row.date === history[110].date).map(row => row.predictedCounts));
  });

  it("excludes simulated, malformed, off-schedule, future and all ambiguous-date records", () => {
    const history = fixture(105);
    const extra: Draw[] = [
      { date: "2024-05-31", main: [1, 2, 3, 4, 5, 6], supp: [7, 8], isSimulated: true },
      { date: "2024-05-29", main: [1, 1, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2024-06-04", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2027-01-04", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { ...history[104] },
    ];
    const result = analyze([...history, ...extra]);
    expect(result.ignored).toMatchObject({ simulated: 1, malformed: 1, offSchedule: 1, future: 1, ambiguousDateRows: 2 });
    expect(result.baseline).toHaveLength(104);
    expect(result.records.some(row => row.date === history[104].date)).toBe(false);
    expect(result.baseline.some(row => row.isSimulated)).toBe(false);
    expect(() => analyzeNumberGroupFrequencyAudit(history, { window: 14 as 13 })).toThrow();
    expect(() => analyzeNumberGroupFrequencyAudit(history, { asOfDate: "bad date" })).toThrow();
  });

  it("excludes the partial opening month rather than treating it as a full baseline", () => {
    const opening = { date: "2024-05-31", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] };
    const result = analyze([opening, ...fixture(102)]);
    expect(result.excludedMonths).toEqual(["2024-05"]);
    expect(result.ignored.openingMonthRows).toBe(1);
    expect(result.validDraws).toBe(103);
    expect(result.baseline).toHaveLength(102);
    expect(result.targets).toBe(2);
  });

  it("restarts training warm-up at a missing scheduled draw and never bridges gaps", () => {
    const history = fixture(220);
    const result = analyze(history.filter((_, index) => index !== 105));
    expect(result.ignored.gapResets).toBe(1);
    expect(result.targets).toBe(19);
    const resumed = result.records.find(row => row.date === history[206].date)!;
    expect(resumed.trainingFrom).toBe(history[106].date);
    expect(resumed.trainingDraws).toBe(100);
    expect(resumed.ordinal).toBeGreaterThan(0);
    expect(resumed.monthLength).toBeGreaterThanOrEqual(12);
    expect(resumed.monthLength).toBeLessThanOrEqual(14);
    expect(analyze(history.slice(0, 150).filter((_, index) => index !== 105)).current).toBeNull();
  });

  it("retains every exact tied group and computes the fair pool-size expectation", () => {
    const repeated = fixture(102).map(draw => ({ ...draw, main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }));
    const result = analyze(repeated);
    const row = result.records.find(row => row.scale === 3)!;
    expect(row.high).toEqual({ groups: [0], poolSize: 15, hits: 8, expected: 8 / 3 });
    expect(row.quiet.groups).toEqual([1, 2]);
    expect(row.quiet.poolSize).toBe(30);
    expect(row.quiet.expected).toBeCloseTo(16 / 3);
    expect(result.summaries[0].high.excessPP).toBeCloseTo(100 * (8 / 15 - 8 / 45));
    const balanced = analyze(fixture(140));
    expect(balanced.records.filter(record => record.scale === 3).some(record => record.high.poolSize === 45)).toBe(true);
    expect(balanced.summaries[0].high.informativeTrials).toBeLessThan(balanced.targets);
  });

  it("retains the real shared OGA arithmetic and its exact fair-score expectation", () => {
    const history = fixture(101);
    const audit = analyze(history);
    for (const row of audit.records) {
      expect(row.rawOga).toBe(computeOGA([...row.actual.main, ...row.actual.supp], history.slice(0, 100), row.scale));
      const forecast = numberGroupForecast(history.slice(0, 100), row.scale);
      expect(row.fairOgaMean).toBeCloseTo(forecast.groupHits.reduce((sum, count) => sum + (8 / row.scale) / (count / 100 + 0.001), 0));
      expect(row.neutralCompositionLoss).toBeCloseTo(row.actualCounts.reduce((sum, count) => sum + (count - 8 / row.scale) ** 2, 0) / row.scale);
    }
  });

  it("summarises draw-level gains, sensitivity halves and thin intervals without declaring a winner", () => {
    expect(summarizeNumberGroupComparison([])).toEqual({ trials: 0, mean: null, interval95: null, earlierMean: null, laterMean: null });
    expect(summarizeNumberGroupComparison([1, 2, 3, 4, 5])).toMatchObject({ trials: 5, mean: 3, earlierMean: 2, laterMean: 4.5, interval95: null });
    expect(summarizeNumberGroupComparison(Array(30).fill(2)).interval95).toEqual([2, 2]);
    const audit = analyze(fixture());
    expect(audit.earlierTargets).toBe(20);
    expect(audit.laterTargets).toBe(20);
    for (const summary of audit.summaries) {
      const rows = audit.records.filter(row => row.scale === summary.scale);
      const blend = summary.methods.find(row => row.method === "blend")!;
      expect(blend.individualGain.mean).toBeCloseTo(rows.reduce((sum, row) => sum + row.losses.individual - row.losses.blend, 0) / 40);
      expect(blend.individualGain.interval95).not.toBeNull();
      expect(summary.compositionGain.mean).toBeCloseTo(summary.neutralCompositionLoss! - summary.groupCompositionLoss!);
    }
    expect(audit).not.toHaveProperty("winner");
    expect(audit).not.toHaveProperty("generationWeights");
  });

  it("shows unavailable results rather than fabricated observations when history is empty or thin", () => {
    for (const count of [0, 1, 99, 100]) {
      const audit = analyze(fixture(count));
      expect(audit.targets).toBe(0);
      expect(audit.summaries.every(row => row.groupCompositionLoss === null && row.methods.every(method => method.loss === null))).toBe(true);
      expect(audit.current === null).toBe(count < 100);
    }
  });
});
