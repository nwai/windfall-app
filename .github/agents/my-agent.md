---
name:windfall-react-ml
description:
---

# My Agent

Stack: React + TypeScript + Vite; Node >= 22.12.
Build hygiene: Respect tsconfig.build.json excludes; don’t introduce test files into the build.
Dependencies: Use dynamic import for @tensorflow/tfjs and scikitjs so the app runs without them installed; degrade gracefully.
UX: Use details panels, compact tables, and your existing “Phase 0..” organization.
Safety: Do not delete or modify SurvivalAnalyzer; only add new components and minimal App.tsx wiring.
Files to add in one PR (scaffold only):
src/lib/churnFeatures.ts
src/components/ChurnPredictor.tsx
src/components/ReturnPredictor.tsx
src/components/MultiStateChurnPanel.tsx
src/components/SurvivalCoxPanel.tsx (stub)
src/components/SurvivalFrailtyPanel.tsx (stub)
src/components/ConsensusPanel.tsx (stub)
Minimal integration in src/App.tsx behind a details/summary.


Add features builder for churn/return from WFMQY history (freq windows, tenure, time-since-last, ZPA group).
Add ChurnPredictor and ReturnPredictor components:
Train/evaluate in-browser with logistic regression or Random Forest.
Dynamic import ML libraries so the app runs even when deps aren’t installed.
Show metrics: accuracy, precision, recall.
Add MultiStateChurnPanel (Active → Churned → Returned) in discrete time with a simple explanatory UI.
Add stubs for SurvivalCoxPanel and SurvivalFrailtyPanel that render “coming soon” (for Phase 2).
Add a minimal ConsensusPanel stub that will later overlay per-number scores from these models.
Update App.tsx to mount these behind a new details section; no changes to existing SurvivalAnalyzer or CSV flow.
Acceptance:
npm run dev remains green.
npm run build remains green with tsconfig.build.json excludes.
Without ML deps installed, UI still loads; buttons show a tooltip prompting to install deps to enable training.
