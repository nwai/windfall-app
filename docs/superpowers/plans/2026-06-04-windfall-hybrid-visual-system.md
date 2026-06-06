# Windfall Hybrid Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Swiss Ledger × Evidence Wall visual system to Windfall’s core app shell, shared panel chrome, primary generator workspace, and one interpretation panel without changing analytical logic.

**Architecture:** Implement a global CSS token layer first, then move shared shell components onto semantic class names. Apply the Swiss Ledger treatment to generator surfaces and the Evidence Wall treatment to interpretation panels through class-based styling, leaving data calculations and candidate algorithms untouched.

**Tech Stack:** React, TypeScript, Vite, Vitest, React DOM server rendering tests, CSS in `src/index.css`.

---

## Scope Check

The approved spec covers an app-wide visual system. This plan implements the first production slice:

- Global Helvetica-led token system.
- Shared collapsible panel chrome.
- App title/status line.
- Paste-Weighted Candidate Generator as a Swiss Ledger proof surface.
- Undrawn Patterns as an Evidence Wall proof surface.
- Render tests, typecheck, full tests, lint, build, and browser/local rendered QA.

Generated Candidates, Candidate Generation Influences, DGA, and the remaining evidence panels are left for follow-up implementation slices after this first visual system lands safely.

## File Structure

- Modify `src/index.css`: global design tokens, base element styles, shared utility classes.
- Modify `src/App.css`: remove Create React App boilerplate styling so it does not conflict with the visual system.
- Modify `src/components/shared/CollapsibleSection.tsx`: class-based Swiss/Evidence-compatible section wrapper.
- Modify `src/components/shared/InlineCollapsibleCard.tsx`: class-based inline disclosure card.
- Modify `src/App.tsx`: replace the inline monospace app root and emoji title with the Windfall app shell/header classes.
- Modify `src/components/candidates/PasteWeightedCandidatesPanel.tsx`: apply Swiss Ledger classes while preserving generator behaviour.
- Modify `src/components/UndrawnPatternsPanel.tsx`: apply Evidence Wall classes while preserving statistics.
- Create `tests/hybridVisualSystem.test.tsx`: render tests for shared shell and representative panel class contracts.
- Modify `tests/pasteWeightedCandidatesPanel.test.ts`: assert the Paste-Weighted panel exposes ledger styling hooks.
- Modify `tests/undrawnPatternsPanel.test.ts`: assert Undrawn Patterns exposes evidence-wall styling hooks.

## Task 1: Add Visual Contract Tests

**Files:**
- Create: `tests/hybridVisualSystem.test.tsx`
- Modify: `tests/pasteWeightedCandidatesPanel.test.ts`
- Modify: `tests/undrawnPatternsPanel.test.ts`

- [ ] **Step 1: Create the shared visual system render test**

Create `tests/hybridVisualSystem.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "../src/components/shared/CollapsibleSection";
import { InlineCollapsibleCard } from "../src/components/shared/InlineCollapsibleCard";

describe("hybrid visual system shell", () => {
  it("renders collapsible sections with Windfall section classes", () => {
    const html = renderToStaticMarkup(
      <CollapsibleSection title="Generated Candidates" summaryHint="Dense table" defaultOpen>
        <div>Body</div>
      </CollapsibleSection>,
    );

    expect(html).toContain("windfall-section");
    expect(html).toContain("windfall-section__summary");
    expect(html).toContain("windfall-section__title");
    expect(html).toContain("windfall-section__hint");
    expect(html).toContain("Generated Candidates");
    expect(html).toContain("Dense table");
  });

  it("renders inline collapsible cards with Windfall card classes", () => {
    const html = renderToStaticMarkup(
      <InlineCollapsibleCard title="DGA grid" subtitle="Heatmap and simulation" defaultExpanded>
        <div>Grid body</div>
      </InlineCollapsibleCard>,
    );

    expect(html).toContain("windfall-inline-card");
    expect(html).toContain("windfall-inline-card__button");
    expect(html).toContain("windfall-inline-card__title");
    expect(html).toContain("windfall-inline-card__subtitle");
    expect(html).toContain("DGA grid");
    expect(html).toContain("Heatmap and simulation");
  });
});
```

