# Stage-Conditioned IDM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Stage-Conditioned Ideal Draw Model that scores generated candidates against the historical bucket state expected after the next draw stage in comparable same-size months.

**Architecture:** Extend the Monthly Draws Summary analytics path with a separate `StageIdealDrawState`, emitted by `MonthlyDrawsSummaryPanel`, stored in `App.tsx`, and consumed by `GeneratedCandidatesPanel`. The existing whole-month IDM remains unchanged; Stage IDM is added beside it as an observable, sortable diagnostic.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, existing Monthly Draws Summary helpers and `computeIdealMonthlyDraw`.

---

## File Structure

- Modify `src/lib/monthlyDrawSummary.ts`
  - Add `StageIdealDrawState`, `AnalyzeStageIdealDrawArgs`, expected draw-count inference, comparable partial-month filtering, robust stage target calculation, and `analyzeStageIdealDrawModel`.
- Modify `src/lib/monthlyDrawSummary.test.ts`
  - Add analytics tests for stage target, comparable-month filtering, stage clamping, and unavailable states.
- Modify `src/components/MonthlyDrawsSummaryPanel.tsx`
  - Add expected draw-count override selector, render Stage IDM evidence, and emit `StageIdealDrawState | null`.
- Modify `src/App.tsx`
  - Hold `stageIdealDrawState` and pass it to `GeneratedCandidatesPanel`.
- Modify `src/components/candidates/GeneratedCandidatesPanel.tsx`
  - Add Stage IDM score/column/sort/header text without changing generation or Rdy.
- Modify `tests/generatedCandidatesPanel.test.ts`
  - Add rendered Stage IDM target/score test.
- Modify `tests/generatedCandidatesIdmWiring.test.ts`
  - Add app wiring assertions for `stageIdealDrawState`.
- Modify `public/user-manual.html`
  - Add concise Stage IDM explanation and honesty note.

---

### Task 1: Add Stage IDM Analytics Tests

**Files:**
- Modify: `src/lib/monthlyDrawSummary.test.ts`

- [ ] **Step 1: Add failing tests for stage-conditioned analytics**

Append this `describe` block before `describe("computeIdealMonthlyDraw", ...)`:

```ts
describe("analyzeStageIdealDrawModel", () => {
  const repeatDraws = (month: string, count: number, start = 1): Draw[] => (
    Array.from({ length: count }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const base = ((start + index * 3 - 1) % 45) + 1;
      return draw(`${month}-${day}`, [
        base,
        ((base + 1 - 1) % 45) + 1,
        ((base + 2 - 1) % 45) + 1,
        ((base + 3 - 1) % 45) + 1,
        ((base + 4 - 1) % 45) + 1,
        ((base + 5 - 1) % 45) + 1,
      ], [
        ((base + 6 - 1) % 45) + 1,
        ((base + 7 - 1) % 45) + 1,
      ]);
    })
  );

  it("targets the next draw stage using only comparable same-size months", () => {
    const history = [
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-02", 12, 2),
      ...repeatDraws("2026-03", 13, 3),
      ...repeatDraws("2026-06", 5, 4),
    ];

    const state = analyzeStageIdealDrawModel(history, {
      today: new Date("2026-06-11T12:00:00"),
      expectedDrawCountOverride: 13,
    });

    expect(state).not.toBeNull();
    expect(state?.workingMonthLabel).toBe("2026-06");
    expect(state?.expectedDrawCount).toBe(13);
    expect(state?.expectedDrawCountSource).toBe("override");
    expect(state?.completedDrawCount).toBe(5);
    expect(state?.targetStageDrawCount).toBe(6);
    expect(state?.comparableMonthCount).toBe(2);
    expect(state?.targetDistribution.reduce((sum, value) => sum + value, 0)).toBe(45);
    expect(state?.idealDrawBucketCounts.reduce((sum, value) => sum + value, 0)).toBe(8);
  });

  it("returns null when no comparable months exist", () => {
    const state = analyzeStageIdealDrawModel([
      ...repeatDraws("2026-02", 12, 2),
      ...repeatDraws("2026-06", 5, 4),
    ], {
      today: new Date("2026-06-11T12:00:00"),
      expectedDrawCountOverride: 13,
    });

    expect(state).toBeNull();
  });

  it("clamps the target stage to the expected draw count", () => {
    const state = analyzeStageIdealDrawModel([
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-03", 13, 3),
      ...repeatDraws("2026-06", 13, 4),
    ], {
      today: new Date("2026-06-30T12:00:00"),
      expectedDrawCountOverride: 13,
      forceWorkingMonthLabel: "2026-06",
    });

    expect(state?.completedDrawCount).toBe(13);
    expect(state?.targetStageDrawCount).toBe(13);
    expect(state?.warnings).toContain("Target stage was clamped to the expected 13 draws.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/monthlyDrawSummary.test.ts
```

