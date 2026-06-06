# Windfall Hybrid Visual System Design

Date: 2026-06-04

## Approved Direction

Use a hybrid of **Swiss Ledger** and **Evidence Wall**.

- Swiss Ledger is the app operating system: generated candidates, filters, controls, DGA, grids, compact tables, and high-frequency workflows.
- Evidence Wall is the interpretation layer: undrawn patterns, month-end carry-over, adaptive shape, diagnostics, statistical explanations, and panels where the user needs to understand meaning before acting.
- Bauhaus influence appears only as functional state geometry: square for action or primary, circle for validated or stable, triangle for caution or conflict.

The app should feel like a serious analytical decision-support workspace, not a lottery-themed product, casino interface, marketing site, or decorative dashboard.

## Design Principles

1. **Form follows function**
   Every visual choice must improve orientation, comparison, action, or trust.

2. **Data first, decoration last**
   Tables, controls, and evidence panels stay visually quiet. Colour, geometry, and emphasis are reserved for state and decision points.

3. **Entry, Proof, Action**
   Each important panel should make the first read obvious:
   - Entry: what question or workflow is this panel for?
   - Proof: what data or evidence supports the state?
   - Action: what can the user do next?

4. **One typographic voice**
   Use Helvetica first, with platform-safe fallbacks:
   `Helvetica, "Helvetica Neue", Arial, sans-serif`.

5. **Achromatic default, semantic colour**
   The base UI is near-white, white, charcoal, black, and cool grey. Accent colour is semantic and sparing.

## Visual Tokens

### Typography

- Font family: `Helvetica, "Helvetica Neue", Arial, sans-serif`
- App title: 28-34px, 800 weight, tight line height
- Section title: 17-22px, 800 weight
- Panel title: 14-16px, 800 weight
- Table text: 12-13px, 500-700 weight depending on role
- Micro labels: 10-11px, 700-800 weight, uppercase, letter spacing around `0.06em`
- Body/help text: 12-13px, regular or 500, line height around 1.45

No viewport-scaled type. No decorative type. No negative letter spacing in implementation.

### Colour

- Ink: `#090b0d`
- Charcoal: `#171a1f`
- Text: `#111827`
- Muted text: `#66707d`
- Page background: `#f7f8fa`
- Surface: `#ffffff`
- Rule: `#d5d9df`
- Soft rule: `#eceff3`
- Primary blue: `#075fd8`
- Valid green: `#057a41`
- Caution amber: `#a86400`
- Stop/error red: `#bc2020`

Use blue for deliberate actions, green for validated/pass states, amber for caution/watch states, and red only for errors, invalid states, or blocking risks.

### Shape And Containers

- Primary surfaces use 1px borders and low radius, usually 2-4px.
- Avoid nested cards.
- Use full-width bands, tables, rails, and framed tools.
- Use cards only for repeated items, compact metrics, or truly separate evidence blocks.
- Avoid gradients, bokeh, decorative orbs, oversized rounded pills, glass effects, and heavy shadows.

### Spacing

- Global app gutters: 16-20px desktop, 12-14px mobile
- Panel internal spacing: 10-16px depending on density
- Dense control gaps: 6-10px
- Evidence Wall gaps: 14-20px for calmer reading
- Tables: stable row height, 30-38px depending on density

## App Layout

### App Shell

The app should move toward a stricter shell:

- Optional black left rail for major navigation or section grouping.
- Top title/status line with current draw history state, active WFMQYH window, latest draw, and data integrity status.
- Main content area using a two-zone layout where practical:
  - Ledger zone: dense controls, candidate tables, filters, DGA.
  - Evidence zone: explanatory state, diagnostics, next action guidance.

This can be implemented incrementally without rewriting the app router.

### Swiss Ledger Surfaces

Apply this treatment to:

- Generated Candidates
- Paste-Weighted Candidate Generator
- Candidate Generation Influences
- DGA grid and heatmaps
- Draw History Manager
- Window controls
- Constraint/filter panels
- Monthly Draw Summary tables where screen real estate is critical

Rules:

- Compact grid layout.
- Clear headers with strong horizontal rules.
- Numeric columns aligned.
- Controls use consistent sizing and direct labels.
- Actions are high contrast and visually distinct from filters.
- Hover/focus/selected states are visible but not flashy.

### Evidence Wall Surfaces

Apply this treatment to:

- Undrawn Patterns
- Month-end carry-over analysis
- Adaptive shape evidence
- Modulation diagnostics
- Survival analysis
- Ending digit sequences
- Statistical explanation or model-quality panels

Rules:

- Larger section headings.
- Three-beat internal structure where useful: what matters, proof, action.
- More negative space than generator panels.
- Short, direct explanatory copy.
- Evidence rows grouped by proximity and separated by clean rules.
- Colour marks only state or confidence, not decoration.

## Component Language

### Buttons

- Primary: black or blue fill, white text, 2-4px radius, bold uppercase or concise title case.
- Secondary: white surface, 1px ink or rule border.
- Destructive/error: red only where the action is destructive or invalid.
- Icon buttons should use familiar symbols where the command is already clear.

### Inputs And Selects

- Consistent height, border, font size, and focus ring.
- Avoid browser-default visual feel.
- Labels are close to controls and use proximity grouping.
- Disabled controls remain readable but clearly inactive.

### Tables

- Header row uses uppercase micro labels and a subtle grey band.
- Body rows use thin rules and compact vertical rhythm.
- Important scores use semantic colour only when it changes interpretation.
- Avoid zebra striping unless it materially improves scanning on very wide tables.
- Candidate numbers should be visually grouped and easy to compare.

### Metrics And Chips

- Chips are square or low-radius, not pill-heavy.
- Use chips for filters, ratios, profile labels, and compact state.
- Use metric blocks sparingly, preferably inside Evidence Wall areas.

### Collapsible Sections

- Summary rows should become stronger section headers.
- The open/closed state should be clear.
- Summary hints should be muted and concise.
- Section titles should use the new Helvetica hierarchy and ink colour, not saturated blue by default.

## Implementation Strategy

Implement in phases.

### Phase 1: Global Design System

- Replace empty global CSS with app tokens and base element styles.
- Set global Helvetica font stack.
- Normalize body background, text colour, buttons, inputs, selects, details, summary, tables, and focus states.
- Add utility classes for ledger surfaces, evidence surfaces, micro labels, status chips, and action bands.

### Phase 2: Shared Panel Shells

- Update `CollapsibleSection` and `InlineCollapsibleCard` to use the hybrid system.
- Add shared styles or components for:
  - ledger panel
  - evidence panel
  - metric strip
  - status chip
  - action band

### Phase 3: Primary Workflows

Apply Swiss Ledger treatment to:

- Generated Candidates
- Paste-Weighted Candidate Generator
- Candidate Generation Influences
- Draw History Manager

### Phase 4: Interpretation Panels

Apply Evidence Wall treatment to:

- Undrawn Patterns
- Month-end carry-over
- Ending digit sequences
- Modulation diagnostics
- Survival analysis

### Phase 5: DGA And Heatmaps

Preserve functional colour scales and data meaning.

- Improve shell, labels, and control grouping.
- Do not replace useful heatmap colours with the global palette when the colours encode data.
- Tighten table/grid chrome around the visual data.

## Responsive Behaviour

- Desktop: two-zone ledger/evidence layout where space allows.
- Tablet: stacked sections with sticky or repeated action controls where useful.
- Mobile: single-column flow, tables scroll horizontally, controls wrap without overlap.
- No text should overflow buttons, chips, table cells, or metric blocks.
- DGA and wide candidate tables may remain horizontally scrollable when preserving data structure is more honest than forcing a card layout.

## Accessibility

- Maintain strong text contrast.
- Use visible focus states.
- Do not rely on colour alone for status.
- Preserve semantic controls and table structure.
- Keep micro labels readable.

## Non-Goals

- No marketing landing page.
- No fake product hero.
- No decorative illustration system.
- No casino, gaming, jackpot, or entertainment styling.
- No full rewrite of analytical logic during the visual pass.
- No replacement of data-dense tables with cards where comparison is the main task.

## Testing And Verification

Minimum verification after implementation:

- Unit/render tests touched by component changes.
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- Browser or local rendered verification of:
  - app load
  - primary generator surface
  - Paste-Weighted Candidate Generator
  - one Evidence Wall panel
  - one DGA/heatmap surface
  - desktop and mobile viewport checks

Visual QA should check:

- Helvetica stack is applied.
- Panel hierarchy is clear at a glance.
- Dense tables remain readable.
- Evidence panels feel calmer and easier to scan.
- Semantic colour is consistent.
- No accidental overlaps, clipping, unreadable labels, or decorative clutter.
