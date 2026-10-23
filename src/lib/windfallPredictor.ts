import type { Draw } from "../types";
import { buildDgaSuppSuggestion } from "./dgaSuppSuggestion";
import { portfolioCalendarDate, portfolioHistoryFingerprint, portfolioIsoDate, preparePortfolioHistory } from "./evidencePortfolio";
import { buildPlanningDrawContext, countScheduledDrawsInMonth, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";
import { computeWeekdayWindfallPrizeDivision } from "./prizeDivisions";

export const WINDFALL_PREDICTOR_VERSION = "WP-1";
export const WINDFALL_PREDICTOR_FORMAT = "windfall-predictor";
export const WINDFALL_PREDICTOR_DISCLAIMER = "Windfall is for entertainment only and must never be treated as anything else. These experimental suggestions are not a reliable forecast, financial advice or a promise of a prize.";
export const PREDICTOR_FAMILIES = ["monthly-stage", "previous-neighbour", "terminal-digit"] as const;
export type PredictorFamily = typeof PREDICTOR_FAMILIES[number];
const LABELS: Record<PredictorFamily, string> = { "monthly-stage": "Monthly number state", "previous-neighbour": "Previous-draw neighbours", "terminal-digit": "Terminal-family context" };
export const PREDICTOR_RECIPES = ["Balanced evidence", "Monthly state", "Neighbour / terminal", "Coverage hedge"] as const;
export const PREDICTOR_PROTOCOL = { priorStrength: 45, minimumStateTrials: 20, warmupMonths: 3, gateTargets: 60, gateMonths: 6, intervalMultiplier: 2.58, minimumFactor: 0.8, maximumFactor: 1.2 } as const;
const BASELINE = 8 / 45;
const numbers = () => Array.from({ length: 45 }, (_, i) => i + 1);
const drawn = (draw: Draw) => [...draw.main, ...draw.supp];
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface PredictorAudit {
  family: PredictorFamily; label: string; trainingStates: number; targets: number; months: number;
  brier: number | null; baselineBrier: number | null; improvement: number | null;
  interval: [number, number] | null; cleared: boolean; reason: string;
}
export interface PredictorNumberEvidence {
  number: number; bucket: number; monthGap: number; factors: Record<PredictorFamily, number>;
  stateTrials: Record<PredictorFamily, number>;
}
export interface PredictorGame {
  recipe: typeof PREDICTOR_RECIPES[number]; main: number[]; supp: number[]; suppMethod: string;
}
export interface PredictorRoleAudit {
  targets: number; months: number; meanHits: number | null; exactPairRate: number | null;
  interval: [number, number] | null; cleared: boolean; reason: string;
}
export interface WindfallPredictorSnapshot {
  format: typeof WINDFALL_PREDICTOR_FORMAT; version: typeof WINDFALL_PREDICTOR_VERSION;
  id: string; frozenAt: string; targetDate: string; month: string; ordinal: number; monthLength: number;
  cutoffDate: string; cutoffDraw: Draw; historyFingerprint: string; seed: number;
  liveDates: string[]; trainingMonths: string[]; trainingDraws: number; excludedMonths: string[];
  constraints: { forced: number[]; excluded: number[] }; audits: PredictorAudit[];
  roleAudit: PredictorRoleAudit;
  numberEvidence: PredictorNumberEvidence[]; games: PredictorGame[]; controls: PredictorGame[];
  formalTimingEligible: boolean; warnings: string[];
}
export interface BuildWindfallPredictorOptions {
  history: readonly Draw[]; targetDate: string; now: string; seed: number;
  forced?: readonly number[]; excluded?: readonly number[];
}
interface Counter { trials: number; hits: number }
type Tables = Record<PredictorFamily, Map<string, Counter>>;
interface State { keys: Record<PredictorFamily, string>; bucket: number; gap: number }
const emptyTables = (): Tables => ({ "monthly-stage": new Map(), "previous-neighbour": new Map(), "terminal-digit": new Map() });

function monthStates(prefix: readonly Draw[], monthLength: number): State[] {
  const counts = Array(46).fill(0) as number[], last = Array(46).fill(-1) as number[], terminal = Array(10).fill(0) as number[];
  prefix.forEach((draw, i) => drawn(draw).forEach(n => { counts[n]++; last[n] = i; terminal[n % 10]++; }));
  const mask = Array(46).fill(0) as number[];
  const latest = prefix[prefix.length - 1];
  if (latest) drawn(latest).forEach(n => [-2, -1, 1, 2].forEach((offset, index) => { const target = n + offset; if (target >= 1 && target <= 45) mask[target] |= 1 << index; }));
  const ordinal = prefix.length + 1, stage = ordinal <= 4 ? "early" : ordinal <= 9 ? "middle" : "late";
  return numbers().map(n => {
    const bucket = Math.min(8, counts[n]), gap = prefix.length - 1 - last[n];
    const capacity = n % 10 >= 1 && n % 10 <= 5 ? 5 : 4;
    const expected = prefix.length * 8 * capacity / 45;
    const band = !expected ? "none" : terminal[n % 10] < expected * 0.8 ? "quiet" : terminal[n % 10] > expected * 1.2 ? "busy" : "middle";
    return { bucket, gap, keys: {
      "monthly-stage": `${monthLength}|${ordinal}|${bucket}|${Math.min(6, gap)}`,
      "previous-neighbour": `${stage}|${mask[n]}`,
      "terminal-digit": `${stage}|${capacity}|${band}`,
    } };
  });
}

function estimate(table: Map<string, Counter>, key: string): number {
  const row = table.get(key);
  return !row || row.trials < PREDICTOR_PROTOCOL.minimumStateTrials ? BASELINE
    : (row.hits + PREDICTOR_PROTOCOL.priorStrength * BASELINE) / (row.trials + PREDICTOR_PROTOCOL.priorStrength);
}

export function predictorHistoryScope(history: readonly Draw[], targetDate: string) {
  const prepared = preparePortfolioHistory(history);
  const month = targetDate.slice(0, 7);
  const prior = prepared.draws.filter(draw => portfolioIsoDate(draw.date) < targetDate);
  const grouped = new Map<string, Draw[]>();
  prior.forEach(draw => { const key = portfolioIsoDate(draw.date).slice(0, 7); grouped.set(key, [...(grouped.get(key) ?? []), draw]); });
  const complete: Array<{ month: string; draws: Draw[] }> = [], excludedMonths: string[] = [];
  grouped.forEach((draws, key) => {
    if (key >= month) return;
    if (draws.length === countScheduledDrawsInMonth(key)) complete.push({ month: key, draws });
    else excludedMonths.push(key);
  });
  return { prepared, prior, complete, excludedMonths, live: grouped.get(month) ?? [] };
}

export function learnPredictorEvidence(complete: Array<{ month: string; draws: Draw[] }>) {
  const tables = emptyTables();
  const roleRecords: Array<{month: string; hits: number}> = [];
  const records: Record<PredictorFamily, Array<{month: string; brier: number; baseline: number}>> = { "monthly-stage": [], "previous-neighbour": [], "terminal-digit": [] };
  complete.forEach((month, index) => {
    const roleTraining = complete.slice(0, index).flatMap(prior => prior.draws);
    const pending: Array<{ states: State[]; actual: Set<number> }> = [];
    month.draws.forEach((target, drawIndex) => {
      const states = monthStates(month.draws.slice(0, drawIndex), month.draws.length), actual = new Set(drawn(target));
      if (index >= PREDICTOR_PROTOCOL.warmupMonths) {
        const suggestion = buildDgaSuppSuggestion(drawn(target), month.draws.slice(0, drawIndex), roleTraining);
        if (suggestion) roleRecords.push({month:month.month,hits:suggestion.supp.filter(n => target.supp.includes(n)).length});
      }
      if (index >= PREDICTOR_PROTOCOL.warmupMonths) PREDICTOR_FAMILIES.forEach(family => {
        const brier = mean(states.map((state, n) => (estimate(tables[family], state.keys[family]) - Number(actual.has(n + 1))) ** 2));
        const baseline = mean(states.map((_, n) => (BASELINE - Number(actual.has(n + 1))) ** 2));
        records[family].push({ month: month.month, brier, baseline });
      });
      pending.push({ states, actual });
    });
    // Freeze the model for the whole held-out month; reveal its outcomes only afterwards.
    pending.forEach(({states, actual}) => states.forEach((state, index) => PREDICTOR_FAMILIES.forEach(family => {
      const key = state.keys[family], row = tables[family].get(key) ?? { trials: 0, hits: 0 };
      row.trials++; row.hits += Number(actual.has(index + 1)); tables[family].set(key, row);
    })));
  });
  const audits: PredictorAudit[] = PREDICTOR_FAMILIES.map(family => {
    const rows = records[family], byMonth = new Map<string, number[]>();
    rows.forEach(row => byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), row.baseline - row.brier]));
    const values = [...byMonth.values()].map(mean), average = mean(values);
    const margin = values.length > 1 ? PREDICTOR_PROTOCOL.intervalMultiplier * Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1) / values.length) : null;
    const interval: [number, number] | null = margin === null ? null : [average - margin, average + margin];
    const enough = rows.length >= PREDICTOR_PROTOCOL.gateTargets && byMonth.size >= PREDICTOR_PROTOCOL.gateMonths;
    const cleared = enough && interval !== null && interval[0] > 0;
    return { family, label: LABELS[family], trainingStates: [...tables[family].values()].reduce((sum, row) => sum + row.trials, 0),
      targets: rows.length, months: byMonth.size, brier: rows.length ? mean(rows.map(row => row.brier)) : null,
      baselineBrier: rows.length ? mean(rows.map(row => row.baseline)) : null, improvement: rows.length ? average : null, interval, cleared,
      reason: !enough ? "Learning: needs 60 held-out real targets across six months after three training months. Neutral weighting."
        : !cleared ? "No stable Brier improvement over the exact 8/45 reference in the month-level screen. Neutral weighting."
          : "Clears this retrospective month-level Brier screen only; prospective candidate-level advantage is not established." };
  });
  const roleMonths = new Map<string, number[]>();
  roleRecords.forEach(row => roleMonths.set(row.month, [...(roleMonths.get(row.month) ?? []), row.hits - 0.5]));
  const monthly = [...roleMonths.values()].map(mean), average = mean(monthly);
  const margin = monthly.length > 1 ? PREDICTOR_PROTOCOL.intervalMultiplier * Math.sqrt(monthly.reduce((sum, value) => sum + (value - average) ** 2, 0) / (monthly.length - 1) / monthly.length) : null;
  const interval: [number, number] | null = margin === null ? null : [average - margin, average + margin];
  const exactPairRate = roleRecords.length ? roleRecords.filter(row => row.hits === 2).length / roleRecords.length : null;
  const cleared = roleRecords.length >= 60 && roleMonths.size >= 6 && interval !== null && interval[0] > 0 && exactPairRate !== null && exactPairRate >= 1 / 28;
  const roleAudit: PredictorRoleAudit = {targets:roleRecords.length,months:roleMonths.size,meanHits:roleRecords.length ? mean(roleRecords.map(row => row.hits)) : null,
    exactPairRate,interval,cleared,reason:cleared ? "Clears the retrospective known-eight role screen only; it does not test discovering the eight in advance."
      : "No cleared known-eight role screen. Supplementary roles use seeded uniform assignment, not unvalidated historical preference."};
  return { tables, audits, roleAudit };
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let value = Math.imul(state ^ (state >>> 15), 1 | state); value ^= value + Math.imul(value ^ (value >>> 7), 61 | value); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; };
}
function cleanNumbers(input: readonly number[]) {
  if (input.some(n => !Number.isInteger(n) || n < 1 || n > 45)) throw new Error("Forced and excluded numbers must be whole numbers from 1 to 45.");
  return [...new Set(input)].sort((a, b) => a - b);
}
export const predictorConstraintKey = (forced: readonly number[], excluded: readonly number[]) => JSON.stringify({ forced: cleanNumbers(forced), excluded: cleanNumbers(excluded) });