- [ ] **Step 2: Add Paste-Weighted ledger assertions**

In `tests/pasteWeightedCandidatesPanel.test.ts`, add these assertions to the existing `"renders the paste-weighted candidate controls without seeded fake input"` test:

```tsx
expect(html).toContain("windfall-ledger-panel");
expect(html).toContain("windfall-action-band");
expect(html).toContain("windfall-status-strip");
```

- [ ] **Step 3: Add Undrawn Patterns evidence assertions**

In `tests/undrawnPatternsPanel.test.ts`, add these assertions to the first render test that creates `UndrawnPatternsPanel` with history:

```tsx
expect(html).toContain("windfall-evidence-panel");
expect(html).toContain("windfall-evidence-wall");
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
npm test -- tests/hybridVisualSystem.test.tsx tests/pasteWeightedCandidatesPanel.test.ts tests/undrawnPatternsPanel.test.ts
```

Expected result: tests fail because the new class names do not exist yet.

- [ ] **Step 5: Commit visual contract tests**

```bash
git add tests/hybridVisualSystem.test.tsx tests/pasteWeightedCandidatesPanel.test.ts tests/undrawnPatternsPanel.test.ts
git commit -m "test: add hybrid visual system render contracts"
```

## Task 2: Establish Global Hybrid CSS

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.css`

- [ ] **Step 1: Replace `src/index.css` with global tokens and shared classes**

Replace the entire contents of `src/index.css` with:

```css
:root {
  --wf-font-sans: Helvetica, "Helvetica Neue", Arial, sans-serif;
  --wf-ink: #090b0d;
  --wf-charcoal: #171a1f;
  --wf-text: #111827;
  --wf-muted: #66707d;
  --wf-page: #f7f8fa;
  --wf-surface: #ffffff;
  --wf-rule: #d5d9df;
  --wf-soft-rule: #eceff3;
  --wf-primary: #075fd8;
  --wf-valid: #057a41;
  --wf-caution: #a86400;
  --wf-danger: #bc2020;
  --wf-radius: 4px;
  --wf-radius-tight: 2px;
  --wf-shadow-subtle: 0 1px 0 rgba(9, 11, 13, 0.04);
}

* {
  box-sizing: border-box;
}

html {
  background: var(--wf-page);
  color: var(--wf-text);
  font-family: var(--wf-font-sans);
}

body {
  margin: 0;
  min-width: 320px;
  background: var(--wf-page);
  color: var(--wf-text);
  font-family: var(--wf-font-sans);
  font-size: 13px;
  line-height: 1.45;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border-radius: var(--wf-radius-tight);
}

input,
select,
textarea {
  border: 1px solid var(--wf-rule);
  border-radius: var(--wf-radius-tight);
  background: var(--wf-surface);
  color: var(--wf-text);
}

input:focus-visible,
select:focus-visible,
textarea:focus-visible,
button:focus-visible,
summary:focus-visible,
a:focus-visible {
  outline: 2px solid var(--wf-primary);
  outline-offset: 2px;
}

table {
  font-family: var(--wf-font-sans);
}

.windfall-app-shell {
  max-width: 1720px;
  padding: 18px;
  color: var(--wf-text);
  font-family: var(--wf-font-sans);
}

.windfall-app-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: end;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 3px solid var(--wf-ink);
}

.windfall-app-title {
  margin: 0;
  color: var(--wf-ink);
  font-size: 32px;
  font-weight: 800;
  line-height: 0.95;
}

