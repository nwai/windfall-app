# Scoring System Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an observe-only `Scoring System Diagnostics` panel that separates exact structural baselines, full-history evidence, and WFMQYH evidence without changing generation or ranking.

**Architecture:** Put all scoring and validation logic in a pure `src/lib/scoringSystemDiagnostics.ts` module. Render the diagnostics in `src/components/ScoringSystemDiagnosticsPanel.tsx`, then wire it into `src/App.tsx` immediately after `Odd/Even Ratio Cadence` using `realHistory` and `realFilteredHistory`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, existing `Draw` type, shared HIG controls from `src/components/shared/HigControls.tsx`.

---

## File Structure

- Create `src/lib/scoringSystemDiagnostics.ts`
  - Exact odd/even combinatorics.
  - Draw validation for mains-only and mains+supps scopes.
  - Number and terminal digit scoring.
  - Terminal digit set generation and occurrence scoring.
  - Rank and rank movement helpers.
- Create `src/lib/scoringSystemDiagnostics.test.ts`
  - Unit tests for combinatorics, validation, scoring, terminal digit sets, and rank movement.
- Create `src/components/ScoringSystemDiagnosticsPanel.tsx`
  - HIG-style observe-only diagnostics UI with tabs, filters, status strip, and compact tables.
- Create `tests/scoringSystemDiagnosticsPanel.test.tsx`
  - Component rendering and interaction tests.
- Create `tests/scoringSystemDiagnosticsWiring.test.ts`
  - Text-level app wiring guardrail.
- Modify `src/App.tsx`
  - Import and render the new panel after `Odd/Even Ratio Cadence`.
- Modify `src/lib/panelFavorites.ts`
  - Add panel metadata for favorites.
- Optional CSS only if needed in `src/index.css`
  - Prefer component-local styles first to keep the change isolated.

Repo guardrail: do not stage or commit during execution unless the user explicitly asks.

---

### Task 1: Analytics Tests

**Files:**
- Create: `src/lib/scoringSystemDiagnostics.test.ts`

- [ ] **Step 1: Write failing analytics tests**

