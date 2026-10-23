# EP-1 Review: 7 October 2026 Draw

## Verdict

EP-1 has useful honesty safeguards, but this audit does not establish an
advantage over uniform number selection. There are concrete ranking and
information-design issues to repair before increasing its influence.

No production algorithm, saved prediction, exclusion, seed, or weight was
changed during this review. The result must not be used to retrospectively
promote Control 1 or to choose settings that fit this one draw.

## Source and Frozen Configuration

- Source: `src/windfall_history_lottolyzer.csv`, 374 accepted real draw rows,
  ending 7 October 2026. The portfolio history validator reported no warnings.
- Target mains: 22, 2, 16, 33, 1, 43. Supplementaries: 11, 6.
- Frozen portfolio: EP-1, target 2026-10-07, D3 of a 13-draw month.
- Freeze shown in the user's browser: 7 October 2026, 5:52:43 PM Melbourne.
- Evidence cutoff: 5 October 2026; 373 prior real draws, 367 baseline draws.
- WFMQYH: Custom 16, covering 31 August through 5 October 2026.
- Seed: 1; uniform proposal pool: 2,048; forced and excluded numbers: none.
- Current CSV contents and the browser's recorded result agree. This audit
  did not independently authenticate the results against the lottery operator.

Production replay from the prior CSV prefix reproduced all four frozen rows
exactly. The app's frozen family-removal alternatives also reproduced exactly.

## This Draw

| Row | Six mains | Two supplementary suggestions | All-eight hits | Main hits in the six played numbers |
| --- | --- | --- | --- | --- |
| Consensus Core | 22,24,31,34,35,38 | 14,28 | 1 | 1 |
| Independent Evidence | 14,16,21,22,29,32 | 2,37 | 3 | 2 |
| Stage Context, consensus fallback | 10,17,18,30,31,32 | 14,28 | 0 | 0 |
| Coverage Hedge | 9,17,25,26,27,43 | 8,20 | 1 | 1 |
| Control 1 | 1,27,29,33,43,45 | 13,24 | 3 | 3 |
| Control 2 | 6,7,18,20,23,45 | 11,21 | 2 | 0 |
| Control 3 | 3,13,18,22,23,36 | 2,9 | 2 | 1 |
| Control 4 | 8,13,24,30,35,37 | 9,27 | 0 | 0 |

Across all eight positions, EP-1 covered four distinct drawn numbers:
2, 16, 22, 43. The controls covered seven: 1, 2, 6, 11, 22, 33, 43.

Control 1 was the strongest six-main row for this result. It did not qualify
for a prize under the app's six-main ticket check: three mains alone do not
satisfy Division 5. Independent Evidence's third hit, 2, was in its additional
supplementary suggestions, not its six played numbers.

These checks assume each game played was its six listed mains. Playing an
eight-number system is a different ticket and coverage question.

The frozen ablations for this draw produced:

| Removed group | Mean eight-number hits without group | EP-1 minus alternative |
| --- | --- | --- |
| Frequency | 1.25 | 0 |
| Drought | 1.25 | 0 |
| Previous neighbours | 1.50 | -0.25 |

One result is an observation, not a decision rule.

## Historical Replay Method

The profile was fixed at the observed 16-draw window, seed 1, and no number
constraints. No windows, seeds, or weights were searched to fit the new draw.

The first 60 real draws were training-only. Each subsequent target was rebuilt
with only the real draws preceding it, using the production
`buildEvidencePortfolioCandidatesForReplay` path. There were 314 targets from
7 October 2024 through 7 October 2026, and no skipped targets.

The control rows were the exact frozen seed-1 controls. They remain unchanged
when seed and number constraints remain unchanged: production control
construction does not depend on historical evidence or target date. This is
one fixed control portfolio, not hundreds of independently reseeded controls.

All scored outcomes were actual CSV draws. Random proposals and control rows
are explicitly generated comparison inputs, never fabricated historical
results. The neutral expectations below were calculated analytically.

For family removal, the production private construction and selection
functions were exposed in memory without changing their calculations or
editing the app. The primary candidates were asserted equal to the exported
production replay for every one of the 314 targets before comparing removals.
No fictitious preset or historical freeze timestamp was created.

This is a retrospective, no-lookahead diagnostic. It is not independent
prospective validation of a model developed without seeing this history.
Rows within a portfolio are related; 1,256 rows are not 1,256 independent draws.

## Aggregate Results

| Metric | EP-1 | Fixed controls | Uniform mathematical reference |
| --- | --- | --- | --- |
| Mean hits across each row's eight numbers | 1.390 | 1.411 | 1.422 |
| Mean actual-main hits in the six played numbers | 0.768 | 0.797 | 0.800 |
| Mean correctly assigned supplementary hits | 0.077 | 0.100 | 0.089 |
| Prize rows, out of 1,256 six-main games | 18 | 10 | 14.7 expected |
| Mean distinct drawn numbers covered by the four-row union | 3.975 | 4.264 | Depends on union size |
| Mean four-row union size | 22.981 | 24 | Not a prediction metric |