Expected: FAIL because `analyzeStageIdealDrawModel` is not exported.

---

### Task 2: Implement Stage IDM Analytics

**Files:**
- Modify: `src/lib/monthlyDrawSummary.ts`
- Modify: `src/lib/monthlyDrawSummary.test.ts`

- [ ] **Step 1: Import the new function in the test**

Update the import block in `src/lib/monthlyDrawSummary.test.ts`:

```ts
import {
  analyzeMonthlyDrawSummary,
  analyzeStageIdealDrawModel,
  computeIdealMonthlyDraw,
  createEmptyMonthlyBucketSets,
  MONTHLY_BUCKET_KEYS,
  projectMonthlyBucketCounts,
} from "./monthlyDrawSummary";
```

- [ ] **Step 2: Add exported Stage IDM types**

In `src/lib/monthlyDrawSummary.ts`, after `MonthlyIdealDrawState`, add:

```ts
export type ExpectedDrawCountSource = "auto" | "override";

export interface StageIdealDrawState {
  bucketSets: MonthlyBucketSets;
  currentDistribution: number[];
  targetDistribution: number[];
  idealDrawBucketCounts: number[];
  workingMonthLabel: string;
  expectedDrawCount: number;
  targetStageDrawCount: number;
  completedDrawCount: number;
  comparableMonthCount: number;
  expectedDrawCountSource: ExpectedDrawCountSource;
  warnings: string[];
}

export interface AnalyzeStageIdealDrawArgs extends AnalyzeMonthlyDrawSummaryOptions {
  expectedDrawCountOverride?: number | "auto";
  forceWorkingMonthLabel?: string;
}
```

- [ ] **Step 3: Add implementation helpers**

Add these helpers near the existing private monthly helpers:

```ts
function buildRowsFromParsedDraws(args: {
  parsed: ParsedDraw[];
  drawLimit: number;
  maxNumber: number;
  maxBucket: number;
  drawSize: number;
}): MonthlyDrawMonthRow[] {
  const grouped = new Map<string, ParsedDraw[]>();
  for (const item of args.parsed) {
    const bucket = grouped.get(item.monthLabel);
    if (bucket) bucket.push(item);
    else grouped.set(item.monthLabel, [item]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthLabel, items]) => buildMonthRow({
      monthLabel,
      draws: items.slice(0, args.drawLimit),
      totalDrawCount: items.length,
      maxNumber: args.maxNumber,
      maxBucket: args.maxBucket,
      drawSize: args.drawSize,
    }));
}

function parseHistoryForMonthlyAnalysis(
  history: Draw[],
  options: { includeSupp: boolean; maxNumber: number },
): ParsedDraw[] {
  const parsed: ParsedDraw[] = [];
  for (const draw of history) {
    const dateInfo = parseDrawDate(draw.date);
    if (!dateInfo) continue;
    const sanitized = sanitizeDrawNumbers(draw, options);
    parsed.push({
      monthLabel: dateInfo.monthLabel,
      timestamp: dateInfo.timestamp,
      numbers: sanitized.numbers,
      invalidNumberCount: sanitized.invalidNumberCount,
      duplicateNumberCount: sanitized.duplicateNumberCount,
    });
  }
  parsed.sort((a, b) => a.timestamp - b.timestamp);
  return parsed;
}

function inferExpectedDrawCountFromWeekdayRhythm(args: {
  parsed: ParsedDraw[];
  workingMonthLabel: string;
}): number | null {
  const recent = args.parsed.slice(-90);
  const weekdays = new Set<number>();
  for (const draw of recent) {
    const date = new Date(draw.timestamp);
    if (!Number.isNaN(date.getTime())) weekdays.add(date.getDay());
  }
  if (!weekdays.size || !args.workingMonthLabel) return null;
  const [yearRaw, monthRaw] = args.workingMonthLabel.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) break;
    if (weekdays.has(date.getDay())) count++;
  }
  return count > 0 ? count : null;
}
```