.windfall-app-subtitle {
  margin-top: 5px;
  color: var(--wf-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.windfall-app-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.windfall-micro-label {
  color: var(--wf-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.windfall-primary-button,
.windfall-secondary-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 11px;
  border-radius: var(--wf-radius-tight);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-decoration: none;
  text-transform: uppercase;
  cursor: pointer;
}

.windfall-primary-button {
  border: 1px solid var(--wf-primary);
  background: var(--wf-primary);
  color: #ffffff;
}

.windfall-secondary-button {
  border: 1px solid var(--wf-ink);
  background: var(--wf-surface);
  color: var(--wf-ink);
}

.windfall-section {
  margin-top: 12px;
  border-top: 1px solid var(--wf-rule);
}

.windfall-section__summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 0;
  cursor: pointer;
}

.windfall-section__title {
  color: var(--wf-ink);
  font-size: 16px;
  font-weight: 800;
}

.windfall-section__hint {
  color: var(--wf-muted);
  font-size: 11px;
  font-weight: 700;
}

.windfall-section__body {
  padding: 2px 0 8px;
}

.windfall-inline-card,
.windfall-ledger-panel,
.windfall-evidence-panel {
  border: 1px solid var(--wf-rule);
  border-radius: var(--wf-radius);
  background: var(--wf-surface);
  box-shadow: var(--wf-shadow-subtle);
}

.windfall-inline-card {
  overflow: hidden;
}

.windfall-inline-card__button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--wf-soft-rule);
  background: var(--wf-surface);
  color: var(--wf-ink);
  text-align: left;
  cursor: pointer;
}

.windfall-inline-card__title {
  color: var(--wf-ink);
  font-size: 14px;
  font-weight: 800;
}

.windfall-inline-card__subtitle,
.windfall-inline-card__summary,
.windfall-inline-card__toggle {
  color: var(--wf-muted);
  font-size: 12px;
}

.windfall-inline-card__toggle {
  font-weight: 800;
  white-space: nowrap;
}

.windfall-inline-card__summary {
  padding: 0 12px 10px;
}

.windfall-ledger-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.windfall-evidence-panel {
  padding: 14px;
}

.windfall-evidence-wall {
  display: grid;
  gap: 14px;
}

.windfall-action-band {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--wf-rule);
  border-radius: var(--wf-radius);
  background: var(--wf-surface);
}

.windfall-status-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.windfall-status-chip {
  border: 1px solid var(--wf-rule);
  border-radius: var(--wf-radius-tight);
  background: #fbfcfd;
  padding: 7px 8px;
  color: var(--wf-text);
  font-size: 12px;
}

.windfall-status-chip strong {
  display: block;
  color: var(--wf-ink);
  font-size: 15px;
  line-height: 1.1;
}

.windfall-state-valid {
  color: var(--wf-valid);
}

.windfall-state-caution {
  color: var(--wf-caution);
}

.windfall-state-danger {
  color: var(--wf-danger);
}

