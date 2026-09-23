# Windfall Settings Transparency Audit

Date: 17 September 2026

## Scope and conclusion

Read-only investigation of the current local working version, including uncommitted work. Application behavior and the user's saved browser state were not changed. This document records findings, not completed repairs.

**Yes: some settings activate automatically, some chosen values are overwritten, and some enabled features apply additional fixed weights without a separate user control.** There are also legitimate internal model constants. Those categories should not be confused.

The review followed state initialization, effects, persistence, component inputs, generation weights and rejection rules. It covered the main generator, drought and monthly governors, carry-over, neighbour support, Monte Carlo, temperature, DGA supplementary assignment, paste-weighted generation, and selected diagnostic models. It is not an exhaustive certification of every panel, imported preset, or combination of settings.

Priority: P1 means a correctness issue to repair first; P2 means a material behavior, transparency, or user-control issue.

## Findings

### 1. P1: Autosave can save initial defaults instead of current choices

Evidence: `src/App.tsx:2264`, `src/App.tsx:10281`.

The interval is installed once with an empty effect dependency list. Its callback closes over the first render's `buildSnapshot`, which reads that render's state. Marking a dirty ref does not refresh the captured state.

Browser reproduction in a separate, disposable browser context:

- Select Monthly Bucket Transition Governor = Strong.
- Verify the visible control reads `strong`.
- Wait through more than two autosave intervals.
- Inspect `app:autosave:v1`: it records the governor as `off`.

This is not just an undisclosed default. Settings can be lost on restart or an earlier saved setup overwritten with initial values. Explicitly saving a preset and saving a journal snapshot use different invocation paths; this finding does not establish that those paths have the same defect.

Recommended repair: keep a current snapshot callback/ref for the interval, coordinate restore-before-save, and add browser tests for change, wait, reload, and preset restoration.

### 2. P1: Last-draw match bias can secretly become an absolute filter

Evidence: `src/generateCandidates.ts:1338`, `src/App.tsx:9464`.

The UI accepts bias from 0 to 5 and calls it soft. When the minimum overlap is positive, the generator instead applies this acceptance test:

```text
acceptance = min(1, 1 - bias + bias * matches / 8)
```

At bias 2 and exactly two matches, acceptance is -0.5. At bias 5, it is -2.75. Both reject every such candidate, even though it passes the user's explicit Exactly 2 rule. Increasing Attempts cannot solve this conflict.

Controlled reproduction against the real generator, using a clearly synthetic eight-number fixture, a fixed random seed, and no other optional filters:

| Bias | Requested | Generated | Attempts |
|---|---:|---:|---:|
| 0 | 30 | 30 | 129 |
| 0.5 | 30 | 30 | 166 |
| 1 | 30 | 30 | 402 |
| 2 | 30 | 0 | 3,000 |
| 5 | 30 | 0 | 3,000 |

Recommended repair: define a genuinely positive, bounded soft weighting scheme across the supported range. Merely clamping a negative acceptance to zero would preserve the undisclosed hard filter, not fix it. Explicit overlap rules must remain the only source of hard overlap limits.

### 3. P2: History changes can overwrite manually chosen windows

Evidence: `src/App.tsx:2313`, `src/App.tsx:2868`.

- Every `history` change sets Custom WFMQYH count to the full history length. A user choosing Custom 13 can therefore lose that choice when history is updated.
- Whenever the active window size or current-month default changes, an effect replaces `repeatWindowSizeW` with that default. This also happens after the user has manually edited the lookback.

These are ongoing state assignments, not just first-use defaults. They can change both the evidence slice and the repeat-union rule without another edit to those controls.

An isolated browser reproduction confirmed the lookback overwrite: set Look back over newest draws to 9, then select Q in WFMQYH. The lookback became 6, despite Q containing enough draws to retain 9. This was replacement by the current-month default, not a necessary availability limit.

Recommended repair: separate automatic defaults from manual values. Preserve a manually chosen window, show its effective count when limited by available history, and provide an explicit reset/use-current-month action.

### 4. P2: Manual quota minimums can be reduced automatically

Evidence: `src/App.tsx:2874`, `src/App.tsx:3122`, `src/generateCandidates.ts:549`.

The repeat-pool minimum and strict/empirical drought manual minimums are clamped downward as eligible pools shrink. The drought generator also reduces the requested minimum after exclusions. Some effective-count changes are reported in Trace, but the App effects overwrite the stored manual value itself.

For example, a requested drought minimum of three becomes one when only one eligible number remains. Expanding the pool later does not restore the original request.

