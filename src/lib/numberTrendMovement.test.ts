import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { analyzeNumberTrendMovement, calculateNumberTrendRate, numberTrendMovementBand } from "./numberTrendMovement";

function historyFor(hits: readonly boolean[]): Draw[] {
  const date = new Date(2026, 0, 2);
  return hits.map(hit => {
    while (![1, 3, 5].includes(date.getDay())) date.setDate(date.getDate() + 1);
    const draw = { date: `${date.getMonth() + 1}/${date.getDate()}/26`,
      main: hit ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6, 7], supp: hit ? [7, 8] : [8, 9] };
    date.setDate(date.getDate() + 1);
    return draw;
  });
}

describe("Number Trends Movement Replay", () => {
  it("compares rates, not the latest hit or miss, and shares the neutral band", () => {
    const positiveMiss = analyzeNumberTrendMovement(historyFor([...Array(10).fill(false), true, false, false]), 1).points.at(-1)!;
    expect(positiveMiss.role).toBe("absent");
    expect(positiveMiss.deltaPP).toBeCloseTo(100 * (1 / 3 - 1 / 13));
    expect(positiveMiss.direction).toBe("up");
    const negativeHit = analyzeNumberTrendMovement(historyFor([...Array(10).fill(true), false, false, true]), 1).points.at(-1)!;
    expect(negativeHit.role).toBe("main");
    expect(negativeHit.deltaPP).toBeLessThan(0);
    expect(negativeHit.direction).toBe("down");
    expect(calculateNumberTrendRate(1, 5, 3, 13).dir).toBe("flat");
    expect(numberTrendMovementBand(-5.5)).toBe("flat");
    expect(numberTrendMovementBand(5.5)).toBe("flat");
    expect(numberTrendMovementBand(20)).toBe("slight-up");
    expect(numberTrendMovementBand(-20)).toBe("slight-down");
  });

  it("has the exact +/-76.923 full-window bounds across all possible thirteen-draw hit histories", () => {
    let highest = -Infinity, lowest = Infinity;
    for (let mask = 0; mask < 8192; mask += 1) {
      let all = 0, recent = 0;
      for (let index = 0; index < 13; index += 1) {
        const hit = (mask >> index) & 1;
        all += hit;
        if (index >= 10) recent += hit;
      }
      const value = calculateNumberTrendRate(recent, all, 3, 13).deltaPP;
      highest = Math.max(highest, value); lowest = Math.min(lowest, value);
    }
    expect(highest).toBeCloseTo(1000 / 13);
    expect(lowest).toBeCloseTo(-1000 / 13);
  });

  it("uses available warm-up denominators without adding short states to full-window summaries", () => {
    for (const length of [0, 1, 2, 3, 6, 12, 13]) {
      const result = analyzeNumberTrendMovement(historyFor(Array(length).fill(true)), 1);
      expect(result.summary.fullWindowCount).toBe(Math.max(0, length - 12));
      expect(result.summary.warmupCount).toBe(Math.min(12, length));
      expect(result.bands.reduce((sum, band) => sum + band.trials, 0)).toBe(0);
      if (length) {
        expect(result.points.at(-1)?.deltaPP).toBe(0);
        expect(result.points.at(-1)?.recentDrawCount).toBe(Math.min(3, length));
        expect(result.points.at(-1)?.comparisonDrawCount).toBe(Math.min(13, length));
        expect(result.summary.mathematicalLimit).toBeCloseTo(100 * (1 - Math.min(3, length) / Math.min(13, length)));
      } else {
        expect(result.summary.mathematicalLimit).toBeNull();
        expect(result.summary.typicalRange).toBeNull();
      }
      if (length < 13) expect(result.summary.highest).toBeNull();
    }
  });

  it("freezes each earlier score before its outcome and only resolves that outcome when the next draw arrives", () => {
    const history = historyFor(Array.from({ length: 30 }, (_, index) => index % 4 === 0));
    const full = analyzeNumberTrendMovement(history, 1);
    for (let end = 13; end < history.length; end += 1) {
      const replay = analyzeNumberTrendMovement(history.slice(0, end), 1);
      const current = replay.points.at(-1)!;
      const later = full.points[end - 1];
      for (const key of ["date", "hits3", "hits13", "recentDrawCount", "comparisonDrawCount", "deltaPP", "direction", "role"] as const) {
        expect(current[key]).toEqual(later[key]);
      }
      expect(current.nextHit).toBeNull();
      expect(current.nextStatus).toBe("pending");
      expect(later.nextHit).toBe(history[end].main.includes(1));
      expect(replay.bands.reduce((sum, band) => sum + band.trials, 0)).toBe(end - 13);
    }
  });

  it("counts main and supplementary appearances equally but keeps their role markers", () => {
    const history = historyFor(Array(16).fill(true));
    history[14] = { ...history[14], main: [2, 3, 4, 5, 6, 7], supp: [1, 8] };
    const result = analyzeNumberTrendMovement(history, 1);
    expect(result.points[14].role).toBe("supp");
    expect(result.points[14].hits3).toBe(3);
    expect(result.points[14].deltaPP).toBe(0);
    expect(result.bands.find(row => row.id === "flat")).toMatchObject({ trials: 3, hits: 3, rate: 1 });
  });

  it("censors missing next scheduled draws and leaves the latest outcome pending", () => {
    const source = historyFor(Array(17).fill(true));
    const result = analyzeNumberTrendMovement(source.filter((_, index) => index !== 14), 1);
    expect(result.points[13].nextStatus).toBe("gap");
    expect(result.points[13].nextHit).toBeNull();
    expect(result.points.at(-1)?.nextStatus).toBe("pending");
    expect(result.bands.reduce((sum, band) => sum + band.trials, 0)).toBe(2);
    expect(result.summary.currentRun).toBe(2);
    expect(result.states.find(state => state.direction === "flat")?.longestRun).toBe(2);
  });

  it("omits simulated, invalid, off-schedule and all conflicting-date rows without mutating the source", () => {
    const history = historyFor(Array(18).fill(false));
    const source: Draw[] = [...history.slice().reverse(), { ...history[3] }, { ...history[5], isSimulated: true },
      { ...history[6], date: "2026-01-03" }, { ...history[7], main: [1, 1, 2, 3, 4, 5] }];
    const before = JSON.stringify(source);
    const result = analyzeNumberTrendMovement(source, 1);
    expect(result.ignored).toEqual({ simulated: 1, malformed: 1, offSchedule: 1, duplicateDateRows: 2 });
    expect(result.points).toHaveLength(17);
    expect(result.points[0].date).toBe("2026-01-02");
    expect(result.points[2].nextStatus).toBe("gap");
    expect(JSON.stringify(source)).toBe(before);
  });

  it("reports measured extrema, quantiles, durations and raw same-number band rates", () => {
    const result = analyzeNumberTrendMovement(historyFor(Array(30).fill(false)), 1);
    expect(result.summary).toMatchObject({ fullWindowCount: 18, warmupCount: 12, currentRun: 18, typicalRange: [0, 0] });
    expect(result.summary.lowest?.deltaPP).toBe(0);
    expect(result.summary.highest?.deltaPP).toBe(0);
    expect(result.states).toEqual([{ direction: "up", count: 0, longestRun: 0 }, { direction: "flat", count: 18, longestRun: 18 }, { direction: "down", count: 0, longestRun: 0 }]);
    expect(result.bands.find(band => band.id === "flat")).toMatchObject({ trials: 17, hits: 0, rate: 0 });
    expect(result.bands.find(band => band.id === "flat")?.liftPP).toBeCloseTo(-100 * 8 / 45);
    expect(result.bands.find(band => band.id === "up")?.rate).toBeNull();
    expect(result.bands.find(band => band.id === "up")?.liftPP).toBeNull();
    expect(() => analyzeNumberTrendMovement([], 0)).toThrow(RangeError);
    expect(() => analyzeNumberTrendMovement([], 46)).toThrow(RangeError);
  });
});