Create `src/lib/scoringSystemDiagnostics.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  analyzeScoringSystemDiagnostics,
  buildOddEvenBlueprint,
  buildTerminalDigitSets,
  combination,
  isStraightTerminalDigitRun,
  scoreFromPercent,
  terminalDigitBaseScoreForNumber,
  terminalDigitForNumber,
} from "./scoringSystemDiagnostics";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("scoring system diagnostics analytics", () => {
  it("computes exact eight-number odd/even blueprint rows", () => {
    const rows = buildOddEvenBlueprint(8);

    expect(combination(45, 8)).toBe(215553195);
    expect(rows.map((row) => row.ratio)).toEqual([
      "8:0", "7:1", "6:2", "5:3", "4:4", "3:5", "2:6", "1:7", "0:8",
    ]);
    expect(rows.find((row) => row.ratio === "4:4")).toMatchObject({
      totalCombinations: 64774325,
      baselinePercent: 30.05,
      baseScore: 3005,
    });
    expect(rows.find((row) => row.ratio === "0:8")).toMatchObject({
      totalCombinations: 319770,
      baselinePercent: 0.15,
      baseScore: 15,
    });
    expect(rows.reduce((sum, row) => sum + row.totalCombinations, 0)).toBe(215553195);
  });

  it("computes six-number odd/even blueprint separately from the eight-number blueprint", () => {
    const rows = buildOddEvenBlueprint(6);

    expect(rows.map((row) => row.ratio)).toEqual([
      "6:0", "5:1", "4:2", "3:3", "2:4", "1:5", "0:6",
    ]);
    expect(rows.reduce((sum, row) => sum + row.totalCombinations, 0)).toBe(combination(45, 6));
    expect(rows.find((row) => row.ratio === "3:3")?.baseScore).not.toBe(3005);
  });

  it("scores from observed percentages on the blueprint scale", () => {
    expect(scoreFromPercent(30.05)).toBe(3005);
    expect(scoreFromPercent(7.5)).toBe(750);
    expect(scoreFromPercent(0)).toBe(0);
  });

  it("applies terminal digit labels without pretending they are number probabilities", () => {
    expect(terminalDigitForNumber(10)).toBe(0);
    expect(terminalDigitForNumber(45)).toBe(5);
    expect(terminalDigitBaseScoreForNumber(1)).toBe(11.11);
    expect(terminalDigitBaseScoreForNumber(25)).toBe(11.11);
    expect(terminalDigitBaseScoreForNumber(30)).toBe(8.89);
    expect(terminalDigitBaseScoreForNumber(44)).toBe(11.11);
  });

  it("generates all 1002 unordered terminal digit sets from length 2 through 8", () => {
    const sets = buildTerminalDigitSets();
    const byLength = new Map<number, number>();
    for (const set of sets) {
      byLength.set(set.digits.length, (byLength.get(set.digits.length) ?? 0) + 1);
    }

    expect(sets).toHaveLength(1002);
    expect(byLength.get(2)).toBe(45);
    expect(byLength.get(3)).toBe(120);
    expect(byLength.get(4)).toBe(210);
    expect(byLength.get(5)).toBe(252);
    expect(byLength.get(6)).toBe(210);
    expect(byLength.get(7)).toBe(120);
    expect(byLength.get(8)).toBe(45);
    expect(new Set(sets.map((set) => set.key)).size).toBe(1002);
  });

  it("identifies 42 unordered straight terminal digit runs without double-counting descending labels", () => {
    const straightSets = buildTerminalDigitSets().filter((set) => isStraightTerminalDigitRun(set.digits));
    const byLength = new Map<number, number>();
    for (const set of straightSets) {
      byLength.set(set.digits.length, (byLength.get(set.digits.length) ?? 0) + 1);
    }

    expect(straightSets).toHaveLength(42);
    expect(byLength.get(2)).toBe(9);
    expect(byLength.get(3)).toBe(8);
    expect(byLength.get(8)).toBe(3);
    expect(isStraightTerminalDigitRun([0, 1, 2])).toBe(true);
    expect(isStraightTerminalDigitRun([2, 1, 0])).toBe(true);
    expect(isStraightTerminalDigitRun([0, 2, 3])).toBe(false);
  });

  it("keeps absent WFMQYH ratios at zero while preserving base and full-history scores", () => {
    const full = [
      draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
      draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
      draw("D3", [2, 4, 6, 8, 10, 12], [1, 3]),
    ];
    const filtered = [
      draw("D3", [2, 4, 6, 8, 10, 12], [1, 3]),
    ];

    const result = analyzeScoringSystemDiagnostics(full, filtered);
    const sixTwo = result.ratioRows.find((row) => row.ratio === "6:2");

    expect(sixTwo?.fullHistoryCount).toBe(1);
    expect(sixTwo?.fullHistoryScore).toBeGreaterThan(0);
    expect(sixTwo?.wfmqyhCount).toBe(0);
    expect(sixTwo?.wfmqyhScore).toBe(0);
    expect(sixTwo?.baseScore).toBeGreaterThan(0);
  });

  it("scores number rows and rank movement from full history versus WFMQYH only", () => {
    const full = [
      draw("D1", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("D2", [1, 2, 9, 10, 11, 12], [13, 14]),
      draw("D3", [20, 21, 22, 23, 24, 25], [26, 27]),
    ];
    const filtered = [
      draw("D3", [20, 21, 22, 23, 24, 25], [26, 27]),
    ];

    const result = analyzeScoringSystemDiagnostics(full, filtered);
    const one = result.numberRows.find((row) => row.number === 1);
    const twentyFour = result.numberRows.find((row) => row.number === 24);

    expect(one?.fullHistoryCount).toBe(2);
    expect(one?.wfmqyhCount).toBe(0);
    expect(twentyFour?.fullHistoryCount).toBe(1);
    expect(twentyFour?.wfmqyhCount).toBe(1);
    expect(twentyFour?.rankMovement).not.toBeNull();
  });

  it("builds terminal digit set rows using unique digits from each draw", () => {
    const full = [
      draw("D1", [1, 11, 21, 31, 41, 2], [12, 22]),
      draw("D2", [3, 13, 23, 33, 43, 4], [14, 24]),
    ];
    const result = analyzeScoringSystemDiagnostics(full, full);

    const digitSet = result.terminalDigitSetRows.find((row) => row.key === "1,2");
    expect(digitSet?.fullHistoryCount).toBe(1);
    expect(digitSet?.wfmqyhCount).toBe(1);
    expect(digitSet?.length).toBe(2);
  });

  it("skips invalid rows and reports provenance for each history", () => {
    const full = [
      draw("bad duplicate", [1, 1, 2, 3, 4, 5], [6, 7]),
      draw("good", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];
    const result = analyzeScoringSystemDiagnostics(full, full);

    expect(result.provenance.fullValidDraws).toBe(1);
    expect(result.provenance.fullSkippedDraws).toBe(1);
    expect(result.provenance.filteredValidDraws).toBe(1);
    expect(result.provenance.filteredSkippedDraws).toBe(1);
  });
});
```

- [ ] **Step 2: Run analytics tests to verify RED**

Run:

```bash
npm test -- src/lib/scoringSystemDiagnostics.test.ts
```

Expected: fail because `src/lib/scoringSystemDiagnostics.ts` does not exist.

---

### Task 2: Analytics Module

**Files:**
- Create: `src/lib/scoringSystemDiagnostics.ts`
- Test: `src/lib/scoringSystemDiagnostics.test.ts`

- [ ] **Step 1: Create exported types and constants**

Create `src/lib/scoringSystemDiagnostics.ts` with these public types and constants:

