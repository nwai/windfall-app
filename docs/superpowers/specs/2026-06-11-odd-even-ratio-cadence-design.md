# Odd/Even Ratio Cadence Design

## Purpose

Add an evidence-first panel that shows how odd/even draw ratios have appeared over time and how irregular or regular their observed intervals have been. The panel must help identify rare ratios such as `7:1`, `8:0`, `1:7`, and `0:8` without implying that a rare or overdue ratio is predictive.

## Product Language

- Panel title: `Odd/Even Ratio Cadence`
- Primary description: `Observed odd/even ratio cadence across the active draw window. Intervals describe history only; they are not calibrated predictions.`
- Use odd-first ratio labels everywhere, for example `5:3`, `7:1`, `8:0`.
- Avoid wording such as `due`, `expected next`, `likely`, or `prediction`.

## Placement

- Add the panel in the Signals workflow, immediately after `Odd/Even Ratio Filters`.
- Use a `CollapsibleSection` with `panelId="odd-even-ratio-cadence"` so it participates in panel favorites.
- Default collapsed state should be closed to preserve screen real estate.

## Scope Controls

The panel should support two scopes:

- `Mains + supps (8)` as the default because existing app ratio controls use all eight drawn numbers and rare ratios like `7:1` and `8:0` are naturally eight-number ratios.
- `Mains only (6)` for six-number analysis and comparison.

The active draw input is `filteredHistory`, so WFMQYH and range filters already determine the history window being analyzed.

## Analytics Module

Create a pure analytics module at `src/lib/oddEvenRatioCadence.ts`, with no React dependency.

Primary function:

```ts
analyzeOddEvenRatioCadence(draws, options)
```

Inputs:

- `draws`: chronological draw history.
- `scope`: `"mains-plus-supps"` or `"mains"`.
- `recentWindow`: default `50`, clamped to available valid draws.
- `rarePercentThreshold`: default `5`, configurable from `1` to `5`.

Validation:

- Use only finite integer numbers between `1` and `45`.
- De-duplicate numbers inside the selected scope for a draw.
- Skip a draw if it has fewer valid numbers than the expected scope size.
- Report `skippedDraws` so invalid data does not silently distort cadence.

Outputs:

- `validDraws`: number of draws included.
- `skippedDraws`: number of draws skipped.
- `totalNumbers`: `8` or `6`.
- `timeline`: one row per valid draw containing draw index, original date label, odd count, even count, and ratio.
- `ratios`: one row for every possible ratio from `0:totalNumbers` through `totalNumbers:0`.

Each ratio row should include:

- `ratio`
- `odd`
- `even`
- `count`
- `percent`
- `expectedPercent`
- `expectedCount`
- `observedMinusExpected`
- `lastSeenIndex`
- `lastSeenDate`
- `currentGap`
- `intervals`
- `meanGap`
- `medianGap`
- `longestGap`
- `intervalCv`
- `recentCount`
- `isRare`
- `isNeverSeen`
- `regularityLabel`

## Statistical Baseline

Use the exact no-replacement combinatorial baseline for a 6/45 lottery with 23 odd and 22 even numbers:

```text
P(O = o) = C(23, o) * C(22, k - o) / C(45, k)
```

where `k` is `8` for mains+supps and `6` for mains only.

This baseline is not a prediction. It is a neutral random-combination reference that helps distinguish genuinely rare ratio structures from ratios that merely look unusual.

## Interval Logic

- Intervals are measured in valid draws between consecutive appearances of the same ratio.
- `currentGap` is the number of valid draws since the ratio last appeared.
- If a ratio has never appeared, `currentGap` equals `validDraws` and interval metrics are unavailable.
- If a ratio appears once, interval metrics are unavailable because regularity cannot be measured from one occurrence.
- `intervalCv` is the coefficient of variation: interval standard deviation divided by mean interval.
- `regularityLabel` should be conservative:
  - `no observations`
  - `single observation`
  - `steady cadence` when at least three intervals exist and `intervalCv <= 0.5`
  - `uneven cadence` when at least two intervals exist and `intervalCv > 0.5`
  - `limited evidence` otherwise

## Rare-Ratio Definition

Mark a ratio as rare when:

- it has never appeared in the active window, or
- its observed percent is less than or equal to `rarePercentThreshold`.

The UI should visibly distinguish `never seen` from `rare but observed`.

## Component Design

Create `src/components/OddEvenRatioCadencePanel.tsx`.

The panel should contain:

- A compact control row with scope selector, recent-window selector, and rare-threshold selector.
  - The rare-threshold selector must offer `1%`, `2%`, `3%`, `4%`, and `5%`.
  - It defaults to `5%`.
- A pure SVG timeline chart:
  - x-axis: valid draw order from older to newer.
  - y-axis: odd/even ratio rows, ordered odd-heavy at the top and even-heavy at the bottom.
  - each draw shown as a small point on its ratio row.
  - selected ratio highlighted across the chart.
  - rare ratios use a distinct stroke or marker, but color must not be the only cue.
- A selected-ratio detail summary:
  - count and percent
  - expected percent
  - latest gap
  - longest gap
  - median gap
  - regularity label
- A compact diagnostics table:
  - ratio
  - count
  - observed %
  - expected %
  - current gap
  - mean gap
  - median gap
  - longest gap
  - recent count
  - regularity

The table should support selecting a ratio row. Sorting is optional for V1; the default order should keep the ratio rows stable and readable.

## UI/HIG Requirements

- Use Helvetica/system sans-serif inherited from the app.
- Use shared HIG controls where practical, especially `InfoHelp` for the truthfulness explanation.
- No hover-only essential help.
- Controls must wrap cleanly on mobile.
- Keep the panel dense but calm: no decorative chart treatment.
- Use status text alongside color for rare, never-seen, and selected states.

## Data Flow

`App.tsx` passes `filteredHistory` into `OddEvenRatioCadencePanel`.

The component:

1. Holds local UI state for scope, recent window, rare threshold, and selected ratio.
2. Calls `analyzeOddEvenRatioCadence` inside `useMemo`.
3. Renders empty-state messaging when no valid draws exist.
4. Does not mutate app generation settings in V1.

## Error Handling

- Empty history: show `No active draw history available.`
- All draws invalid for selected scope: show `No valid draws for this scope.`
- Some skipped draws: show a small provenance note with skipped count.
- Missing draw date: use `Draw #n`.
- Very small windows: still render counts, but label interval regularity as limited evidence.

## Tests

Add unit tests for `src/lib/oddEvenRatioCadence.ts`:

- ratio extraction for mains+supps and mains-only scopes.
- all possible ratio rows are emitted.
- exact combinatorial baseline probabilities sum to approximately 1.
- intervals, current gap, median gap, and longest gap are correct.
- never-seen and rare-but-observed ratios are distinguished.
- invalid draws are skipped and reported.

Add component tests:

- empty state renders.
- known history renders timeline/table labels.
- selecting a rare ratio updates the detail summary without changing app state.

Add app wiring test:

- `App.tsx` contains an `OddEvenRatioCadencePanel` in the Signals workflow after `Odd/Even Ratio Filters`.

## Verification

Before handing implementation back:

- Run the narrow new tests.
- Run `npm run typecheck`.
- Run `npm run build`.
- Validate the rendered panel in the in-app browser and check console errors.

## Non-Goals For V1

- Do not feed cadence results into candidate generation.
- Do not claim probability of the next draw.
- Do not add backtesting in this first pass.
- Do not add external charting dependencies.