EP-1's prizes were eight Division 5 and ten Division 6 rows. The controls had
two Division 4, one Division 5, and seven Division 6 rows. More small prizes in
this replay is worth monitoring, but is not enough to establish an advantage.

Across the latest 90 targets, EP-1 averaged 1.478 eight-number hits versus
1.433 for the controls, with eight prize rows versus one. This is a descriptive
recent subset, not an untouched holdout or evidence for tuning to recent wins.

The all-target month-weighted eight-hit difference was -0.034 hits per row.
Its approximate descriptive 95% range was -0.119 to +0.051. It includes no
difference. This range is not a formal promotion gate.

### Family Removal Across the Same Targets

| Group removed | Targets | Mean eight-number hits without group | EP-1 with-minus-without | Prize rows without group |
| --- | --- | --- | --- | --- |
| Frequency | 314 | 1.422 | -0.032 | 19 |
| Drought | 314 | 1.399 | -0.009 | 12 |
| Previous neighbours | 314 | 1.396 | -0.006 | 14 |
| Monthly stage | 0 active | Not applicable | Not applicable | Not applicable |

All three active groups' approximate month-level difference ranges included
zero. In the latest 90 targets, drought and neighbour support helped mean
eight-hit coverage modestly, while frequency support did not. The mixed
results do not justify deleting a family on the basis of this draw.

Family removal measures changes to the complete selection pipeline, including
interactions. It is not a calibrated probability or an isolated causal effect.

## Findings and Recommended Changes

### 1. Tighten score comparability and evidence admission

`src/lib/evidencePortfolio.ts:155` gives the top 12 frequency numbers declining
rank weights. Numbers with equal counts receive different scores because
numerical order breaks ties. A tied number at position 13 loses all frequency
support while position 12 retains it. This is deterministic ranking bias,
not additional evidence that one tied number is better.

Repair tie handling and expose the cutoff. A challenger could use continuous,
baseline-shrunk support rather than a hard top-12 cliff, but that replacement
must be tested rather than advertised as an improvement in advance.

`src/lib/evidencePortfolio.ts:169` gives every neighbour target support 1.
The resulting candidate contribution averaged 0.867 in this replay, versus
0.303 frequency and 0.201 drought. Equal upper bounds do not make their
effective contributions comparable. The construction strongly rewards
membership in a broad cloud without requiring validated incremental lift.

On this draw, the cloud contained 22 numbers. Winning numbers 2 and 43 were
frequency leaders but outside it; both received less combined support than
numbers also inside the cloud. This explains a structural preference, not a
guaranteed way to recover the result.

Test background-aware, capped family contributions and neutral fallback in a
versioned challenger. Do not choose a specific new multiplier from this draw.

### 2. Remove an inactive stage role's misleading practical redundancy

`src/lib/evidencePortfolio.ts:228` sends Stage Context back to consensus when
monthly evidence is unavailable. This is disclosed, but the role fell back
for all 314 tested targets. It is not currently a separate stage-led strategy.

Keep the monthly evidence gate. Do not lower it simply to make the role active.
Show the effective role prominently, and test an explicitly labelled coverage
fallback rather than another consensus selection. First-three-row selection
currently prevents duplicate rows but does not penalise number overlap; only
Coverage Hedge has an explicit novelty term.

### 3. Tighten the distinction between eight-number support and playable games

`src/lib/evidencePortfolio.ts:224` ranks all eight numbers, then assigns roles
at line 235. Six-main prize outcomes are evaluated separately at line 373.
Those are different objectives. This draw illustrates the distinction: 2 was
an eight-number hit but not part of the Independent Evidence six-main game.

Add per-row actual-main and actual-supplementary matches in the six played
numbers, alongside the existing all-eight and supplementary-role measures.
Retain both prediction and ticket evaluations; do not silently count the two
extra suggestions as part of a purchased six-number game.

Use the existing supplementary-policy replay to evaluate role changes. No
alternative supplementary method has been established as the winner by this
review.

### 4. Add a fixed-protocol joint replay, not more unvalidated votes

Expose comparative six-main, all-eight, supplementary-role, prize, union-size,
overlap, and family-removal results together. Use a declared bank of seeds
without selecting the best seed after a result. Freeze development choices,
then compare on later real draws with uncertainty and scope visible.

Rename Independent Evidence to Cross-group Support unless independence has
actually been demonstrated: its score counts declared-group support at line
226, not measured statistical independence.

Do not add terminal, temperature, or other correlated counts as extra votes
merely to increase the apparent consensus. Registered adapters must earn
incremental value without double-counting an existing source.

### 5. Keep the controls and timing safeguards