```ts
import type { Draw } from "../types";

export type ScoringDiagnosticsScope = "mains-plus-supps" | "mains";

export interface ScoringDiagnosticsOptions {
  scope?: ScoringDiagnosticsScope;
}

export interface ScoringDiagnosticsProvenance {
  scope: ScoringDiagnosticsScope;
  drawSize: 6 | 8;
  fullValidDraws: number;
  filteredValidDraws: number;
  fullSkippedDraws: number;
  filteredSkippedDraws: number;
}

export interface OddEvenBlueprintRow {
  ratio: string;
  odd: number;
  even: number;
  totalCombinations: number;
  baselinePercent: number;
  baseScore: number;
}

export interface RatioDiagnosticRow extends OddEvenBlueprintRow {
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  fullObservedMinusBaseline: number;
  wfmqyhObservedMinusBaseline: number;
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export interface NumberDiagnosticRow {
  number: number;
  terminalDigit: number;
  terminalDigitBaseScore: number;
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export interface TerminalDigitDiagnosticRow {
  terminalDigit: number;
  baseScore: number;
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export interface TerminalDigitSetDefinition {
  key: string;
  digits: number[];
}

export interface TerminalDigitSetDiagnosticRow extends TerminalDigitSetDefinition {
  length: number;
  isStraightRun: boolean;
  fullHistoryCount: number;
  fullHistoryPercent: number;
  fullHistoryScore: number;
  wfmqyhCount: number;
  wfmqyhPercent: number;
  wfmqyhScore: number;
  fullHistoryLengthCount: number;
  fullHistoryLengthScore: number;
  wfmqyhLengthCount: number;
  wfmqyhLengthScore: number;
  combinedDiagnosticScore: number;
  rank: number;
  fullHistoryRank: number | null;
  rankMovement: number | null;
}

export interface ScoringSystemDiagnosticsResult {
  provenance: ScoringDiagnosticsProvenance;
  ratioRows: RatioDiagnosticRow[];
  numberRows: NumberDiagnosticRow[];
  terminalDigitRows: TerminalDigitDiagnosticRow[];
  terminalDigitSetRows: TerminalDigitSetDiagnosticRow[];
  straightRunRows: TerminalDigitSetDiagnosticRow[];
}

const MAX_NUMBER = 45;
const ODD_POOL_SIZE = 23;
const EVEN_POOL_SIZE = 22;
const TERMINAL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
```

- [ ] **Step 2: Implement pure helpers**

Add helpers for combinations, score scaling, validation, terminal digits, and set generation:

```ts
const round2 = (value: number): number => Number(value.toFixed(2));

export const scoreFromPercent = (percent: number): number => Math.round(round2(percent) * 100);

export const combination = (n: number, k: number): number => {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const effectiveK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= effectiveK; i += 1) {
    result = (result * (n - effectiveK + i)) / i;
  }
  return Math.round(result);
};

export const terminalDigitForNumber = (number: number): number => {
  if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) return Number.NaN;
  return number % 10;
};

export const terminalDigitBaseScoreForNumber = (number: number): number => {
  const digit = terminalDigitForNumber(number);
  return digit >= 1 && digit <= 5 ? 11.11 : 8.89;
};

const isValidDrawNumber = (value: unknown): value is number => (
  typeof value === "number"
  && Number.isInteger(value)
  && Number.isFinite(value)
  && value >= 1
  && value <= MAX_NUMBER
);

const numbersForScope = (draw: Draw, scope: ScoringDiagnosticsScope): number[] => (
  scope === "mains" ? draw.main : [...draw.main, ...(draw.supp ?? [])]
);

const normalizeDrawNumbers = (draw: Draw, scope: ScoringDiagnosticsScope): number[] | null => {
  const expectedCount = scope === "mains" ? 6 : 8;
  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const value of numbersForScope(draw, scope)) {
    if (!isValidDrawNumber(value) || seen.has(value)) return null;
    seen.add(value);
    numbers.push(value);
  }
  return numbers.length === expectedCount ? numbers : null;
};

const normalizeHistory = (draws: Draw[], scope: ScoringDiagnosticsScope): { rows: number[][]; skipped: number } => {
  const rows: number[][] = [];
  let skipped = 0;
  for (const draw of draws) {
    const normalized = normalizeDrawNumbers(draw, scope);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    rows.push(normalized);
  }
  return { rows, skipped };
};

const keyForDigits = (digits: readonly number[]): string => [...digits].sort((left, right) => left - right).join(",");

const terminalDigitSetForNumbers = (numbers: readonly number[]): string => (
  keyForDigits([...new Set(numbers.map((number) => terminalDigitForNumber(number)))])
);

const chooseDigitSets = (
  digits: readonly number[],
  length: number,
  start = 0,
  prefix: number[] = [],
  out: TerminalDigitSetDefinition[] = [],
): TerminalDigitSetDefinition[] => {
  if (prefix.length === length) {
    out.push({ digits: [...prefix], key: keyForDigits(prefix) });
    return out;
  }
  for (let index = start; index < digits.length; index += 1) {
    chooseDigitSets(digits, length, index + 1, [...prefix, digits[index]], out);
  }
  return out;
};

export const buildTerminalDigitSets = (): TerminalDigitSetDefinition[] => {
  const rows: TerminalDigitSetDefinition[] = [];
  for (let length = 2; length <= 8; length += 1) {
    rows.push(...chooseDigitSets(TERMINAL_DIGITS, length));
  }
  return rows;
};

export const isStraightTerminalDigitRun = (digits: readonly number[]): boolean => {
  const sorted = [...digits].sort((left, right) => left - right);
  if (sorted.length < 2) return false;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1] + 1) return false;
  }
  return true;
};
```

- [ ] **Step 3: Implement blueprint, rank, and occurrence helpers**

Add helpers for rows and ranks:

