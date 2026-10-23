import type { Draw } from "../types";
import type { AppPresetSnapshot } from "./presets";
import { EVIDENCE_FAMILY_REGISTRY, EVIDENCE_PORTFOLIO_VERSION, type EvidenceFamilyId } from "./evidenceFamilyRegistry";
import { prepareNextDrawEvidenceHistory } from "./nextDrawEvidenceEnsemble";
import { buildDgaSuppSuggestion } from "./dgaSuppSuggestion";
import { computeDroughtHazard, computeStrictDroughtShortlist } from "./droughtHazard";
import { buildEmpiricalDroughtQuotaShortlist } from "./strictDroughtQuotaAdvice";
import { filterRowsForHistoryBaselines } from "./monthlyAverageScope";
import { analyzeMonthlyStageEvidence } from "./monthlyStageEvidenceAudit";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts, countScheduledDrawsInMonth } from "./planningDrawContext";
import { computeWeekdayWindfallPrizeDivision, computeWeekdayWindfallPrizeHits } from "./prizeDivisions";

export const EVIDENCE_PORTFOLIO_MODEL = "EP-1";
export const EVIDENCE_PORTFOLIO_CHALLENGER = "EP-R1";
export const EVIDENCE_PORTFOLIO_FORMAT = "windfall-evidence-portfolio";
export const EVIDENCE_PORTFOLIO_POOL_SIZE = 2048;
export const EVIDENCE_PORTFOLIO_ROLES = ["Consensus Core", "Independent Evidence", "Stage Context", "Coverage Hedge"] as const;
export type EvidencePortfolioRole = typeof EVIDENCE_PORTFOLIO_ROLES[number];
export type PortfolioGroupId = "frequency-state" | "drought-state" | "previous-neighbour" | "monthly-stage";
const GROUP_IDS: PortfolioGroupId[] = ["frequency-state", "drought-state", "previous-neighbour", "monthly-stage"];

export interface PortfolioEvidenceGroup {
  id: PortfolioGroupId;
  label: string;
  familyIds: EvidenceFamilyId[];
  sourcePanelIds: string[];
  scope: string;
  reason: string;
  active: boolean;
  scores: number[];
  observedNumbers: number[];
}

export interface PortfolioCandidate {
  role: EvidencePortfolioRole;
  main: number[];
  supp: number[];
  score: number;
  contributions: Record<PortfolioGroupId, number>;
  suppMethod: string;
  stageFallback: boolean;
}

export interface EvidencePortfolioSnapshot {
  format: typeof EVIDENCE_PORTFOLIO_FORMAT;
  version: 1;
  modelVersion: typeof EVIDENCE_PORTFOLIO_MODEL;
  registryVersion: string;
  id: string;
  frozenAt: string;
  targetDate: string;
  targetOrdinal: number;
  monthLength: number;
  cutoffDate: string;
  cutoffDraw: Draw;
  historyFingerprint: string;
  scopes: { allReal: number; baseline: number; active: number; activeDates: string[]; windowLabel: string };
  seed: number;
  poolSize: number;
  appliedConstraints: { forced: number[]; excluded: number[] };
  settingsSnapshot: AppPresetSnapshot;
  groups: PortfolioEvidenceGroup[];
  familyAvailability: Array<{ family: EvidenceFamilyId; label: string; status: "included" | "unavailable" | "context"; reason: string }>;
  numberBuckets: number[];
  candidates: PortfolioCandidate[];
  shadowBaseline: PortfolioCandidate[];
  ablations: Partial<Record<PortfolioGroupId, PortfolioCandidate[]>>;
  challenger?: PortfolioChallenger;
  formalTimingEligible: boolean;
  warnings: string[];
}

export interface PortfolioChallenger {
  modelVersion: typeof EVIDENCE_PORTFOLIO_CHALLENGER;
  groups: PortfolioEvidenceGroup[];
  candidates: PortfolioCandidate[];
  ablations: Partial<Record<PortfolioGroupId, PortfolioCandidate[]>>;
}

export interface BuildEvidencePortfolioOptions {
  history: readonly Draw[];
  activeHistory: readonly Draw[];
  targetDate: string;
  seed: number;
  now: string;
  windowLabel: string;
  settingsSnapshot: AppPresetSnapshot;
  forcedNumbers?: readonly number[];
  excludedNumbers?: readonly number[];
}

