# Label And Manual Coverage Audit

Date: 2026-08-04

## Purpose

This audit checks whether user-facing Windfall acronyms, compact table headings, diagnostic labels, and short controls are defined in the user manual clearly enough for a new user to understand what they mean and whether they affect generation.

## Findings Addressed

- Corrected remaining visible `WFMQY` wording to `WFMQYH` in Window Stats, Adjacent Combos, Number Frequency tooltip text, and legacy workflow title helpers.
- Expanded the manual glossary into a broader `Glossary & Label Reference` covering high-risk short labels such as `LD±1`, `Prev±1`, `Dup±1`, `Sing±1`, `SelHits`, `RecentHits`, `MRB`, `GPWF`, `KDE`, `PNUaRW45`, `RwR45`, `PJFR`, `Use counts`, and `Use selected`.
- Added truthfulness language to the glossary so diagnostic labels are defined without implying prediction, probability, or validated lift.
- Added a contributor rule to `docs/HIG_UI_GUIDE.md`: any future acronym, compact column heading, diagnostic label, or short control must be added to the manual/glossary in the same change.

## Remaining Watch List

- Deep panel-specific labels can still drift if they are added without using shared controls or without updating the manual.
- Some legacy code identifiers still use `wfmqy` internally. Those are not user-facing labels and were left unchanged to avoid unnecessary behavioral churn.
- The manual is now better centralized, but future audits should still search rendered UI text before major releases.

## Suggested Release Checklist

- Search user-facing source for new all-caps labels and compact headings.
- Confirm every new short label exists in `public/user-manual.html`.
- Confirm labels that change generation are explicitly marked as hard filter, soft weighting, observe-only, or diagnostic.
- Run `npm run typecheck` and `npm run build`.