- [ ] **Step 4: Refactor `analyzeMonthlyDrawSummary` to use shared parsing helpers**

Replace the existing manual parsed/grouped setup with:

```ts
const parsed = parseHistoryForMonthlyAnalysis(history, { includeSupp, maxNumber });
let invalidDateCount = 0;
let invalidNumberCount = 0;
let duplicateNumberCount = 0;

for (const draw of history) {
  if (!parseDrawDate(draw.date)) {
    invalidDateCount++;
    continue;
  }
  const sanitized = sanitizeDrawNumbers(draw, { includeSupp, maxNumber });
  invalidNumberCount += sanitized.invalidNumberCount;
  duplicateNumberCount += sanitized.duplicateNumberCount;
}

const groupedForMax = new Map<string, ParsedDraw[]>();
for (const item of parsed) {
  const bucket = groupedForMax.get(item.monthLabel);
  if (bucket) bucket.push(item);
  else groupedForMax.set(item.monthLabel, [item]);
}
const maxObservedDrawsPerMonth = Math.max(1, ...[...groupedForMax.values()].map((items) => items.length));
const drawLimit = normalizeDrawLimit(options.drawLimitPerMonth, maxObservedDrawsPerMonth);
const rows = buildRowsFromParsedDraws({ parsed, drawLimit, maxNumber, maxBucket, drawSize });
```

Keep the existing warning logic and return shape unchanged.

- [ ] **Step 5: Add `analyzeStageIdealDrawModel`**

Add this exported function before `computeIdealMonthlyDraw`:

```ts
export function analyzeStageIdealDrawModel(
  history: Draw[],
  args: AnalyzeStageIdealDrawArgs = {},
): StageIdealDrawState | null {
  const includeSupp = args.includeSupp ?? true;
  const maxNumber = normalizePositiveInteger(args.maxNumber, DEFAULT_MAX_NUMBER);
  const maxBucket = normalizePositiveInteger(args.maxBucket, DEFAULT_MAX_BUCKET);
  const drawSize = normalizePositiveInteger(args.drawSize, DEFAULT_DRAW_SIZE);
  const parsed = parseHistoryForMonthlyAnalysis(history, { includeSupp, maxNumber });
  if (!parsed.length) return null;

  const grouped = new Map<string, ParsedDraw[]>();
  for (const item of parsed) {
    const bucket = grouped.get(item.monthLabel);
    if (bucket) bucket.push(item);
    else grouped.set(item.monthLabel, [item]);
  }
  const maxObservedDrawsPerMonth = Math.max(1, ...[...grouped.values()].map((items) => items.length));
  const fullRows = buildRowsFromParsedDraws({
    parsed,
    drawLimit: maxObservedDrawsPerMonth,
    maxNumber,
    maxBucket,
    drawSize,
  });

  const todayMonthLabel = monthLabelFromLocalDate(args.today ?? new Date());
  const workingMonthLabel = args.forceWorkingMonthLabel
    || resolveEffectiveMonthState({
      rows: fullRows,
      todayMonthLabel,
      maxObservedDrawsPerMonth,
      maxNumber,
      maxBucket,
    }).monthLabel;
  if (!workingMonthLabel) return null;

  const workingItems = grouped.get(workingMonthLabel) ?? [];
  const completedDrawCount = workingItems.length;
  const override = args.expectedDrawCountOverride;
  const inferred = override && override !== "auto"
    ? Math.max(1, Math.floor(override))
    : inferExpectedDrawCountFromWeekdayRhythm({ parsed, workingMonthLabel })
      ?? maxObservedDrawsPerMonth;
  const expectedDrawCount = Math.max(1, inferred);
  const expectedDrawCountSource: ExpectedDrawCountSource = override && override !== "auto" ? "override" : "auto";
  const unclampedTargetStage = completedDrawCount + 1;
  const targetStageDrawCount = Math.min(unclampedTargetStage, expectedDrawCount);
  const warnings: string[] = [];
  if (targetStageDrawCount !== unclampedTargetStage) {
    warnings.push(`Target stage was clamped to the expected ${expectedDrawCount} draws.`);
  }

  const pastRows = fullRows.filter((row) => row.monthLabel < workingMonthLabel);
  const baselineRows = filterRowsForHistoryBaselines(pastRows, (row) => row.monthLabel);
  const comparableItems = baselineRows
    .filter((row) => row.totalDrawCount === expectedDrawCount)
    .map((row) => grouped.get(row.monthLabel) ?? [])
    .filter((items) => items.length >= targetStageDrawCount);

  if (!comparableItems.length) return null;

  const partialRows = comparableItems.map((items) => buildMonthRow({
    monthLabel: items[0]?.monthLabel ?? "",
    draws: items.slice(0, targetStageDrawCount),
    totalDrawCount: items.length,
    maxNumber,
    maxBucket,
    drawSize,
  }));
  const currentRow = buildMonthRow({
    monthLabel: workingMonthLabel,
    draws: workingItems,
    totalDrawCount: expectedDrawCount,
    maxNumber,
    maxBucket,
    drawSize,
  });
  const targetDistribution = buildBucketStats(
    partialRows,
    currentRow.distribution,
    maxBucket,
    maxNumber,
  ).map((bucket) => bucket.targetCount);
  const idealDraw = computeIdealMonthlyDraw({
    currentDistribution: currentRow.distribution,
    targetDistribution,
    drawSize,
  });
  if (partialRows.length < 3) warnings.push("Thin evidence: fewer than 3 comparable months.");

  return {
    bucketSets: bucketSetsFromDistribution(currentRow.numbers, currentRow.undrawn, maxBucket),
    currentDistribution: currentRow.distribution,
    targetDistribution,
    idealDrawBucketCounts: idealDraw.bucketCounts.map(({ count }) => count),
    workingMonthLabel,
    expectedDrawCount,
    targetStageDrawCount,
    completedDrawCount,
    comparableMonthCount: partialRows.length,
    expectedDrawCountSource,
    warnings,
  };
}
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
npm test -- src/lib/monthlyDrawSummary.test.ts
```

Expected: PASS.

---

### Task 3: Add Monthly Summary UI And State Emission

**Files:**
- Modify: `src/components/MonthlyDrawsSummaryPanel.tsx`

- [ ] **Step 1: Write failing component/source expectations**

Add assertions to an existing component/source test or create `tests/monthlyDrawsSummaryStageIdm.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MonthlyDrawsSummaryPanel Stage IDM wiring", () => {
  it("renders and emits Stage IDM state", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/MonthlyDrawsSummaryPanel.tsx"), "utf8");

    expect(source).toContain("analyzeStageIdealDrawModel");
    expect(source).toContain("onStageIdealDrawStateChange");
    expect(source).toContain("Stage IDM");
    expect(source).toContain("Expected Draw Count");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- tests/monthlyDrawsSummaryStageIdm.test.ts
```

