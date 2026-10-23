import type { Draw } from "../types";
import { filterRowsForHistoryBaselines } from "./monthlyAverageScope";
import { isParseableDrawDate } from "./strictDrawValidation";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";
import { buildEmpiricalDroughtQuotaShortlist, buildStrictDroughtQuotaShortlist } from "./strictDroughtQuotaAdvice";

export const TERMINAL_LEADERSHIP_PROTOCOL = {
  version: "TFLH-1",
  lookback: 3,
  leaders: 3,
  shortlistSize: 8,
  droughtThreshold: 6,
  minPriorDraws: 24,
  drawSize: 8,
} as const;

export interface FamilyDroughtMember { number: number; rank: number; k: number }
export interface FamilyLeadershipState {
  digit: number;
  familySize: number;
  recentHits: number;
  expectedHits: number;
  index: number | null;
  leader: boolean;
  entered: boolean;
  left: boolean;
  leaderStart: number | null;
  leaderSpan: number;
  seedStart: number | null;
  runSpan: number;
  confirmed: boolean;
  strict: FamilyDroughtMember[];
  empirical: FamilyDroughtMember[];
}
export interface FamilyLeadershipSnapshot {
  date: string;
  ordinal: number;
  ready: boolean;
  leaders: number[];
  entered: number[];
  left: number[];
  families: FamilyLeadershipState[];
}
export interface FamilyLeadershipMonth {
  key: string;
  nextAfterState: string | null;
  expectedDraws: number;
  complete: boolean;
  prefixComplete: boolean;
  snapshots: FamilyLeadershipSnapshot[];
  droughtTrainingDraws: number;
}
export interface LeadershipResponse {
  trials: number;
  actual: number;
  expected: number;
}
export interface LeadershipStageResponse {
  ordinal: number;
  leaders: LeadershipResponse;
  entrants: LeadershipResponse;
  runs: LeadershipResponse;
}
export interface FamilyRunDuration {
  digit: number;
  ended: number;
  median: number | null;
  mean: number | null;
  longest: number | null;
  censored: number;
}
export interface FamilyRunAgeResponse extends LeadershipResponse { age: number }
export interface FamilyDroughtComparison {
  key: string;
  label: string;
  opportunities: number;
  hits: number;
}
export interface FamilyDroughtAuditRow {
  date: string;
  month: string;
  ordinal: number;
  trainingDraws: number;
  leaders: number[];
  activeRuns: number[];
  strict: number[];
  empirical: number[];
  strictHits: number[];
  empiricalHits: number[];
  strictRunHits: number[];
  empiricalRunHits: number[];
}
export interface TerminalFamilyLeadershipAnalysis {
  version: string;
  validDraws: number;
  baselineDraws: number;
  completeMonths: number;
  completeDraws: number;
  omittedMonths: number;
  latestDate: string | null;
  nextDate: string | null;
  planningMonth: string | null;
  months: FamilyLeadershipMonth[];
  response: LeadershipResponse;
  entrantResponse: LeadershipResponse;
  entrantSpells: number;
  entrantsHeldToMonthEnd: number;
  stages: LeadershipStageResponse[];
  runDurations: FamilyRunDuration[];
  runAges: FamilyRunAgeResponse[];
  earlyLater: { months: number; changedGroups: number; aboveExpectedMonths: number; later: LeadershipResponse };
  droughtComparisons: FamilyDroughtComparison[];
  droughtAudit: FamilyDroughtAuditRow[];
  droughtEligibleDraws: number;
  warnings: string[];
}

interface PreparedDraw extends Draw { key: string; month: string }
interface PreparedMonth { key: string; expected: string[]; rows: PreparedDraw[]; complete: boolean; prefixComplete: boolean }
interface Shortlists { strict: FamilyDroughtMember[]; empirical: FamilyDroughtMember[]; trainingDraws: number }