function constructGames(seed: number, evidence: PredictorNumberEvidence[], forced: number[], excluded: number[], live: Draw[], training: Draw[], rolesCleared: boolean, shadow = false): PredictorGame[] {
  const rng = random(seed), seen = new Set<string>(), mains = new Set<string>(), used = new Map<number, number>();
  const result: PredictorGame[] = [];
  for (const recipe of PREDICTOR_RECIPES) {
    let accepted: PredictorGame | null = null;
    for (let attempt = 0; attempt < 512 && !accepted; attempt++) {
      const selected = forced.slice();
      const eligible = numbers().filter(n => !excluded.includes(n) && !forced.includes(n));
      while (selected.length < 8) {
        const weights = eligible.map(n => {
          const row = evidence[n - 1];
          const families: PredictorFamily[] = recipe === "Monthly state" ? ["monthly-stage"]
            : recipe === "Neighbour / terminal" ? ["previous-neighbour", "terminal-digit"] : [...PREDICTOR_FAMILIES];
          const factor = shadow ? 1 : Math.exp(mean(families.map(family => Math.log(row.factors[family]))));
          return factor * (!shadow && recipe === "Coverage hedge" ? 1 / Math.sqrt(1 + (used.get(n) ?? 0)) : 1);
        });
        let threshold = rng() * weights.reduce((sum, weight) => sum + weight, 0), pick = eligible.length - 1;
        for (let index = 0; index < weights.length; index++) { threshold -= weights[index]; if (threshold < 0) { pick = index; break; } }
        selected.push(eligible.splice(pick, 1)[0]);
      }
      const key = selected.slice().sort((a, b) => a - b).join(",");
      if (seen.has(key)) continue;
      const suggestion = !shadow && rolesCleared ? buildDgaSuppSuggestion(selected, live, training) : null;
      const roleOrder = selected.slice();
      if (!suggestion) for (let i = roleOrder.length - 1; i > 0; i--) {
        const other = Math.floor(rng() * (i + 1)); [roleOrder[i], roleOrder[other]] = [roleOrder[other], roleOrder[i]];
      }
      const supp = suggestion?.supp ?? roleOrder.slice(-2).sort((a, b) => a - b);
      const main = suggestion?.main ?? selected.filter(n => !supp.includes(n)).sort((a, b) => a - b);
      if (mains.has(main.join(","))) continue;
      accepted = { recipe, main, supp, suppMethod: shadow ? "Seeded uniform role assignment; unplayed control"
        : suggestion ? "Current-month supplementary counts first; completed-prior-month role/pair evidence breaks ties; remaining ties use the existing DGA deterministic rule. The prior-only known-eight role screen passed; eight-number prediction is not established."
          : "Seeded uniform role assignment: the historical role method did not clear its separate known-eight screen. Not a supplementary forecast." };
      seen.add(key); mains.add(main.join(",")); selected.forEach(n => used.set(n, (used.get(n) ?? 0) + 1));
    }
    if (!accepted) throw new Error("The active forced/excluded numbers do not allow four distinct eight-number games with distinct main rows. Widen the pool.");
    result.push(accepted);
  }
  return result;
}