Recommended repair: retain requested and effective values separately. For an impossible manual hard minimum, explain the conflict and block generation unless the user explicitly accepts relaxation. Bounds preventing invalid number entry are still appropriate.

### 5. P2: Month-end carry-over can turn itself on

Evidence: `src/App.tsx:3997`, `src/App.tsx:4027`, `src/lib/monthEndCarryOver.ts:496`.

Until the control is marked manually touched, the app enables it when the planning draw is within the first three draws of the month and at least one eligible weight is above 1. Selecting or deselecting a carry-over number also sets the overall carry-over toggle to On. The resulting weights affect construction and survivor selection.

This is an existing, previously requested automatic behavior, not invented data. However, it does not meet a strict policy that every influence starts Off until explicitly enabled. The default selected carry-over strength is also Strong, although it only acts on selected carry-over numbers and its strength control is visible.

Recommended repair: make early-month auto-enabling an explicit opt-in mode. Keep selecting numbers separate from enabling the entire carry-over influence, or clearly confirm that combined action.

### 6. P2: Neighbour support and drought quotas include additional fixed boosts

Evidence: `src/lib/latestNeighbourSupport.ts:87`, `src/lib/strictDroughtQuotaAdvice.ts:112`, `src/lib/strictDroughtQuotaAdvice.ts:141`, `src/App.tsx:3054`, `src/generateCandidates.ts:929`.

| Feature enabled by the user | Additional internal behavior |
|---|---|
| Latest Neighbour Support | Eligible numbers receive a fixed 3x construction weight, in addition to the minimum-one rule. |
| Strict drought quota with a positive minimum | Rank-based weights run from 2x for first place to 1.125x for eighth place in a full eight-number shortlist. |
| Empirical drought quota with a positive minimum | The same rank-based weight schedule is applied independently of the strict quota and Drought Evidence Governor. |

These factors multiply. A number receiving all three maximum factors would have 12x relative weight from these sources alone, before other influences and normalization. That is not a 12x winning probability.

The manual mentions a neighbour construction boost but not its exact 3x factor. Drought quota UI emphasizes minimum counts, not these extra rank multipliers. Switching the separate Drought Evidence Governor Off does not disable boosts belonging to an enabled drought quota.

Recommended repair: expose the exact factors, distinguish quota-only from quota-plus-weighting, and include the combined per-number weighting breakdown in Trace. Do not present arbitrary rank multipliers as calibrated evidence.

### 7. P2: Monte Carlo starts with trend weighting enabled and uses mismatched windows

Evidence: `src/components/candidates/MonteCarloPanel.tsx:49`, `src/App.tsx:1313`, `src/App.tsx:3925`, `src/lib/trendBias.ts:21`.

Trend bias defaults On. Its exponential method and strength beta = 3 are fixed by the App. The caller supplies counts from six and thirteen draws, but the weighting function divides them by fourteen and thirty.

This is a real unit mismatch, not simply an advanced parameter lacking a slider. A controlled example with a number in every one of the latest thirteen draws gives a multiplier of approximately 0.985816 instead of the neutral 1 expected from equal occurrence rates in the two windows.

Recommended repair: pass actual denominators, handle short histories explicitly, then make the trend influence an explicit opt-in with its recipe visible. This finding concerns Monte Carlo's model; it does not establish a corresponding main-generator effect.

Additional Monte Carlo risks found during the review:

- Numbers absent from a nonempty active history receive zero sampling weight. That is an implicit exclusion, not just a lower preference (`MonteCarloPanel.tsx:83`).
- The sampling loop has no feasibility check when fewer than eight numbers have positive weight. This can occur with a one-draw window plus exclusions. Code inspection identifies a nontermination risk; the unsafe loop was not deliberately run (`:158`).
- Stored simulation counts are divided by the currently editable run count, not the run count that produced them. Editing runs can change displayed simulated percentages without a new simulation (`:118`).

These need correctness tests, not additional cosmetic controls.

### 8. P2: The baseline-history exclusion is dataset-specific

Evidence: `src/lib/monthlyAverageScope.ts:1`.

The incomplete-opening-month policy is encoded as May 2024. It is not a general completeness assessment of the loaded CSV. A different incomplete opening month is not covered by that rule; adding complete May 2024 data does not automatically remove its special treatment.

The current baseline labels do disclose the exclusion. The issue is the automatic policy when users import different histories, not a claim that all-history panels secretly discard the month.