export const portfolioIsoDate = (value: string): string => {
  const parts = parseDrawDateParts(value);
  return parts ? datePartsToIso(parts) : "";
};
export const portfolioCalendarDate = (timestamp: string): string => {
  if (!Number.isFinite(Date.parse(timestamp))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const values = (draw: Draw): number[] => [...draw.main, ...draw.supp];
const fingerprintRow = (draw: Draw): string => `${portfolioIsoDate(draw.date)}:${draw.main.slice().sort((a, b) => a - b).join(",")}|${draw.supp.slice().sort((a, b) => a - b).join(",")}`;
const hash = (text: string): string => {
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) state = Math.imul(state ^ text.charCodeAt(index), 16777619);
  return (state >>> 0).toString(16).padStart(8, "0");
};
export const portfolioHistoryFingerprint = (history: readonly Draw[]): string => hash(history.map(fingerprintRow).join(";"));

export const preparePortfolioHistory = (history: readonly Draw[]) => {
  const prepared = prepareNextDrawEvidenceHistory(history);
  const draws = prepared.draws.filter(draw => {
    const parts = parseDrawDateParts(draw.date);
    return parts && isScheduledDrawDate(parts);
  }).map(draw => ({ ...draw, main: draw.main.slice(), supp: draw.supp.slice() }));
  const offSchedule = prepared.draws.length - draws.length;
  return { draws, warnings: [...prepared.warnings, ...(offSchedule ? [`Excluded ${offSchedule} off-schedule rows.`] : [])] };
};

const normalizeNumbers = (numbers: readonly number[]): number[] => {
  if (numbers.some(number => !Number.isInteger(number) || number < 1 || number > 45)) throw new Error("Inclusions and exclusions must be whole numbers from 1 to 45.");
  return [...new Set(numbers)].sort((a, b) => a - b);
};

const randomFromSeed = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const emptyScores = (): number[] => Array(46).fill(0);
const rankScores = (numbers: readonly number[]): number[] => {
  const scores = emptyScores();
  numbers.forEach((number, index) => { scores[number] = 1 - 0.65 * index / Math.max(1, numbers.length - 1); });
  return scores;
};

export const tieFairFrequencySupport = (counts: readonly number[]) => {
  const ranked = allNumbers().filter(number => counts[number] > 0).sort((a, b) => counts[b] - counts[a] || a - b);
  const cutoff = counts[ranked[Math.min(11, ranked.length - 1)]];
  const leaders = ranked.filter(number => counts[number] >= cutoff);
  const scores = emptyScores();
  for (let start = 0; start < leaders.length;) {
    let end = start;
    while (end + 1 < leaders.length && counts[leaders[end + 1]] === counts[leaders[start]]) end += 1;
    const score = 1 - 0.65 * ((start + end) / 2) / Math.max(1, leaders.length - 1);
    leaders.slice(start, end + 1).forEach(number => { scores[number] = score; });
    start = end + 1;
  }
  return { leaders, scores };
};
const countNumbers = (history: readonly Draw[]): number[] => {
  const counts = emptyScores();
  history.forEach(draw => values(draw).forEach(number => { counts[number] += 1; }));
  return counts;
};
const allNumbers = (): number[] => Array.from({ length: 45 }, (_, index) => index + 1);

const scheduledDatesBefore = (targetDate: string): string[] => {
  const parts = parseDrawDateParts(targetDate)!;
  const dates: string[] = [];
  for (let day = 1; day < parts.day; day += 1) {
    const prior = { ...parts, day };
    if (isScheduledDrawDate(prior)) dates.push(datePartsToIso(prior));
  }
  return dates;
};

const buildEvidence = (history: Draw[], active: Draw[], targetDate: string): { groups: PortfolioEvidenceGroup[]; buckets: number[]; baseline: Draw[] } => {
  const baseline = filterRowsForHistoryBaselines(history, draw => portfolioIsoDate(draw.date).slice(0, 7), draw => draw.date);
  const counts = countNumbers(active);
  const leaders = allNumbers().filter(number => counts[number] > 0).sort((a, b) => counts[b] - counts[a] || a - b).slice(0, 12);
  const frequency = rankScores(leaders);
  const strict = computeStrictDroughtShortlist(active, history).rows.slice(0, 8).map(row => row.number);
  const empiricalMaxK = computeDroughtHazard(active).maxK;
  const empirical = active.length >= 24 ? buildEmpiricalDroughtQuotaShortlist(active).rows.filter(row => row.k <= empiricalMaxK && row.trials >= 20).map(row => row.number) : [];
  const strictScores = rankScores(strict);
  const empiricalScores = rankScores(empirical);
  const drought = allNumbers().reduce((scores, number) => { scores[number] = Math.max(strictScores[number], empiricalScores[number]); return scores; }, emptyScores());
  const neighbours = new Set<number>();
  const latest = history[history.length - 1];
  if (latest) values(latest).forEach(number => [-2, -1, 1, 2].forEach(delta => {
    if (number + delta >= 1 && number + delta <= 45) neighbours.add(number + delta);
  }));
  const neighbourScores = emptyScores();
  neighbours.forEach(number => { neighbourScores[number] = 1; });
  const monthHistory = history.filter(draw => portfolioIsoDate(draw.date).slice(0, 7) === targetDate.slice(0, 7));
  const monthCounts = countNumbers(monthHistory);
  const buckets = monthCounts.map(count => Math.min(8, count));
  const stage = analyzeMonthlyStageEvidence(history, { now: targetDate });
  const stageScores = emptyScores();
  const stagePassed = stage.gate.status === "stage-supported" && stage.currentState?.targetDate === targetDate;
  if (stagePassed) {
    const eligible = stage.currentState!.bucketRows.filter(row => row.exactTrials >= 30 && row.learnedRate > row.bucketBaselineRate);
    const maxLift = Math.max(0, ...eligible.map(row => row.learnedRate - row.bucketBaselineRate));
    eligible.forEach(row => row.numbers.forEach(number => { stageScores[number] = maxLift > 0 ? (row.learnedRate - row.bucketBaselineRate) / maxLift : 0; }));
  }
  const stageActive = stageScores.some(score => score > 0);
  return { baseline, buckets, groups: [
    { id: "frequency-state", label: "Frequency state", familyIds: ["frequency-recency"], sourcePanelIds: ["number-frequency"], scope: `${active.length} active WFMQYH real draws`, active: leaders.length > 0, scores: frequency, observedNumbers: leaders, reason: "Top 12 appearance counts; fixed rank support 1 to 0.35. Count-derived temperature, number scoring and terminal frequency add no separate vote." },
    { id: "drought-state", label: "Drought state", familyIds: ["drought"], sourcePanelIds: ["drought-break-shortlist"], scope: `Strict: ${history.length} all real draws; empirical: ${active.length} WFMQYH draws`, active: strict.length + empirical.length > 0, scores: drought, observedNumbers: [...new Set([...strict, ...empirical])], reason: `Strict 6+ top eight and empirical top eight share one maximum contribution. Empirical needs 24 active draws and 20 pooled trials at the current drought state. Strict [${strict.join(", ")}]; empirical [${empirical.join(", ")}].` },
    { id: "previous-neighbour", label: "Previous neighbours", familyIds: ["previous-neighbour"], sourcePanelIds: ["previous-neighbour-backtest"], scope: `Immediate previous real draw ${latest?.date ?? "unavailable"}`, active: neighbours.size > 0, scores: neighbourScores, observedNumbers: [...neighbours].sort((a, b) => a - b), reason: "Unique +/-1 and +/-2 targets receive equal diagnostic support. Directional duplicates and the Atlas add no extra vote." },
    { id: "monthly-stage", label: "Monthly stage", familyIds: ["monthly-stage"], sourcePanelIds: ["monthly-bucket-transition-lab"], scope: `${baseline.length} baseline real draws; partial opening month excluded when required`, active: stageActive, scores: stageScores, observedNumbers: allNumbers().filter(number => stageScores[number] > 0), reason: stageActive ? "MSELA-1 stage-supported gate passed; each used bucket also has at least 30 exact-context exposures and positive lift over bucket-only evidence." : `Unavailable: ${stage.gate.reason} No eligible positive exact-context bucket lift passed the fixed gate.` },
  ] };
};

const challengerGroups = (groups: PortfolioEvidenceGroup[], active: Draw[]): PortfolioEvidenceGroup[] => {
  const frequency = tieFairFrequencySupport(countNumbers(active));
  return groups.map(group => {
    if (group.id === "monthly-stage") return { ...group, scores: group.scores.slice(), observedNumbers: group.observedNumbers.slice() };
    const raw = group.id === "frequency-state" ? frequency.scores : group.scores;
    const observedNumbers = group.id === "frequency-state" ? frequency.leaders : group.observedNumbers.slice();
    const covered = raw.slice(1).filter(score => score > 0).length;
    const discount = 1 - covered / 45;
    const scores = raw.map(score => score * discount);
    const method = group.id === "frequency-state"
      ? "Equal counts share their midrank score; the entire tie at the top-12 boundary is included."
      : group.reason;
    return { ...group, observedNumbers, scores, active: scores.some(score => score > 0),
      reason: `${method} EP-R1 coverage discount: ${covered}/45 numbers have support; multiplied by the uncovered share (${discount.toFixed(3)}). A fixed heuristic, not calibrated evidence or a winning probability.` };
  });
};

const makePool = (forced: number[], excluded: number[], seed: number): number[][] => {
  const eligible = allNumbers().filter(number => !excluded.includes(number) && !forced.includes(number));
  if (forced.length > 8) throw new Error("At most eight forced inclusions can fit in an eight-number portfolio candidate.");
  if (forced.some(number => excluded.includes(number))) throw new Error("A number is both forced and excluded. Resolve the conflict before building a portfolio.");
  if (eligible.length + forced.length < 8) throw new Error("Fewer than eight numbers remain after exclusions.");
  const rng = randomFromSeed(seed);
  const pool: number[][] = [];
  const seen = new Set<string>();
  for (let attempt = 0; attempt < EVIDENCE_PORTFOLIO_POOL_SIZE * 12 && pool.length < EVIDENCE_PORTFOLIO_POOL_SIZE; attempt += 1) {
    const remaining = eligible.slice();
    const numbers = forced.slice();
    while (numbers.length < 8) {
      const index = Math.floor(rng() * remaining.length);
      numbers.push(remaining.splice(index, 1)[0]);
    }
    numbers.sort((a, b) => a - b);
    const key = numbers.join(",");
    if (!seen.has(key)) { seen.add(key); pool.push(numbers); }
    if (eligible.length + forced.length === 8 || forced.length === 8) break;
  }
  if (pool.length < 4) throw new Error("These inclusions and exclusions leave fewer than four distinct eight-number candidates. Widen the available pool.");
  return pool;
};

const selectPortfolio = (pool: number[][], groups: PortfolioEvidenceGroup[], history: Draw[], active: Draw[], omit?: PortfolioGroupId, challenger = false): PortfolioCandidate[] => {
  const scores = groups.filter(group => group.active && group.id !== omit);
  const stageActive = scores.some(group => group.id === "monthly-stage");
  const selected: PortfolioCandidate[] = [];
  const usedNumbers = new Map<number, number>();
  const usedSets = new Set<string>();
  const usedMains = new Set<string>();
  for (const role of EVIDENCE_PORTFOLIO_ROLES) {
    const ranked = pool.filter(numbers => !usedSets.has(numbers.join(","))).map((numbers, index) => {
      const contributions = Object.fromEntries(GROUP_IDS.map(id => [id, 0])) as Record<PortfolioGroupId, number>;
      scores.forEach(group => { contributions[group.id] = numbers.reduce((sum, number) => sum + group.scores[number], 0) / 8; });
      const sum = Object.values(contributions).reduce((total, score) => total + score, 0);
      const breadth = numbers.reduce((total, number) => total + scores.filter(group => group.scores[number] > 0).length, 0) / 8;
      const novelty = numbers.reduce((total, number) => total + 1 / (1 + (usedNumbers.get(number) ?? 0)), 0) / 8;
      const score = role === "Independent Evidence" ? breadth + sum * 0.1
        : role === "Stage Context" && stageActive ? contributions["monthly-stage"] * 2 + sum
          : role === "Coverage Hedge" || (challenger && role === "Stage Context" && !stageActive) ? sum + novelty * 2 : sum;
      return { numbers, contributions, score, index };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    let candidate: PortfolioCandidate | null = null;
    for (const row of ranked) {
      const suggestion = buildDgaSuppSuggestion(row.numbers, active, history);
      const supp = suggestion?.supp ?? row.numbers.slice(-2);
      const main = suggestion?.main ?? row.numbers.filter(number => !supp.includes(number));
      if (usedMains.has(main.join(","))) continue;
      candidate = { role, main, supp, contributions: row.contributions, score: row.score, suppMethod: suggestion ? "DGA active supplementary counts, pair history and full-history tie-breaks" : "No supplementary role evidence; deterministic highest-number tie-break (unvalidated)", stageFallback: role === "Stage Context" && !stageActive };
      usedSets.add(row.numbers.join(","));
      usedMains.add(main.join(","));
      row.numbers.forEach(number => usedNumbers.set(number, (usedNumbers.get(number) ?? 0) + 1));
      break;
    }
    if (!candidate) throw new Error("Unable to make four distinct main rows under the current constraints.");
    selected.push(candidate);
  }
  return selected;
};

type PortfolioConstructionOptions = Pick<BuildEvidencePortfolioOptions,
  "history" | "activeHistory" | "targetDate" | "seed" | "forcedNumbers" | "excludedNumbers">;

const buildPortfolioConstruction = (options: PortfolioConstructionOptions) => {
  const targetParts = parseDrawDateParts(options.targetDate);
  if (!targetParts || !isScheduledDrawDate(targetParts)) throw new Error("The target must be a valid Monday, Wednesday or Friday draw date.");
  const targetDate = datePartsToIso(targetParts);
  const prepared = preparePortfolioHistory(options.history);
  if (prepared.draws.some(draw => portfolioIsoDate(draw.date) >= targetDate)) throw new Error("The target or a later draw is already loaded. A new portfolio must target an unrecorded future draw.");
  const history = prepared.draws;
  if (history.length < 24) throw new Error("At least 24 valid real draws are required to build an evidence portfolio.");
  const dateSet = new Set(history.map(draw => portfolioIsoDate(draw.date)));
  if (scheduledDatesBefore(targetDate).some(date => !dateSet.has(date))) throw new Error("The target month has missing earlier scheduled draws. Update history before using its stage evidence.");
  const latest = history[history.length - 1];
  const cutoff = portfolioIsoDate(latest.date);
  const next = new Date(`${cutoff}T12:00:00`);
  do { next.setDate(next.getDate() + 1); } while (![1, 3, 5].includes(next.getDay()));
  if (datePartsToIso({ year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate() }) !== targetDate) throw new Error("History is behind the immediate next target draw. Load the missing real results first.");
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 4294967295) throw new Error("Seed must be a whole number from 0 to 4294967295.");
  const byFingerprint = new Map(history.map(draw => [fingerprintRow(draw), draw]));
  const active = preparePortfolioHistory(options.activeHistory).draws.map(draw => byFingerprint.get(fingerprintRow(draw))).filter((draw): draw is Draw => Boolean(draw));
  if (!active.length) throw new Error("WFMQYH contains no valid real draws shared with the loaded history.");
  const forced = normalizeNumbers(options.forcedNumbers ?? []);
  const excluded = normalizeNumbers(options.excludedNumbers ?? []);
  const pool = makePool(forced, excluded, options.seed);
  const evidence = buildEvidence(history, active, targetDate);
  const candidates = selectPortfolio(pool, evidence.groups, history, active);
  return { targetDate, targetParts, prepared, history, active, forced, excluded, pool, evidence, candidates, latest, cutoff };
};

// Replay uses the production construction path without inventing a saved preset or freeze timestamp.
export const buildEvidencePortfolioCandidatesForReplay = (options: PortfolioConstructionOptions): PortfolioCandidate[] => (
  buildPortfolioConstruction(options).candidates
);

const buildShadowBaseline = (pool: number[][], seed: number): PortfolioCandidate[] => {
  const shadowRng = randomFromSeed(seed ^ 0x9e3779b9);
  return pool.slice(0, 4).map((numbers, index): PortfolioCandidate => {
    const shuffled = numbers.slice();
    for (let position = shuffled.length - 1; position > 0; position -= 1) {
      const other = Math.floor(shadowRng() * (position + 1));
      [shuffled[position], shuffled[other]] = [shuffled[other], shuffled[position]];
    }
    return { role: EVIDENCE_PORTFOLIO_ROLES[index], main: shuffled.slice(0, 6).sort((a, b) => a - b), supp: shuffled.slice(6).sort((a, b) => a - b), contributions: { "frequency-state": 0, "drought-state": 0, "previous-neighbour": 0, "monthly-stage": 0 }, score: 0, suppMethod: "Seeded uniform random role assignment; unplayed control", stageFallback: false };
  });
};

const buildAblations = (pool: number[][], groups: PortfolioEvidenceGroup[], history: Draw[], active: Draw[], challenger = false) => {
  const ablations: EvidencePortfolioSnapshot["ablations"] = {};
  groups.filter(group => group.active).forEach(group => { ablations[group.id] = selectPortfolio(pool, groups, history, active, group.id, challenger); });
  return ablations;
};

export const buildEvidencePortfolioComparisonForReplay = (options: Omit<PortfolioConstructionOptions, "seed"> & { seeds: readonly number[] }) => {
  if (!options.seeds.length || options.seeds.length > 8 || new Set(options.seeds).size !== options.seeds.length
    || options.seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 4294967295)) throw new Error("Replay needs one to eight distinct valid seeds.");
  const construction = buildPortfolioConstruction({ ...options, seed: options.seeds[0] });
  const { history, active, forced, excluded, evidence } = construction;
  const revised = challengerGroups(evidence.groups, active);
  return options.seeds.map(seed => {
    const pool = seed === options.seeds[0] ? construction.pool : makePool(forced, excluded, seed);
    return { seed, shadowBaseline: buildShadowBaseline(pool, seed), models: [
      { modelVersion: EVIDENCE_PORTFOLIO_MODEL, candidates: seed === options.seeds[0] ? construction.candidates : selectPortfolio(pool, evidence.groups, history, active), ablations: buildAblations(pool, evidence.groups, history, active) },
      { modelVersion: EVIDENCE_PORTFOLIO_CHALLENGER, candidates: selectPortfolio(pool, revised, history, active, undefined, true), ablations: buildAblations(pool, revised, history, active, true) },
    ] };
  });
};

export const buildEvidencePortfolio = (options: BuildEvidencePortfolioOptions): EvidencePortfolioSnapshot => {
  if (!Number.isFinite(Date.parse(options.now))) throw new Error("A valid freeze time is required.");
  const { targetDate, targetParts, prepared, history, active, forced, excluded, pool, evidence, candidates, latest, cutoff } = buildPortfolioConstruction(options);
  const shadowBaseline = buildShadowBaseline(pool, options.seed);
  const ablations = buildAblations(pool, evidence.groups, history, active);
  const revised = challengerGroups(evidence.groups, active);
  const challenger: PortfolioChallenger = { modelVersion: EVIDENCE_PORTFOLIO_CHALLENGER, groups: revised,
    candidates: selectPortfolio(pool, revised, history, active, undefined, true), ablations: buildAblations(pool, revised, history, active, true) };
  const fingerprint = portfolioHistoryFingerprint(history);
  const formalTimingEligible = portfolioCalendarDate(options.now) < targetDate;
  const included = new Set(evidence.groups.filter(group => group.active).flatMap(group => group.familyIds));
  return {
    format: EVIDENCE_PORTFOLIO_FORMAT, version: 1, modelVersion: EVIDENCE_PORTFOLIO_MODEL, registryVersion: EVIDENCE_PORTFOLIO_VERSION,
    id: `ep-${hash(`${EVIDENCE_PORTFOLIO_MODEL}|${targetDate}|${options.now}|${options.seed}|${fingerprint}|${portfolioHistoryFingerprint(active)}|${forced}|${excluded}`)}`, frozenAt: options.now, targetDate,
    targetOrdinal: countScheduledDrawsInMonth(targetDate.slice(0, 7), targetParts.day), monthLength: countScheduledDrawsInMonth(targetDate.slice(0, 7)),
    cutoffDate: cutoff, cutoffDraw: latest, historyFingerprint: fingerprint,
    scopes: { allReal: history.length, baseline: evidence.baseline.length, active: active.length, activeDates: active.map(draw => portfolioIsoDate(draw.date)), windowLabel: options.windowLabel },
    seed: options.seed, poolSize: pool.length, appliedConstraints: { forced, excluded }, settingsSnapshot: JSON.parse(JSON.stringify(options.settingsSnapshot)),
    groups: evidence.groups, numberBuckets: evidence.buckets, candidates, shadowBaseline, ablations, challenger, formalTimingEligible,
    familyAvailability: EVIDENCE_FAMILY_REGISTRY.map(family => ({ family: family.id, label: family.title, status: included.has(family.id) ? "included" : family.id === "monthly-stage" ? "unavailable" : "context", reason: included.has(family.id) ? "Included once through the frozen group contribution." : family.id === "monthly-stage" ? evidence.groups[3].reason : "EP-1 has no separate validated adapter for this family. Related counts, user state and downstream aggregators cannot add extra support." })),
    warnings: [...prepared.warnings, ...(!formalTimingEligible ? ["Frozen on or after the target Melbourne calendar date: descriptive comparison only; formal audits require an earlier calendar date because the physical draw time is not recorded."] : [])],
  };
};

export const isEvidencePortfolioSnapshot = (value: unknown): value is EvidencePortfolioSnapshot => {
  const record = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item));
  const strings = (items: unknown): items is string[] => Array.isArray(items) && items.every(item => typeof item === "string");
  const numbers = (items: unknown): items is number[] => Array.isArray(items) && items.every(item => Number.isInteger(item) && item >= 1 && item <= 45) && new Set(items).size === items.length;
  const integer = (item: unknown, min: number, max: number) => typeof item === "number" && Number.isInteger(item) && item >= min && item <= max;
  const iso = (date: unknown): date is string => typeof date === "string" && portfolioIsoDate(date) === date && Boolean(parseDrawDateParts(date) && isScheduledDrawDate(parseDrawDateParts(date)!));
  const bounded = (score: unknown) => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1;
  if (!record(value)) return false;
  const item = value;
  if (item.format !== EVIDENCE_PORTFOLIO_FORMAT || item.version !== 1 || item.modelVersion !== EVIDENCE_PORTFOLIO_MODEL
    || typeof item.registryVersion !== "string" || typeof item.id !== "string" || !/^ep-[0-9a-f]{8}$/.test(item.id)
    || typeof item.frozenAt !== "string" || !Number.isFinite(Date.parse(item.frozenAt))
    || !iso(item.targetDate) || !iso(item.cutoffDate) || item.cutoffDate >= item.targetDate
    || typeof item.historyFingerprint !== "string" || !/^[0-9a-f]{8}$/.test(item.historyFingerprint)
    || !integer(item.seed, 0, 4294967295) || !integer(item.poolSize, 4, EVIDENCE_PORTFOLIO_POOL_SIZE)
    || item.formalTimingEligible !== (portfolioCalendarDate(item.frozenAt) < item.targetDate)
    || !record(item.settingsSnapshot) || !strings(item.warnings)) return false;
  if (!Array.isArray(item.numberBuckets) || item.numberBuckets.length !== 46 || !item.numberBuckets.every(bucket => integer(bucket, 0, 8))) return false;
  const targetParts = parseDrawDateParts(item.targetDate)!;
  if (item.monthLength !== countScheduledDrawsInMonth(item.targetDate.slice(0, 7)) || item.targetOrdinal !== countScheduledDrawsInMonth(item.targetDate.slice(0, 7), targetParts.day)) return false;
  if (!record(item.cutoffDraw) || !numbers(item.cutoffDraw.main) || !numbers(item.cutoffDraw.supp)
    || item.cutoffDraw.main.length !== 6 || item.cutoffDraw.supp.length !== 2
    || new Set([...item.cutoffDraw.main, ...item.cutoffDraw.supp]).size !== 8 || item.cutoffDraw.isSimulated
    || typeof item.cutoffDraw.date !== "string" || portfolioIsoDate(item.cutoffDraw.date) !== item.cutoffDate) return false;
  if (!record(item.scopes) || !integer(item.scopes.allReal, 24, Number.MAX_SAFE_INTEGER)
    || !integer(item.scopes.baseline, 0, item.scopes.allReal as number) || !integer(item.scopes.active, 1, item.scopes.allReal as number)
    || typeof item.scopes.windowLabel !== "string" || !strings(item.scopes.activeDates)
    || item.scopes.activeDates.length !== item.scopes.active || new Set(item.scopes.activeDates).size !== item.scopes.activeDates.length
    || !item.scopes.activeDates.every(date => iso(date) && date <= (item.cutoffDate as string))) return false;
  if (!record(item.appliedConstraints) || !numbers(item.appliedConstraints.forced) || !numbers(item.appliedConstraints.excluded)
    || item.appliedConstraints.forced.length > 8 || item.appliedConstraints.forced.some(number => (item.appliedConstraints as { excluded: number[] }).excluded.includes(number))) return false;
  const constraints = item.appliedConstraints as { forced: number[]; excluded: number[] };
  const validRows = (rows: unknown): rows is PortfolioCandidate[] => Array.isArray(rows) && rows.length === 4 && rows.every((row, index) => {
    if (!record(row) || row.role !== EVIDENCE_PORTFOLIO_ROLES[index] || !numbers(row.main) || !numbers(row.supp)
      || row.main.length !== 6 || row.supp.length !== 2 || typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0
      || typeof row.suppMethod !== "string" || typeof row.stageFallback !== "boolean" || !record(row.contributions)
      || !GROUP_IDS.every(group => bounded((row.contributions as Record<string, unknown>)[group]))) return false;
    const selected = [...row.main, ...row.supp];
    return new Set(selected).size === 8 && constraints.forced.every(number => selected.includes(number)) && !constraints.excluded.some(number => selected.includes(number));
  }) && new Set(rows.map(row => [...row.main, ...row.supp].sort((a, b) => a - b).join(","))).size === 4;
  const validGroups = (groups: unknown): groups is PortfolioEvidenceGroup[] => Array.isArray(groups) && groups.length === GROUP_IDS.length && groups.every((group, index) => record(group)
    && group.id === GROUP_IDS[index] && typeof group.label === "string" && typeof group.scope === "string" && typeof group.reason === "string"
    && typeof group.active === "boolean" && strings(group.familyIds) && group.familyIds.every(id => EVIDENCE_FAMILY_REGISTRY.some(family => family.id === id))
    && strings(group.sourcePanelIds) && numbers(group.observedNumbers) && Array.isArray(group.scores) && group.scores.length === 46 && group.scores.every(bounded));
  const validAblations = (groups: PortfolioEvidenceGroup[], ablations: unknown) => record(ablations)
    && Object.keys(ablations).every(group => GROUP_IDS.includes(group as PortfolioGroupId) && validRows(ablations[group]))
    && groups.every(group => group.active === Boolean(ablations[group.id]));
  if (!validGroups(item.groups)) return false;
  if (!validRows(item.candidates) || !validRows(item.shadowBaseline) || !record(item.ablations)
    || !Object.keys(item.ablations).every(group => GROUP_IDS.includes(group as PortfolioGroupId) && validRows((item.ablations as Record<string, unknown>)[group]))
    || !item.groups.every(group => group.active === Boolean((item.ablations as Record<string, unknown>)[group.id]))) return false;
  if (item.challenger !== undefined && (!record(item.challenger) || item.challenger.modelVersion !== EVIDENCE_PORTFOLIO_CHALLENGER
    || !validGroups(item.challenger.groups) || !validRows(item.challenger.candidates) || !validAblations(item.challenger.groups, item.challenger.ablations))) return false;
  return Array.isArray(item.familyAvailability) && item.familyAvailability.length === EVIDENCE_FAMILY_REGISTRY.length
    && item.familyAvailability.every((family, index) => record(family) && family.family === EVIDENCE_FAMILY_REGISTRY[index].id
      && typeof family.label === "string" && typeof family.reason === "string" && ["included", "unavailable", "context"].includes(family.status as string));
};