export function buildWindfallPredictor(options: BuildWindfallPredictorOptions): WindfallPredictorSnapshot {
  const parts = parseDrawDateParts(options.targetDate);
  if (!parts || !isScheduledDrawDate(parts) || portfolioIsoDate(options.targetDate) !== options.targetDate) throw new Error("Target must be a scheduled draw date in YYYY-MM-DD format.");
  if (!Number.isFinite(Date.parse(options.now))) throw new Error("A valid freeze time is required.");
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 4294967295) throw new Error("Seed must be a whole number from 0 to 4294967295.");
  const scope = predictorHistoryScope(options.history, options.targetDate), history = scope.prepared.draws;
  const latest = history[history.length - 1];
  if (!latest) throw new Error("Load verified real draw history first. No simulated history is substituted.");
  if (history.some(draw => portfolioIsoDate(draw.date) >= options.targetDate)) throw new Error("Target or later results are already loaded. Only an unrecorded next draw can be created.");
  if (buildPlanningDrawContext(history, { now: latest.date }).targetDrawDate !== options.targetDate) throw new Error("Load missing official results before predicting the immediate next draw.");
  const ordinal = countScheduledDrawsInMonth(options.targetDate.slice(0, 7), parts.day);
  if (scope.live.length !== ordinal - 1) throw new Error("Current month has missing scheduled draws. Stage evidence cannot be used across gaps.");
  const forced = cleanNumbers(options.forced ?? []), excluded = cleanNumbers(options.excluded ?? []);
  if (forced.length > 8 || forced.some(n => excluded.includes(n)) || 45 - excluded.length < 8) throw new Error("Resolve forced/excluded conflicts and leave at least eight eligible numbers.");
  const monthLength = countScheduledDrawsInMonth(options.targetDate.slice(0, 7));
  const learned = learnPredictorEvidence(scope.complete), states = monthStates(scope.live, monthLength);
  const numberEvidence = states.map((state, index): PredictorNumberEvidence => ({ number: index + 1, bucket: state.bucket, monthGap: state.gap,
    factors: Object.fromEntries(PREDICTOR_FAMILIES.map(family => [family, learned.audits.find(row => row.family === family)!.cleared
      ? Math.max(PREDICTOR_PROTOCOL.minimumFactor, Math.min(PREDICTOR_PROTOCOL.maximumFactor, estimate(learned.tables[family], state.keys[family]) / BASELINE)) : 1])) as Record<PredictorFamily, number>,
    stateTrials: Object.fromEntries(PREDICTOR_FAMILIES.map(family => [family, learned.tables[family].get(state.keys[family])?.trials ?? 0])) as Record<PredictorFamily, number>,
  }));
  const training = scope.complete.flatMap(month => month.draws);
  const fingerprint = portfolioHistoryFingerprint(history), cutoffDate = portfolioIsoDate(latest.date);
  const key = `${fingerprint}-${options.seed.toString(16)}-${options.now.replace(/\D/g, "")}-${forced.join(".")}-${excluded.join(".")}`;
  return { format: WINDFALL_PREDICTOR_FORMAT, version: WINDFALL_PREDICTOR_VERSION, id: `wp-${key}`, frozenAt: options.now,
    targetDate: options.targetDate, month: options.targetDate.slice(0, 7), ordinal, monthLength, cutoffDate, cutoffDraw: clone(latest), historyFingerprint: fingerprint,
    seed: options.seed, liveDates: scope.live.map(draw => portfolioIsoDate(draw.date)), trainingMonths: scope.complete.map(month => month.month), trainingDraws: training.length,
    excludedMonths: scope.excludedMonths, constraints: {forced, excluded}, audits: learned.audits, roleAudit:learned.roleAudit, numberEvidence,
    games: constructGames(options.seed, numberEvidence, forced, excluded, scope.live, training, learned.roleAudit.cleared),
    controls: constructGames(options.seed ^ 0x9e3779b9, numberEvidence, forced, excluded, [], [], false, true),
    formalTimingEligible: portfolioCalendarDate(options.now) < options.targetDate,
    warnings: [...scope.prepared.warnings, ...(!scope.live.length ? ["No draws have been recorded in the target month. Live context is empty; no previous-month draw is silently substituted."] : []),
      ...(!learned.audits.some(audit => audit.cleared) ? ["No evidence family cleared its retrospective gate. Suggestions use neutral sampling plus the explicitly labelled coverage hedge, not a demonstrated prediction advantage."] : []),
      ...(portfolioCalendarDate(options.now) >= options.targetDate ? ["Created on/after the target Melbourne calendar date. Descriptive scoring only; excluded from formal prospective review."] : [])],
  };
}

