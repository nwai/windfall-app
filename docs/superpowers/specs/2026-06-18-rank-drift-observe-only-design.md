# Rank Drift Observe-Only Design

## Purpose

Add an observe-only movement timeline for Scoring System Diagnostics so a user can inspect whether diagnostic support for a number, terminal digit, terminal digit set, or straight-run set has strengthened, weakened, or stayed stable as real draw history accumulates.

This feature must not present rank drift as a prediction. It should describe historical diagnostic movement only:

```text
This signal's diagnostic support has strengthened/weakened over observed historical snapshots.
```

It must not say that a number, digit, or set is due, likely, guaranteed, or expected to appear next.

## Placement

Add the first version as a new tab inside `Scoring System Diagnostics`:

```text
Rank Drift
```

The existing Scoring System Diagnostics panel is the correct home because rank drift is a time-series view of the same observe-only scoring rows, not a generator control.

## V1 Scope

V1 should support:

- numbers `1` through `45`
- terminal digits `0` through `9`
- unique terminal digit sets
- straight terminal digit runs as a filtered subset of unique terminal digit sets

V1 must not influence candidate generation, generated candidate ranking, paste-weighted candidates, portfolio compression, selected-number boosts, or simulation behavior.

## Data Discipline

Use only real validated draw history. Exclude simulated-only, fallback, or invalid rows.

Use strict walk-forward snapshots:

1. Choose a starting cutoff where enough prior draws exist to compute meaningful diagnostics.
2. For each snapshot date, compute diagnostics using only draws at or before that cutoff.
3. Record each selected row's rank, combined diagnostic score, full-history score, WFMQYH score, and rank movement.
4. Move the cutoff forward by one draw and repeat.

No snapshot may use future draws relative to its cutoff. This protects the panel from lookahead bias.

## Snapshot Controls

Provide compact controls:

- `Entity`: `Numbers`, `Terminal digits`, `Digit sets`, `Straight runs`
- `Item`: entity-specific selector or search input
- `Scope`: `Mains + supps (8)` or `Mains only (6)`
- `Start after`: minimum number of prior draws before snapshots begin
- `Step`: `Every draw`, `Every 3 draws`, `Every month`
- `Window`: current WFMQYH window or all-history mode for the WFMQYH component

Default recommendations:

- entity: `Terminal digits`
- item: first ranked current row
- scope: `Mains + supps (8)`
- start after: `50` draws
- step: `Every draw`

## Metrics

For each snapshot, store:

- snapshot date
- draw index
- row key
- rank
- combined diagnostic score
- full-history score
- WFMQYH score
- rank movement versus full-history rank

For the selected item summary, compute:

- current rank
- best rank
- worst rank
- rank change from first available snapshot to current snapshot
- recent rank change over the last available WFMQYH-like slice
- score change from first available snapshot to current snapshot
- recent score slope
- volatility as the standard deviation of rank changes between adjacent snapshots

Direction labels:

- `Progressing`: recent rank improved by at least two places or recent score slope is positive while rank is stable.
- `Regressing`: recent rank worsened by at least two places or recent score slope is negative while rank is stable.
- `Flat`: neither progressing nor regressing.
- `Insufficient history`: fewer than three snapshots are available.

These labels are diagnostic movement labels only, not probability labels.

## UI Design

Use an Apple HIG-inspired diagnostic layout:

- A compact control strip at the top.
- A summary strip with current rank, best rank, worst rank, rank change, score change, volatility, and direction.
- A scrollable table for snapshots.
- A simple SVG or CSS sparkline for rank and score if it can be implemented accessibly and without heavy dependencies.

The rank sparkline should visually invert rank so upward movement means improvement. The table must still show the numeric values so color and shape are not the only cues.

Use language such as:

- `Rank drift`
- `Observed movement`
- `Diagnostic support`
- `Walk-forward snapshots`

Avoid language such as:

- `prediction`
- `probability`
- `expected next`
- `due`
- `signal guarantee`

## Implementation Boundaries

Create a pure analytics module for rank drift. Recommended file:

```text
src/lib/scoringRankDrift.ts
```

The module should depend on `scoringSystemDiagnostics.ts` for current row scoring behavior. It should not duplicate scoring formulas unless a tiny adapter is needed for entity selection.

Recommended exported function:

```ts
analyzeScoringRankDrift(draws, options)
```

Recommended options:

- `entity`: `"numbers" | "terminal-digits" | "digit-sets" | "straight-runs"`
- `key`: selected number, terminal digit, or terminal digit set key
- `scope`: `"mains-plus-supps" | "mains"`
- `startAfter`: number of prior valid draws before snapshots begin
- `step`: `"draw" | "weekly" | "month"`
- `filteredWindow`: optional WFMQYH-style slice size for the filtered score component

Recommended output:

- provenance summary
- selected item label
- summary metrics
- snapshot rows
- warnings for insufficient data or invalid selected key

## Testing

Add analytics tests for:

- no-lookahead behavior by checking that a late draw cannot affect early snapshots
- rank direction labels for progressing, regressing, flat, and insufficient history
- number, terminal digit, digit set, and straight-run entity selection
- invalid selected key handling
- month stepping without skipping the final current snapshot

Add panel tests for:

- tab renders observe-only language
- changing entity changes the item selector/search behavior
- selected item summary updates
- snapshot table is scrollable
- no generation controls are affected

## Future Extensions

After V1 is trustworthy, possible extensions are:

- compare two selected items side by side
- add export/copy snapshot rows
- add small multiples for top ten current movers
- backtest whether rank drift has any relationship to later candidate quality

Any future generator influence must require separate approval, explicit tests, and a backtest showing whether it improves over frequency-only and random baselines.