Expected: FAIL because the source does not contain the Stage IDM wiring yet.

- [ ] **Step 3: Add imports and exported type**

Update the import list:

```ts
import {
  analyzeMonthlyDrawSummary,
  analyzeStageIdealDrawModel,
  bucketLabelForTimes,
  MONTHLY_BUCKET_KEYS,
  monthlyFrequencyConstraintsFromSelections,
  numbersFromMonthlySelections,
  projectMonthlyBucketCounts,
  pruneMonthlySelections,
  sampleMonthlyNumbers,
  type AvgBucketEntry,
  type MonthlyBucketKey,
  type MonthlyBucketSelections,
  type MonthlyBucketSets,
  type MonthlyConstraintPayload,
  type MonthlyDrawMonthRow,
  type MonthlyDrawSummary,
  type MonthlyFrequencyCount,
  type MonthlyIdealDrawState,
  type StageIdealDrawState,
} from "../lib/monthlyDrawSummary";
```

Update the export block:

```ts
export type {
  AvgBucketEntry,
  MonthlyBucketSelections,
  MonthlyBucketSets,
  MonthlyConstraintPayload,
  MonthlyFrequencyConstraints,
  MonthlyIdealDrawState,
  StageIdealDrawState,
} from "../lib/monthlyDrawSummary";
```

- [ ] **Step 4: Add props and local override state**

Extend props:

```ts
onStageIdealDrawStateChange?: (state: StageIdealDrawState | null) => void;
```

Destructure it and add state:

```ts
const [stageExpectedDrawCount, setStageExpectedDrawCount] = useState<number | "auto">("auto");
```

- [ ] **Step 5: Compute and emit stage state**

Add:

```ts
const stageIdealDrawState = useMemo(() => analyzeStageIdealDrawModel(history, {
  drawLimitPerMonth: "all",
  averageDrawCountFilter,
  expectedDrawCountOverride: stageExpectedDrawCount,
}), [averageDrawCountFilter, history, stageExpectedDrawCount]);

useEffect(() => {
  onStageIdealDrawStateChange?.(stageIdealDrawState);
}, [onStageIdealDrawStateChange, stageIdealDrawState]);
```

- [ ] **Step 6: Render compact Stage IDM UI**

Inside the `Robust Baseline And Ideal Draw` section, below the existing ideal draw row, add:

```tsx
<div style={{ marginTop: 10, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
    <strong style={{ color: "#0f172a" }}>Stage IDM</strong>
    <label style={{ ...controlLabelStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
      Expected Draw Count
      <select
        value={stageExpectedDrawCount === "auto" ? "auto" : String(stageExpectedDrawCount)}
        onChange={(event) => setStageExpectedDrawCount(event.target.value === "auto" ? "auto" : Number(event.target.value))}
        style={{ ...selectStyle, minHeight: 32 }}
      >
        <option value="auto">Auto{stageIdealDrawState ? `: ${stageIdealDrawState.expectedDrawCount} draws` : ""}</option>
        {summary.drawCountOptions.map((count) => (
          <option key={count} value={count}>{count} draws</option>
        ))}
      </select>
    </label>
  </div>
  {stageIdealDrawState ? (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", color: "#475569", fontSize: 12 }}>
      <span>
        {stageIdealDrawState.workingMonthLabel} · {stageIdealDrawState.expectedDrawCountSource === "auto" ? "Auto" : "Override"}: {stageIdealDrawState.expectedDrawCount}-draw month · planning draw {stageIdealDrawState.targetStageDrawCount} · baseline: {stageIdealDrawState.comparableMonthCount} comparable month{stageIdealDrawState.comparableMonthCount === 1 ? "" : "s"}
      </span>
      {stageIdealDrawState.idealDrawBucketCounts.map((count, times) => (
        <BucketChip key={times} times={times} value={count} muted={count === 0} />
      ))}
      {stageIdealDrawState.warnings.map((warning) => (
        <span key={warning} style={{ color: "#b45309", fontWeight: 700 }}>{warning}</span>
      ))}
    </div>
  ) : (
    <div style={{ color: "#64748b", fontSize: 12 }}>
      Stage IDM unavailable: no comparable months for the resolved draw count and next stage.
    </div>
  )}
</div>
```

