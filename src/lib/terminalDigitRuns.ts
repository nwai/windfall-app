import type { Draw } from "../types";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";
import { strictValidateDraws } from "./strictDrawValidation";
import { sortDrawsChronologically } from "./recentDraws";
import { buildOddEvenRatioQuotas } from "./oddEvenRatios";
import { TERMINAL_REPETITION_SHAPES, terminalRepetitionShape, type TerminalShapeOption } from "./terminalShapeQuotas";
export const TERMINAL_RUN_RULE_VERSION = "TRQ-2";
export const TERMINAL_RUN_SHAPE_LINK_VERSION = "TRSL-1";

export interface TerminalDigitRun { key: string; digits: number[]; coveredNumbers: number }
export interface TerminalRunOption {
  run: string;
  digits: number[];
  count: number;
  percent: number;
  expectedPercent: number;
  latestOccurrence?: { date: string; drawNumber: number | null } | null;
}
export interface TerminalRunRuleOptions {
  enabled: boolean;
  mode: "allocation" | "requireAll";
  selectedRuns: string[];
  runOptions: TerminalRunOption[];
  useAllObservedRuns?: boolean;
  allocationBasis?: "history" | "equal";
  finalRequested?: number;
}

export function maximalTerminalDigitRuns(numbers: readonly number[]): TerminalDigitRun[] {
  const endings = numbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 45).map((n) => n % 10);
  const present = new Set(endings);
  const runs: number[][] = [];
  if (present.size === 10) runs.push(Array.from({ length: 10 }, (_, digit) => digit));
  else for (let start = 0; start < 10; start++) {
    if (!present.has(start) || present.has((start + 9) % 10)) continue;
    const digits = [start];
    for (let next = (start + 1) % 10; present.has(next); next = (next + 1) % 10) digits.push(next);
    if (digits.length >= 2) runs.push(digits);
  }
  return runs.map((digits) => ({ key: digits.join("-"), digits,
    coveredNumbers: endings.filter((digit) => digits.includes(digit)).length }));
}

const choose = (n: number, k: number): number => {
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
  return Math.round(result);
};
const familySizes = Array.from({ length: 10 }, (_, d) => d >= 1 && d <= 5 ? 5 : 4);

// Exact presence of every run digit and absence of both neighbours. No sampled draws.
export function exactMaximalRunPercent(digits: readonly number[]): number {
  const required = new Set(digits), forbidden = new Set([(digits[0] + 9) % 10, (digits[digits.length - 1] + 1) % 10]);
  let polynomial = [1, ...Array<number>(8).fill(0)];
  for (let digit = 0; digit < 10; digit++) {
    const next = Array<number>(9).fill(0);
    const minimum = required.has(digit) ? 1 : 0;
    const maximum = forbidden.has(digit) ? 0 : familySizes[digit];
    for (let used = 0; used <= 8; used++) for (let count = minimum; count <= maximum && used + count <= 8; count++) {
      next[used + count] += polynomial[used] * choose(familySizes[digit], count);
    }
    polynomial = next;
  }
  return polynomial[8] / choose(45, 8) * 100;
}

const possibleRuns = Array.from({ length: 7 }, (_, i) => i + 2).flatMap((length) =>
  Array.from({ length: 10 }, (_, start) => Array.from({ length }, (_, i) => (start + i) % 10)));
const runKeys = new Set(possibleRuns.map((digits) => digits.join("-")));
const expected = new Map(possibleRuns.map((digits) => [digits.join("-"), exactMaximalRunPercent(digits)]));

export function observedTerminalRunKeys(options: TerminalRunOption[]): string[] {
  return [...new Set(options.filter((row) => runKeys.has(row.run) && Number.isInteger(row.count) && row.count > 0).map((row) => row.run))];
}

function validTerminalRunDraws(draws: Draw[]): Draw[] {
  const dates = new Set<string>();
  return sortDrawsChronologically(strictValidateDraws(draws).filter((draw) => {
    const date = parseDrawDateParts(draw.date);
    if (draw.isSimulated || !date || !isScheduledDrawDate(date)) return false;
    const key = `${date.year}-${date.month}-${date.day}`;
    if (dates.has(key)) return false;
    dates.add(key);
    return true;
  }));
}

export function terminalRunEvidence(draws: Draw[], numberingHistory: Draw[] = draws) {
  const valid = validTerminalRunDraws(draws);
  const numbered = numberingHistory === draws ? valid : validTerminalRunDraws(numberingHistory);
  const drawNumbers = new Map(numbered.map((draw, index) => [datePartsToIso(parseDrawDateParts(draw.date)!), index + 1]));
  const counts = new Map<string, number>();
  const latest = new Map<string, { date: string; drawNumber: number | null }>();
  valid.forEach((draw) => {
    const date = datePartsToIso(parseDrawDateParts(draw.date)!);
    maximalTerminalDigitRuns([...draw.main, ...draw.supp]).forEach(({ key }) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      latest.set(key, { date, drawNumber: drawNumbers.get(date) ?? null });
    });
  });
  return { draws: valid.length, options: possibleRuns.map((digits): TerminalRunOption => {
    const run = digits.join("-"), count = counts.get(run) ?? 0;
    return { run, digits, count, percent: valid.length ? count / valid.length * 100 : 0,
      expectedPercent: expected.get(run)!, latestOccurrence: latest.get(run) ?? null };
  }) };
}

