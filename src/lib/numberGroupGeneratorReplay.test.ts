import { describe, expect, it } from "vitest";
import type { Draw, Knobs } from "../types";
import { generateCandidates } from "../generateCandidates";
import { analyzeNumberGroupFrequencyAudit, numberGroupForecast } from "./numberGroupFrequencyAudit";
import { seededRandom } from "./settingsTransparency";
import {
  generateNumberGroupReplayRows, numberGroupReplaySeed, numberGroupReplaySourceKey, numberGroupReplayWeights,
  NUMBER_GROUP_GENERATOR_PROTOCOL, runNumberGroupGeneratorReplay, scoreNumberGroupReplayRows, summarizeNumberGroupGeneratorReplay,
} from "./numberGroupGeneratorReplay";

// Deliberate test-only fixtures; published replay outcomes always come from real history.
function fixture(count = 104): Draw[] {
  const day = new Date(2024, 5, 3);
  return Array.from({ length: count }, (_, index) => {
    while (![1, 3, 5].includes(day.getDay())) day.setDate(day.getDate() + 1);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    day.setDate(day.getDate() + 1);
    const numbers = Array.from({ length: 8 }, (_, i) => (index * 7 + i * 4) % 45 + 1);
    return { date, main: numbers.slice(0, 6), supp: numbers.slice(6) };
  });
}
const asOfDate = "2026-10-18";
const neutralWeights = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [i + 1, 1]));

