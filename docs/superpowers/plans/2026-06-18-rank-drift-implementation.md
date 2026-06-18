# Rank Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an observe-only Rank Drift tab to Scoring System Diagnostics that shows walk-forward rank and score movement without affecting generators.

**Architecture:** Implement a pure analytics module, `src/lib/scoringRankDrift.ts`, that calls `analyzeScoringSystemDiagnostics` at each historical cutoff and extracts the selected entity row. Add a Rank Drift tab to `ScoringSystemDiagnosticsPanel.tsx` that renders controls, a compact summary, optional sparkline, and a scrollable snapshot table. No generator files, candidate ranking files, simulation files, or shared generation state are modified.

**Tech Stack:** React 18, TypeScript, Vitest, existing Windfall draw/scoring types and HIG-inspired inline component styles.

---

### Task 1: Rank Drift Analytics

**Files:**
- Create: `src/lib/scoringRankDrift.ts`
- Create: `src/lib/scoringRankDrift.test.ts`
- Read: `src/lib/scoringSystemDiagnostics.ts`

- [ ] **Step 1: Write failing analytics tests**

Add tests that verify:

```ts
import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import { analyzeScoringRankDrift } from "./scoringRankDrift";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("scoring rank drift", () => {
  const history = [
    draw("1/1/26", [1, 2, 3, 4, 5, 6], [7, 8]),
    draw("1/3/26", [1, 2, 11, 12, 21, 22], [31, 32]),
    draw("1/5/26", [1, 11, 21, 31, 41, 2], [12, 22]),
    draw("1/7/26", [3, 13, 23, 33, 43, 4], [14, 24]),
    draw("1/10/26", [5, 15, 25, 35, 45, 6], [16, 26]),
    draw("1/12/26", [7, 17, 27, 37, 8, 18], [28, 38]),
  ];

  it("builds strict walk-forward snapshots without using future draws", () => {
    const result = analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "1",
      scope: "mains-plus-supps",
      startAfter: 2,
      step: "draw",
      filteredWindow: 2,
    });

    expect(result.snapshots.map((row) => row.drawCount)).toEqual([3, 4, 5, 6]);
    expect(result.snapshots[0].date).toBe("1/5/26");
    expect(result.snapshots[0].drawCount).toBe(3);
    expect(result.provenance.validDraws).toBe(6);
    expect(result.provenance.usedSnapshots).toBe(4);
  });

  it("reports progressing, regressing, flat, and insufficient-history directions", () => {
    expect(analyzeScoringRankDrift(history.slice(0, 2), {
      entity: "terminal-digits",
      key: "1",
      startAfter: 1,
    }).summary.direction).toBe("Insufficient history");

    expect(analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "1",
      startAfter: 2,
      filteredWindow: 2,
    }).summary.direction).toMatch(/Progressing|Regressing|Flat/);
  });

  it("returns warnings for invalid selected keys", () => {
    const result = analyzeScoringRankDrift(history, {
      entity: "terminal-digits",
      key: "99",
      startAfter: 2,
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.warnings).toContain("Selected item was not found in the available walk-forward snapshots.");
  });
});
```

- [ ] **Step 2: Run analytics tests and verify failure**

Run:

```bash
npm test -- src/lib/scoringRankDrift.test.ts
```

Expected: fail because `src/lib/scoringRankDrift.ts` does not exist.

- [ ] **Step 3: Implement analytics module**

Create `src/lib/scoringRankDrift.ts` with:

- exported entity and direction types
- `analyzeScoringRankDrift(draws, options)`
- snapshot generation from validated draw prefixes
- entity row extraction for numbers, terminal digits, digit sets, and straight runs
- summary metrics: current rank, best rank, worst rank, rank change, score change, recent score slope, volatility, direction
- warnings for invalid selection or insufficient snapshots

- [ ] **Step 4: Run analytics tests and verify pass**

Run:

```bash
npm test -- src/lib/scoringRankDrift.test.ts
```

Expected: all tests pass.

### Task 2: Rank Drift Panel Tab

**Files:**
- Modify: `src/components/ScoringSystemDiagnosticsPanel.tsx`
- Modify: `tests/scoringSystemDiagnosticsPanel.test.ts`

- [ ] **Step 1: Write failing panel tests**

Add tests that verify:

- the `Rank Drift` tab appears
- it renders observe-only / walk-forward language
- changing entity and item updates the selected summary
- snapshot rows render in a scrollable region

- [ ] **Step 2: Run panel tests and verify failure**

Run:

```bash
npm test -- tests/scoringSystemDiagnosticsPanel.test.ts
```

Expected: fail because `Rank Drift` tab is absent.

- [ ] **Step 3: Implement Rank Drift tab**

Add a `rank-drift` tab to `ScoringSystemDiagnosticsPanel.tsx` with:

- entity selector
- item input
- start-after selector
- step selector
- filtered-window selector
- observe-only explanation
- summary metrics
- accessible SVG or text sparkline
- scrollable snapshot table

The tab calls `analyzeScoringRankDrift(realHistory, options)` and never writes to generator state.

- [ ] **Step 4: Run panel tests and verify pass**

Run:

```bash
npm test -- tests/scoringSystemDiagnosticsPanel.test.ts
```

Expected: all tests pass.

### Task 3: Verification

**Files:**
- Verify only; no new implementation files.

- [ ] **Step 1: Run focused tests**

```bash
npm test -- src/lib/scoringRankDrift.test.ts src/lib/scoringSystemDiagnostics.test.ts tests/scoringSystemDiagnosticsPanel.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run full typecheck**

```bash
npm run typecheck
```

Expected: TypeScript exits `0`.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: build exits `0`; existing Vite/Rollup warnings may still appear.

- [ ] **Step 4: Browser smoke check**

Start the dev server:

```bash
npm run dev -- --host 127.0.0.1 --port 5176
```

Open `http://127.0.0.1:5176/`, confirm the app loads, `Scoring System Diagnostics` is present, and console errors are empty.

- [ ] **Step 5: Final report**

Report changed files, verification results, and reiterate that Rank Drift is observe-only and does not touch generator code.
