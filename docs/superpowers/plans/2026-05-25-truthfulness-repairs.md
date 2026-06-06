# Truthfulness Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix result-producing logic that can mislead users through false similarity matches, synthetic history, mismatched prize rules, unbounded probabilities, and non-functional scoring controls.

**Architecture:** Keep changes local to the existing React/Vite modules. Add narrow regression tests for each behavior before touching production code, then implement the smallest compatible fix without broad UI rewrites.

**Tech Stack:** React 18, TypeScript, Vite, Vitest.

---

### Task 1: Bitmask Similarity Correctness

**Files:**
- Modify: `src/analytics.ts`
- Test: `tests/analytics.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  maxJaccard,
  maxJaccardBit,
  minHamming,
  minHammingBit,
  precomputeHistoryBitmasks,
  toBitmask,
} from "../src/analytics";
import type { CandidateSet, Draw } from "../src/types";

function draw(main: number[], supp: number[] = []): Draw {
  return { main, supp, date: "2026-01-01" };
}

describe("analytics bitmask helpers", () => {
  it("keeps high lottery numbers distinct instead of wrapping at 32 bits", () => {
    expect(toBitmask([1])).not.toEqual(toBitmask([33]));
    expect(toBitmask([9])).not.toEqual(toBitmask([41]));
  });

  it("matches set-based Hamming and Jaccard calculations for numbers above 31", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6]),
      draw([33, 34, 35, 36, 37, 38]),
      draw([9, 10, 11, 12, 13, 14]),
    ];
    const candidate: CandidateSet = {
      main: [33, 34, 35, 36, 37, 38],
      supp: [39, 40],
    };
    const masks = precomputeHistoryBitmasks(history);
    const candidateMask = toBitmask(candidate.main);

    expect(minHammingBit(candidateMask, candidate.main.length, masks)).toBe(
      minHamming(candidate, history)
    );
    expect(maxJaccardBit(candidateMask, candidate.main.length, masks)).toBe(
      maxJaccard(candidate, history)
    );
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest --run tests/analytics.test.ts`
Expected: FAIL because number bitmasks wrap/collide.

- [ ] **Step 3: Implement BigInt masks**

Change `toBitmask`, `popcount`, `HistoryBitmasks.mainMasks`, `minHammingBit`, and `maxJaccardBit` to use `bigint`.

- [ ] **Step 4: Run green test**

Run: `npx vitest --run tests/analytics.test.ts`
Expected: PASS.

### Task 2: Explicit Demo History Fallback

**Files:**
- Modify: `src/lib/fetchDraws.ts`
- Test: `tests/fetchDraws.demo.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildDemoDrawHistory } from "../src/lib/fetchDraws";

describe("buildDemoDrawHistory", () => {
  it("marks fallback rows as simulated and prevents main/supp overlap", () => {
    const rng = (n: number, min: number, max: number, exclude: number[] = []) => {
      const values: number[] = [];
      for (let x = min; x <= max && values.length < n; x += 1) {
        if (!exclude.includes(x)) values.push(x);
      }
      return values;
    };

    const rows = buildDemoDrawHistory(3, 6, 1, 45, rng, Date.UTC(2026, 0, 3));

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.isSimulated).toBe(true);
      expect(row.main).toHaveLength(6);
      expect(row.supp).toHaveLength(2);
      expect(new Set([...row.main, ...row.supp]).size).toBe(8);
    }
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest --run tests/fetchDraws.demo.test.ts`
Expected: FAIL because `buildDemoDrawHistory` does not exist.

- [ ] **Step 3: Implement explicit demo helper**

Add `buildDemoDrawHistory`, use `rng(2, min, max, main)` for supplementaries, mark rows `isSimulated: true`, and change fallback trace to say `DEMO MODE`.

- [ ] **Step 4: Run green test**

Run: `npx vitest --run tests/fetchDraws.demo.test.ts`
Expected: PASS.

### Task 3: Prize Division Consistency

**Files:**
- Create: `src/lib/prizeDivisions.ts`
- Test: `src/lib/prizeDivisions.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/candidates/GeneratedCandidatesPanel.tsx`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { computeWeekdayWindfallPrizeDivision } from "./prizeDivisions";

