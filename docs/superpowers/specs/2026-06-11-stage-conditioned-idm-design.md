# Stage-Conditioned Ideal Draw Model Design

## Purpose

Add a second Ideal Draw Model that targets the next intra-month draw stage instead of the final whole-month shape. The model must answer a more precise question:

> Given the current working month state, what bucket mix would move this month closest to the historical state normally seen after the next draw number in comparable months?

For example, if June 2026 is a 13-draw month, five draws have already happened, and draw six is next, the model should compare the current June state against historical 13-draw months after their first six draws.

## Product Language

- Model name: `Stage IDM`
- Expanded label: `Stage-Conditioned Ideal Draw Match`
- Description: `Matches candidate bucket composition to the historical bucket state for the next draw stage in comparable months. Descriptive alignment only; not a calibrated prediction.`
- Avoid wording such as `will happen`, `guaranteed`, `due`, or `probability`.
- Use `stage target`, `comparable months`, `observed history`, and `bucket alignment`.

## Existing Model Relationship

Keep the existing IDM. It remains useful as a whole-month or robust monthly destination model.

Add Stage IDM beside it rather than replacing it:

- `IDM%`: alignment to the current Monthly Draws Summary robust target.
- `Stage IDM%`: alignment to the next-stage target from comparable months.

This lets the user compare the full-month destination against the next-draw-stage destination without hiding either signal.

## Core Definition

The model derives four planning values:

- `workingMonthLabel`: the effective planning month, for example `2026-06`.
- `expectedDrawCount`: the expected total draws in that month, for example `13`.
- `completedDrawCount`: how many draws are already loaded for the working month, for example `5`.
- `targetStageDrawCount`: the draw stage to model after the next draw, equal to `completedDrawCount + 1`, clamped to `expectedDrawCount`.

For the June 2026 example:

- `expectedDrawCount = 13`
- `completedDrawCount = 5`
- `targetStageDrawCount = 6`
- Comparable history = prior months with exactly `13` total draws
- Stage target = bucket distribution after the first `6` draws of those prior 13-draw months

## Expected Draw Count

Default behavior should infer the expected draw count automatically.

Inference order:

1. If the current working month exists in loaded draw history and already has a known total from grouped rows, use that when it is complete.
2. If the current month is in progress, infer the expected count from calendar rhythm when possible.
3. Use the app's observed month draw-count options as a fallback.
4. Expose a small override selector in Monthly Draws Summary so the user can choose the expected draw count manually.

The selector should show:

- `Auto` as the default.
- Observed monthly draw-count options from history.
- The resolved value, for example `Auto: 13 draws`.

Manual override must be visible in the UI and included in explanatory text so the user can tell whether the stage model is inferred or user-selected.

## Comparable-Month Filtering

Only use historical months that satisfy all of these:

- The month is before the working month.
- The month has exactly `expectedDrawCount` total draws.
- The month has at least `targetStageDrawCount` draws available.
- The opening partial history month remains excluded from baselines, consistent with the existing Monthly Draws Summary rules.

For each comparable month, build a partial month row from only its first `targetStageDrawCount` draws, then calculate the frequency bucket distribution:

- `0x`: numbers not drawn in those first N draws.
- `1x`: numbers drawn exactly once.
- `2x`: numbers drawn exactly twice.
- Continue through `8x+`.

## Stage Target Calculation

Use robust bucket targets, matching the current Monthly Draws Summary philosophy:

1. Collect each comparable partial-month bucket distribution.
2. Compute median bucket values by bucket.
3. Reconcile the resulting target distribution so bucket counts sum to `45`.
4. Use the reconciled distribution as the Stage IDM target.

The model should also expose diagnostics:

- comparable month count
- expected draw count
- target stage draw count
- whether expected draw count is auto or overridden
- stage target distribution
- quality warnings when evidence is thin

## Ideal Stage Draw Allocation

Use the existing exhaustive SSD helper:

```ts
computeIdealMonthlyDraw({
  currentDistribution,
  targetDistribution: stageTargetDistribution,
  drawSize: 8,
})
```

This produces the ideal 8-number bucket allocation for the next draw stage. It must be the basis for Stage IDM scoring.

## Scoring

For each generated candidate:

1. Map all 8 candidate numbers to the current working-month bucket sets.
2. Count candidate bucket composition.
3. Compare that composition to the ideal stage allocation.
4. Convert difference to a 0-100 alignment score using the same transparent distance logic as IDM.

