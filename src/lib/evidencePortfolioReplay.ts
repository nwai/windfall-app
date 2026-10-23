import type { Draw } from "../types";
import {
  buildEvidencePortfolioComparisonForReplay, portfolioHistoryFingerprint, portfolioIsoDate,
  preparePortfolioHistory, scorePortfolioRows, type PortfolioCandidate, type PortfolioGroupId,
} from "./evidencePortfolio";

export const PORTFOLIO_REPLAY_PROTOCOL = {
  version: "EP-AUDIT-1", seeds: [0, 1, 17, 42], minPriorDraws: 60, developmentShare: 0.7,
  minConfirmationDraws: 60, minConfirmationMonths: 6, intervalMultiplier: 2.58,
  primaryMetric: "Actual-main matches in the six ticket numbers, averaged across four rows and all fixed seeds per target",
} as const;
export type PortfolioReplayModel = "EP-1" | "EP-R1" | "Uniform controls";
export interface PortfolioReplayRow {
  main: number[]; supp: number[]; eightHits: number; mainHits: number; ticketSuppHits: number;
  suppRoleHits: number; division: string;
}
export interface PortfolioReplayMetrics {
  rows: number; eightHits: number; mainHits: number; ticketSuppHits: number; suppRoleHits: number;
  prizeRate: number; unionHits: number; unionSize: number; meanPairOverlap: number;
}
interface PortfolioReplaySeed {
  seed: number;
  models: Record<PortfolioReplayModel, { rows: PortfolioReplayRow[]; metrics: PortfolioReplayMetrics }>;
  removals: Array<{ model: Exclude<PortfolioReplayModel, "Uniform controls">; group: PortfolioGroupId;
    mainDifference: number; eightDifference: number }>;
}
export interface PortfolioReplayRecord {
  targetDate: string; cutoffDate: string; month: string; phase: "development" | "confirmation";
  actualMain: number[]; actualSupp: number[]; priorDraws: number; windowDraws: number;
  seeds: PortfolioReplaySeed[];
  metrics: Record<PortfolioReplayModel, PortfolioReplayMetrics>;
}
export interface PortfolioReplayResult {
  version: typeof PORTFOLIO_REPLAY_PROTOCOL.version;
  protocol: typeof PORTFOLIO_REPLAY_PROTOCOL;
  sourceFingerprint: string;
  validDraws: number;
  windowSize: number;
  warnings: string[];
  skipped: Array<{ date: string; reason: string }>;
  records: PortfolioReplayRecord[];
  gate: { status: "insufficient" | "no-stable-advantage" | "forward-watch-only";
    reasons: string[]; confirmationInterval: [number, number] | null };
}
const MODELS: PortfolioReplayModel[] = ["EP-1", "EP-R1", "Uniform controls"];
const mean = (values: readonly number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
const averageMetrics = (items: PortfolioReplayMetrics[]): PortfolioReplayMetrics => Object.fromEntries(
  ["rows", "eightHits", "mainHits", "ticketSuppHits", "suppRoleHits", "prizeRate", "unionHits", "unionSize", "meanPairOverlap"]
    .map(key => [key, key === "rows" ? items.reduce((sum, item) => sum + item.rows, 0) : mean(items.map(item => item[key as keyof PortfolioReplayMetrics]))]),
) as unknown as PortfolioReplayMetrics;

const evaluateRows = (rows: PortfolioCandidate[], target: Draw) => {
  const scores = scorePortfolioRows(rows, target);
  const actual = new Set([...target.main, ...target.supp]);
  const numbers = rows.map(row => new Set([...row.main, ...row.supp]));
  const union = new Set(rows.flatMap(row => [...row.main, ...row.supp]));
  const overlaps: number[] = [];
  numbers.forEach((set, index) => numbers.slice(index + 1).forEach(other => overlaps.push([...set].filter(number => other.has(number)).length)));
  return {
    rows: rows.map((row, index): PortfolioReplayRow => ({ main: row.main.slice(), supp: row.supp.slice(),
      eightHits: scores[index].uniqueHits, mainHits: scores[index].mainHits, ticketSuppHits: scores[index].ticketSuppHits,
      suppRoleHits: scores[index].supplementaryRoleHits, division: scores[index].division })),
    metrics: { rows: rows.length, eightHits: mean(scores.map(row => row.uniqueHits)), mainHits: mean(scores.map(row => row.mainHits)),
      ticketSuppHits: mean(scores.map(row => row.ticketSuppHits)), suppRoleHits: mean(scores.map(row => row.supplementaryRoleHits)),
      prizeRate: scores.filter(row => row.division !== "—").length / rows.length,
      unionHits: [...union].filter(number => actual.has(number)).length, unionSize: union.size, meanPairOverlap: mean(overlaps) },
  };
};

export const summarizePortfolioReplay = (records: readonly PortfolioReplayRecord[]) => MODELS.map(model => ({
  model, targets: records.length, metrics: records.length ? averageMetrics(records.map(record => record.metrics[model])) : null,
}));

const monthInterval = (records: readonly PortfolioReplayRecord[], difference: (record: PortfolioReplayRecord) => number): [number, number] | null => {
  const months = new Map<string, number[]>();
  records.forEach(record => months.set(record.month, [...(months.get(record.month) ?? []), difference(record)]));
  if (months.size < PORTFOLIO_REPLAY_PROTOCOL.minConfirmationMonths) return null;
  const values = [...months.values()].map(mean), average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  const margin = PORTFOLIO_REPLAY_PROTOCOL.intervalMultiplier * Math.sqrt(variance / values.length);
  return [average - margin, average + margin];
};

export const evaluatePortfolioReplayGate = (records: readonly PortfolioReplayRecord[]): PortfolioReplayResult["gate"] => {
  const development = records.filter(record => record.phase === "development");
  const confirmation = records.filter(record => record.phase === "confirmation");
  const delta = (record: PortfolioReplayRecord) => record.metrics["EP-R1"].mainHits - record.metrics["EP-1"].mainHits;
  const controlDelta = (record: PortfolioReplayRecord) => record.metrics["EP-R1"].mainHits - record.metrics["Uniform controls"].mainHits;
  const interval = monthInterval(confirmation, delta);
  const controlInterval = monthInterval(confirmation, controlDelta);
  const neutralInterval = monthInterval(confirmation, record => record.metrics["EP-R1"].mainHits - 36 / 45);
  if (!development.length || confirmation.length < PORTFOLIO_REPLAY_PROTOCOL.minConfirmationDraws || !interval) {
    return { status: "insufficient", confirmationInterval: interval,
      reasons: ["Requires an earlier development block and at least 60 later confirmation targets across six months. No model is promoted."] };
  }
  const reasons: string[] = [];
  if (mean(development.map(delta)) <= 0) reasons.push("The challenger did not improve the primary six-main measure in development.");
  if (interval[0] <= 0) reasons.push("The later block does not clear the positive month-level difference screen over EP-1.");
  if (!controlInterval || controlInterval[0] <= 0) reasons.push("The later block does not clear the positive screen over the fixed uniform controls.");
  if (!neutralInterval || neutralInterval[0] <= 0) reasons.push("The later block does not clear the positive screen over the exact 0.8 main-hit expectation.");
  if (mean(confirmation.map(record => record.metrics["EP-R1"].prizeRate - record.metrics["EP-1"].prizeRate)) < 0) reasons.push("The later block's six-main prize rate was lower than EP-1's.");
  return { status: reasons.length ? "no-stable-advantage" : "forward-watch-only", confirmationInterval: interval,
    reasons: reasons.length ? reasons : ["Clears the fixed retrospective screens. Independent prospective evidence is still required; EP-1 remains unchanged."] };
};

export const summarizePortfolioRemovals = (records: readonly PortfolioReplayRecord[]) => {
  const grouped = new Map<string, Array<{ mainDifference: number; eightDifference: number; date: string }>>();
  records.forEach(record => record.seeds.forEach(seed => seed.removals.forEach(effect => {
    const key = `${effect.model}|${effect.group}`;
    grouped.set(key, [...(grouped.get(key) ?? []), { ...effect, date: record.targetDate }]);
  })));
  return [...grouped].map(([key, rows]) => { const [model, group] = key.split("|"); return { model, group,
    targets: new Set(rows.map(row => row.date)).size, mainDifference: mean(rows.map(row => row.mainDifference)),
    eightDifference: mean(rows.map(row => row.eightDifference)) }; });
};

export async function runEvidencePortfolioReplay(
  input: readonly Draw[], windowSize: number,
  onProgress?: (done: number, total: number) => void,
  cancelled?: () => boolean,
): Promise<PortfolioReplayResult> {
  if (!Number.isInteger(windowSize) || windowSize < 0 || windowSize > 10000) throw new Error("Window must be 0 (expanding history) or a whole number from 1 to 10000.");
  const prepared = preparePortfolioHistory(input), history = prepared.draws;
  const start = Math.max(PORTFOLIO_REPLAY_PROTOCOL.minPriorDraws, windowSize);
  const records: PortfolioReplayRecord[] = [], skipped: PortfolioReplayResult["skipped"] = [];
  for (let index = start; index < history.length; index += 1) {
    if (cancelled?.()) throw new Error("Replay cancelled; no model was adopted.");
    const target = history[index], prior = history.slice(0, index);
    const active = windowSize === 0 ? prior : prior.slice(-windowSize);
    const targetDate = portfolioIsoDate(target.date);
    try {
      const comparisons = buildEvidencePortfolioComparisonForReplay({ history: prior, activeHistory: active,
        targetDate, seeds: PORTFOLIO_REPLAY_PROTOCOL.seeds });
      const seeds = comparisons.map(comparison => {
        const original = evaluateRows(comparison.models[0].candidates, target);
        const challenger = evaluateRows(comparison.models[1].candidates, target);
        const models = { "EP-1": original, "EP-R1": challenger, "Uniform controls": evaluateRows(comparison.shadowBaseline, target) };
        const removals = comparison.models.flatMap(model => Object.entries(model.ablations).map(([group, rows]) => {
          const alternative = evaluateRows(rows!, target).metrics;
          return { model: model.modelVersion as "EP-1" | "EP-R1", group: group as PortfolioGroupId,
            mainDifference: models[model.modelVersion as "EP-1" | "EP-R1"].metrics.mainHits - alternative.mainHits,
            eightDifference: models[model.modelVersion as "EP-1" | "EP-R1"].metrics.eightHits - alternative.eightHits };
        }));
        return { seed: comparison.seed, models, removals };
      });
      records.push({ targetDate, cutoffDate: portfolioIsoDate(prior[prior.length - 1].date), month: targetDate.slice(0, 7),
        phase: "development", actualMain: target.main.slice(), actualSupp: target.supp.slice(), priorDraws: prior.length,
        windowDraws: active.length, seeds,
        metrics: Object.fromEntries(MODELS.map(model => [model, averageMetrics(seeds.map(seed => seed.models[model].metrics))])) as Record<PortfolioReplayModel, PortfolioReplayMetrics> });
    } catch (error) { skipped.push({ date: targetDate, reason: error instanceof Error ? error.message : "Construction failed; no substitute rows were used." }); }
    onProgress?.(index - start + 1, history.length - start);
    if ((index - start + 1) % 8 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  const split = Math.floor(records.length * PORTFOLIO_REPLAY_PROTOCOL.developmentShare);
  records.forEach((record, index) => { record.phase = index < split ? "development" : "confirmation"; });
  return { version: PORTFOLIO_REPLAY_PROTOCOL.version, protocol: PORTFOLIO_REPLAY_PROTOCOL,
    sourceFingerprint: portfolioHistoryFingerprint(history), validDraws: history.length, windowSize,
    warnings: prepared.warnings, skipped, records, gate: evaluatePortfolioReplayGate(records) };
}
