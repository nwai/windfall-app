# Scoring Diagnostics Generation Influence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Scoring System Diagnostics into candidate generation as an explicit, user-controlled evidence weighting layer that defaults off and preserves hard constraints and quota truth.

**Architecture:** Add a pure scoring adapter that converts real-history diagnostics into serializable per-number and candidate evidence scores. The main generator receives only this serializable profile, applies it inside weighted construction after legal exclusions and before rejection filters, and annotates accepted candidates with transparent evidence traces. UI controls live in Candidate Generation Influences/App state and do not import panel components into generation code.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, existing worker-based candidate generation.

---

### Task 1: Pure Scoring Adapter

**Files:**
- Create: `src/lib/scoringGenerationInfluence.ts`
- Create: `src/lib/scoringGenerationInfluence.test.ts`
- Read: `src/lib/scoringSystemDiagnostics.ts`

- [ ] **Step 1: Write failing tests**

Add tests covering:

```ts
import { describe, expect, it } from "vitest";
import type { CandidateSet, Draw } from "../types";
import {
  buildScoringGenerationProfile,
  scoreCandidateWithScoringProfile,
  scoringInfluenceMultiplier,
} from "./scoringGenerationInfluence";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("scoring generation influence", () => {
  const fullHistory = [
    draw("1/1/26", [1, 2, 3, 4, 5, 6], [7, 8]),
    draw("1/3/26", [1, 11, 21, 31, 41, 2], [12, 22]),
    draw("1/5/26", [1, 11, 21, 31, 41, 3], [13, 23]),
    draw("1/7/26", [4, 14, 24, 34, 44, 5], [15, 25]),
  ];
  const filteredHistory = fullHistory.slice(-2);

  it("builds a serializable profile without probability language", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, {
      scope: "mains-plus-supps",
      influence: "normal",
    });

    expect(profile.enabled).toBe(true);
    expect(profile.scope).toBe("mains-plus-supps");
    expect(profile.influence).toBe("normal");
    expect(profile.numberScores[1]).toBeGreaterThan(profile.numberScores[40]);
    expect(profile.traceLabel).toContain("Scoring Diagnostics");
    expect(profile.traceLabel).toContain("evidence weighting");
    expect(profile.traceLabel).not.toMatch(/predict|probability|guarantee/i);
  });

  it("keeps off mode neutral", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, {
      scope: "mains-plus-supps",
      influence: "off",
    });

    expect(profile.enabled).toBe(false);
    expect(scoringInfluenceMultiplier(1, profile)).toBe(1);
  });

  it("scores candidates transparently from number, ratio, and terminal-digit-set evidence", () => {
    const profile = buildScoringGenerationProfile(fullHistory, filteredHistory, {
      scope: "mains-plus-supps",
      influence: "normal",
    });
    const candidate: CandidateSet = { main: [1, 11, 21, 31, 41, 4], supp: [14, 24] };

    const scored = scoreCandidateWithScoringProfile(candidate, profile);

    expect(scored.score).toBeGreaterThan(0);
    expect(scored.components.number).toBeGreaterThan(0);
    expect(scored.components.ratio).toBeGreaterThan(0);
    expect(scored.components.terminalDigitSet).toBeGreaterThan(0);
    expect(scored.trace.join(" ")).toContain("diagnostic evidence");
  });
});
```

- [ ] **Step 2: Run the new tests and verify failure**

Run:

```bash
npm test -- src/lib/scoringGenerationInfluence.test.ts
```

Expected: fail because `src/lib/scoringGenerationInfluence.ts` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `src/lib/scoringGenerationInfluence.ts` with exported:

```ts
export type ScoringGenerationInfluence = "off" | "light" | "normal" | "strong";

export interface ScoringGenerationProfile {
  enabled: boolean;
  influence: ScoringGenerationInfluence;
  scope: ScoringDiagnosticsScope;
  numberScores: Record<number, number>;
  numberMultipliers: Record<number, number>;
  ratioScores: Record<string, number>;
  terminalDigitSetScores: Record<string, number>;
  straightRunScores: Record<string, number>;
  traceLabel: string;
}

export function buildScoringGenerationProfile(
  realHistory: Draw[],
  realFilteredHistory: Draw[],
  options: { scope?: ScoringDiagnosticsScope; influence?: ScoringGenerationInfluence },
): ScoringGenerationProfile;

export function scoringInfluenceMultiplier(number: number, profile?: ScoringGenerationProfile): number;

export function scoreCandidateWithScoringProfile(
  candidate: CandidateSet,
  profile?: ScoringGenerationProfile,
): { score: number; normalizedScore: number; components: { number: number; ratio: number; terminalDigitSet: number; straightRun: number }; trace: string[] };
```

Use `analyzeScoringSystemDiagnostics` internally. Normalize number multipliers into bounded ranges:

- `off`: `1`
- `light`: `0.90` to `1.20`
- `normal`: `0.75` to `1.55`
- `strong`: `0.55` to `2.20`

- [ ] **Step 4: Run adapter tests**

