import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { analyzeTerminalFamilyLeadership, terminalFamilyLeaders } from "./terminalFamilyLeadership";
import { buildEmpiricalDroughtQuotaShortlist, buildStrictDroughtQuotaShortlist } from "./strictDroughtQuotaAdvice";

const fixture = (date: string, values = [1, 11, 21, 2, 12, 22, 3, 13]): Draw => ({ date, main: values.slice(0, 6), supp: values.slice(6, 8) });
const month = (year: number, monthNumber: number, values?: (ordinal: number) => number[]): Draw[] => {
  const draws: Draw[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, monthNumber - 1, day);
    if (date.getMonth() !== monthNumber - 1) break;
    if (![1, 3, 5].includes(date.getDay())) continue;
    draws.push(fixture(`${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`, values?.(draws.length + 1)));
  }
  return draws;
};
const varied = (ordinal: number): number[] => Array.from({ length: 8 }, (_, i) => ((ordinal * 7 + i * 5) % 45) + 1);

describe("terminal family leadership protocol", () => {
  it("waits for three draws and includes exact ties adjusted for four/five-number capacity", () => {
    const draws = [fixture("2026-09-02"), fixture("2026-09-04"), fixture("2026-09-07")];
    expect(terminalFamilyLeaders(draws.slice(0, 2))).toEqual([]);
    expect(terminalFamilyLeaders(draws)).toEqual([1, 2, 3]);
    const tied = [fixture("2026-10-07", [22, 2, 16, 33, 1, 43, 11, 6]),
      fixture("2026-10-09", [28, 33, 36, 15, 40, 18, 44, 4]), fixture("2026-10-12", [10, 12, 1, 14, 39, 37, 36, 45])];
    expect(terminalFamilyLeaders(tied)).toEqual([1, 2, 3, 4, 6]);
  });

  it("is invariant to newest-first CSV order and leaves supplied history untouched", () => {
    const history = [...month(2026, 1, varied), ...month(2026, 2, varied)];
    const before = JSON.stringify(history);
    const a = analyzeTerminalFamilyLeadership(history);
    expect(analyzeTerminalFamilyLeadership([...history].reverse())).toEqual(a);
    expect(JSON.stringify(history)).toBe(before);
    expect(a.completeMonths).toBe(2);
    expect(a.response.trials).toBe(history.length - 6);
  });

  it("excludes a partial opening month but keeps an unfinished current prefix separate from outcomes", () => {
    const history = [...month(2026, 1).slice(4), ...month(2026, 2), ...month(2026, 3).slice(0, 3)];
    const result = analyzeTerminalFamilyLeadership(history);
    expect(result.completeMonths).toBe(1);
    expect(result.baselineDraws).toBe(month(2026, 2).length + 3);
    expect(result.months.find(row => row.key === "2026-01")).toBeUndefined();
    expect(result.months[0].snapshots).toHaveLength(3);
    expect(result.response.trials).toBe(month(2026, 2).length - 3);
    expect(result.omittedMonths).toBe(2);
  });

  it("resets month leadership and runs at a closed-month boundary instead of forecasting old leaders", () => {
    const result = analyzeTerminalFamilyLeadership(month(2026, 7));
    expect(result.planningMonth).toBe("2026-08");
    expect(result.nextDate).toBe("2026-08-03");
    expect(result.months[0].snapshots).toEqual([]);
    expect(result.runDurations.find(row => row.digit === 1)).toMatchObject({ ended: 0, median: null, censored: 1 });
  });

  it("measures a completed run from its first seed, without resetting on later multi-hits", () => {
    const seed = [1, 11, 2, 3, 4, 5, 6, 7], single = [21, 2, 3, 4, 5, 6, 7, 8], absent = [2, 3, 4, 5, 6, 7, 8, 9];
    const result = analyzeTerminalFamilyLeadership(month(2026, 1, ordinal => ordinal <= 3 ? ordinal === 2 ? single : seed : absent));
    expect(result.runDurations.find(row => row.digit === 1)).toMatchObject({ ended: 1, median: 3, mean: 3, longest: 3, censored: 0 });
    expect(result.runAges.find(row => row.age === 3)).toBeDefined();
    expect(result.months[0].snapshots).toEqual([]); // February planning reset.
  });

  it("does not confirm a new multi-hit seed using earlier single hits", () => {
    const single = [21, 2, 3, 4, 5, 6, 7, 8], seed = [1, 11, 2, 3, 4, 5, 6, 7], absent = [2, 3, 4, 5, 6, 7, 8, 9];
    const result = analyzeTerminalFamilyLeadership(month(2026, 1, ordinal => ordinal < 3 ? single : ordinal === 3 ? seed : absent));
    const january = result.months.find(row => row.key === "2026-01")!;
    expect(january.snapshots[2].families[1]).toMatchObject({ seedStart: 3, runSpan: 1, confirmed: false });
    expect(result.runDurations[1]).toMatchObject({ ended: 0, median: null, censored: 0 });
  });

  it("rejects simulated, impossible dates, off-schedule, malformed and ambiguous duplicate rows", () => {
    const original = month(2026, 1, varied);
    const result = analyzeTerminalFamilyLeadership([
      ...original, { ...fixture("2026-02-02"), isSimulated: true }, fixture("2026-02-30"), fixture("2026-02-03"),
      fixture("2026-02-04", [1, 1, 2, 3, 4, 5, 6, 7]), fixture(original[0].date),
    ]);
    expect(result.validDraws).toBe(original.length - 1);
    expect(result.warnings.join(" ")).toContain("simulated");
    expect(result.warnings.join(" ")).toContain("invalid date");
    expect(result.warnings.join(" ")).toContain("off-schedule");
    expect(result.warnings.join(" ")).toContain("malformed");
    expect(result.warnings.join(" ")).toContain("duplicate");
  });

  it("does not relabel missing stages or train drought across a missing draw", () => {
    const january = month(2026, 1, varied), february = month(2026, 2, varied), march = month(2026, 3, varied);
    const result = analyzeTerminalFamilyLeadership([...january, ...february.filter((_, i) => i !== 5), ...march]);
    expect(result.months.find(row => row.key === "2026-02")).toMatchObject({ prefixComplete: false, snapshots: [] });
    expect(result.droughtAudit).toEqual([]);
    expect(result.warnings.join(" ")).toContain("Drought training restarts");
  });

  it("rebuilds strict and empirical lists before targets and never uses target/future outcomes to select them", () => {
    const history = [...month(2026, 1, varied), ...month(2026, 2, varied), ...month(2026, 3, varied)];
    const result = analyzeTerminalFamilyLeadership(history);
    const record = result.droughtAudit.at(-1)!;
    const targetIndex = history.findIndex(draw => draw.date === record.date);
    const prior = history.slice(0, targetIndex);
    const expectedStrict = buildStrictDroughtQuotaShortlist(prior, prior).numbers.filter(number => record.leaders.includes(number % 10));
    const expectedEmpirical = buildEmpiricalDroughtQuotaShortlist(prior).numbers.filter(number => record.leaders.includes(number % 10));
    expect(record.strict).toEqual(expectedStrict);
    expect(record.empirical).toEqual(expectedEmpirical);
    expect(record.trainingDraws).toBe(targetIndex);
    const changed = analyzeTerminalFamilyLeadership(history.map((draw, i) => i >= targetIndex ? fixture(draw.date, [4, 14, 24, 34, 44, 5, 15, 25]) : draw));
    const changedRecord = changed.droughtAudit.find(row => row.date === record.date)!;
    expect(changedRecord.leaders).toEqual(record.leaders);
    expect(changedRecord.strict).toEqual(record.strict);
    expect(changedRecord.empirical).toEqual(record.empirical);
    expect(changedRecord.activeRuns).toEqual(record.activeRuns);
  });

  it("does not fabricate zero-history rates and separates overlapping drought sources", () => {
    const empty = analyzeTerminalFamilyLeadership([]);
    expect(empty.response).toEqual({ trials: 0, actual: 0, expected: 0 });
    expect(empty.months).toEqual([]);
    const result = analyzeTerminalFamilyLeadership([...month(2026, 1, varied), ...month(2026, 2, varied), ...month(2026, 3, varied)]);
    const groups = Object.fromEntries(result.droughtComparisons.map(row => [row.key, row]));
    expect(groups["strict-only"].opportunities + groups.both.opportunities).toBe(groups["strict-leader"].opportunities);
    expect(groups["empirical-only"].hits + groups.both.hits).toBe(groups["empirical-leader"].hits);
  });
});
