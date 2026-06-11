# Copilot Instructions for Windfall App

## Project Overview

Windfall is a React + TypeScript application for lottery draw analysis, diagnostic backtesting, and candidate generation. The app is decision-support software for entertainment use, so mathematical honesty and data provenance are core requirements.

## Technology Stack

- React 18 with TypeScript
- Vite build tooling
- Vitest for tests
- ESLint for source linting
- Node `>=20.19.0 || >=22.12.0`

## Development Commands

```bash
npm run dev        # Start Vite dev server
npm run typecheck  # TypeScript no-emit check
npm run lint       # ESLint source files
npm run test       # Vitest test suite
npm run build      # TypeScript build check + Vite production build
```

## UI / Apple HIG-Inspired Standards

- Follow HIG principles: clarity, deference to content, progressive disclosure, visible feedback, and accessible controls.
- Use the Helvetica/system sans-serif design language defined in `src/index.css`.
- Prefer shared UI primitives from `src/components/shared/HigControls.tsx` for new buttons, fields, and inline help.
- Do not rely on hover-only `title` text for essential explanations. Use visible copy or `InfoHelp`.
- Every input must have a visible label or an explicit accessible name.
- Keep controls large enough to operate reliably: 32px minimum in dense desktop surfaces, 44px where touch use is likely.
- Make panels responsive with wrapping controls and no overlapping text.
- Use color as a secondary cue; pair it with text, labels, icons, or values.
- Major workflow sections should be reachable from `AppWorkflowNav` and marked with `WorkflowAnchor`.

## Truthfulness Standards

- Do not describe heuristic rankings as predictions, probabilities, or certainty unless they are empirically calibrated.
- Label simulated, synthetic, fallback, diagnostic, and backtested data explicitly.
- Backtests must avoid lookahead bias by using only history available before the evaluated draw.
- Prefer wording such as "evidence", "diagnostic", "observed", and "ranked support" when the result is not calibrated probability.
- Do not add fake data, mock results, or placeholder logic.

## Code Standards

- Use functional React components and hooks.
- Keep expensive derived values in `useMemo` when they operate over draw history, generated candidates, or large tables.
- Prefer small, focused utility functions for statistical and parsing logic.
- Avoid `any`; use domain types or `unknown` with explicit narrowing.
- Keep edits scoped to the requested workflow and avoid unrelated refactors.

## Verification

- Run relevant focused tests for changed code.
- Run `npm run typecheck` and `npm run build` before reporting completion when practical.
- For rendered UI changes, validate in the browser and check for console errors.
