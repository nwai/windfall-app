# Odd/Even Ratio Cadence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `Odd/Even Ratio Cadence` panel that shows observed odd/even ratio timelines and interval diagnostics across the active draw window.

**Architecture:** Put all statistics in a pure `src/lib/oddEvenRatioCadence.ts` module and keep rendering in `src/components/OddEvenRatioCadencePanel.tsx`. Wire the panel into `src/App.tsx` after the existing Odd/Even Ratio Filters panel. Use a pure SVG chart and no external charting dependency.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, existing app `Draw` type, shared HIG controls.

---

### Task 1: Analytics Module

**Files:**
- Create: `src/lib/oddEvenRatioCadence.ts`
- Test: `src/lib/oddEvenRatioCadence.test.ts`

- [ ] **Step 1: Write failing analytics tests**

Create `src/lib/oddEvenRatioCadence.test.ts` with tests that import:

```ts
import { describe, expect, it } from "vitest";
import { analyzeOddEvenRatioCadence, oddEvenCombinationProbability } from "./oddEvenRatioCadence";
import type { Draw } from "../types";
```

Cover these cases:

```ts
const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

it("builds mains plus supps cadence rows with all 8-number ratios", () => {
  const result = analyzeOddEvenRatioCadence([
    draw("2026-01-01", [1, 3, 5, 7, 9, 11], [2, 4]),
    draw("2026-01-02", [2, 4, 6, 8, 10, 12], [1, 3]),
  ]);

  expect(result.totalNumbers).toBe(8);
  expect(result.validDraws).toBe(2);
  expect(result.timeline.map((row) => row.ratio)).toEqual(["6:2", "2:6"]);
  expect(result.ratios.map((row) => row.ratio)).toEqual([
    "8:0", "7:1", "6:2", "5:3", "4:4", "3:5", "2:6", "1:7", "0:8",
  ]);
});

it("supports mains-only six-number ratios", () => {
  const result = analyzeOddEvenRatioCadence([
    draw("2026-01-01", [1, 3, 5, 2, 4, 6], [7, 9]),
  ], { scope: "mains" });

  expect(result.totalNumbers).toBe(6);
  expect(result.timeline[0].ratio).toBe("3:3");
  expect(result.ratios.map((row) => row.ratio)).toEqual([
    "6:0", "5:1", "4:2", "3:3", "2:4", "1:5", "0:6",
  ]);
});

it("computes exact combination baseline probabilities", () => {
  const probs = Array.from({ length: 9 }, (_, odd) => oddEvenCombinationProbability(odd, 8));
  expect(probs.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  expect(oddEvenCombinationProbability(8, 8)).toBeGreaterThan(0);
  expect(oddEvenCombinationProbability(9, 8)).toBe(0);
});

it("computes interval and current-gap diagnostics", () => {
  const result = analyzeOddEvenRatioCadence([
    draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
    draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D3", [1, 3, 5, 7, 9, 11], [2, 4]),
    draw("D4", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D5", [1, 3, 5, 7, 9, 11], [2, 4]),
  ]);

  const sixTwo = result.ratios.find((row) => row.ratio === "6:2");
  expect(sixTwo?.count).toBe(3);
  expect(sixTwo?.intervals).toEqual([2, 2]);
  expect(sixTwo?.currentGap).toBe(0);
  expect(sixTwo?.meanGap).toBe(2);
  expect(sixTwo?.medianGap).toBe(2);
  expect(sixTwo?.longestGap).toBe(2);
});

it("distinguishes never-seen and rare observed ratios using the selected threshold", () => {
  const result = analyzeOddEvenRatioCadence([
    draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
    draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D3", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D4", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D5", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D6", [1, 3, 5, 7, 2, 4], [6, 8]),
  ], { rarePercentThreshold: 20 });

  expect(result.ratios.find((row) => row.ratio === "6:2")?.isRare).toBe(true);
  expect(result.ratios.find((row) => row.ratio === "8:0")?.isNeverSeen).toBe(true);
});

it("skips invalid draws without silently changing the denominator", () => {
  const result = analyzeOddEvenRatioCadence([
    draw("bad", [1, 1, 2, 3, 4, 5], [6, 7]),
    draw("good", [1, 3, 5, 7, 9, 11], [2, 4]),
  ]);

  expect(result.validDraws).toBe(1);
  expect(result.skippedDraws).toBe(1);
  expect(result.timeline[0].dateLabel).toBe("good");
});
```