Recommended repair: use a reviewed history-completeness policy and show which dates were excluded and why. Keep literal all real history distinct from a complete-month baseline.

## Other automatic or fixed choices

These are not all bugs. Several were deliberately requested earlier. They should be documented and surfaced as model configuration, not necessarily turned into dozens of sliders.

| Area | Choice made by code | Assessment |
|---|---|---|
| D1 Terminal Momentum SGI | Off/Light/Normal/Strong chosen internally after the user enables it; strength factors 1 / 1.12 / 1.25 / 1.45 (`src/lib/d1TerminalMomentumInfluence.ts:36`). | Intentional opt-in automation; default Off. Trace-visible, but the precise recipe should remain inspectable. |
| DGA auto supplementary assignment | Eight selected numbers receive algorithmic main/supp roles using active and full history (`src/App.tsx:3261`). | Previously requested automation. An optional Auto versus selection-order mode would offer more explicit control. Manual Prize Check remains a separate path. |
| Temperature classifications | Fixed EMA alpha 0.25, hybrid weight 0.6, ten bucket boundaries, four-draw trend lookback and other classification settings (`src/App.tsx:6936`, `:10087`). | Diagnostic model assumptions, not automatic forced numbers. Show the effective recipe and scope. |
| Paste-weighted adaptive shape | Small-window evidence uses a fixed latest-50-draw shrinkage target (`src/components/candidates/PasteWeightedCandidatesPanel.tsx:276`). | Deliberately approved baseline and displayed scope. Not a hidden universal generation rule. |
| Next-Draw Evidence Ensemble | Fixed feature windows, training thresholds, regularization and validation settings (`src/lib/nextDrawEvidenceEnsemble.ts:18`). | A fixed, versioned research model is reasonable. Keep its recipe visible; changing every parameter would increase overfitting risk. |
| Next Hot Blocks | Hybrid blend is 70% EMA / 30% latest value (`src/components/NextHotBlocksPanel.tsx:99`). | Diagnostic assumption; not an automatic exclusion by itself. |
| Monthly Bucket Transition Governor | Off/Auto/Light/Normal/Strong now available; manual factors 1.10 / 1.25 / 1.40, while stage eligibility and evidence thresholds remain fixed (`src/lib/monthlyBucketTransitionGovernor.ts:17`, `:491`). | Recent manual controls address the original strength-choice concern. Auto remains an explicit delegation, not proof of predictive skill. |
| Drought Evidence Governor | Explicit Off/Auto/Manual mode with family/bucket/weight controls in the current local implementation (`src/components/DroughtEvidenceGovernorControls.tsx`). | Improved control; does not remove independent drought-quota boosts described above. |
| Exclusion propagation and range validation | Ineligible selections are removed and numeric bounds enforced (`src/App.tsx:3156`). | Necessary safety behavior, but removed selections should have a clear explanation. |
| Preset restoration | Prior saved choices are loaded without entering every field again (`src/App.tsx:2231`). | Legitimate earlier user input. Distinguish it visibly from fresh defaults and fix autosave first. |

## Recommended repair order

1. Repair autosave and add persistence/reload tests.
2. Preserve manual window and quota requests across history/context changes; surface impossible requests rather than silently weaken them.
3. Repair the last-draw soft-bias formula and Monte Carlo window/results/feasibility defects.
4. Make carry-over auto-enabling explicit and separate quota requirements from extra construction boosts.
5. Add a shared Effective Settings ledger. For each active influence record requested value, applied value, source (manual, restored, automatic, fixed model), scope, trigger/reason, and effect (sampling, rejection, ranking, display only).
6. Save that same ledger with Trace and new Prediction Journal snapshots, including model versions. Record reproducible random seeds for controlled replay where supported.

A concise UI can disclose these details through a compact summary and accessible expandable details. Transparency does not require every internal constant to become editable.

## Verification and limitations

- The generator and trend-weighting reproductions imported the current local modules, rather than reimplementing them. Synthetic fixtures were used only for these tests and were not written to draw history.
- The autosave and lookback reproductions used Playwright in isolated browser contexts. Completed runs reported no page errors. They did not access or replace the user's normal browser storage. One intermediate script attempt stopped at a collapsed WFMQYH panel; opening the panel allowed the verification to complete.
- Source inspection established the automatic assignments and fixed model settings. Not every branch or setting combination was exercised in a browser.
- No application source was changed for this audit. Full typecheck/build/test-suite runs were not undertaken because this is an inspection report, not a repair or release validation.
- These findings concern correctness and control. They do not establish that changing a setting improves lottery prediction.
