import type { CandidateSet, Draw, Knobs } from "../types";
import { generateCandidates, type GenerateCandidatesResult, type GeneratorSamplingAuditOptions } from "../generateCandidates";
import {
  analyzeNumberGroupFrequencyAudit, numberGroupForecast, NUMBER_GROUP_NEUTRAL_RATE, summarizeNumberGroupComparison,
  type NumberGroupAudit, type NumberGroupAuditOptions, type NumberGroupComparison,
} from "./numberGroupFrequencyAudit";
import { seededRandom, SETTINGS_MODEL_VERSION } from "./settingsTransparency";
import { computeWeekdayWindfallPrizeDivision, type WeekdayWindfallPrizeDivision } from "./prizeDivisions";

export const NUMBER_GROUP_GENERATOR_PROTOCOL = {
  version: "NGFA-GR1", grouping: 15, numbersPerGroup: 3, neutralStrength: 30,
  settingsModelVersion: SETTINGS_MODEL_VERSION,
  seeds: [0, 1, 17, 42], rowsPerSeed: 25, attemptMultiplier: 100, overgen: 1,
  formula: "Group estimate per number / (8/45); same weight for all three numbers in a group; no outcome-tuned strength or cap",
  primaryMetric: "Actual-main matches in each playable six-number row, averaged across all rows and fixed seeds per target",
} as const;
export type NumberGroupReplayScenario = "isolated" | "composition";
export type NumberGroupReplayArm = "Off" | "On";
export interface NumberGroupReplayOptions extends NumberGroupAuditOptions { scenario?: NumberGroupReplayScenario }
export interface NumberGroupReplayOutcome {
  main: number[]; supp: number[]; mainHits: number; ticketSuppHits: number; eightHits: number;
  division: WeekdayWindfallPrizeDivision;
}
export interface NumberGroupReplayMetrics {
  rows: number; attempts: number; shortfall: number; mainHits: number | null; eightHits: number | null;
  prizeRows: number; prizeRate: number | null; unionSize: number | null; meanPairOverlap: number | null;
}
interface NumberGroupReplaySeedArm {
  rows: NumberGroupReplayOutcome[]; metrics: NumberGroupReplayMetrics;
  rejects: GenerateCandidatesResult["rejectionStats"]; warning: string | null;
}
export interface NumberGroupGeneratorReplayRecord {
  date: string; ordinal: number; monthLength: number; trainingFrom: string; trainingThrough: string; trainingDraws: number;
  actual: { main: number[]; supp: number[] }; numberMultipliers: Record<number, number>;
  seeds: { seed: number; effectiveSeed: number; arms: Record<NumberGroupReplayArm, NumberGroupReplaySeedArm> }[];
  metrics: Record<NumberGroupReplayArm, NumberGroupReplayMetrics>;
  completePair: boolean; trace: Record<NumberGroupReplayArm, string[]>;
}
export interface NumberGroupGeneratorReplayResult {
  protocol: typeof NUMBER_GROUP_GENERATOR_PROTOCOL; options: { window: NumberGroupAudit["config"]["window"]; scenario: NumberGroupReplayScenario; asOfDate: string };
  sourceKey: string; source: Pick<NumberGroupAudit, "modelVersion" | "baselinePolicy" | "config" | "ignored" | "excludedMonths" | "validDraws" | "baseline">;
  settings: { knobs: Knobs; excludedNumbers: number[]; forcedNumbers: number[]; selectedOddEvenRatios: string[];
    maxLastDrawMatches: number | null; entropyThreshold: number; hammingThreshold: number; jaccardThreshold: number; lambda: number;
    additionalOptionalInfluences: "Not supplied; production defaults, no additional active influence" };
  records: NumberGroupGeneratorReplayRecord[];
}

const mean = (values: readonly number[]): number | null => values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : null;
const ARMS: NumberGroupReplayArm[] = ["Off", "On"];
const NEUTRAL_KNOBS: Knobs = {
  enableSDE1: false, enableHC3: false, enableOGA: false, enableGPWF: false,
  enableEntropy: false, enableHamming: false, enableJaccard: false,
  F: 0, M: 0, Q: 0, Y: 0, Historical_Weight: 0, gpwf_window_size: 0,
  gpwf_bias_factor: 0, gpwf_floor: 0, gpwf_scale_multiplier: 0, lambda: 0,
  octagonal_top: 9, exact_set_override: false, hamming_relax: false, gpwf_targeted_mode: false,
};

export const numberGroupReplaySourceKey = (audit: NumberGroupAudit): string => JSON.stringify({
  version: audit.modelVersion, policy: audit.baselinePolicy, config: audit.config,
  ignored: audit.ignored, excludedMonths: audit.excludedMonths, baseline: audit.baseline,
});

export function numberGroupReplayWeights(training: readonly Draw[]): Record<number, number> {
  const forecast = numberGroupForecast(training, 15);
  return Object.fromEntries(forecast.probabilities.group.map((estimate, index) => [index + 1, estimate / NUMBER_GROUP_NEUTRAL_RATE]));
}