describe("NGFA paired production-generator replay", () => {
  it("uses the fixed forecast-to-neutral ratio, identical for all three members of each group", () => {
    const history = fixture();
    const forecast = numberGroupForecast(history, 15);
    const weights = numberGroupReplayWeights(history);
    expect(Object.keys(weights)).toHaveLength(45);
    for (let number = 1; number <= 45; number++) {
      expect(weights[number]).toBeCloseTo(forecast.probabilities.group[number - 1] / (8 / 45), 12);
      expect(weights[number]).toBeGreaterThan(0);
      expect(weights[number]).toBe(weights[Math.floor((number - 1) / 3) * 3 + 1]);
    }
    expect(Object.values(weights).reduce((sum, n) => sum + n, 0)).toBeCloseTo(45, 12);
    expect(numberGroupReplaySeed("2026-10-16", 0)).toBe(numberGroupReplaySeed("2026-10-16", 0));
    expect(numberGroupReplaySeed("2026-10-16", 0)).not.toBe(numberGroupReplaySeed("2026-10-14", 0));
    expect(numberGroupReplaySeed("2026-10-16", 1)).not.toBe(numberGroupReplaySeed("2026-10-16", 0));
  });

  it.each(["isolated", "composition"] as const)("preserves exact Off behaviour with all-one audit weights in %s", scenario => {
    const training = fixture(100);
    const before = JSON.stringify(training);
    const off = generateNumberGroupReplayRows({ training, scenario, seed: 101 });
    const trace: string[] = [];
    const neutral = generateNumberGroupReplayRows({ training, scenario, seed: 101, weights: neutralWeights, trace: line => trace.push(line) });
    expect(neutral.candidates).toEqual(off.candidates);
    expect(neutral.rejectionStats).toEqual(off.rejectionStats);
    expect(neutral.candidates).toHaveLength(25);
    expect(JSON.stringify(training)).toBe(before);
    expect(trace.join("\n")).toContain("NGFA-GR1: audit-only sampling multipliers active before hard filters");
    if (scenario === "composition") {
      const last = new Set([...training.at(-1)!.main, ...training.at(-1)!.supp]);
      const weighted = generateNumberGroupReplayRows({ training, scenario, seed: 101, weights: numberGroupReplayWeights(training) });
      for (const result of [off, weighted]) {
        expect(result.candidates).toHaveLength(25);
        expect(result.candidates.every(row => [...row.main, ...row.supp].filter(n => n % 2 === 1).length === 4)).toBe(true);
        expect(result.candidates.every(row => [...row.main, ...row.supp].filter(n => last.has(n)).length <= 2)).toBe(true);
      }
      expect(off.rejectionStats.totalAttempts).toBeGreaterThan(25);
    }
  });

  it("actually changes sampling, without relaxing production hard inclusions, exclusions or count rules", () => {
    const knobs: Knobs = { enableSDE1: false, enableHC3: false, enableOGA: false, enableGPWF: false,
      enableEntropy: false, enableHamming: false, enableJaccard: false, F: 0, M: 0, Q: 0, Y: 0, Historical_Weight: 0,
      gpwf_window_size: 0, gpwf_bias_factor: 0, gpwf_floor: 0, gpwf_scale_multiplier: 0, lambda: 0, octagonal_top: 9,
      exact_set_override: false, hamming_relax: false, gpwf_targeted_mode: false };
    const run = (weights?: Record<number, number>) => {
      const args: Parameters<typeof generateCandidates> = [200, [], knobs, () => {}, [1], [], false, 0, [], [45], [], undefined, 0, 0, 1, 0];
      args[39] = 100;
      args[54] = seededRandom(123);
      args[57] = weights ? { label: "test-only weights", numberMultipliers: weights } : undefined;
      return generateCandidates(...args);
    };
    const strong = { ...neutralWeights, 1: 100, 2: 100, 3: 100 };
    const off = run(), on = run(strong);
    expect(on.candidates).toHaveLength(200);
    expect(on.candidates.every(row => [...row.main, ...row.supp].includes(45) && ![...row.main, ...row.supp].includes(1))).toBe(true);
    const hits = (rows: typeof on.candidates) => rows.filter(row => [...row.main, ...row.supp].includes(2)).length;
    expect(hits(on.candidates)).toBeGreaterThan(hits(off.candidates) + 100);
    for (const weights of [{ ...neutralWeights, 2: NaN }, { ...neutralWeights, 2: 0 }, { 1: 1 }]) {
      const invalid = run(weights);
      expect(invalid.candidates).toHaveLength(0);
      expect(invalid.quotaWarning).toContain("45 finite, positive multipliers");
    }
  });

  it("scores playable six-number prizes separately from eight-number overlap", () => {
    const target = { date: "2026-10-16", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] };
    const scores = scoreNumberGroupReplayRows([
      { main: [1, 2, 3, 4, 5, 6], supp: [9, 10] },
      { main: [1, 2, 3, 4, 5, 7], supp: [6, 8] },
      { main: [1, 2, 9, 10, 11, 12], supp: [7, 8] },
    ], target);
    expect(scores[0]).toMatchObject({ mainHits: 6, division: "Div1", eightHits: 6 });
    expect(scores[1]).toMatchObject({ mainHits: 5, ticketSuppHits: 1, division: "Div2", eightHits: 8 });
    expect(scores[2]).toMatchObject({ mainHits: 2, ticketSuppHits: 0, division: "\u2014", eightHits: 4 });
  });

  it("replays all fixed seeds and preserves reproducibility, correct denominators and complete provenance", async () => {
    const history = fixture();
    const before = JSON.stringify(history);
    const progress: number[][] = [];
    const result = await runNumberGroupGeneratorReplay(history, { asOfDate, window: 13 }, (done, total) => progress.push([done, total]));
    const again = await runNumberGroupGeneratorReplay([...history].reverse(), { asOfDate, window: 13 });
    expect(result).toEqual(again);
    expect(JSON.stringify(history)).toBe(before);
    expect(result.protocol.version).toBe("NGFA-GR1");
    expect(result.settings).toMatchObject({ excludedNumbers: [], forcedNumbers: [], selectedOddEvenRatios: [], maxLastDrawMatches: null, lambda: 0 });
    expect(result.settings.knobs).toMatchObject({ enableSDE1: false, enableHC3: false, enableOGA: false, enableGPWF: false, enableEntropy: false, enableHamming: false, enableJaccard: false });
    expect(result.source.baseline).toEqual(history);
    expect(result.sourceKey).toBe(numberGroupReplaySourceKey(analyzeNumberGroupFrequencyAudit(history, { asOfDate, window: 13 })));
    expect(result.records).toHaveLength(4);
    expect(progress).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    for (const record of result.records) {
      expect(record.trainingDraws).toBe(13);
      expect(record.trainingThrough < record.date).toBe(true);
      expect(record.completePair).toBe(true);
      expect(record.seeds.map(seed => seed.seed)).toEqual([...NUMBER_GROUP_GENERATOR_PROTOCOL.seeds]);
      expect(record.trace.On.filter(line => line.startsWith("[TRACE] Sampling weight "))).toHaveLength(45);
      expect(record.trace.Off.some(line => line.includes("neutral 1x"))).toBe(true);
      expect(record.trace.On.some(line => line.includes("samplingAudit="))).toBe(true);
      for (const seed of record.seeds) for (const arm of ["Off", "On"] as const) {
        const run = seed.arms[arm];
        expect(run.rows).toHaveLength(25);
        expect(run.metrics.attempts).toBeLessThanOrEqual(2500);
        expect(run.rows.every(row => row.main.length === 6 && row.supp.length === 2 && new Set([...row.main, ...row.supp]).size === 8)).toBe(true);
      }
    }
    const summary = summarizeNumberGroupGeneratorReplay(result.records);
    expect(summary.targets).toBe(4);
    expect(summary.mainDifference.trials).toBe(4);
    expect(summary.mainDifference.interval95).toBeNull();
    expect(summary.arms.map(arm => arm.metrics.rows)).toEqual([400, 400]);
    expect(summary.mainDifference.mean).toBeCloseTo(summary.pairedArms[1].metrics.mainHits! - summary.pairedArms[0].metrics.mainHits!);
  });

  it("does not use a target or later outcome in its weights, seeds or generated rows", async () => {
    const history = fixture(103);
    const original = await runNumberGroupGeneratorReplay(history, { asOfDate });
    const prefix = await runNumberGroupGeneratorReplay(history.slice(0, 102), { asOfDate });
    expect(original.records.slice(0, 2)).toEqual(prefix.records);
    const changed = history.map((draw, index) => index === 101 ? { ...draw, main: [1, 2, 3, 4, 5, 6], supp: [7, 8] } : draw);
    const alternative = await runNumberGroupGeneratorReplay(changed, { asOfDate });
    const before = original.records[1], after = alternative.records[1];
    expect(before.numberMultipliers).toEqual(after.numberMultipliers);
    expect(before.seeds.map(seed => [seed.effectiveSeed, seed.arms.Off.rows.map(row => [row.main, row.supp]), seed.arms.On.rows.map(row => [row.main, row.supp])]))
      .toEqual(after.seeds.map(seed => [seed.effectiveSeed, seed.arms.Off.rows.map(row => [row.main, row.supp]), seed.arms.On.rows.map(row => [row.main, row.supp])])) ;
  });

  it("inherits all source exclusions and gap warm-up rules without substituting targets", async () => {
    const history = fixture(108);
    const invalid = [
      { ...history[0], date: "2024-05-31" },
      { ...history[0], date: "2024-05-29", isSimulated: true },
      { ...history[0], date: "2024-06-04" },
      { ...history[0], date: "2027-01-04" },
      { ...history[0], date: "2024-05-27", main: [1, 1, 3, 4, 5, 6] },
    ];
    const source = [...history.filter((_, index) => index !== 103), ...invalid, history[107]];
    const audit = analyzeNumberGroupFrequencyAudit(source, { asOfDate });
    const result = await runNumberGroupGeneratorReplay(source, { asOfDate });
    expect(result.records.map(row => row.date)).toEqual(audit.records.filter(row => row.scale === 15).map(row => row.date));
    expect(result.source.ignored).toMatchObject({ simulated: 1, malformed: 1, offSchedule: 1, future: 1, ambiguousDateRows: 2, openingMonthRows: 1 });
    expect(result.records).toHaveLength(3);
  });

  it("keeps incomplete pairs visible while withholding them from paired performance", async () => {
    const result = await runNumberGroupGeneratorReplay(fixture(102), { asOfDate });
    const incomplete = structuredClone(result.records[1]);
    incomplete.completePair = false;
    incomplete.seeds[0].arms.On.metrics.shortfall = 1;
    incomplete.seeds[0].arms.On.metrics.rows = 24;
    const summary = summarizeNumberGroupGeneratorReplay([result.records[0], incomplete]);
    expect(summary).toMatchObject({ targets: 2, completeTargets: 1, incompleteTargets: 1 });
    expect(summary.mainDifference.trials).toBe(1);
    expect(summary.arms[1].metrics.shortfall).toBe(1);
    expect(summary.arms[1].metrics.rows).toBe(199);
    expect(summary.pairedArms[1].metrics.rows).toBe(100);
  });

  it("does not report fake successes for empty history or after cancellation", async () => {
    const result = await runNumberGroupGeneratorReplay([], { asOfDate });
    expect(result.records).toEqual([]);
    expect(summarizeNumberGroupGeneratorReplay([]).mainDifference.mean).toBeNull();
    await expect(runNumberGroupGeneratorReplay(fixture(101), { asOfDate }, undefined, () => true)).rejects.toThrow("Replay cancelled");
    await expect(runNumberGroupGeneratorReplay(fixture(), { asOfDate, scenario: "bad" as "isolated" })).rejects.toThrow("Unknown generator replay scenario");
  });
});
