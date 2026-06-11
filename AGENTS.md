# Windfall Contributor Guardrails

This repo is a React 18 + TypeScript + Vite app for lottery draw analysis, candidate generation, and diagnostic backtesting. Future contributors should treat accuracy, transparency, and usable information design as product requirements, not polish.

## UI / HIG Requirements

- Follow Apple Human Interface Guidelines-inspired principles: clarity, deference to content, progressive disclosure, immediate feedback, and accessible controls.
- Use the app's Helvetica/system sans-serif visual language. Do not introduce decorative UI that competes with the data.
- Prefer shared controls from `src/components/shared/HigControls.tsx` for new buttons, fields, and inline help.
- Avoid hover-only explanations. Any material explanation must be keyboard/touch accessible.
- Every input must have a visible label or an explicit accessible name.
- Interactive targets should be at least 32px high on dense desktop surfaces and 44px where touch use is likely.
- Keep panel layouts responsive. Dense tables are allowed, but surrounding controls must wrap cleanly on mobile.
- Use color as a secondary cue only. Pair status color with text, labels, or values.

## Truthfulness Requirements

- Do not present heuristic scores as predictions, probabilities, or guarantees unless they are empirically calibrated.
- Label simulated, synthetic, fallback, or diagnostic data explicitly.
- Guard against lookahead bias in analytics and backtests.
- Prefer measured language such as "evidence", "diagnostic", "ranked support", and "observed history" unless stronger claims are proven.

## Verification

Before handing work back, run the narrow tests for touched code plus:

```bash
npm run typecheck
npm run build
```

For rendered UI changes, also validate the app in the browser and check for console errors.

See `docs/HIG_UI_GUIDE.md` for the practical UI checklist.