```ts
export const buildOddEvenBlueprint = (drawSize: 6 | 8): OddEvenBlueprintRow[] => {
  const denominator = combination(MAX_NUMBER, drawSize);
  return Array.from({ length: drawSize + 1 }, (_, even) => {
    const odd = drawSize - even;
    const totalCombinations = combination(ODD_POOL_SIZE, odd) * combination(EVEN_POOL_SIZE, even);
    const baselinePercent = denominator > 0 ? round2((totalCombinations / denominator) * 100) : 0;
    return {
      ratio: `${odd}:${even}`,
      odd,
      even,
      totalCombinations,
      baselinePercent,
      baseScore: scoreFromPercent(baselinePercent),
    };
  });
};

const percent = (count: number, total: number): number => total > 0 ? round2((count / total) * 100) : 0;

const addRanks = <T extends { combinedDiagnosticScore: number; fullHistoryScore?: number; number?: number; ratio?: string; key?: string }>(
  rows: T[],
): Array<T & { rank: number; fullHistoryRank: number | null; rankMovement: number | null }> => {
  const fullRanked = [...rows]
    .sort((left, right) => (right.fullHistoryScore ?? 0) - (left.fullHistoryScore ?? 0) || String(left.number ?? left.ratio ?? left.key).localeCompare(String(right.number ?? right.ratio ?? right.key)));
  const fullRanks = new Map<T, number>();
  fullRanked.forEach((row, index) => fullRanks.set(row, index + 1));

  return [...rows]
    .sort((left, right) => right.combinedDiagnosticScore - left.combinedDiagnosticScore || String(left.number ?? left.ratio ?? left.key).localeCompare(String(right.number ?? right.ratio ?? right.key)))
    .map((row, index) => {
      const rank = index + 1;
      const fullHistoryRank = fullRanks.get(row) ?? null;
      return {
        ...row,
        rank,
        fullHistoryRank,
        rankMovement: fullHistoryRank == null ? null : fullHistoryRank - rank,
      };
    });
};

const countMap = <T extends string | number>(values: readonly T[]): Map<T, number> => {
  const map = new Map<T, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
};
```

- [ ] **Step 4: Implement `analyzeScoringSystemDiagnostics`**

Add the main function:

```ts
export function analyzeScoringSystemDiagnostics(
  realHistory: Draw[],
  realFilteredHistory: Draw[],
  options: ScoringDiagnosticsOptions = {},
): ScoringSystemDiagnosticsResult {
  const scope = options.scope ?? "mains-plus-supps";
  const drawSize: 6 | 8 = scope === "mains" ? 6 : 8;
  const full = normalizeHistory(realHistory, scope);
  const filtered = normalizeHistory(realFilteredHistory, scope);
  const blueprint = buildOddEvenBlueprint(drawSize);

  const ratioForNumbers = (numbers: readonly number[]): string => {
    const odd = numbers.filter((number) => number % 2 !== 0).length;
    return `${odd}:${numbers.length - odd}`;
  };
  const fullRatios = countMap(full.rows.map(ratioForNumbers));
  const filteredRatios = countMap(filtered.rows.map(ratioForNumbers));

  const ratioRows = addRanks(blueprint.map((base) => {
    const fullHistoryCount = fullRatios.get(base.ratio) ?? 0;
    const wfmqyhCount = filteredRatios.get(base.ratio) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    return {
      ...base,
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      fullObservedMinusBaseline: round2(fullHistoryPercent - base.baselinePercent),
      wfmqyhObservedMinusBaseline: round2(wfmqyhPercent - base.baselinePercent),
      combinedDiagnosticScore: base.baseScore + fullHistoryScore + wfmqyhScore,
    };
  }));

  const fullNumberCounts = countMap(full.rows.flat());
  const filteredNumberCounts = countMap(filtered.rows.flat());
  const numberRows = addRanks(Array.from({ length: MAX_NUMBER }, (_, index) => {
    const number = index + 1;
    const terminalDigit = terminalDigitForNumber(number);
    const terminalDigitBaseScore = terminalDigitBaseScoreForNumber(number);
    const fullHistoryCount = fullNumberCounts.get(number) ?? 0;
    const wfmqyhCount = filteredNumberCounts.get(number) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    return {
      number,
      terminalDigit,
      terminalDigitBaseScore,
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      combinedDiagnosticScore: terminalDigitBaseScore + fullHistoryScore + wfmqyhScore,
    };
  }));

  const fullTerminalDigits = countMap(full.rows.flat().map(terminalDigitForNumber));
  const filteredTerminalDigits = countMap(filtered.rows.flat().map(terminalDigitForNumber));
  const terminalDigitRows = addRanks(TERMINAL_DIGITS.map((terminalDigit) => {
    const baseScore = terminalDigit >= 1 && terminalDigit <= 5 ? 11.11 : 8.89;
    const fullHistoryCount = fullTerminalDigits.get(terminalDigit) ?? 0;
    const wfmqyhCount = filteredTerminalDigits.get(terminalDigit) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length * drawSize);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length * drawSize);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    return {
      terminalDigit,
      baseScore,
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      combinedDiagnosticScore: baseScore + fullHistoryScore + wfmqyhScore,
    };
  }));

  const fullSetCounts = countMap(full.rows.map(terminalDigitSetForNumbers));
  const filteredSetCounts = countMap(filtered.rows.map(terminalDigitSetForNumbers));
  const fullLengthCounts = countMap(full.rows.map((numbers) => terminalDigitSetForNumbers(numbers).split(",").filter(Boolean).length));
  const filteredLengthCounts = countMap(filtered.rows.map((numbers) => terminalDigitSetForNumbers(numbers).split(",").filter(Boolean).length));
  const terminalDigitSetRows = addRanks(buildTerminalDigitSets().map((definition) => {
    const fullHistoryCount = fullSetCounts.get(definition.key) ?? 0;
    const wfmqyhCount = filteredSetCounts.get(definition.key) ?? 0;
    const fullHistoryPercent = percent(fullHistoryCount, full.rows.length);
    const wfmqyhPercent = percent(wfmqyhCount, filtered.rows.length);
    const fullHistoryScore = scoreFromPercent(fullHistoryPercent);
    const wfmqyhScore = scoreFromPercent(wfmqyhPercent);
    const fullHistoryLengthCount = fullLengthCounts.get(definition.digits.length) ?? 0;
    const wfmqyhLengthCount = filteredLengthCounts.get(definition.digits.length) ?? 0;
    const fullHistoryLengthScore = scoreFromPercent(percent(fullHistoryLengthCount, full.rows.length));
    const wfmqyhLengthScore = scoreFromPercent(percent(wfmqyhLengthCount, filtered.rows.length));
    return {
      ...definition,
      length: definition.digits.length,
      isStraightRun: isStraightTerminalDigitRun(definition.digits),
      fullHistoryCount,
      fullHistoryPercent,
      fullHistoryScore,
      wfmqyhCount,
      wfmqyhPercent,
      wfmqyhScore,
      fullHistoryLengthCount,
      fullHistoryLengthScore,
      wfmqyhLengthCount,
      wfmqyhLengthScore,
      combinedDiagnosticScore: fullHistoryScore + wfmqyhScore + fullHistoryLengthScore + wfmqyhLengthScore,
    };
  }));

  return {
    provenance: {
      scope,
      drawSize,
      fullValidDraws: full.rows.length,
      filteredValidDraws: filtered.rows.length,
      fullSkippedDraws: full.skipped,
      filteredSkippedDraws: filtered.skipped,
    },
    ratioRows,
    numberRows,
    terminalDigitRows,
    terminalDigitSetRows,
    straightRunRows: terminalDigitSetRows.filter((row) => row.isStraightRun),
  };
}
```