export function numberGroupReplaySeed(date: string, seed: number): number {
  let state = seed >>> 0;
  for (const character of date) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return state;
}

/** Use the production generator unchanged apart from the explicit audit-only weight argument. */
export function generateNumberGroupReplayRows({ training, scenario, seed, weights, trace = () => {} }: {
  training: Draw[]; scenario: NumberGroupReplayScenario; seed: number;
  weights?: Record<number, number>; trace?: (line: string) => void;
}): GenerateCandidatesResult {
  const args: Parameters<typeof generateCandidates> = [
    NUMBER_GROUP_GENERATOR_PROTOCOL.rowsPerSeed, training, { ...NEUTRAL_KNOBS }, trace, [],
    scenario === "composition" ? ["4:4"] : [], false, 0, [], [], [], undefined, 0, 0, 1, 0,
  ];
  const auditProfile: GeneratorSamplingAuditOptions | undefined = weights ? { label: NUMBER_GROUP_GENERATOR_PROTOCOL.version, numberMultipliers: weights } : undefined;
  args[16] = scenario === "composition" ? [{ ratio: "4:4", count: 1 }] : [];
  args[39] = NUMBER_GROUP_GENERATOR_PROTOCOL.attemptMultiplier; // attemptMultiplier
  args[41] = scenario === "composition" ? 2 : undefined; // maxLastDrawMatches
  args[54] = seededRandom(seed); // rng
  args[57] = auditProfile; // samplingAuditOptions
  return generateCandidates(...args);
}

export function scoreNumberGroupReplayRows(rows: readonly CandidateSet[], target: Draw): NumberGroupReplayOutcome[] {
  const mains = new Set(target.main), supps = new Set(target.supp), all = new Set([...mains, ...supps]);
  return rows.map(row => ({ main: [...row.main], supp: [...row.supp], mainHits: row.main.filter(n => mains.has(n)).length,
    ticketSuppHits: row.main.filter(n => supps.has(n)).length, eightHits: [...row.main, ...row.supp].filter(n => all.has(n)).length,
    division: computeWeekdayWindfallPrizeDivision(row.main, [], mains, supps) }));
}

function metricsFor(rows: NumberGroupReplayOutcome[], attempts: number): NumberGroupReplayMetrics {
  const sets = rows.map(row => new Set([...row.main, ...row.supp]));
  const overlaps: number[] = [];
  sets.forEach((set, index) => sets.slice(index + 1).forEach(other => overlaps.push([...set].filter(n => other.has(n)).length)));
  const prizeRows = rows.filter(row => row.division !== "\u2014").length;
  return { rows: rows.length, attempts, shortfall: NUMBER_GROUP_GENERATOR_PROTOCOL.rowsPerSeed - rows.length,
    mainHits: mean(rows.map(row => row.mainHits)), eightHits: mean(rows.map(row => row.eightHits)),
    prizeRows, prizeRate: rows.length ? prizeRows / rows.length : null,
    unionSize: rows.length ? new Set(rows.flatMap(row => [...row.main, ...row.supp])).size : null, meanPairOverlap: mean(overlaps) };
}

function combineMetrics(metrics: NumberGroupReplayMetrics[]): NumberGroupReplayMetrics {
  const rows = metrics.reduce((sum, m) => sum + m.rows, 0);
  const weighted = (key: "mainHits" | "eightHits") => rows ? metrics.reduce((sum, m) => sum + (m[key] ?? 0) * m.rows, 0) / rows : null;
  const prizeRows = metrics.reduce((sum, m) => sum + m.prizeRows, 0);
  return { rows, attempts: metrics.reduce((sum, m) => sum + m.attempts, 0), shortfall: metrics.reduce((sum, m) => sum + m.shortfall, 0),
    mainHits: weighted("mainHits"), eightHits: weighted("eightHits"), prizeRows, prizeRate: rows ? prizeRows / rows : null,
    unionSize: mean(metrics.flatMap(m => m.unionSize === null ? [] : [m.unionSize])),
    meanPairOverlap: mean(metrics.flatMap(m => m.meanPairOverlap === null ? [] : [m.meanPairOverlap])) };
}

export function summarizeNumberGroupGeneratorReplay(records: readonly NumberGroupGeneratorReplayRecord[]) {
  const paired = records.filter(row => row.completePair);
  const comparison = (key: "mainHits" | "eightHits" | "prizeRate" | "meanPairOverlap"): NumberGroupComparison => summarizeNumberGroupComparison(
    paired.map(row => row.metrics.On[key]! - row.metrics.Off[key]!),
  );
  return { targets: records.length, completeTargets: paired.length, incompleteTargets: records.length - paired.length,
    arms: ARMS.map(arm => ({ arm, metrics: combineMetrics(records.flatMap(row => row.seeds.map(seed => seed.arms[arm].metrics))) })),
    pairedArms: ARMS.map(arm => ({ arm, metrics: combineMetrics(paired.flatMap(row => row.seeds.map(seed => seed.arms[arm].metrics))) })),
    mainDifference: comparison("mainHits"), eightDifference: comparison("eightHits"), prizeDifference: comparison("prizeRate"), overlapDifference: comparison("meanPairOverlap") };
}

