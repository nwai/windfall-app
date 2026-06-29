# Windfall HIG UI Guide

Windfall is a dense analytical app, so the design goal is not decoration. The design goal is calm control: users should understand where they are, what is real evidence, what is simulated, and what action is available next.

## Principles

- **Clarity first:** headings, controls, and table labels should say what they do without overstating the math.
- **Content-led layout:** panels should give data the most space. Decorative elements should be removed unless they improve orientation or status recognition.
- **Progressive disclosure:** keep advanced configuration collapsible, but make workflow navigation visible.
- **Accessible by default:** keyboard focus, visible labels, reachable help, sufficient contrast, and controls large enough to operate reliably.
- **Truthful language:** avoid prediction certainty unless a backtest or calibration supports it.

## Practical Checklist

- Use Helvetica/system sans-serif tokens from `src/index.css`.
- Use shared controls from `src/components/shared/HigControls.tsx` for new UI.
- Give every input a visible label or explicit `aria-label`.
- Do not rely on `title` text for essential explanations.
- Prefer `InfoHelp` for longer explanations that need to work with keyboard and touch.
- Keep buttons at or above the app's HIG target sizing unless inside a genuinely dense table.
- Make controls wrap into rows on narrow screens.
- Do not use color alone to communicate status.
- Keep generator panels visually findable with `windfall-generator-panel`.
- Use `WorkflowAnchor` and `AppWorkflowNav` when adding major workflow sections.
- Use the shared disclosure affordance on collapsible panels; do not reintroduce browser-default markers or panel-specific collapse icons.

## Review Questions

- Can a first-time user tell which workflow area they are in?
- Can a keyboard-only user reach the same explanation as a mouse user?
- Does the wording distinguish evidence, simulation, backtest, and calibrated probability?
- Does the panel still fit on mobile without overlapping or clipping important controls?