export function linkedTerminalShapeEvidence(draws: Draw[], options: TerminalRunRuleOptions) {
  const valid = validTerminalRunDraws(draws), counts = new Map<string, number>();
  const selectionError = terminalRunSelectionError({ ...options, enabled: true });
  let matchingDraws = 0;
  if (!selectionError) valid.forEach((draw) => {
    const numbers = [...draw.main, ...draw.supp];
    if (!satisfiesTerminalRunRule(numbers, { ...options, enabled: true })) return;
    const shape = terminalRepetitionShape(numbers);
    if (!shape) return;
    // A draw with several selected separate runs still contributes one shape observation.
    matchingDraws++;
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  });
  const shapeOptions: TerminalShapeOption[] = TERMINAL_REPETITION_SHAPES.map((shape) => ({
    shape, count: counts.get(shape) ?? 0, percent: matchingDraws ? (counts.get(shape) ?? 0) / matchingDraws * 100 : 0,
  }));
  const error = selectionError ?? (!matchingDraws
    ? `No valid real WFMQYH draws match ${options.mode === "requireAll" ? "all" : "any"} selected exact runs; linked shape quotas have no evidence. No fallback shapes were substituted. Missing historical evidence does not mean the combination is impossible`
    : null);
  return { modelVersion: TERMINAL_RUN_SHAPE_LINK_VERSION, sourceDraws: valid.length, matchingDraws,
    shapeOptions, selectedShapes: shapeOptions.filter((row) => row.count > 0).map((row) => row.shape), error };
}

export function terminalRunSelectionError(options: TerminalRunRuleOptions): string | null {
  if (!options.enabled) return null;
  const selected = [...new Set(options.selectedRuns)];
  if (!selected.length) return "Terminal run rules are ON but no runs are selected";
  if (options.mode !== "allocation" && options.mode !== "requireAll") return "Unknown terminal run mode";
  if (selected.some((run) => !runKeys.has(run))) return "A selected terminal run is invalid";
  if (options.allocationBasis !== undefined && options.allocationBasis !== "history" && options.allocationBasis !== "equal") return "Unknown terminal run allocation basis";
  if (options.mode === "allocation") {
    if (options.allocationBasis !== "equal") {
      const unavailable = selected.filter((run) => !options.runOptions.some((row) => row.run === run && Number.isInteger(row.count) && row.count > 0));
      if (unavailable.length) return `Selected runs have no real WFMQYH observations: ${unavailable.join(", ")}. Choose Test alternatives (Equal selected runs) for a manual allocation plan, or Require together (Require all selected runs) for a structural test`;
    }
  } else {
    const digits = selected.flatMap((run) => run.split("-").map(Number));
    const actual = maximalTerminalDigitRuns(digits.map((d) => d || 10)).map((run) => run.key);
    if (new Set(digits).size > 8) return "Selected runs require more than eight different terminal digits";
    if (selected.some((run) => !actual.includes(run))) return "Selected runs overlap or touch and would merge into a longer run";
  }
  return null;
}

export function terminalRunShares(options: TerminalRunRuleOptions): Record<string, number> {
  if (!options.enabled || options.mode !== "allocation" || terminalRunSelectionError(options)) return {};
  const selected = [...new Set(options.selectedRuns)];
  if (options.allocationBasis === "equal") return Object.fromEntries(selected.map((run) => [run, 100 / selected.length]));
  const total = selected.reduce((sum, run) => sum + options.runOptions.find((row) => row.run === run)!.count, 0);
  return Object.fromEntries(selected.map((run) => [run, options.runOptions.find((row) => row.run === run)!.count / total * 100]));
}

export function buildTerminalRunQuotas(requested: number, options: TerminalRunRuleOptions): Record<string, number> {
  if (!Object.keys(terminalRunShares(options)).length) return {};
  if (options.allocationBasis === "equal") {
    if (!Number.isFinite(requested) || Math.floor(requested) <= 0) return {};
    const selected = [...new Set(options.selectedRuns)], total = Math.floor(requested);
    const base = Math.floor(total / selected.length), remainder = total % selected.length;
    // A user allocation plan, not fabricated historical counts.
    return Object.fromEntries(selected.map((run, index) => [run, base + (index < remainder ? 1 : 0)]));
  }
  return buildOddEvenRatioQuotas(requested, [...new Set(options.selectedRuns)], options.runOptions.map((row) => ({ ratio: row.run, count: row.count })));
}

export function selectedMaximalRuns(numbers: readonly number[], options: TerminalRunRuleOptions): string[] {
  return maximalTerminalDigitRuns(numbers).map((run) => run.key).filter((key) => options.selectedRuns.includes(key));
}

export function satisfiesTerminalRunRule(numbers: readonly number[], options?: TerminalRunRuleOptions): boolean {
  if (!options?.enabled) return true;
  const matches = selectedMaximalRuns(numbers, options);
  return options.mode === "requireAll" ? options.selectedRuns.every((run) => matches.includes(run)) : matches.length > 0;
}

export function terminalRunAvailabilityError(options: TerminalRunRuleOptions, available: number[], forced: number[]): string | null {
  const present = new Set(available.map((n) => n % 10)), fixed = new Set(forced.map((n) => n % 10));
  const impossible = options.selectedRuns.filter((run) => {
    const digits = run.split("-").map(Number);
    return digits.some((digit) => !present.has(digit)) || fixed.has((digits[0] + 9) % 10) || fixed.has((digits[digits.length - 1] + 1) % 10);
  });
  return impossible.length ? `Exact terminal runs conflict with exclusions or forced adjacent endings: ${impossible.map(run => {
    const digits = run.split("-").map(Number);
    const missing = digits.filter(digit => !present.has(digit));
    const adjacent = [(digits[0] + 9) % 10, (digits[digits.length - 1] + 1) % 10].filter(digit => fixed.has(digit));
    return `${run} (${[missing.length ? `no eligible numbers ending in ${missing.join(", ")}` : null,
      adjacent.length ? `forced ending ${adjacent.join(", ")} extends this exact run` : null].filter(Boolean).join("; ")})`;
  }).join("; ")}` : null;
}
