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
- Keep a table panel's collapsible title visible while its table is being reviewed.
- Treat the complete `thead` as one sticky header group so grouped or multi-row headings retain their order.
- Let ordinary data tables use the shared bounded scroll frame when their contents exceed its height limit.
- Reserve `windfall-table--custom-layout` for geometry-driven tables whose independent scrolling or row alignment would be broken by the shared table behavior.
- Make controls wrap into rows on narrow screens.
- Mirror shared adjustable settings from one owning state wherever related panels expose them. Show both the requested value and effective result, including Off, inactive stage, evidence-gate failure, or bypass. Use read-only summaries with an Edit link to the owning control instead of independent copies. Panel-local settings must be labelled local; do not overwrite historical counts, independent diagnostics, or unrelated constraints to make values look aligned.
- Do not use color alone to communicate status.
- Main panel titles inherit their workflow colour from the ownership manifest's `data-workflow-home`. Keep the navigation label and workflow heading aligned with that colour. Use the `--wf-workflow-*` tokens, retain the written labels, and keep text contrast at least 4.5:1 on the page and white surfaces. These colours identify location only, never reliability or status.
- Color number tokens only when the color names a specific fact in that surface, such as evidence source, temperature, monthly bucket, or main/supp role. Keep that fact visible in text, a label, or an accessible name; leave ordinary numbers neutral.
- When a number belongs to more than one source, use an explicit combined treatment and show both source labels. Do not invent a third color that hides the overlap.
- Preserve independent interaction state with a separate cue such as an outline, checkmark, or disabled treatment. Do not overwrite evidence color to show selection or exclusion.
- Use one visible title source per panel, usually the `CollapsibleSection` heading. Do not repeat the same panel title inside the panel body.
- When adding or renaming app-specific acronyms, compact table headings, diagnostic labels, or short controls, update `public/user-manual.html` in the same change. The glossary is the source of truth for terms such as `WFMQYH`, `OGA`, `IDM`, `Rdy`, `SDE1`, `HC3`, `LD±1`, `PNUaRW45`, `SelHits`, and `RecentHits`.
- For grouped form areas inside a dense panel, prefer a compact bordered group with the group label riding the border, using the Prediction Journal review-status treatment as the reference pattern. This preserves scan clarity without spending an extra title row.
- Keep generator panels visually findable with `windfall-generator-panel`.
- Use `WorkflowAnchor` and `AppWorkflowNav` when adding major workflow sections.
- Register every new collapsible panel in `src/lib/evidenceFamilyRegistry.ts`. Declare its workflow home, primary evidence family, role, permitted use, and dependencies before exposing it. Aggregators and cross-checks must not turn one underlying observation into multiple independent votes.
- Any cross-panel score must use the versioned evidence-portfolio rules from `src/lib/evidenceFamilyRegistry.ts`: cap by independence group, keep aggregator/consumer/user-state output context-only, and never alter included families or weights after a target result is known.
- Use the shared disclosure affordance on collapsible panels; do not reintroduce browser-default markers or panel-specific collapse icons.
- Start panels and nested setup cards closed. Do not restore disclosure state from browser storage; closing a panel must never disable or reset its settings. Explicit navigation and user actions can open their destination.
- Keep title help in the shared PanelHelp dialog and its versioned source descriptions in src/lib/panelHelp.ts. Describe effects, scope and validation limits without inventing reliability figures or treating help as a test run. Help must be accessible while the panel is closed and must not toggle its parent disclosure.

## Review Questions

- Can a first-time user tell which workflow area they are in?
- Can a keyboard-only user reach the same explanation as a mouse user?
- Does the wording distinguish evidence, simulation, backtest, and calibrated probability?
- Is the panel's evidence family registered, and are shared-data dependencies disclosed instead of double-counted?
- Does the panel still fit on mobile without overlapping or clipping important controls?