const familySizes = Array.from({ length: 10 }, (_, digit) => (
  Array.from({ length: 45 }, (_value, index) => index + 1).filter(number => number % 10 === digit).length
));
const drawNumbers = (draw: Draw): number[] => [...draw.main, ...draw.supp];
const digitCounts = (rows: readonly Draw[]): number[] => {
  const counts = Array<number>(10).fill(0);
  rows.forEach(row => drawNumbers(row).forEach(number => { counts[number % 10] += 1; }));
  return counts;
};
const expectedMonthDates = (month: string): string[] => {
  const [year, monthNumber] = month.split("-").map(Number);
  const keys: string[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, monthNumber - 1, day);
    if (date.getMonth() !== monthNumber - 1) break;
    const parts = { year, month: monthNumber, day };
    if (isScheduledDrawDate(parts)) keys.push(datePartsToIso(parts));
  }
  return keys;
};
const nextScheduledDate = (key: string): string => {
  const parts = parseDrawDateParts(key)!;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  do { date.setDate(date.getDate() + 1); } while (![1, 3, 5].includes(date.getDay()));
  return datePartsToIso({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
};
const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = result * (n - k + i) / i;
  return result;
};
const presenceBaseline = (digit: number): number => 1 - choose(45 - familySizes[digit], 8) / choose(45, 8);
const blankResponse = (): LeadershipResponse => ({ trials: 0, actual: 0, expected: 0 });
const addResponse = (acc: LeadershipResponse, actual: number, expected: number): void => {
  acc.trials += 1; acc.actual += actual; acc.expected += expected;
};
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function terminalFamilyLeaders(rows: readonly Draw[]): number[] {
  if (rows.length < TERMINAL_LEADERSHIP_PROTOCOL.lookback) return [];
  const counts = digitCounts(rows.slice(-TERMINAL_LEADERSHIP_PROTOCOL.lookback));
  const ranked = counts.map((hits, digit) => ({ hits, digit, size: familySizes[digit] }))
    .sort((a, b) => b.hits * a.size - a.hits * b.size || a.digit - b.digit);
  const cutoff = ranked[TERMINAL_LEADERSHIP_PROTOCOL.leaders - 1];
  // Compare integer fractions so exact third-place ties never depend on rounding.
  return ranked.filter(row => row.hits * cutoff.size >= cutoff.hits * row.size)
    .map(row => row.digit).sort((a, b) => a - b);
}

function prepareHistory(history: readonly Draw[]): { rows: PreparedDraw[]; warnings: string[] } {
  let simulated = 0, malformed = 0, invalidDate = 0, offSchedule = 0;
  const candidates: PreparedDraw[] = [];
  const counts = new Map<string, number>();
  history.forEach(draw => {
    if (draw.isSimulated) { simulated += 1; return; }
    const strictFormat = typeof draw.date === "string" && /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(draw.date.trim());
    const parts = strictFormat && isParseableDrawDate(draw.date) ? parseDrawDateParts(draw.date) : null;
    if (!parts) { invalidDate += 1; return; }
    if (!isScheduledDrawDate(parts)) { offSchedule += 1; return; }
    const key = datePartsToIso(parts);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!Array.isArray(draw.main) || !Array.isArray(draw.supp)) { malformed += 1; return; }
    const all = drawNumbers(draw);
    if (draw.main.length !== 6 || draw.supp.length !== 2 || new Set(all).size !== 8
      || all.some(number => !Number.isInteger(number) || number < 1 || number > 45)) { malformed += 1; return; }
    candidates.push({ ...draw, key, month: key.slice(0, 7) });
  });
  const duplicateRows = [...counts.values()].filter(count => count > 1).reduce((sum, count) => sum + count, 0);
  const rows = candidates.filter(row => counts.get(row.key) === 1).sort((a, b) => a.key.localeCompare(b.key));
  const warnings = [
    simulated ? `${simulated} simulated rows excluded.` : "",
    malformed ? `${malformed} malformed number rows excluded.` : "",
    invalidDate ? `${invalidDate} invalid date rows excluded.` : "",
    offSchedule ? `${offSchedule} off-schedule rows excluded.` : "",
    duplicateRows ? `${duplicateRows} rows on duplicate dates excluded; no result was chosen arbitrarily.` : "",
  ].filter(Boolean);
  return { rows, warnings };
}