export interface PortfolioRowScore { role: string; uniqueHits: number; mainHits: number; ticketSuppHits: number; supplementaryRoleHits: number; division: ReturnType<typeof computeWeekdayWindfallPrizeDivision> }
export const scorePortfolioRows = (rows: PortfolioCandidate[], draw: Draw): PortfolioRowScore[] => rows.map(row => {
  const drawnMain = new Set(draw.main);
  const drawnSupp = new Set(draw.supp);
  const hits = computeWeekdayWindfallPrizeHits(row.main, drawnMain, drawnSupp);
  return { role: row.role, uniqueHits: [...row.main, ...row.supp].filter(number => values(draw).includes(number)).length, mainHits: hits.mainHits, ticketSuppHits: hits.suppHits, supplementaryRoleHits: row.supp.filter(number => draw.supp.includes(number)).length, division: computeWeekdayWindfallPrizeDivision(row.main, [], drawnMain, drawnSupp) };
});
const mean = (numbers: number[]): number => numbers.length ? numbers.reduce((sum, number) => sum + number, 0) / numbers.length : 0;
export interface EvidencePortfolioScore {
  status: "pending" | "scored" | "invalidated";
  reason: string;
  targetDate: string;
  candidates: PortfolioRowScore[];
  shadowBaseline: PortfolioRowScore[];
  challenger: PortfolioRowScore[];
  averageHits: number | null;
  baselineAverageHits: number | null;
  attribution: Array<{ group: PortfolioGroupId; label: string; withoutMeanHits: number; difference: number }>;
}
export const scoreEvidencePortfolio = (snapshot: EvidencePortfolioSnapshot, history: readonly Draw[]): EvidencePortfolioScore => {
  const draws = preparePortfolioHistory(history).draws;
  const prior = draws.filter(draw => portfolioIsoDate(draw.date) <= snapshot.cutoffDate);
  const empty: EvidencePortfolioScore = { status: "pending", reason: "Waiting for the exact real target draw.", targetDate: snapshot.targetDate, candidates: [], shadowBaseline: [], challenger: [], averageHits: null, baselineAverageHits: null, attribution: [] };
  if (portfolioHistoryFingerprint(prior) !== snapshot.historyFingerprint) return { ...empty, status: "invalidated", reason: "Recorded history before the frozen cutoff has changed or is missing. Attribution is withheld." };
  const target = draws.find(draw => portfolioIsoDate(draw.date) === snapshot.targetDate);
  if (!target) return empty;
  const candidates = scorePortfolioRows(snapshot.candidates, target);
  const shadowBaseline = scorePortfolioRows(snapshot.shadowBaseline, target);
  const challenger = snapshot.challenger ? scorePortfolioRows(snapshot.challenger.candidates, target) : [];
  const averageHits = mean(candidates.map(row => row.uniqueHits));
  return { status: "scored", reason: "Exact real target draw; frozen rows and ablations were retained unchanged.", targetDate: snapshot.targetDate, candidates, shadowBaseline, challenger, averageHits, baselineAverageHits: mean(shadowBaseline.map(row => row.uniqueHits)), attribution: snapshot.groups.filter(group => snapshot.ablations[group.id]).map(group => {
    const withoutMeanHits = mean(scorePortfolioRows(snapshot.ablations[group.id]!, target).map(row => row.uniqueHits));
    return { group: group.id, label: group.label, withoutMeanHits, difference: averageHits - withoutMeanHits };
  }) };
};