- [ ] **Step 2: Run analytics tests to verify RED**

Run:

```bash
npm test -- src/lib/oddEvenRatioCadence.test.ts
```

Expected: fail because `src/lib/oddEvenRatioCadence.ts` does not exist.

- [ ] **Step 3: Implement analytics module**

Create `src/lib/oddEvenRatioCadence.ts` with exported types, exact combination probability, valid draw normalization, timeline construction, interval statistics, rare flagging, and conservative regularity labels.

- [ ] **Step 4: Run analytics tests to verify GREEN**

Run:

```bash
npm test -- src/lib/oddEvenRatioCadence.test.ts
```

Expected: pass.

### Task 2: React Panel

**Files:**
- Create: `src/components/OddEvenRatioCadencePanel.tsx`
- Test: `tests/oddEvenRatioCadencePanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create component tests that render:

```tsx
<OddEvenRatioCadencePanel draws={[]} />
```

and a known draw history. Tests should assert empty state text, panel title, `Rare threshold` selector with options `1%` through `5%`, default `5%`, timeline/table labels, and detail update after selecting a rare ratio row.

- [ ] **Step 2: Run component tests to verify RED**

Run:

```bash
npm test -- tests/oddEvenRatioCadencePanel.test.tsx
```

Expected: fail because `OddEvenRatioCadencePanel` does not exist.

- [ ] **Step 3: Implement React panel**

Create `OddEvenRatioCadencePanel` with:

```ts
interface OddEvenRatioCadencePanelProps {
  draws: Draw[];
}
```

Use local state for `scope`, `recentWindow`, `rarePercentThreshold`, and `selectedRatio`. Use `useMemo` to call `analyzeOddEvenRatioCadence(draws, { scope, recentWindow, rarePercentThreshold })`. Render compact controls, SVG timeline, selected-ratio details, diagnostics table, provenance/skipped notes, and truthfulness copy via `InfoHelp`.

- [ ] **Step 4: Run component tests to verify GREEN**

Run:

```bash
npm test -- tests/oddEvenRatioCadencePanel.test.tsx
```

Expected: pass.

### Task 3: App Wiring

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/oddEvenRatioCadenceWiring.test.ts`

- [ ] **Step 1: Write failing app wiring test**

Create a text-level wiring test that asserts:

```ts
expect(appSource).toContain('import { OddEvenRatioCadencePanel } from "./components/OddEvenRatioCadencePanel";');
expect(appSource).toContain('panelId="odd-even-ratio-cadence"');
expect(appSource.indexOf('panelId="odd-even-ratio-filters"')).toBeLessThan(appSource.indexOf('panelId="odd-even-ratio-cadence"'));
expect(appSource).toContain('<OddEvenRatioCadencePanel draws={filteredHistory} />');
```

- [ ] **Step 2: Run wiring test to verify RED**

Run:

```bash
npm test -- tests/oddEvenRatioCadenceWiring.test.ts
```

Expected: fail before the app import/panel wiring exists.

- [ ] **Step 3: Wire the panel into App**

Import `OddEvenRatioCadencePanel` and add a closed-by-default `CollapsibleSection` immediately after Odd/Even Ratio Filters:

```tsx
<CollapsibleSection
  panelId="odd-even-ratio-cadence"
  title={<b>Odd/Even Ratio Cadence</b>}
  summaryHint="Observed ratio timeline and intervals"
  defaultOpen={false}
>
  <OddEvenRatioCadencePanel draws={filteredHistory} />
</CollapsibleSection>
```

- [ ] **Step 4: Run wiring test to verify GREEN**

Run:

```bash
npm test -- tests/oddEvenRatioCadenceWiring.test.ts
```

Expected: pass.

### Task 4: Verification and Browser QA

**Files:**
- No new implementation files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/oddEvenRatioCadence.test.ts tests/oddEvenRatioCadencePanel.test.tsx tests/oddEvenRatioCadenceWiring.test.ts
```

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: pass.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: pass, allowing existing non-fatal Vite/Rollup warnings.

- [ ] **Step 4: Browser QA**

Open the local app in the in-app browser, navigate to Signals, verify the panel is present, open it, check no console errors, confirm threshold selector offers `1%` to `5%`, and capture screenshot evidence.