Run:

```bash
npm test -- src/lib/scoringGenerationInfluence.test.ts
```

Expected: pass.

### Task 2: Generator and Worker Wiring

**Files:**
- Modify: `src/types.ts`
- Modify: `src/generateCandidates.ts`
- Modify: `src/workers/generateWorker.ts`
- Modify: `src/hooks/useGenerateWorker.ts`
- Test: `tests/generateCandidates.scoringInfluence.test.ts`

- [ ] **Step 1: Write failing generator tests**

Add tests verifying:

- off mode leaves candidate `scoreEvidence` undefined or zero
- enabled mode annotates accepted candidates
- selected odd/even quotas still match requested quotas after scoring weighting

- [ ] **Step 2: Run generator test and verify failure**

Run:

```bash
npm test -- tests/generateCandidates.scoringInfluence.test.ts
```

Expected: fail because generator does not accept scoring profile yet.

- [ ] **Step 3: Add candidate fields and generator option**

Extend `CandidateSet` with optional:

```ts
scoreEvidence?: number;
scoreEvidenceTrace?: string[];
```

Add an optional final `scoringGenerationProfile` parameter to `generateCandidates`, worker args, and sync fallback.

- [ ] **Step 4: Apply scoring during weighted construction and accepted annotation**

Inside `buildWeightedPool`, multiply each legal number by `scoringInfluenceMultiplier(n, scoringGenerationProfile)` after legal exclusions and existing active multipliers. When a candidate is accepted, call `scoreCandidateWithScoringProfile` and attach:

```ts
scoreEvidence: scored.normalizedScore,
scoreEvidenceTrace: scored.trace,
trace: [...(candidate.trace ?? []), ...scored.trace],
```

Keep all hard rejection filters and quota logic unchanged.

- [ ] **Step 5: Run generator tests**

Run:

```bash
npm test -- tests/generateCandidates.scoringInfluence.test.ts
```

Expected: pass.

### Task 3: App Controls and Final Survivor Sorting

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/candidates/GeneratedCandidatesPanel.tsx` if a visible score column already has a safe place; otherwise defer display to trace only.
- Test: `tests/scoringGenerationInfluenceWiring.test.ts`

- [ ] **Step 1: Write failing wiring tests**

Add static tests verifying:

- app has a `scoringGenerationInfluence` state defaulting to `"off"`
- worker args include `scoringGenerationProfile`
- generation trace uses “evidence weighting” and avoids probability wording
- post-generation odd/even quota application remains after final composite sorting

- [ ] **Step 2: Run wiring tests and verify failure**

Run:

```bash
npm test -- tests/scoringGenerationInfluenceWiring.test.ts
```

Expected: fail before app wiring exists.

- [ ] **Step 3: Wire app state**

Add:

```ts
const [scoringGenerationInfluence, setScoringGenerationInfluence] =
  useState<ScoringGenerationInfluence>("off");
```

Build profile with:

```ts
const scoringGenerationProfile = useMemo(
  () => buildScoringGenerationProfile(realHistory, realFilteredHistory, {
    scope: "mains-plus-supps",
    influence: scoringGenerationInfluence,
  }),
  [realHistory, realFilteredHistory, scoringGenerationInfluence],
);
```

Pass `scoringGenerationProfile.enabled ? scoringGenerationProfile : undefined` into worker args and batch calls.

- [ ] **Step 4: Add compact controls**

Place a compact selector in Candidate Generation Influences or the existing generation constraints control area:

```tsx
<label>
  Scoring diagnostics influence
  <select value={scoringGenerationInfluence} onChange={(event) => setScoringGenerationInfluence(event.target.value as ScoringGenerationInfluence)}>
    <option value="off">Off</option>
    <option value="light">Light</option>
    <option value="normal">Normal</option>
    <option value="strong">Strong</option>
  </select>
</label>
```

Visible copy must say “diagnostic evidence weighting” and “not a probability”.

- [ ] **Step 5: Use final survivor sorting safely**

When `processedCandidates.length > numCandidates`, include `scoreEvidence` as a tie-breaker after `finalCompositeAdj` and before OGA percentile. Do not sort across quota buckets after `applyOddEvenRatioQuotas`; keep quota selection as the final quota-preserving slice.

- [ ] **Step 6: Run wiring tests**

Run:

```bash
npm test -- tests/scoringGenerationInfluenceWiring.test.ts
```

Expected: pass.

### Task 4: Verification

**Files:** no new implementation files.

- [ ] **Step 1: Run focused tests**

```bash
npm test -- src/lib/scoringGenerationInfluence.test.ts tests/generateCandidates.scoringInfluence.test.ts tests/scoringGenerationInfluenceWiring.test.ts src/lib/scoringSystemDiagnostics.test.ts
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Browser smoke check**

Start Vite on an alternate port, open the app, verify the new selector is visible, the default is Off, and console errors are empty.

- [ ] **Step 5: Report**

Report files changed, verification output, and reiterate that scoring influence is default-off and labelled as diagnostic evidence, not calibrated probability.