- [ ] **Step 7: Run component/source test**

Run:

```bash
npm test -- tests/monthlyDrawsSummaryStageIdm.test.ts
```

Expected: PASS.

---

### Task 4: Wire Stage IDM Through App

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/generatedCandidatesIdmWiring.test.ts`

- [ ] **Step 1: Add failing wiring assertions**

Extend `tests/generatedCandidatesIdmWiring.test.ts`:

```ts
expect(appSource).toContain("stageIdealDrawState");
expect(appSource).toContain("setStageIdealDrawState");
expect(monthlySummaryCall).toContain("onStageIdealDrawStateChange={setStageIdealDrawState}");
expect(generatedCandidatesCall).toContain("stageIdealDrawState={stageIdealDrawState}");
```

- [ ] **Step 2: Run the wiring test**

Run:

```bash
npm test -- tests/generatedCandidatesIdmWiring.test.ts
```

Expected: FAIL because `stageIdealDrawState` is not wired.

- [ ] **Step 3: Update App imports and state**

Update the Monthly Summary import:

```ts
import MonthlyDrawsSummaryPanel, { type MonthlyConstraintPayload, type MonthlyFrequencyConstraints, type MonthlyBucketSets, type MonthlyIdealDrawState, type StageIdealDrawState } from "./components/MonthlyDrawsSummaryPanel";
```

Add state near `monthlyIdealDrawState`:

```ts
const [stageIdealDrawState, setStageIdealDrawState] = useState<StageIdealDrawState | null>(null);
```

- [ ] **Step 4: Wire panel props**

Add to `MonthlyDrawsSummaryPanel`:

```tsx
onStageIdealDrawStateChange={setStageIdealDrawState}
```

Add to `GeneratedCandidatesPanel`:

```tsx
stageIdealDrawState={stageIdealDrawState}
```

- [ ] **Step 5: Run wiring test**

Run:

```bash
npm test -- tests/generatedCandidatesIdmWiring.test.ts
```

Expected: PASS.

---

### Task 5: Add Stage IDM To Generated Candidates

**Files:**
- Modify: `src/components/candidates/GeneratedCandidatesPanel.tsx`
- Modify: `tests/generatedCandidatesPanel.test.ts`

- [ ] **Step 1: Add failing rendered test**

Append this test to `tests/generatedCandidatesPanel.test.ts`:

```ts
it("renders Stage IDM target and score when stage ideal state is available", () => {
  const buckets = monthlyBucketSets({
    undrawn: [1, 2],
    times1: [3, 4, 5, 6, 7],
    times2: [8],
  });
  const html = renderToStaticMarkup(
    React.createElement(GeneratedCandidatesPanel, buildProps({
      candidates: [
        {
          main: [1, 2, 3, 4, 5, 6],
          supp: [7, 8],
          ogaScore: 0.42,
          ogaPercentile: 55,
        },
      ],
      monthlyBuckets: buckets,
      stageIdealDrawState: {
        bucketSets: buckets,
        currentDistribution: [2, 5, 1, 0, 0, 0, 0, 0, 0],
        targetDistribution: [4, 8, 12, 10, 6, 3, 1, 1, 0],
        idealDrawBucketCounts: [2, 5, 1, 0, 0, 0, 0, 0, 0],
        workingMonthLabel: "2026-06",
        expectedDrawCount: 13,
        targetStageDrawCount: 6,
        completedDrawCount: 5,
        comparableMonthCount: 4,
        expectedDrawCountSource: "auto",
        warnings: [],
      },
    } as any)),
  );

  expect(html).toContain("Stage IDM target:");
  expect(html).toContain("draw 6 of a 13-draw month");
  expect(html).toContain("Stage IDM");
  expect(html).toContain("Top 100.0%");
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/generatedCandidatesPanel.test.ts
```

Expected: FAIL because `stageIdealDrawState` is not a prop and no Stage IDM UI exists.

- [ ] **Step 3: Add prop and import type**

Update import:

```ts
import {
  computeIdealMonthlyDraw,
  type MonthlyBucketSets,
  type MonthlyIdealDrawState,
  type StageIdealDrawState,
} from "../../lib/monthlyDrawSummary";
```

Add prop:

```ts
stageIdealDrawState?: StageIdealDrawState | null;
```

Destructure:

```ts
stageIdealDrawState = null,
```

- [ ] **Step 4: Add Stage IDM score helpers**

Near the existing `getIdealDrawMatch`, add:

```ts
const stageNumberToBucket = useMemo((): Map<number, number> | null => {
  if (!stageIdealDrawState?.bucketSets) return null;
  const m = new Map<number, number>();
  const bucketSets = [
    stageIdealDrawState.bucketSets.undrawn,
    stageIdealDrawState.bucketSets.times1,
    stageIdealDrawState.bucketSets.times2,
    stageIdealDrawState.bucketSets.times3,
    stageIdealDrawState.bucketSets.times4,
    stageIdealDrawState.bucketSets.times5,
    stageIdealDrawState.bucketSets.times6,
    stageIdealDrawState.bucketSets.times7,
    stageIdealDrawState.bucketSets.times8,
  ];
  bucketSets.forEach((set, idx) => set.forEach((n) => m.set(n, idx)));
  return m;
}, [stageIdealDrawState]);

const stageIdealDrawComp = useMemo(
  () => toNineBucketDistribution(stageIdealDrawState?.idealDrawBucketCounts),
  [stageIdealDrawState],
);

const getStageIdealDrawMatch = useCallback((numbers: number[]): number | null => {
  if (!stageIdealDrawComp || !stageNumberToBucket) return null;
  const candidateComp = new Array(9).fill(0);
  numbers.forEach((n) => {
    const bucket = stageNumberToBucket.get(n);
    if (bucket !== undefined) candidateComp[bucket] += 1;
  });
  let totalDiff = 0;
  for (let i = 0; i < 9; i++) totalDiff += Math.abs(candidateComp[i] - stageIdealDrawComp[i]);
  return Math.max(0, 1 - totalDiff / 16);
}, [stageIdealDrawComp, stageNumberToBucket]);

const stageIdmScores = useMemo((): (number | null)[] => (
  candidates.map((c) => getStageIdealDrawMatch([...c.main, ...c.supp]))
), [candidates, getStageIdealDrawMatch]);
```

- [ ] **Step 5: Add sort key support**

Where `SortKey` is defined, add:

```ts
| "stageIdm"
```

Where candidate rows are sorted, add:

```ts
case "stageIdm":
  va = stageIdmScores[a.origIdx] ?? -Infinity;
  vb = stageIdmScores[b.origIdx] ?? -Infinity;
  break;
```

Use the same null handling pattern as existing `idm`.

- [ ] **Step 6: Render Stage IDM target banner**

Below the existing IDM target banner, add:

```tsx
{stageIdealDrawState && stageIdealDrawComp && (
  <div style={{
    fontSize: 12, color: "#333", background: "#f8fafc", border: "1px solid #cbd5e1",
    borderRadius: 5, padding: "6px 10px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  }}>
    <b style={{ color: "#0f172a" }}>Stage IDM target:</b>
    <span>
      {stageIdealDrawState.workingMonthLabel} · draw {stageIdealDrawState.targetStageDrawCount} of a {stageIdealDrawState.expectedDrawCount}-draw month · {stageIdealDrawState.comparableMonthCount} comparable month{stageIdealDrawState.comparableMonthCount === 1 ? "" : "s"} · descriptive alignment only
    </span>
    {MONTHLY_BUCKET_LABELS.map((label, idx) => (
      <span key={label} style={{
        background: idx === 0 ? "#f0f0f0" : "#e0f2fe",
        border: idx === 0 ? "1px solid #ccc" : "1px solid #7dd3fc",
        borderRadius: 3,
        padding: "1px 6px",
        fontWeight: stageIdealDrawComp[idx] > 0 ? 600 : 400,
        color: stageIdealDrawComp[idx] > 0 ? "#333" : "#aaa",
      }}>
        {label}={stageIdealDrawComp[idx]}
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 7: Add table header and cells**

After the `IDM` header, add:

```tsx
{renderMetricHeader("stageIdm", "Stage IDM", "Stage IDM measures how closely this candidate's bucket composition matches the next draw-stage target from comparable months. It is descriptive alignment, not a probability.")}
```

After the IDM cell, add:

```tsx
<td style={{ padding: "4px 6px", borderBottom: "1px solid #eee", verticalAlign: "top", textAlign: "center", fontWeight: stageIdmScores[origIdx] !== null && (stageIdmScores[origIdx] as number) >= 0.875 ? 700 : undefined }}>
  {stageIdmScores[origIdx] !== null ? `Top ${((stageIdmScores[origIdx] as number) * 100).toFixed(1)}%` : "—"}
</td>
```

- [ ] **Step 8: Run generated panel test**

Run:

```bash
npm test -- tests/generatedCandidatesPanel.test.ts
```

Expected: PASS.

---

### Task 6: Update Manual

**Files:**
- Modify: `public/user-manual.html`

- [ ] **Step 1: Add Stage IDM manual text**

Near the `IDM% Column — Ideal Draw Match` section, add:

```html
  <h3 id="stage-idm-column">Stage IDM Column — Stage-Conditioned Ideal Draw Match</h3>

  <p><strong>Stage IDM</strong> measures how closely a generated candidate's bucket composition matches the ideal draw mix for the next intra-month stage. If the working month has five loaded draws and the next draw is draw six, Stage IDM uses prior comparable months after their first six draws.</p>

  <p>The model first resolves the working month, the expected number of draws in that month, and the next target stage. It then uses only prior months with the same expected draw count. This makes Stage IDM a short-horizon bucket alignment diagnostic rather than a whole-month target.</p>

  <div class="warn-box">
    <strong>Honesty note:</strong> Stage IDM is not a calibrated next-draw probability. It is descriptive alignment to observed historical stage structure in comparable months.
  </div>
```

- [ ] **Step 2: Add column reference row**

In the column reference table, add:

```html
<tr><td><strong>Stage IDM</strong></td><td>Stage-conditioned Ideal Draw Match. See <a href="#stage-idm-column">Stage IDM Column</a>.</td></tr>
```

---

### Task 7: Final Verification

**Files:**
- No code changes unless verification exposes a bug.

- [ ] **Step 1: Run narrow tests**

Run:

```bash
npm test -- src/lib/monthlyDrawSummary.test.ts tests/monthlyDrawsSummaryStageIdm.test.ts tests/generatedCandidatesPanel.test.ts tests/generatedCandidatesIdmWiring.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Rollup/mathjs and chunk-size warnings are acceptable if unchanged.

- [ ] **Step 4: Browser validation**

Open/reload the local app in the in-app browser at the active localhost URL.

Verify:

- Monthly Draws Summary renders `Stage IDM`.
- Expected Draw Count selector shows `Auto` and observed draw-count options.
- Generated Candidates renders `Stage IDM` when stage state is available.
- Browser console has no fresh errors.

- [ ] **Step 5: Final status**

Report:

- Files changed.
- Tests/build/browser checks run.
- Whether Stage IDM is observe-only and does not alter generation/Rdy.
- Any warnings or limitations, especially thin comparable-month evidence.