export function isWindfallPredictorSnapshot(value: unknown): value is WindfallPredictorSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as WindfallPredictorSnapshot;
  const valid = (ns: unknown, size?: number): ns is number[] => Array.isArray(ns) && (size === undefined || ns.length === size) && ns.every(n => Number.isInteger(n) && n >= 1 && n <= 45) && new Set(ns).size === ns.length;
  const iso = (date: unknown): date is string => typeof date === "string" && portfolioIsoDate(date) === date && !!parseDrawDateParts(date) && isScheduledDrawDate(parseDrawDateParts(date)!);
  const strings = (list: unknown): list is string[] => Array.isArray(list) && list.every(s => typeof s === "string");
  if (item.format !== WINDFALL_PREDICTOR_FORMAT || item.version !== WINDFALL_PREDICTOR_VERSION || typeof item.id !== "string" || !item.id.startsWith("wp-")
    || !iso(item.targetDate) || !iso(item.cutoffDate) || item.cutoffDate >= item.targetDate || !Number.isFinite(Date.parse(item.frozenAt))
    || item.formalTimingEligible !== (portfolioCalendarDate(item.frozenAt) < item.targetDate) || !Number.isInteger(item.seed) || item.seed < 0 || item.seed > 4294967295
    || !/^[a-f0-9]{8}$/.test(item.historyFingerprint) || item.month !== item.targetDate.slice(0, 7)
    || item.monthLength !== countScheduledDrawsInMonth(item.month) || item.ordinal !== countScheduledDrawsInMonth(item.month, parseDrawDateParts(item.targetDate)!.day)
    || !strings(item.liveDates) || item.liveDates.length !== item.ordinal - 1 || new Set(item.liveDates).size !== item.liveDates.length || !item.liveDates.every(date => iso(date) && date.startsWith(item.month) && date < item.targetDate)
    || !strings(item.trainingMonths) || new Set(item.trainingMonths).size !== item.trainingMonths.length || !item.trainingMonths.every(month => /^\d{4}-\d{2}$/.test(month) && month < item.month) || !strings(item.excludedMonths) || !strings(item.warnings)
    || !Number.isInteger(item.trainingDraws) || item.trainingDraws !== item.trainingMonths.reduce((sum, month) => sum + countScheduledDrawsInMonth(month), 0)
    || !item.cutoffDraw || item.cutoffDraw.isSimulated || portfolioIsoDate(item.cutoffDraw.date) !== item.cutoffDate || !valid(item.cutoffDraw.main, 6) || !valid(item.cutoffDraw.supp, 2) || new Set(drawn(item.cutoffDraw)).size !== 8
    || !item.constraints || !valid(item.constraints.forced) || !valid(item.constraints.excluded) || item.constraints.forced.length > 8 || item.constraints.forced.some(n => item.constraints.excluded.includes(n))) return false;
  if (!Array.isArray(item.audits) || item.audits.length !== 3 || !PREDICTOR_FAMILIES.every((family, i) => {
    const row = item.audits[i];
    return row?.family === family && typeof row.label === "string" && typeof row.reason === "string" && typeof row.cleared === "boolean"
      && [row.trainingStates, row.targets, row.months].every(n => Number.isInteger(n) && n >= 0)
      && [row.brier, row.baselineBrier, row.improvement].every(n => n === null || typeof n === "number" && Number.isFinite(n))
      && (row.interval === null || Array.isArray(row.interval) && row.interval.length === 2 && row.interval.every(Number.isFinite))
      && (!row.cleared || row.targets >= 60 && row.months >= 6 && row.interval !== null && row.interval[0] > 0);
  })) return false;
  if (!Array.isArray(item.numberEvidence) || item.numberEvidence.length !== 45 || !item.numberEvidence.every((row, i) => row?.number === i + 1
    && Number.isInteger(row.bucket) && row.bucket >= 0 && row.bucket <= 8 && Number.isInteger(row.monthGap) && row.monthGap >= 0 && row.monthGap < item.ordinal
    && row.factors && row.stateTrials && PREDICTOR_FAMILIES.every((family, index) => Number.isInteger(row.stateTrials[family]) && row.stateTrials[family] >= 0
      && Number.isFinite(row.factors[family]) && row.factors[family] >= 0.8 && row.factors[family] <= 1.2
      && (item.audits[index].cleared && row.stateTrials[family] >= PREDICTOR_PROTOCOL.minimumStateTrials || row.factors[family] === 1)))) return false;
  const role = item.roleAudit;
  if (!role || ![role.targets,role.months].every(n => Number.isInteger(n) && n >= 0) || typeof role.cleared !== "boolean" || typeof role.reason !== "string"
    || !(role.meanHits === null || typeof role.meanHits === "number" && Number.isFinite(role.meanHits) && role.meanHits >= 0 && role.meanHits <= 2)
    || !(role.exactPairRate === null || typeof role.exactPairRate === "number" && Number.isFinite(role.exactPairRate) && role.exactPairRate >= 0 && role.exactPairRate <= 1)
    || !(role.interval === null || Array.isArray(role.interval) && role.interval.length === 2 && role.interval.every(Number.isFinite))
    || role.cleared && !(role.targets >= 60 && role.months >= 6 && role.interval !== null && role.interval[0] > 0 && role.exactPairRate !== null && role.exactPairRate >= 1 / 28)) return false;
  return [item.games, item.controls].every(rows => Array.isArray(rows) && rows.length === 4
    && rows.every((row, i) => row?.recipe === PREDICTOR_RECIPES[i] && valid(row.main, 6) && valid(row.supp, 2) && new Set([...row.main, ...row.supp]).size === 8 && typeof row.suppMethod === "string"
      && item.constraints.forced.every(n => [...row.main, ...row.supp].includes(n)) && !item.constraints.excluded.some(n => [...row.main, ...row.supp].includes(n)))
    && new Set(rows.map(row => row.main.slice().sort((a, b) => a - b).join(","))).size === 4
    && new Set(rows.map(row => [...row.main, ...row.supp].sort((a, b) => a - b).join(","))).size === 4);
}

