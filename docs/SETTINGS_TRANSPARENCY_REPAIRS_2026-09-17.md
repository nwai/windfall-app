# Settings Transparency Repairs

This implements the approved repair order from `SETTINGS_TRANSPARENCY_AUDIT_2026-09-17.md`. It is a correctness and disclosure pass, not evidence of improved lottery prediction.

## Changes

1. Autosave reads the latest committed settings, restores before saving, and reports storage failures. Manual repeat windows and Custom WFMQYH requests survive history/context changes.
2. Impossible manual repeat/strict/empirical minimums are retained and block generation with an explanation, rather than silently being lowered. Bounds of 0-8 remain because a candidate has eight numbers.
3. Last-draw bias now acts through positive sampling weights only: `1+bias` with a positive minimum, otherwise `1/(1+bias)`. Explicit overlap rules alone decide acceptance. Exactly 2 remains achievable at bias 5.
4. Carry-over Auto is an explicit opt-in. Selecting carry-over numbers no longer enables it. Neighbour 3x and drought quota rank weighting are separate, default-off controls, recorded in presets and new journal snapshots.
5. Monte Carlo trend defaults off and uses actual draw denominators. Count + 0.5 smoothing keeps unseen eligible numbers possible. Sampling is bounded and checks feasibility. Completed runs retain their own denominator and seed; changed evidence invalidates the displayed result.
6. Active Setup Summary includes a shared, expandable Effective Settings table. It distinguishes control/restored/automatic/fixed choices and records requested/applied settings, effects, scope and reasons. Standard generation Trace and new Prediction Journal snapshots use the same versioned ledger.
7. Standard worker generation records a random seed. Trace shows all 45 combined construction weights and their non-neutral components, computed once per run. Row-specific constructive weighting is reported separately. These are not inclusion or winning probabilities.
8. The opening-month baseline policy is date-based instead of permanently identifying May 2024 as incomplete. Only the earliest month is checked against its first scheduled Monday/Wednesday/Friday. Adding missing opening draws removes its exclusion. History views and the CSV retain the rows.

## Verification

- Full Vitest suite and focused generator, Monte Carlo, persistence, baseline and journal regressions.
- TypeScript typecheck and production build.
- Isolated Playwright desktop (1440px) and mobile (390px) validation, without using the user's browser profile or changing the source CSV.
- Browser change/wait/reload: Strong, Custom 13, manual repeat 9 retained; changing WFMQYH does not overwrite repeat 9.
- Browser worker run: generated output with model version, seed and per-number weights in Trace.
- Browser Monte Carlo: Trend Bias initially off; changing Runs from 1000 to 2000 leaves completed simulation percentages unchanged.
- No page or console errors observed in those browser scenarios.

## Boundaries

- This is not an exhaustive validation of every panel or every setting combination. The ledger covers main-generation controls and selected shared model assumptions; panel-local controls such as Monte Carlo also disclose their recipe locally.
- The opening-month check is not a complete-history certificate. Internal gaps and completed-month eligibility remain separate checks. Synthetic tests use explicit fixtures, never injected historical evidence.
- A seed requires identical history, inputs and code to reproduce a standard worker pool. It is not a universal replay guarantee for separate batch/RwR45 paths or historical journal entries.
- Existing predictions are not retroactively given settings they never recorded. Legacy presets lacking a ledger retain the broader Control source label.
- Vite still reports the existing large bundle and mixed static/dynamic generator-import warnings. This pass does not restructure the entire App module.
- Existing local work was preserved. No repository commit or push was made by this pass.