@media (max-width: 760px) {
  .windfall-app-shell {
    padding: 12px;
  }

  .windfall-app-header {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .windfall-app-actions {
    justify-content: flex-start;
  }

  .windfall-app-title {
    font-size: 27px;
  }
}
```

- [ ] **Step 2: Replace `src/App.css` with a no-conflict file**

Replace the entire contents of `src/App.css` with:

```css
/* App-specific styles live in index.css and component classes. */
```

- [ ] **Step 3: Run style contract tests**

Run:

```bash
npm test -- tests/hybridVisualSystem.test.tsx tests/pasteWeightedCandidatesPanel.test.ts tests/undrawnPatternsPanel.test.ts
```

Expected result: tests still fail because components do not emit the class names yet.

- [ ] **Step 4: Commit global CSS system**

```bash
git add src/index.css src/App.css
git commit -m "style: add Windfall hybrid visual tokens"
```

## Task 3: Update Shared Panel Chrome

**Files:**
- Modify: `src/components/shared/CollapsibleSection.tsx`
- Modify: `src/components/shared/InlineCollapsibleCard.tsx`
- Test: `tests/hybridVisualSystem.test.tsx`

- [ ] **Step 1: Replace `CollapsibleSection.tsx` with class-based markup**

Replace `src/components/shared/CollapsibleSection.tsx` with:

```tsx
import React, { useEffect, useState } from "react";

interface CollapsibleSectionProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summaryHint?: string;
  storageKey?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  summaryHint,
  storageKey,
}) => {
  const derivedKey = storageKey ?? (typeof title === "string" ? `cs-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const effectiveDefault = derivedKey ? false : defaultOpen;

  const [open, setOpen] = useState<boolean>(() => {
    const key = derivedKey;
    if (!key) return effectiveDefault;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (saved === "true") return true;
    if (saved === "false") return false;
    return effectiveDefault;
  });

  useEffect(() => {
    if (!derivedKey) return;
    window.localStorage.setItem(derivedKey, open ? "true" : "false");
  }, [open, derivedKey]);

  const handleToggle: React.ReactEventHandler<HTMLDetailsElement> = (event) => {
    setOpen(event.currentTarget.open);
  };

  return (
    <details open={open} onToggle={handleToggle} className="windfall-section">
      <summary className="windfall-section__summary">
        <span className="windfall-section__title">{title}</span>
        {summaryHint ? <span className="windfall-section__hint">{summaryHint}</span> : null}
      </summary>
      <div className="windfall-section__body">{children}</div>
    </details>
  );
};

export default CollapsibleSection;
```

- [ ] **Step 2: Replace `InlineCollapsibleCard.tsx` with class-based markup**

Replace `src/components/shared/InlineCollapsibleCard.tsx` with:

```tsx
import React, { useState } from "react";

interface InlineCollapsibleCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  collapsedSummary?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  keepMounted?: boolean;
  collapsedLabel?: React.ReactNode;
  expandedLabel?: React.ReactNode;
  onExpandedChange?: (value: boolean) => void;
}

export const InlineCollapsibleCard: React.FC<InlineCollapsibleCardProps> = ({
  title,
  subtitle,
  collapsedSummary,
  children,
  defaultExpanded = false,
  expanded,
  keepMounted = false,
  collapsedLabel = "Show",
  expandedLabel = "Hide",
  onExpandedChange,
}) => {
  const [internalExpanded, setInternalExpanded] = useState<boolean>(defaultExpanded);
  const isControlled = typeof expanded === "boolean";
  const isExpanded = isControlled ? expanded : internalExpanded;

  const handleToggle = (): void => {
    const next = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  };

  return (
    <div className="windfall-inline-card">
      <button
        type="button"
        onClick={handleToggle}
        className="windfall-inline-card__button"
        aria-expanded={isExpanded}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span className="windfall-inline-card__title">{title}</span>
          {subtitle ? <span className="windfall-inline-card__subtitle">{subtitle}</span> : null}
        </span>
        <span className="windfall-inline-card__toggle">
          {isExpanded ? expandedLabel : collapsedLabel}
        </span>
      </button>

      {!isExpanded && collapsedSummary ? (
        <div className="windfall-inline-card__summary">{collapsedSummary}</div>
      ) : null}

      {(isExpanded || keepMounted) ? (
        <div style={{ display: isExpanded ? "block" : "none" }} aria-hidden={!isExpanded}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

export default InlineCollapsibleCard;
```

- [ ] **Step 3: Run shared shell tests**

Run:

```bash
npm test -- tests/hybridVisualSystem.test.tsx
```

Expected result: `tests/hybridVisualSystem.test.tsx` passes.

- [ ] **Step 4: Run focused panel tests**

Run:

```bash
npm test -- tests/pasteWeightedCandidatesPanel.test.ts tests/undrawnPatternsPanel.test.ts
```

Expected result: Paste-Weighted and Undrawn visual assertions still fail until those panels are updated.

- [ ] **Step 5: Commit shared panel chrome**

```bash
git add src/components/shared/CollapsibleSection.tsx src/components/shared/InlineCollapsibleCard.tsx tests/hybridVisualSystem.test.tsx
git commit -m "style: update shared Windfall panel chrome"
```

## Task 4: Apply The App Shell Header

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the root app wrapper and title block**

In `src/App.tsx`, replace this block:

```tsx
return (
  <div style={{ fontFamily: "monospace", padding: 20, maxWidth: 1700 }}>
    <ToastContainer position="top-right" duration={1600} />
    <h2>
      🇦🇺 Weekday Windfall – Set Generator{" "}
      <span style={{ fontSize: 16, color: "#666" }}>for entertainment use only</span>
      <label style={{ marginLeft: 12, fontSize: 12 }} title="Toggle verbose trace logging">
        <input type="checkbox" checked={traceVerbose} onChange={(e) => setTraceVerbose(e.target.checked)} style={{ marginRight: 6 }} />
        Trace verbose
      </label>
      <a
        href="/user-manual.html"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginLeft: 16,
          display: "inline-block",
          padding: "4px 14px",
          borderRadius: 20,
          background: "#1a237e",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
          fontFamily: "sans-serif",
          letterSpacing: "0.3px",
        }}
        title="Open User Manual in a new tab (also downloadable from there)"
      >
        📖 Manual
      </a>
    </h2>
```

with:

```tsx
return (
  <div className="windfall-app-shell">
    <ToastContainer position="top-right" duration={1600} />
    <header className="windfall-app-header">
      <div>
        <h1 className="windfall-app-title">Windfall</h1>
        <div className="windfall-app-subtitle">
          Weekday set generator / decision support / entertainment use only
        </div>
      </div>
      <div className="windfall-app-actions">
        <label className="windfall-secondary-button" title="Toggle verbose trace logging">
          <input
            type="checkbox"
            checked={traceVerbose}
            onChange={(event) => setTraceVerbose(event.target.checked)}
            style={{ marginRight: 6 }}
          />
          Trace
        </label>
        <a
          href="/user-manual.html"
          target="_blank"
          rel="noopener noreferrer"
          className="windfall-primary-button"
          title="Open User Manual in a new tab"
        >
          Manual
        </a>
      </div>
    </header>
```

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected result: TypeScript passes.

- [ ] **Step 3: Commit app shell header**

```bash
git add src/App.tsx
git commit -m "style: apply Windfall app shell header"
```

## Task 5: Apply Swiss Ledger Styling To Paste-Weighted Generator

**Files:**
- Modify: `src/components/candidates/PasteWeightedCandidatesPanel.tsx`
- Test: `tests/pasteWeightedCandidatesPanel.test.ts`

- [ ] **Step 1: Update the root section class**

In `PasteWeightedCandidatesPanel.tsx`, change:

```tsx
<section style={panelStyle} aria-label="Paste-Weighted Candidate Generator">
```

to:

```tsx
<section className="windfall-ledger-panel" aria-label="Paste-Weighted Candidate Generator">
```

- [ ] **Step 2: Update the stats grid class**

Change the parsed stats wrapper:

```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
```

to:

```tsx
<div className="windfall-status-strip">
```

For each stat item currently using `statStyle`, change:

```tsx
<div style={statStyle}>
```

to:

```tsx
<div className="windfall-status-chip">
```

- [ ] **Step 3: Update the generate/clear action row**

Change the action row wrapper:

```tsx
<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
```

to:

```tsx
<div className="windfall-action-band">
```

Change the Generate button style object to use the primary class:

```tsx
className="windfall-primary-button"
```

Keep the existing `disabled={!canGenerate}` prop.

Change the Clear button style object to use:

```tsx
className="windfall-secondary-button"
```

- [ ] **Step 4: Remove unused style constants**

After the JSX changes, remove unused constants from the top of `PasteWeightedCandidatesPanel.tsx`:

```tsx
const panelStyle: React.CSSProperties = { ... };
const statStyle: React.CSSProperties = { ... };
```

Keep any constants still referenced by the component.

- [ ] **Step 5: Run Paste-Weighted panel tests**

Run:

```bash
npm test -- tests/pasteWeightedCandidatesPanel.test.ts
```

Expected result: all Paste-Weighted panel tests pass.

- [ ] **Step 6: Commit Paste-Weighted visual treatment**

```bash
git add src/components/candidates/PasteWeightedCandidatesPanel.tsx tests/pasteWeightedCandidatesPanel.test.ts
git commit -m "style: apply Swiss Ledger treatment to paste generator"
```

## Task 6: Apply Evidence Wall Styling To Undrawn Patterns

**Files:**
- Modify: `src/components/UndrawnPatternsPanel.tsx`
- Test: `tests/undrawnPatternsPanel.test.ts`

- [ ] **Step 1: Replace card styling with evidence classes**

In `src/components/UndrawnPatternsPanel.tsx`, change the outer panel wrapper returned by `UndrawnPatternsPanel` to include:

```tsx
className="windfall-evidence-panel"
```

Wrap the panel’s main explanatory/statistical content in:

```tsx
<div className="windfall-evidence-wall">
  {/* existing Undrawn Patterns content */}
</div>
```

Do not change `computeStats`, `buildUndrawnForecast`, or `analyzeMonthEndCarryOver`.

- [ ] **Step 2: Convert top-level evidence cards**

For top-level interpretation blocks currently using:

```tsx
style={cardStyle}
```

change them to:

```tsx
className="windfall-evidence-panel"
```

For nested lists of numbers, keep `numberStyle` unchanged during this slice because number chips encode a specific scanning affordance and should be reviewed separately.

- [ ] **Step 3: Remove unused `cardStyle` only if no references remain**

Run:

```bash
rg -n "cardStyle" src/components/UndrawnPatternsPanel.tsx
```

If the command returns no JSX references to `cardStyle`, remove the `cardStyle` constant.

- [ ] **Step 4: Run Undrawn Patterns tests**

Run:

```bash
npm test -- tests/undrawnPatternsPanel.test.ts
```

Expected result: all Undrawn Patterns tests pass.

- [ ] **Step 5: Commit Evidence Wall visual treatment**

```bash
git add src/components/UndrawnPatternsPanel.tsx tests/undrawnPatternsPanel.test.ts
git commit -m "style: apply Evidence Wall treatment to undrawn patterns"
```

## Task 7: Full Verification And Browser QA

**Files:**
- No code files unless verification reveals defects.

- [ ] **Step 1: Run focused visual tests**

Run:

```bash
npm test -- tests/hybridVisualSystem.test.tsx tests/pasteWeightedCandidatesPanel.test.ts tests/undrawnPatternsPanel.test.ts
```

Expected result: all focused tests pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Expected result:

- `npm run typecheck` exits 0.
- `npm test` exits 0.
- `npm run lint` exits 0, allowing existing warnings if the project still reports them.
- `npm run build` exits 0.

- [ ] **Step 3: Start the local app**

Run:

```bash
npm run dev -- --host 127.0.0.1 --port 5175
```

Expected result: Vite reports `Local: http://127.0.0.1:5175/`.

- [ ] **Step 4: Verify app availability**

Run:

```bash
curl -I http://127.0.0.1:5175/
```

Expected result:

```text
HTTP/1.1 200 OK
```

- [ ] **Step 5: Browser visual QA**

Open `http://127.0.0.1:5175/` and verify:

- App title reads `Windfall`.
- Header uses Helvetica-style sans typography and strong black rule.
- Shared sections use black/grey hierarchy, not saturated blue.
- Paste-Weighted Candidate Generator has the Swiss Ledger panel surface, status strip, and action band.
- Undrawn Patterns has Evidence Wall spacing and class treatment.
- Controls do not overlap at desktop width.
- At a mobile-sized viewport, header actions wrap and wide tables scroll horizontally instead of compressing into unreadable cards.

- [ ] **Step 6: Stop the dev server**

Find the server:

```bash
lsof -nP -iTCP:5175 -sTCP:LISTEN
```

Stop the listed PID:

```bash
kill <PID>
```

- [ ] **Step 7: Commit verification fixes**

If browser QA required code fixes, commit those exact files:

```bash
git add src/index.css src/App.css src/App.tsx src/components/shared/CollapsibleSection.tsx src/components/shared/InlineCollapsibleCard.tsx src/components/candidates/PasteWeightedCandidatesPanel.tsx src/components/UndrawnPatternsPanel.tsx tests/hybridVisualSystem.test.tsx tests/pasteWeightedCandidatesPanel.test.ts tests/undrawnPatternsPanel.test.ts
git commit -m "style: finish first Windfall hybrid visual pass"
```

If no verification fixes were required after Task 6, do not create an empty commit.