export function scoreWindfallPredictor(snapshot: WindfallPredictorSnapshot, history: readonly Draw[]) {
  const actual = preparePortfolioHistory(history).draws.find(draw => portfolioIsoDate(draw.date) === snapshot.targetDate);
  const score = (rows: PredictorGame[]) => rows.map(row => {
    if (!actual) return { ...row, status: "Pending" as const, hits: null, mainHits: null, ticketSuppHits: null, suppHits: null, division: null };
    const hits = [...row.main, ...row.supp].filter(n => drawn(actual).includes(n)).length;
    return { ...row, status: hits === 8 ? "Hit" as const : hits > 0 ? "Partial" as const : "Miss" as const, hits,
      mainHits: row.main.filter(n => actual.main.includes(n)).length, ticketSuppHits: row.main.filter(n => actual.supp.includes(n)).length,
      suppHits: row.supp.filter(n => actual.supp.includes(n)).length,
      division: computeWeekdayWindfallPrizeDivision(row.main, [], new Set(actual.main), new Set(actual.supp)) };
  });
  const games = score(snapshot.games), controls = score(snapshot.controls);
  const historyMatches = portfolioHistoryFingerprint(preparePortfolioHistory(history).draws.filter(draw => portfolioIsoDate(draw.date) <= snapshot.cutoffDate)) === snapshot.historyFingerprint;
  return { actual, games, controls, historyMatches, meanMainHits: actual ? mean(games.map(row => row.mainHits!)) : null, controlMeanMainHits: actual ? mean(controls.map(row => row.mainHits!)) : null };
}