`src/lib/evidencePortfolio.ts:290` takes the first four uniform proposals as
controls. Control 1 is not a learner and is not adjusted from new history.
It had zero six-main prize rows across this fixed-profile replay, despite
being the best control for the current draw. Its latest success is not a
reason to promote it into a predictive method.

The same-day freeze is excluded from the formal journal family audit because
the physical draw time is not recorded. This is intentionally conservative,
not a corrupt or lost result. Adding reliably sourced draw-time cutoffs could
permit verifiable same-day pre-draw entries; do not retrospectively waive the
rule for this favourable or unfavourable outcome.

## Proposed Order

1. Fix tie fairness and clarify effective roles, controls, and ticket metrics.
2. Add the fixed-protocol comparative portfolio replay and preserve EP-1.
3. Test a new challenger with comparable, evidence-gated contributions and an
   explicit coverage fallback. Its strength must default to neutral when
   incremental value is not established.
4. Adopt changes only after later real outcomes support them. No fabricated
   outcomes, outcome-guided seed selection, or rewriting of frozen records.

## Verification

- 25 focused tests passed across Evidence Portfolio, Supplementary Policy
  Replay, and DGA supplementary suggestion.
- `npm run typecheck` passed.
- `npm run build` passed; existing bundle-size/static-dynamic import warnings
  remain and are unrelated to these selection results.
- Browser inspection found no captured warning/error entries.
- Complete generated replay ledgers were retained locally at
  `/tmp/windfall-ep1-oct08-fixed-profile-replay.json` and
  `/tmp/windfall-ep1-oct08-family-removal-replay.json`.

## Follow-Up Implementation and Fixed-Seed Comparison

The review above precedes implementation. The approved follow-up preserves EP-1
and saved rows, clarifies ticket match measures and role labels, freezes an
unplayed EP-R1 challenger in new records, and adds the EP-AUDIT-1 replay. EP-R1
tests tie-fair frequency support, a declared uncovered-field-share discount and
an explicit coverage fallback when stage evidence is unavailable. These are
fixed experimental heuristics, not calibrated predictions.

The follow-up replay retains the same newest-16-draw profile but uses all four
declared seeds (0, 1, 17, 42), not the most favourable seed. It tested 314 actual
targets with 60 prior draws, no user constraints, and no skipped targets. Every
generated row was scored against its real CSV target. The complete ledger is
`/tmp/windfall-portfolio-comparison-oct08.json`.

| Whole replay measure | EP-1 | EP-R1 | Uniform controls |
| --- | --- | --- | --- |
| Mean six-ticket actual-main matches | 0.757 | 0.771 | 0.799 |
| Mean all-eight matches | 1.372 | 1.393 | 1.416 |
| Six-ticket prize rows / 5,024 tested rows | 68 | 64 | 61 |
| Mean union size | 22.990 | 27.931 | 24.500 |
| Mean union hits | 3.971 | 4.886 | 4.339 |
| Exact union-size neutral reference | 4.087 | 4.965 | 4.356 |
| Mean within-portfolio pair overlap | 1.856 | 0.692 | 1.375 |

The chronological development block contains 219 targets (2024-10-07 through
2026-02-27); retrospective confirmation contains 95 (2026-03-02 through
2026-10-07). Confirmation mean main hits were 0.792 EP-1, 0.795 EP-R1 and
0.791 controls. EP-R1's confirmation prize count was lower than EP-1's (21 vs
26 out of 1,520 rows). The approximate month-level main-hit difference screen
over EP-1 spans -0.042 to +0.058. The screen verdict is **no stable challenger
advantage**, not a reason to promote EP-R1. It reduces repeated coverage but
does not establish better six-main prediction. Rows and seeds do not increase
the number of independent real targets, and this examined history is not an
untouched prospective holdout.

### Neighbour and Terminal Follow-Up Questions

On the same current CSV, excluding the partial opening month as a target but
retaining legitimate earlier context, 368 real targets were inspected:

- Immediate previous draw, unrestricted +/-1/+/-2: zero zero-hit targets.
  D2 has the highest average (4.72 observed vs 4.43 exact neutral expectation,
  29 targets). This is an ordinal observation, not proof of a robust uplift.
- +/-1 only: ten zero-hit targets. D9 has the most, but only two out of 28.
  Small counts do not support an automatic ordinal exclusion rule.
- Eligibility-filtered targets are a separate pool; the broad-cloud result
  does not contradict the user observing no hits in a narrower filtered set.
- Terminal effects need exposure-aware baselines because neighbour arithmetic
  directly creates ending-family relationships. Ending 0 and ending 5 have
  different family sizes and should not be merged into a predictive claim.
- Exact eight-number terminal count vectors have 22,935 feasible patterns;
  six-number vectors have 4,950. An eight-number repetition-shape quota would
  have only 18 feasible shapes. This is a future user-controlled quota idea,
  not an additional EP family vote or an implemented quota in this follow-up.