function snapshotsForMonth(month: PreparedMonth): FamilyLeadershipSnapshot[] {
  if (!month.prefixComplete) return [];
  const leaderStarts: (number | null)[] = Array(10).fill(null);
  const seeds: (number | null)[] = Array(10).fill(null);
  let previousLeaders: number[] = [];
  return month.rows.map((draw, i) => {
    const ordinal = i + 1;
    const recent = month.rows.slice(Math.max(0, i - 2), i + 1);
    const counts = digitCounts(recent);
    const currentCounts = digitCounts([draw]);
    const ready = ordinal >= 3;
    const leaders = terminalFamilyLeaders(month.rows.slice(0, ordinal));
    const hadPreviousLeaders = ordinal > 3;
    const entered = hadPreviousLeaders ? leaders.filter(digit => !previousLeaders.includes(digit)) : [];
    const left = hadPreviousLeaders ? previousLeaders.filter(digit => !leaders.includes(digit)) : [];
    const families = counts.map((hits, digit): FamilyLeadershipState => {
      const leader = leaders.includes(digit);
      if (leader) leaderStarts[digit] ??= ordinal;
      else leaderStarts[digit] = null;
      if (currentCounts[digit] === 0) seeds[digit] = null;
      else if (seeds[digit] === null && currentCounts[digit] >= 2) seeds[digit] = ordinal;
      const expectedHits = recent.length * 8 * familySizes[digit] / 45;
      const runSpan = seeds[digit] === null ? 0 : ordinal - seeds[digit]! + 1;
      return {
        digit, familySize: familySizes[digit], recentHits: hits, expectedHits,
        index: ready ? hits / expectedHits : null,
        leader, entered: entered.includes(digit), left: left.includes(digit), leaderStart: leaderStarts[digit],
        leaderSpan: leaderStarts[digit] === null ? 0 : ordinal - leaderStarts[digit]! + 1,
        seedStart: seeds[digit], runSpan, confirmed: runSpan >= 2,
        strict: [], empirical: [],
      };
    });
    previousLeaders = leaders;
    return { date: draw.date, ordinal, ready, leaders, entered, left, families };
  });
}