Stage IDM is therefore:

- descriptive
- bucket-composition based
- stage-conditioned
- not a calibrated win probability

## UI Placement

### Monthly Draws Summary

Add a compact Stage IDM row or card near `Robust Baseline And Ideal Draw`.

It should show:

`Stage IDM: 2026-06 · Auto: 13-draw month · planning draw 6 · baseline: prior 13-draw months after 6 draws`

Show the stage target chips:

`0x=... 1x=... 2x=... 3x=... 4x=... 5x=... 6x=... 7x=... 8x+=...`

Show a short evidence note:

- `12 comparable months`
- `Thin evidence` when comparable month count is low
- `Unavailable` when no comparable months exist

### Generated Candidates

Add `Stage IDM` next to `IDM`.

The candidate table should include:

- `IDM`
- `Stage IDM`

The banner above the table should either show both targets or show the Stage IDM target in a second compact line:

`Stage IDM target: draw 6 of a 13-draw month; descriptive alignment only`

Sorting and filtering:

- Add Stage IDM as a sortable column.
- Do not include Stage IDM in the existing Rdy composite in V1 unless explicitly selected later.
- Do not change generation behavior in V1.

## Data Flow

Create a pure analytics helper in `src/lib/monthlyDrawSummary.ts` or a focused sibling module if the file becomes too crowded.

Suggested exported type:

```ts
interface StageIdealDrawState {
  bucketSets: MonthlyBucketSets;
  currentDistribution: number[];
  targetDistribution: number[];
  idealDrawBucketCounts: number[];
  workingMonthLabel: string;
  expectedDrawCount: number;
  targetStageDrawCount: number;
  completedDrawCount: number;
  comparableMonthCount: number;
  expectedDrawCountSource: "auto" | "override";
  warnings: string[];
}
```

Monthly Draws Summary should emit this state alongside the existing `MonthlyIdealDrawState`.

`App.tsx` should hold:

```ts
const [stageIdealDrawState, setStageIdealDrawState] = useState<StageIdealDrawState | null>(null);
```

Then pass it to `GeneratedCandidatesPanel`.

## Error Handling

- No active working month: Stage IDM unavailable.
- No comparable months: show unavailable state and no candidate Stage IDM scores.
- Target stage beyond expected month size: clamp to expected draw count and show a note.
- Expected draw count cannot be inferred: require Auto fallback to observed options and allow manual override.
- Fewer than three comparable months: show `Thin evidence`; still calculate, but label it clearly.
- Invalid or duplicate draw numbers: reuse existing Monthly Draws Summary validation rules.

## Statistical Integrity

- The model must not use the target draw or future draws from the working month.
- The current working month is excluded from comparable history.
- Comparable month partial rows must use only the first `targetStageDrawCount` draws of each historical month.
- The target is a robust historical stage profile, not a prediction.
- Candidate scores are alignment scores, not probabilities.

## Tests

Add analytics tests:

- A 13-draw current month with five completed draws targets stage six.
- Comparable history includes only prior 13-draw months.
- Comparable partial rows use only the first six draws when target stage is six.
- Months with other draw counts are excluded.
- Current working month is excluded from baseline history.
- Median/reconciled stage target sums to 45.
- Exhaustive ideal allocation is used for stage ideal bucket counts.
- No comparable months returns a clear unavailable state.

Add component/wiring tests:

- Monthly Draws Summary renders the Stage IDM evidence line.
- Manual expected draw-count override changes the resolved stage target.
- Generated Candidates receives `stageIdealDrawState`.
- Generated Candidates renders `Stage IDM` column and target text when state is available.
- Generated Candidates hides or blanks Stage IDM values when state is unavailable.

## Verification

Before handing implementation back:

- Run the new narrow tests.
- Run affected existing tests:
  - `src/lib/monthlyDrawSummary.test.ts`
  - `tests/generatedCandidatesPanel.test.ts`
  - `tests/generatedCandidatesIdmWiring.test.ts`
- Run `npm run typecheck`.
- Run `npm run build`.
- Validate the rendered Monthly Draws Summary and Generated Candidates panels in the in-app browser and check console errors.

## Non-Goals For V1

- Do not replace existing IDM.
- Do not feed Stage IDM into generation or Rdy automatically.
- Do not claim next-draw probability.
- Do not add backtesting in the first implementation pass.
- Do not add external charting dependencies.