export interface PortfolioAuditInput { snapshot: EvidencePortfolioSnapshot; reviewed: boolean; archived?: boolean; savedAt?: string; reviewedAt?: string }
export const auditEvidencePortfolios = (entries: PortfolioAuditInput[], history: readonly Draw[]) => {
  const accepted = new Map<string, { snapshot: EvidencePortfolioSnapshot; score: EvidencePortfolioScore }>();
  entries.slice().sort((a, b) => a.snapshot.frozenAt.localeCompare(b.snapshot.frozenAt)).forEach(entry => {
    const beforeTarget = (time: string | undefined) => Boolean(time && portfolioCalendarDate(time) && portfolioCalendarDate(time) < entry.snapshot.targetDate);
    if (!entry.reviewed || entry.archived || !entry.snapshot.formalTimingEligible || !beforeTarget(entry.savedAt) || !beforeTarget(entry.reviewedAt) || accepted.has(entry.snapshot.targetDate)) return;
    const score = scoreEvidencePortfolio(entry.snapshot, history);
    if (score.status === "scored") accepted.set(entry.snapshot.targetDate, { snapshot: entry.snapshot, score });
  });
  const rows = [...accepted.values()];
  return { eligibleDraws: rows.length, families: GROUP_IDS.map(group => {
    const observed = rows.flatMap(row => {
      const effect = row.score.attribution.find(item => item.group === group);
      return effect ? [{ month: row.snapshot.targetDate.slice(0, 7), difference: effect.difference }] : [];
    });
    const months = new Map<string, number[]>();
    observed.forEach(row => { months.set(row.month, [...(months.get(row.month) ?? []), row.difference]); });
    const monthMeans = [...months.values()].map(mean);
    const average = mean(monthMeans);
    const variance = monthMeans.length > 1 ? monthMeans.reduce((sum, value) => sum + (value - average) ** 2, 0) / (monthMeans.length - 1) : 0;
    // Descriptive month-level interval; no adaptive weights or automatic promotion.
    const margin = 2.58 * Math.sqrt(variance / Math.max(1, monthMeans.length));
    const interval: [number, number] | null = monthMeans.length >= 6 ? [average - margin, average + margin] : null;
    const sufficient = observed.length >= 30 && monthMeans.length >= 6;
    const verdict = !sufficient ? "insufficient" : interval![0] > 0 ? "supportive" : interval![1] < 0 ? "contradicted" : "neutral";
    return { group, trials: observed.length, months: monthMeans.length, meanDifference: observed.length ? mean(observed.map(row => row.difference)) : null, interval, verdict };
  }) };
};