- [ ] **Step 5: Run analytics tests to verify GREEN**

Run:

```bash
npm test -- src/lib/scoringSystemDiagnostics.test.ts
```

Expected: all tests pass.

---

### Task 3: Component Tests

**Files:**
- Create: `tests/scoringSystemDiagnosticsPanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `tests/scoringSystemDiagnosticsPanel.test.tsx` with:

```tsx
import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScoringSystemDiagnosticsPanel } from "../src/components/ScoringSystemDiagnosticsPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("ScoringSystemDiagnosticsPanel", () => {
  const fullHistory = [
    draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
    draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D3", [20, 21, 22, 23, 24, 25], [26, 27]),
  ];
  const filteredHistory = [fullHistory[2]];

  it("renders observe-only language and provenance", () => {
    render(<ScoringSystemDiagnosticsPanel realHistory={fullHistory} realFilteredHistory={filteredHistory} />);

    expect(screen.getByText("Scoring System Diagnostics")).toBeInTheDocument();
    expect(screen.getByText(/Observe-only structural and history-derived scores/i)).toBeInTheDocument();
    expect(screen.getByText(/does not change candidate generation/i)).toBeInTheDocument();
    expect(screen.getByText(/Full real draws/i)).toBeInTheDocument();
    expect(screen.getByText(/WFMQYH real draws/i)).toBeInTheDocument();
  });

  it("shows ratio diagnostics by default", () => {
    render(<ScoringSystemDiagnosticsPanel realHistory={fullHistory} realFilteredHistory={filteredHistory} />);

    expect(screen.getByRole("button", { name: /Ratios/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("columnheader", { name: "Ratio" })).toBeInTheDocument();
    expect(screen.getByText("4:4")).toBeInTheDocument();
    expect(screen.getByText("3005")).toBeInTheDocument();
  });

  it("switches to number diagnostics", () => {
    render(<ScoringSystemDiagnosticsPanel realHistory={fullHistory} realFilteredHistory={filteredHistory} />);

    fireEvent.click(screen.getByRole("button", { name: /Numbers/i }));

    expect(screen.getByRole("button", { name: /Numbers/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("columnheader", { name: "Number" })).toBeInTheDocument();
    expect(screen.getByText("terminal digit base score")).toBeInTheDocument();
  });

  it("filters terminal digit sets by length and observed-only state", () => {
    render(<ScoringSystemDiagnosticsPanel realHistory={fullHistory} realFilteredHistory={filteredHistory} />);

    fireEvent.click(screen.getByRole("button", { name: /Digit Sets/i }));
    fireEvent.change(screen.getByLabelText("Set length"), { target: { value: "2" } });
    fireEvent.click(screen.getByLabelText("Observed only"));

    const table = screen.getByRole("table", { name: /Terminal digit set diagnostics/i });
    expect(within(table).getByText("1,2")).toBeInTheDocument();
    expect(screen.getByText(/Showing/i)).toBeInTheDocument();
  });

  it("supports mains-only scope without reusing eight-number ratio labels", () => {
    render(<ScoringSystemDiagnosticsPanel realHistory={fullHistory} realFilteredHistory={filteredHistory} />);

    fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "mains" } });

    expect(screen.getByText(/Mains only \(6\)/i)).toBeInTheDocument();
    expect(screen.getByText("3:3")).toBeInTheDocument();
    expect(screen.queryByText("8:0")).not.toBeInTheDocument();
  });

  it("renders an empty state when no valid real draws are available", () => {
    render(<ScoringSystemDiagnosticsPanel realHistory={[]} realFilteredHistory={[]} />);

    expect(screen.getByText(/No valid real draw history available/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run component tests to verify RED**

Run:

```bash
npm test -- tests/scoringSystemDiagnosticsPanel.test.tsx
```

Expected: fail because `ScoringSystemDiagnosticsPanel` does not exist.

---

### Task 4: React Panel

**Files:**
- Create: `src/components/ScoringSystemDiagnosticsPanel.tsx`
- Test: `tests/scoringSystemDiagnosticsPanel.test.tsx`

- [ ] **Step 1: Create component shell and tab state**

Create `src/components/ScoringSystemDiagnosticsPanel.tsx` with:

```tsx
import React, { useMemo, useState } from "react";
import {
  analyzeScoringSystemDiagnostics,
  type ScoringDiagnosticsScope,
  type ScoringSystemDiagnosticsResult,
  type TerminalDigitSetDiagnosticRow,
} from "../lib/scoringSystemDiagnostics";
import type { Draw } from "../types";
import { HigField, InfoHelp } from "./shared/HigControls";

type TabKey = "ratios" | "numbers" | "terminal-digits" | "digit-sets" | "straight-runs";

interface ScoringSystemDiagnosticsPanelProps {
  realHistory: Draw[];
  realFilteredHistory: Draw[];
}

export const ScoringSystemDiagnosticsPanel: React.FC<ScoringSystemDiagnosticsPanelProps> = ({
  realHistory,
  realFilteredHistory,
}) => {
  const [scope, setScope] = useState<ScoringDiagnosticsScope>("mains-plus-supps");
  const [activeTab, setActiveTab] = useState<TabKey>("ratios");
  const [digitSetLength, setDigitSetLength] = useState<string>("all");
  const [observedOnly, setObservedOnly] = useState(true);
  const [topN, setTopN] = useState(50);

  const analysis = useMemo(
    () => analyzeScoringSystemDiagnostics(realHistory, realFilteredHistory, { scope }),
    [realHistory, realFilteredHistory, scope],
  );

  if (analysis.provenance.fullValidDraws === 0 && analysis.provenance.filteredValidDraws === 0) {
    return (
      <section style={panelStyle} aria-label="Scoring System Diagnostics">
        <Header />
        <div style={emptyStyle}>No valid real draw history available for scoring diagnostics.</div>
      </section>
    );
  }

  return (
    <section style={panelStyle} aria-label="Scoring System Diagnostics">
      <Header />
      <Controls scope={scope} onScopeChange={setScope} />
      <StatusStrip analysis={analysis} />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <ActiveTabContent
        analysis={analysis}
        activeTab={activeTab}
        digitSetLength={digitSetLength}
        setDigitSetLength={setDigitSetLength}
        observedOnly={observedOnly}
        setObservedOnly={setObservedOnly}
        topN={topN}
        setTopN={setTopN}
      />
    </section>
  );
};
```

- [ ] **Step 2: Add header, controls, status strip, and tabs**

Add these components below the shell:

```tsx
const Header: React.FC = () => (
  <div style={headerStyle}>
    <div>
      <h3 style={titleStyle}>Scoring System Diagnostics</h3>
      <p style={subtitleStyle}>
        Observe-only structural and history-derived scores. These diagnostics do not change candidate generation.
      </p>
    </div>
    <InfoHelp label="How Scoring System Diagnostics works">
      Scores are diagnostic support measures. Base scores come from structure or exact combinations; full-history and WFMQYH scores come from observed real draw counts. They are not calibrated next-draw probabilities.
    </InfoHelp>
  </div>
);

const Controls: React.FC<{
  scope: ScoringDiagnosticsScope;
  onScopeChange: (scope: ScoringDiagnosticsScope) => void;
}> = ({ scope, onScopeChange }) => (
  <div style={controlsStyle}>
    <HigField label="Scope" help="Mains + supps uses the eight-number blueprint. Mains only recomputes the six-number baseline.">
      <select
        value={scope}
        onChange={(event) => onScopeChange(event.target.value as ScoringDiagnosticsScope)}
        style={selectStyle}
      >
        <option value="mains-plus-supps">Mains + supps (8)</option>
        <option value="mains">Mains only (6)</option>
      </select>
    </HigField>
  </div>
);

const StatusStrip: React.FC<{ analysis: ScoringSystemDiagnosticsResult }> = ({ analysis }) => {
  const p = analysis.provenance;
  return (
    <div style={statusStripStyle}>
      <Metric label="Scope" value={p.scope === "mains-plus-supps" ? "Mains + supps (8)" : "Mains only (6)"} />
      <Metric label="Full real draws" value={String(p.fullValidDraws)} />
      <Metric label="WFMQYH real draws" value={String(p.filteredValidDraws)} />
      <Metric label="Skipped rows" value={String(p.fullSkippedDraws + p.filteredSkippedDraws)} />
      <Metric label="State" value="Observe-only" />
    </div>
  );
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "ratios", label: "Ratios" },
  { key: "numbers", label: "Numbers" },
  { key: "terminal-digits", label: "Terminal Digits" },
  { key: "digit-sets", label: "Digit Sets" },
  { key: "straight-runs", label: "Straight Runs" },
];

const TabBar: React.FC<{ activeTab: TabKey; onTabChange: (tab: TabKey) => void }> = ({ activeTab, onTabChange }) => (
  <div style={tabBarStyle} role="group" aria-label="Scoring diagnostics sections">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        aria-pressed={activeTab === tab.key}
        onClick={() => onTabChange(tab.key)}
        style={activeTab === tab.key ? activeTabButtonStyle : tabButtonStyle}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
```

- [ ] **Step 3: Add tables and filters**

Add table renderers:

```tsx
const ActiveTabContent: React.FC<{
  analysis: ScoringSystemDiagnosticsResult;
  activeTab: TabKey;
  digitSetLength: string;
  setDigitSetLength: (value: string) => void;
  observedOnly: boolean;
  setObservedOnly: (value: boolean) => void;
  topN: number;
  setTopN: (value: number) => void;
}> = (props) => {
  if (props.activeTab === "ratios") return <RatioTable analysis={props.analysis} />;
  if (props.activeTab === "numbers") return <NumberTable analysis={props.analysis} />;
  if (props.activeTab === "terminal-digits") return <TerminalDigitTable analysis={props.analysis} />;
  if (props.activeTab === "straight-runs") {
    return (
      <DigitSetTable
        title="Straight terminal digit run diagnostics"
        rows={props.analysis.straightRunRows}
        digitSetLength={props.digitSetLength}
        setDigitSetLength={props.setDigitSetLength}
        observedOnly={props.observedOnly}
        setObservedOnly={props.setObservedOnly}
        topN={props.topN}
        setTopN={props.setTopN}
        showStraightReference
      />
    );
  }
  return (
    <DigitSetTable
      title="Terminal digit set diagnostics"
      rows={props.analysis.terminalDigitSetRows}
      digitSetLength={props.digitSetLength}
      setDigitSetLength={props.setDigitSetLength}
      observedOnly={props.observedOnly}
      setObservedOnly={props.setObservedOnly}
      topN={props.topN}
      setTopN={props.setTopN}
    />
  );
};
```

For each table, include columns for base/full/WFMQYH/combined/rank. Use `<table aria-label="...">` and sticky headers if inline styles permit.

The digit-set table should filter rows with:

```tsx
const filterDigitSetRows = (
  rows: TerminalDigitSetDiagnosticRow[],
  digitSetLength: string,
  observedOnly: boolean,
  topN: number,
): TerminalDigitSetDiagnosticRow[] => {
  const lengthFiltered = digitSetLength === "all"
    ? rows
    : rows.filter((row) => row.length === Number(digitSetLength));
  const observationFiltered = observedOnly
    ? lengthFiltered.filter((row) => row.fullHistoryCount > 0 || row.wfmqyhCount > 0)
    : lengthFiltered;
  return observationFiltered.slice(0, topN);
};
```

- [ ] **Step 4: Add compact styles**

Add component-local style objects:

```tsx
const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  color: "#111827",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const titleStyle: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 800 };
const subtitleStyle: React.CSSProperties = { margin: "4px 0 0", color: "#4b5563", fontSize: 13, lineHeight: 1.4 };
const controlsStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" };
const selectStyle: React.CSSProperties = { minHeight: 34, borderRadius: 8, border: "1px solid #cfd8dc", padding: "4px 8px", background: "#fff" };
const emptyStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f9fafb", color: "#4b5563" };
const statusStripStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 };
const metricStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", background: "#fff" };
const metricLabelStyle: React.CSSProperties = { fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" };
const metricValueStyle: React.CSSProperties = { fontSize: 14, fontWeight: 800 };
const tabBarStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const tabButtonStyle: React.CSSProperties = { minHeight: 34, border: "1px solid #d1d5db", borderRadius: 999, padding: "5px 10px", background: "#fff", cursor: "pointer" };
const activeTabButtonStyle: React.CSSProperties = { ...tabButtonStyle, background: "#111827", color: "#fff", borderColor: "#111827" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" };
const tableStyle: React.CSSProperties = { width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 12 };
const thStyle: React.CSSProperties = { position: "sticky", top: 0, background: "#f9fafb", textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" };
```

- [ ] **Step 5: Run component tests to verify GREEN**

Run:

```bash
npm test -- tests/scoringSystemDiagnosticsPanel.test.tsx
```

Expected: all tests pass.

---

### Task 5: App Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/lib/panelFavorites.ts`
- Create: `tests/scoringSystemDiagnosticsWiring.test.ts`

- [ ] **Step 1: Write failing wiring test**

Create `tests/scoringSystemDiagnosticsWiring.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Scoring System Diagnostics app wiring", () => {
  it("places the observe-only scoring panel after Odd/Even Ratio Cadence using real histories", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('import { ScoringSystemDiagnosticsPanel } from "./components/ScoringSystemDiagnosticsPanel";');
    expect(appSource).toContain('panelId="scoring-system-diagnostics"');
    expect(appSource.indexOf('panelId="odd-even-ratio-cadence"')).toBeLessThan(
      appSource.indexOf('panelId="scoring-system-diagnostics"'),
    );
    expect(appSource).toContain("realHistory={realHistory}");
    expect(appSource).toContain("realFilteredHistory={realFilteredHistory}");
    expect(appSource).not.toContain("setGeneratedCandidates(scoring");
  });

  it("registers the scoring panel as a favoriteable panel", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/panelFavorites.ts"), "utf8");

    expect(source).toContain('"scoring-system-diagnostics"');
    expect(source).toContain("Scoring System Diagnostics");
  });
});
```

- [ ] **Step 2: Run wiring test to verify RED**

Run:

```bash
npm test -- tests/scoringSystemDiagnosticsWiring.test.ts
```

Expected: fail because the import, panel, and registry entry do not exist.

- [ ] **Step 3: Wire `App.tsx`**

Add the import near the other component imports:

```ts
import { ScoringSystemDiagnosticsPanel } from "./components/ScoringSystemDiagnosticsPanel";
```

Insert immediately after the `Odd/Even Ratio Cadence` section:

```tsx
<CollapsibleSection
  panelId="scoring-system-diagnostics"
  title={<b>Scoring System Diagnostics</b>}
  summaryHint="observe-only base, full-history, and WFMQYH scores"
  defaultOpen={false}
>
  <ScoringSystemDiagnosticsPanel
    realHistory={realHistory}
    realFilteredHistory={realFilteredHistory}
  />
</CollapsibleSection>
```

- [ ] **Step 4: Register favorite metadata**

Modify `src/lib/panelFavorites.ts` by adding:

```ts
{
  id: "scoring-system-diagnostics",
  title: "Scoring System Diagnostics",
  group: "Signals",
  summary: "Observe-only base, full-history, and WFMQYH scoring diagnostics.",
}
```

Use the existing registry shape and ordering in that file.

- [ ] **Step 5: Run wiring test to verify GREEN**

Run:

```bash
npm test -- tests/scoringSystemDiagnosticsWiring.test.ts
```

Expected: all tests pass.

---

### Task 6: Truthfulness And Regression Guardrails

**Files:**
- Modify: `tests/truthfulnessLanguage.test.ts`
- Test: `tests/truthfulnessLanguage.test.ts`

- [ ] **Step 1: Add wording guardrails**

Extend the existing truthfulness-language test with assertions that the new panel avoids overclaiming. Add checks equivalent to:

```ts
const componentSource = readFileSync(resolve(process.cwd(), "src/components/ScoringSystemDiagnosticsPanel.tsx"), "utf8");
const libSource = readFileSync(resolve(process.cwd(), "src/lib/scoringSystemDiagnostics.ts"), "utf8");

expect(componentSource).toContain("Observe-only");
expect(componentSource).toContain("not calibrated next-draw probabilities");
expect(componentSource).not.toMatch(/probability of next draw/i);
expect(componentSource).not.toMatch(/guaranteed|guarantee/i);
expect(componentSource).not.toMatch(/ending-family|ending family/i);
expect(componentSource).toContain("terminal digit");
expect(libSource).not.toMatch(/prediction/i);
```

- [ ] **Step 2: Run truthfulness test**

Run:

```bash
npm test -- tests/truthfulnessLanguage.test.ts
```

Expected: pass after wording is corrected.

---

### Task 7: Focused Verification

**Files:**
- No code files changed in this task.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/scoringSystemDiagnostics.test.ts tests/scoringSystemDiagnosticsPanel.test.tsx tests/scoringSystemDiagnosticsWiring.test.ts tests/truthfulnessLanguage.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: TypeScript passes with no errors.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: build succeeds. Existing Vite/Rollup chunk-size or comment warnings are acceptable if no new errors appear.

- [ ] **Step 4: Browser QA**

Run the dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Open the local URL in the in-app browser. Check:

- `Scoring System Diagnostics` appears after `Odd/Even Ratio Cadence`.
- The panel starts collapsed.
- Opening the panel shows the observe-only status strip.
- Ratio tab shows eight-number rows by default.
- Scope selector changes to six-number rows.
- Numbers tab and terminal digit tabs render without console errors.
- Digit-set filters reduce rows and do not freeze scrolling.
- Help popover stays inside the viewport.

Stop the dev server after QA.

---

## Self-Review Notes

- Spec coverage: this plan covers observe-only analytics, exact odd/even baselines, terminal digit naming, score separation, WFMQYH movement, UI tabs, real-history wiring, error states, and verification.
- Scope check: V1 does not affect generation or ranking. That remains a later V2 with separate toggles and backtests.
- Ambiguity resolved: unordered terminal digit sets are scored once; ordered ascending/descending straight-run labels are reference-only.
- Repo-state guardrail: no staging or committing is part of execution unless the user explicitly asks.
