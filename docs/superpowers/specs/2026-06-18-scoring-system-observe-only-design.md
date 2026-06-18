# Scoring System Observe-Only Design

## Purpose

Add a new observe-only scoring diagnostics panel that separates exact structural baselines from measured draw-history evidence. The panel should help inspect whether candidate-support ideas are mathematically coherent before any score is allowed to influence generation or ranking.

This is not a prediction panel. It reports ranked support, historical occurrence, and diagnostic scores across:

- odd/even ratios
- numbers `1` through `45`
- terminal digit groups
- terminal digit sets
- straight terminal digit runs

## Product Language

- Panel title: `Scoring System Diagnostics`
- Primary description: `Observe-only structural and history-derived scores. These diagnostics do not change candidate generation.`
- Use `terminal digit`, not `ending-family`.
- Use `Odd:Even` labels in odd-first order.
- Avoid wording such as `likely`, `guaranteed`, `ideal`, `prediction`, or `probability of next draw`.
- Use `base score`, `full-history score`, `WFMQYH score`, `observed count`, and `ranked support`.

## Placement

- Add the panel in the Signals workflow near the other diagnostics panels.
- Recommended location: immediately after `Odd/Even Ratio Cadence`, because this panel extends exact odd/even baseline math and then branches into terminal-digit diagnostics.
- Use a `CollapsibleSection` with `panelId="scoring-system-diagnostics"` so it participates in panel favorites.
- Default collapsed state should be closed to preserve screen real estate.

## Scope And Data Inputs

The panel consumes two histories:

- `realHistory`: all real validated draws, excluding simulated-only or fallback draws.
- `realFilteredHistory`: the active WFMQYH/range window, also excluding simulated-only or fallback draws.

Default scope is `Mains + supps (8)` because the user-provided odd/even probability blueprint is for eight drawn numbers. A scope selector should also support `Mains only (6)` for comparison, but the probability blueprint table should clearly identify when it is showing the eight-number model.

All calculations must skip invalid draws and report skipped counts. Invalid rows must not be silently repaired inside this panel.

## Score Separation

Every scored row should separate evidence sources:

- `Base score`: structural or exact-combinatorial score that does not depend on the active WFMQYH window.
- `Full-history score`: score derived from all real historical draws.
- `WFMQYH score`: score derived from the active filtered history window.
- `Combined diagnostic score`: a transparent display-only sum of the available pieces.

The combined score must not feed candidate generation in V1.

For history-derived scores, use occurrence percent on the same basis-point-like scale as the odd/even blueprint:

```text
score = observedPercent * 100
```

Examples:

- `30.05%` becomes `3005`.
- `7.50%` becomes `750`.
- a pattern absent from WFMQYH gets `0` for the WFMQYH score while retaining any base or full-history score.

Raw counts and sample sizes must be shown beside scores so users can see whether a score rests on enough observations.

## Odd/Even Ratio Diagnostics

For `Mains + supps (8)`, compute the exact no-replacement combinatorial baseline:

```text
P(O = o) = C(23, o) * C(22, 8 - o) / C(45, 8)
```

The eight-number blueprint rows are:

| Ratio | Total possible combinations | Baseline % | Base score |
|---|---:|---:|---:|
| `4:4` | `64,774,325` | `30.05%` | `3005` |
| `5:3` | `51,819,460` | `24.04%` | `2404` |
| `3:5` | `46,637,514` | `21.64%` | `2164` |
| `6:2` | `23,318,757` | `10.82%` | `1082` |
| `2:6` | `18,877,089` | `8.76%` | `876` |
| `7:1` | `5,393,454` | `2.50%` | `250` |
| `1:7` | `3,922,512` | `1.82%` | `182` |
| `8:0` | `490,314` | `0.23%` | `23` |
| `0:8` | `319,770` | `0.15%` | `15` |

For `Mains only (6)`, compute the same formula with draw size `6` and label the table as six-number scope. Do not reuse the eight-number blueprint scores in six-number mode.

Rows should include:

- ratio
- total possible combinations
- baseline percent
- base score
- full-history count and score
- WFMQYH count and score
- observed minus baseline in both full-history and WFMQYH windows
- combined diagnostic score
- rank within current table
- rank movement versus full-history rank, where available

## Number Diagnostics

Every number `1` through `45` has the same raw lottery inclusion probability in a fair 6/45 draw. The panel must not imply that a specific number is inherently more likely because it belongs to one terminal digit group.

The user-provided number score should be implemented as a `terminal digit base score`, not as an individual-number probability:

- Numbers with terminal digit `1`, `2`, `3`, `4`, or `5` receive `11.11`.
- Numbers with terminal digit `6`, `7`, `8`, `9`, or `0` receive `8.89`.

This score reflects terminal-digit availability structure, not a proven draw advantage.

Rows should include:

- number
- terminal digit
- terminal digit base score
- full-history occurrence count and score
- WFMQYH occurrence count and score
- recency note, if already available from existing shared utilities
- combined diagnostic score
- rank and rank movement

In V1, do not add new hot/cold or recency logic here unless it can reuse an existing tested utility without changing its semantics.

## Terminal Digit Set Diagnostics

Treat terminal digit sets as unordered unique digit sets. For example, `{0,1,2}` is the same set as `{2,1,0}`.

Generate every unordered terminal digit set of length `2` through `8` from digits `0` through `9`. There are exactly `1,002` sets:

| Set length | Unique unordered sets |
|---:|---:|
| `2` | `45` |
| `3` | `120` |
| `4` | `210` |
| `5` | `252` |
| `6` | `210` |
| `7` | `120` |
| `8` | `45` |
| Total | `1,002` |

For each draw, convert the selected draw numbers into a unique terminal digit set. Score exact set occurrence and length occurrence separately:

- `Full-history set score`
- `WFMQYH set score`
- `Full-history length score`
- `WFMQYH length score`

Rows should include:

- terminal digit set
- set length
- full-history set count and score
- WFMQYH set count and score
- full-history length count and score
- WFMQYH length count and score
- straight-run tag, if applicable
- combined diagnostic score
- rank and rank movement

The UI should avoid rendering all `1,002` rows at once without controls. Use compact filters:

- length selector
- `Observed only` toggle
- `Straight runs only` toggle
- top-N selector
- search by digit set text

## Straight Terminal Digit Runs

Straight runs should be treated as a tagged subset of unordered terminal digit sets in V1.

Because the panel treats sets as unordered, ascending and descending versions must not be double-counted. For example, `0,1,2` and `2,1,0` are the same diagnostic set. Across lengths `2` through `8`, this produces `42` unique straight-run sets:

| Run length | Unique unordered straight runs |
|---:|---:|
| `2` | `9` |
| `3` | `8` |
| `4` | `7` |
| `5` | `6` |
| `6` | `5` |
| `7` | `4` |
| `8` | `3` |
| Total | `42` |

The user-provided `84` count is still useful as an ordered reference, but it should not drive V1 scoring because order does not matter in the selected design. The panel can show a small reference note:

```text
Ordered reference: 84 ascending/descending labels. Observe-only scoring uses 42 unordered straight-run sets to avoid double counting.
```

## UI Design

Use a compact Apple HIG-inspired diagnostic surface:

- A top status strip showing:
  - scope
  - full real draw count
  - WFMQYH real draw count
  - skipped rows
  - `Observe-only` state
- A segmented control for:
  - `Ratios`
  - `Numbers`
  - `Terminal Digits`
  - `Digit Sets`
  - `Straight Runs`
- A short, keyboard/touch-accessible `InfoHelp` explanation for the active tab.
- Dense tables with sticky column headers where practical.
- No decorative graphs in V1 unless a small sparkline-like rank movement indicator can be added without crowding.
- Use color only as a secondary cue; pair color with score/rank text.

The panel must be readable at desktop widths and must wrap controls cleanly on mobile.

## Analytics Module

Create `src/lib/scoringSystemDiagnostics.ts` as a pure TypeScript module with no React dependency.

Primary function:

```ts
analyzeScoringSystemDiagnostics(realHistory, realFilteredHistory, options)
```

Options:

- `scope`: `"mains-plus-supps"` or `"mains"`
- `topN`: default `50`
- `digitSetLength`: optional filter
- `observedOnly`: default `true` for digit-set views
- `straightRunsOnly`: default `false`

Outputs:

- provenance summary:
  - full history valid draws
  - filtered valid draws
  - full history skipped draws
  - filtered skipped draws
  - scope
- ratio rows
- number rows
- terminal digit rows
- terminal digit set rows
- straight-run rows

Helper functions should be independently exported where tests benefit:

- `combination`
- `buildOddEvenBlueprint`
- `terminalDigitForNumber`
- `terminalDigitBaseScoreForNumber`
- `buildTerminalDigitSets`
- `isStraightTerminalDigitRun`
- `scoreFromPercent`

## Error Handling

- Empty full history: show an empty state and no full-history ranks.
- Empty WFMQYH history: show WFMQYH scores as `0` and explain that the active window has no valid real draws.
- Invalid draw rows: skip and report counts.
- Duplicate numbers inside a draw: skip that draw for the selected scope rather than repairing it.
- Missing supplemental numbers in eight-number scope: skip that draw for eight-number calculations, but allow it in mains-only scope if mains are valid.

## Tests

Add unit tests for `src/lib/scoringSystemDiagnostics.ts`:

- eight-number odd/even blueprint matches exact combination counts and scores.
- six-number odd/even blueprint is computed separately.
- ratio WFMQYH score is `0` when a ratio is absent from the active window.
- terminal digit base scores are applied to numbers as structure labels, not probability labels.
- all `1,002` unordered terminal digit sets are generated.
- exactly `42` unordered straight-run sets are identified across lengths `2` through `8`.
- duplicate terminal digits in a draw become one terminal digit set.
- invalid draw rows are skipped and reported.
- rank movement compares WFMQYH rank with full-history rank without lookahead.

Add component tests:

- panel renders observe-only language.
- tabs/segmented control switch between ratios, numbers, terminal digits, digit sets, and straight runs.
- empty and invalid-history states are visible.
- digit-set filters reduce visible rows without changing analysis totals.

Add app wiring tests:

- `App.tsx` passes `realHistory` and `realFilteredHistory`.
- `Scoring System Diagnostics` is wired after `Odd/Even Ratio Cadence`.
- the panel does not pass scores into generation settings or candidate ranking.

## Verification

Before handing implementation back:

- Run the new focused unit/component tests.
- Run affected existing diagnostics tests.
- Run `npm run typecheck`.
- Run `npm run build`.
- Validate the rendered panel in the in-app browser and check console errors.

## Non-Goals For V1

- Do not influence candidate generation.
- Do not influence generated-candidate ranking.
- Do not calibrate confidence labels.
- Do not backtest this scoring system.
- Do not treat terminal digit base score as individual-number probability.
- Do not double-count ascending and descending straight runs when scoring unordered digit sets.
- Do not render a huge unfiltered 1,002-row table as the default first view.

## Later V2 Direction

After V1 is inspected and tested, consider an optional influence layer:

- default off
- per-signal toggles
- visible weight sliders
- caps so no one diagnostic overwhelms generation
- source labels in candidate rows
- walk-forward tests before considering any default-on behavior

V2 should proceed only if V1 diagnostics prove understandable and mathematically coherent.