describe("computeWeekdayWindfallPrizeDivision", () => {
  const drawMain = new Set([10, 11, 12, 13, 14, 15]);
  const drawSupp = new Set([20, 21]);

  it("counts supplementary hits from the player's six main numbers", () => {
    expect(computeWeekdayWindfallPrizeDivision([10, 11, 12, 13, 14, 20], [1, 2], drawMain, drawSupp)).toBe("Div2");
  });

  it("awards Div6 for one or two main numbers plus both supplementaries", () => {
    expect(computeWeekdayWindfallPrizeDivision([10, 20, 21, 30, 31, 32], [1, 2], drawMain, drawSupp)).toBe("Div6");
    expect(computeWeekdayWindfallPrizeDivision([10, 11, 20, 21, 31, 32], [1, 2], drawMain, drawSupp)).toBe("Div6");
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest --run src/lib/prizeDivisions.test.ts`
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement shared helper and wire callers**

Create `computeWeekdayWindfallPrizeDivision` and `computeWeekdayWindfallPrizeScore`. Replace duplicate local prize division functions in app and candidate panel.

- [ ] **Step 4: Run green test**

Run: `npx vitest --run src/lib/prizeDivisions.test.ts`
Expected: PASS.

### Task 4: GPWF Recent Window Truthfulness

**Files:**
- Modify: `src/gpwf.ts`
- Test: `tests/gpwf.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { gpwfScore } from "../src/gpwf";
import type { CandidateSet, Draw, Knobs } from "../src/types";

function draw(main: number[]): Draw {
  return { main, supp: [], date: "2026-01-01" };
}

const knobs = {
  enableSDE1: false,
  enableHC3: false,
  enableOGA: false,
  enableGPWF: true,
  enableEntropy: false,
  enableHamming: false,
  enableJaccard: false,
  F: 0,
  M: 0,
  Q: 0,
  Y: 0,
  Historical_Weight: 0,
  gpwf_window_size: 3,
  gpwf_bias_factor: 0,
  gpwf_floor: 0,
  gpwf_scale_multiplier: 1,
  lambda: 0,
  octagonal_top: 9,
  exact_set_override: false,
  hamming_relax: false,
  gpwf_targeted_mode: false,
} satisfies Knobs;

describe("gpwfScore", () => {
  it("scores numbers from the most recent window higher than old-window numbers", () => {
    const history = [
      draw([1, 2, 3, 4, 5, 6]),
      draw([1, 2, 3, 4, 5, 6]),
      draw([1, 2, 3, 4, 5, 6]),
      draw([40, 41, 42, 43, 44, 45]),
      draw([40, 41, 42, 43, 44, 45]),
      draw([40, 41, 42, 43, 44, 45]),
    ];
    const oldCandidate: CandidateSet = { main: [1, 2, 3, 4, 5, 6], supp: [] };
    const recentCandidate: CandidateSet = { main: [40, 41, 42, 43, 44, 45], supp: [] };

    expect(gpwfScore(recentCandidate, history, knobs)).toBeGreaterThan(
      gpwfScore(oldCandidate, history, knobs)
    );
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest --run tests/gpwf.test.ts`
Expected: FAIL because GPWF reads the oldest window.

- [ ] **Step 3: Implement recent slice**

Change GPWF to use `history.slice(-window)` and include supplementaries consistently.

- [ ] **Step 4: Run green test**

Run: `npx vitest --run tests/gpwf.test.ts`
Expected: PASS.

### Task 5: Probability Output Honesty

**Files:**
- Modify: `src/components/SurvivalAnalyzer.tsx`
- Modify: `src/components/ReturnPredictor.tsx`
- Test: `tests/ReturnPredictor.test.ts`

- [ ] **Step 1: Write failing test for return-label readiness**

Use `tests/ReturnPredictor.test.ts` from Task 2 style to assert datasets with undefined `returnLabel` are not trainable.

- [ ] **Step 2: Run red test**

Run: `npx vitest --run tests/ReturnPredictor.test.ts`
Expected: FAIL because no exported readiness helper exists.

- [ ] **Step 3: Implement helper and UI guard**

Export `hasTrainableReturnLabels`, disable return training until labels exist, and clamp SurvivalAnalyzer biased probabilities to `[0, 1]`.

- [ ] **Step 4: Run green test**

Run: `npx vitest --run tests/ReturnPredictor.test.ts`
Expected: PASS.

### Task 6: Full Verification

**Files:** all touched files.

- [ ] **Step 1: Run focused tests**

Run: `npx vitest --run tests/analytics.test.ts tests/fetchDraws.demo.test.ts src/lib/prizeDivisions.test.ts tests/gpwf.test.ts tests/ReturnPredictor.test.ts`
Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Report remaining risks**

Document anything still requiring a second pass, especially OGA score orientation and full model calibration if not completed in this branch.