export function analyzeTerminalFamilyLeadership(history: readonly Draw[]): TerminalFamilyLeadershipAnalysis {
  const prepared = prepareHistory(history);
  const { rows, warnings } = prepared;
  const baseline = filterRowsForHistoryBaselines(rows, row => row.month, row => row.date);
  const grouped = new Map<string, PreparedDraw[]>();
  baseline.forEach(row => grouped.set(row.month, [...(grouped.get(row.month) ?? []), row]));
  const months: PreparedMonth[] = [...grouped].map(([key, monthRows]) => {
    const expected = expectedMonthDates(key);
    const prefixComplete = monthRows.every((row, i) => row.key === expected[i]);
    return { key, rows: monthRows, expected, prefixComplete, complete: prefixComplete && monthRows.length === expected.length };
  });
  const nextDate = rows.length ? nextScheduledDate(rows[rows.length - 1].key) : null;
  const planningMonth = nextDate?.slice(0, 7) ?? null;
  if (planningMonth && !months.some(month => month.key === planningMonth)) {
    months.push({ key: planningMonth, rows: [], expected: expectedMonthDates(planningMonth), complete: false, prefixComplete: true });
  }
  const completeMonths = months.filter(month => month.complete);
  const outputs: FamilyLeadershipMonth[] = months.map(month => ({
    key: month.key, nextAfterState: month.rows.length ? nextScheduledDate(month.rows[month.rows.length - 1].key) : month.expected[0] ?? null,
    expectedDraws: month.expected.length, complete: month.complete, prefixComplete: month.prefixComplete,
    snapshots: snapshotsForMonth(month), droughtTrainingDraws: 0,
  }));
  const byMonth = new Map(outputs.map(month => [month.key, month]));
  const prefixEligible = new Set(months.filter(month => month.prefixComplete).map(month => month.key));
  const eligibleKeys = new Set(completeMonths.map(month => month.key));
  const sourceMonths = new Set(rows.map(row => row.month));
  const omittedMonths = [...sourceMonths].filter(key => !eligibleKeys.has(key)).length;
  const gaps = baseline.filter((row, i) => i > 0 && row.key !== nextScheduledDate(baseline[i - 1].key)).length;
  if (gaps) warnings.push(`${gaps} history gaps detected. Drought training restarts after each gap; incomplete month stages are not tested.`);
  if (omittedMonths) warnings.push(`${omittedMonths} partial, unfinished or incomplete months omitted from aggregate outcomes; complete current prefixes remain inspectable.`);

  const response = blankResponse(), entrantResponse = blankResponse();
  const stages = new Map<number, LeadershipStageResponse>();
  const runAges = new Map<number, FamilyRunAgeResponse>();
  const endedLengths = Array.from({ length: 10 }, () => [] as number[]);
  const censored = Array<number>(10).fill(0);
  const earlyLater = { months: 0, changedGroups: 0, aboveExpectedMonths: 0, later: blankResponse() };
  let entrantSpells = 0, entrantsHeldToMonthEnd = 0;
  for (const month of completeMonths) {
    const snapshots = byMonth.get(month.key)!.snapshots;
    const earlyLeaders = snapshots[2]?.leaders ?? [];
    if (earlyLeaders.length) {
      earlyLater.months += 1;
      const final = snapshots[snapshots.length - 1].leaders;
      if (earlyLeaders.join(",") !== final.join(",")) earlyLater.changedGroups += 1;
      const poolSize = earlyLeaders.reduce((sum, digit) => sum + familySizes[digit], 0);
      const actual = month.rows.slice(3).flatMap(drawNumbers).filter(number => earlyLeaders.includes(number % 10)).length;
      const expected = (month.rows.length - 3) * 8 * poolSize / 45;
      addResponse(earlyLater.later, actual, expected);
      if (actual > expected) earlyLater.aboveExpectedMonths += 1;
    }
    month.rows.forEach((draw, i) => {
      const previous = snapshots[i - 1];
      if (!previous) return;
      const targetCounts = digitCounts([draw]);
      const stage = stages.get(i + 1) ?? { ordinal: i + 1, leaders: blankResponse(), entrants: blankResponse(), runs: blankResponse() };
      stages.set(i + 1, stage);
      if (previous.ready) {
        const actual = previous.leaders.reduce((sum, digit) => sum + targetCounts[digit], 0);
        const expected = 8 * previous.leaders.reduce((sum, digit) => sum + familySizes[digit], 0) / 45;
        addResponse(response, actual, expected); addResponse(stage.leaders, actual, expected);
        if (previous.entered.length) {
          const entrantActual = previous.entered.reduce((sum, digit) => sum + targetCounts[digit], 0);
          const entrantExpected = 8 * previous.entered.reduce((sum, digit) => sum + familySizes[digit], 0) / 45;
          addResponse(entrantResponse, entrantActual, entrantExpected); addResponse(stage.entrants, entrantActual, entrantExpected);
          entrantSpells += previous.entered.length;
          entrantsHeldToMonthEnd += previous.entered.filter(digit => snapshots.slice(i).every(snapshot => snapshot.leaders.includes(digit))).length;
        }
      }
      previous.families.filter(family => family.runSpan > 0).forEach(family => {
        const age = runAges.get(family.runSpan) ?? { age: family.runSpan, ...blankResponse() };
        const hit = targetCounts[family.digit] > 0 ? 1 : 0;
        const expected = presenceBaseline(family.digit);
        addResponse(age, hit, expected); runAges.set(family.runSpan, age);
        if (family.confirmed) addResponse(stage.runs, hit, expected);
        if (!hit && family.confirmed) endedLengths[family.digit].push(family.runSpan);
      });
    });
    snapshots[snapshots.length - 1]?.families.filter(family => family.confirmed).forEach(family => { censored[family.digit] += 1; });
  }

  const comparisons: FamilyDroughtComparison[] = [
    { key: "strict-leader", label: "Strict: leading families", opportunities: 0, hits: 0 },
    { key: "strict-other", label: "Strict: other families", opportunities: 0, hits: 0 },
    { key: "empirical-leader", label: "Empirical: leading families", opportunities: 0, hits: 0 },
    { key: "empirical-other", label: "Empirical: other families", opportunities: 0, hits: 0 },
    { key: "strict-run", label: "Strict: confirmed family runs", opportunities: 0, hits: 0 },
    { key: "empirical-run", label: "Empirical: confirmed family runs", opportunities: 0, hits: 0 },
    { key: "strict-only", label: "Strict only: leading families", opportunities: 0, hits: 0 },
    { key: "empirical-only", label: "Empirical only: leading families", opportunities: 0, hits: 0 },
    { key: "both", label: "Both lists: leading families", opportunities: 0, hits: 0 },
  ];
  const comparisonByKey = new Map(comparisons.map(row => [row.key, row]));
  const droughtAudit: FamilyDroughtAuditRow[] = [];
  let droughtEligibleDraws = 0;
  let segmentStart = 0;
  const shortlistAt = (end: number): Shortlists => {
    const prior = baseline.slice(segmentStart, end);
    if (prior.length < TERMINAL_LEADERSHIP_PROTOCOL.minPriorDraws) return { strict: [], empirical: [], trainingDraws: prior.length };
    return {
      trainingDraws: prior.length,
      strict: buildStrictDroughtQuotaShortlist(prior, prior).rows.map((row, i) => ({ number: row.number, rank: i + 1, k: row.k })),
      empirical: buildEmpiricalDroughtQuotaShortlist(prior).rows.map((row, i) => ({ number: row.number, rank: i + 1, k: row.k })),
    };
  };
  baseline.forEach((draw, i) => {
    if (i > 0 && draw.key !== nextScheduledDate(baseline[i - 1].key)) segmentStart = i;
    const month = byMonth.get(draw.month);
    if (!month || !prefixEligible.has(draw.month)) return;
    const ordinal = months.find(source => source.key === draw.month)!.rows.findIndex(row => row.key === draw.key) + 1;
    const previous = month.snapshots[ordinal - 2];
    const isMonthLast = ordinal === month.snapshots.length;
    if (previous && (previous.ready || previous.families.some(family => family.confirmed))) {
      const before = shortlistAt(i);
      if (before.trainingDraws >= 24 && eligibleKeys.has(draw.month)) {
        const leaders = previous.ready ? previous.leaders : [];
        const activeRuns = previous.families.filter(family => family.confirmed).map(family => family.digit);
        const strictAll = before.strict.map(row => row.number), empiricalAll = before.empirical.map(row => row.number);
        const strict = strictAll.filter(number => leaders.includes(number % 10));
        const empirical = empiricalAll.filter(number => leaders.includes(number % 10));
        const strictRun = strictAll.filter(number => activeRuns.includes(number % 10));
        const empiricalRun = empiricalAll.filter(number => activeRuns.includes(number % 10));
        const actual = new Set(drawNumbers(draw));
        const add = (key: string, pool: number[]): void => {
          const row = comparisonByKey.get(key)!;
          row.opportunities += pool.length; row.hits += pool.filter(number => actual.has(number)).length;
        };
        if (previous.ready) {
          add("strict-leader", strict); add("strict-other", strictAll.filter(number => !leaders.includes(number % 10)));
          add("empirical-leader", empirical); add("empirical-other", empiricalAll.filter(number => !leaders.includes(number % 10)));
          add("strict-only", strict.filter(number => !empiricalAll.includes(number)));
          add("empirical-only", empirical.filter(number => !strictAll.includes(number)));
          add("both", strict.filter(number => empiricalAll.includes(number)));
        }
        add("strict-run", strictRun); add("empirical-run", empiricalRun);
        droughtEligibleDraws += 1;
        droughtAudit.push({ date: draw.date, month: draw.month, ordinal, trainingDraws: before.trainingDraws,
          leaders, activeRuns, strict, empirical, strictHits: strict.filter(number => actual.has(number)), empiricalHits: empirical.filter(number => actual.has(number)),
          strictRunHits: strictRun.filter(number => actual.has(number)), empiricalRunHits: empiricalRun.filter(number => actual.has(number)) });
      }
    }
    if (isMonthLast) {
      const after = shortlistAt(i + 1);
      month.droughtTrainingDraws = after.trainingDraws;
      month.snapshots[ordinal - 1].families.forEach(family => {
        family.strict = after.strict.filter(row => row.number % 10 === family.digit);
        family.empirical = after.empirical.filter(row => row.number % 10 === family.digit);
      });
    }
  });
  return {
    version: TERMINAL_LEADERSHIP_PROTOCOL.version, validDraws: rows.length, baselineDraws: baseline.length,
    completeMonths: completeMonths.length, completeDraws: completeMonths.reduce((sum, month) => sum + month.rows.length, 0),
    omittedMonths, latestDate: rows[rows.length - 1]?.date ?? null, nextDate, planningMonth,
    months: outputs.sort((a, b) => b.key.localeCompare(a.key)), response, entrantResponse, entrantSpells, entrantsHeldToMonthEnd,
    stages: [...stages.values()].sort((a, b) => a.ordinal - b.ordinal),
    runDurations: endedLengths.map((lengths, digit) => ({ digit, ended: lengths.length, median: median(lengths),
      mean: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null,
      longest: lengths.length ? Math.max(...lengths) : null, censored: censored[digit] })),
    runAges: [...runAges.values()].sort((a, b) => a.age - b.age), earlyLater,
    droughtComparisons: comparisons, droughtAudit: droughtAudit.reverse(), droughtEligibleDraws, warnings,
  };
}