export async function runNumberGroupGeneratorReplay(history: readonly Draw[], options: NumberGroupReplayOptions = {},
  onProgress?: (done: number, total: number) => void, cancelled?: () => boolean,
): Promise<NumberGroupGeneratorReplayResult> {
  const scenario = options.scenario ?? "isolated";
  if (scenario !== "isolated" && scenario !== "composition") throw new RangeError("Unknown generator replay scenario");
  const audit = analyzeNumberGroupFrequencyAudit(history, options);
  const records: NumberGroupGeneratorReplayRecord[] = [];
  const targets = audit.records.filter(row => row.scale === 15);
  const source = { modelVersion: audit.modelVersion, baselinePolicy: audit.baselinePolicy, config: audit.config,
    ignored: audit.ignored, excludedMonths: audit.excludedMonths, validDraws: audit.validDraws, baseline: audit.baseline };
  const dateIndex = new Map(audit.baseline.map((row, index) => [row.date, index]));
  for (const target of targets) {
    if (cancelled?.()) throw new Error("Replay cancelled. No live generation setting or journal entry was changed.");
    const from = dateIndex.get(target.trainingFrom)!;
    const to = dateIndex.get(target.date)!;
    const training = audit.baseline.slice(from, to);
    const actual = audit.baseline[to];
    const numberMultipliers = numberGroupReplayWeights(training);
    const trace: Record<NumberGroupReplayArm, string[]> = { Off: [], On: [] };
    const seeds = NUMBER_GROUP_GENERATOR_PROTOCOL.seeds.map((seed, seedIndex) => {
      const effectiveSeed = numberGroupReplaySeed(target.date, seed);
      const arms = Object.fromEntries(ARMS.map(arm => {
        const lines = [
          `[TRACE] ${NUMBER_GROUP_GENERATOR_PROTOCOL.version} ${arm}: ${target.date}; training ${target.trainingFrom} to ${target.trainingThrough} (${training.length}); scenario ${scenario}; seeds fixed; 25 rows; overgen 1; attempt budget 2500.`,
          `[TRACE] Live controls not imported. GPWF, Lambda, Numbers diagnostic, drought, monthly, neighbour and terminal weighting OFF. No survivor ranking. ${scenario === "composition" ? "Hard gates: 4:4 odd/even across eight numbers; at most two latest-draw matches." : "Hard gates: none."}`,
        ];
        const result = generateNumberGroupReplayRows({ training, scenario, seed: effectiveSeed, weights: arm === "On" ? numberMultipliers : undefined,
          trace: seedIndex === 0 ? line => { if (line.includes("Sampling weight ") || line.includes(NUMBER_GROUP_GENERATOR_PROTOCOL.version)) lines.push(...line.split("\n")); } : undefined });
        if (seedIndex === 0) trace[arm] = lines;
        const rows = scoreNumberGroupReplayRows(result.candidates, actual);
        return [arm, { rows, metrics: metricsFor(rows, result.rejectionStats.totalAttempts), rejects: result.rejectionStats, warning: result.quotaWarning ?? null }];
      })) as Record<NumberGroupReplayArm, NumberGroupReplaySeedArm>;
      return { seed, effectiveSeed, arms };
    });
    records.push({ date: target.date, ordinal: target.ordinal, monthLength: target.monthLength, trainingFrom: target.trainingFrom,
      trainingThrough: target.trainingThrough, trainingDraws: training.length, actual: { main: [...actual.main], supp: [...actual.supp] },
      numberMultipliers, seeds, trace, metrics: { Off: combineMetrics(seeds.map(seed => seed.arms.Off.metrics)), On: combineMetrics(seeds.map(seed => seed.arms.On.metrics)) },
      completePair: seeds.every(seed => ARMS.every(arm => seed.arms[arm].metrics.shortfall === 0)) });
    onProgress?.(records.length, targets.length);
    if (records.length % 4 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return { protocol: NUMBER_GROUP_GENERATOR_PROTOCOL, options: { window: audit.config.window, scenario, asOfDate: audit.config.asOfDate },
    settings: { knobs: { ...NEUTRAL_KNOBS }, excludedNumbers: [], forcedNumbers: [], selectedOddEvenRatios: scenario === "composition" ? ["4:4"] : [],
      maxLastDrawMatches: scenario === "composition" ? 2 : null, entropyThreshold: 0, hammingThreshold: 0, jaccardThreshold: 1, lambda: 0,
      additionalOptionalInfluences: "Not supplied; production defaults, no additional active influence" },
    sourceKey: numberGroupReplaySourceKey(audit), source, records };
}
