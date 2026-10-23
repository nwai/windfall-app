import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import GenerationConflictSummary from "../src/components/GenerationConflictSummary";
import RwR45OutputSummary from "../src/components/RwR45OutputSummary";
import TerminalShapeQuotaControls from "../src/components/TerminalShapeQuotaControls";
import TerminalRunQuotaControls from "../src/components/TerminalRunQuotaControls";
import { captureRwR45Composition } from "../src/lib/generatedComposition";
import { buildTerminalShapeOptions } from "../src/lib/terminalShapeQuotas";
import { terminalRunEvidence } from "../src/lib/terminalDigitRuns";

const numbers = { main: [2,12,7,17,21,33], supp: [34,40] };
const snapshot = captureRwR45Composition([numbers], null, "2026-10 before D4");
const viewOf = (element: React.ReactElement) => new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html");
describe("generation conflict and RwR45 reflection surfaces", () => {
  it("routes conflict/removal controls and keeps a persistent source-specific notice", async () => {
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container), onReview = vi.fn(), onDismissRemovals = vi.fn();
    const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      await act(async () => root.render(React.createElement(GenerationConflictSummary, {
        result: { mode: "standard", eligibleCount: 44, forcedNumbers: [], notices: [], blockers: [{ message: "Conflict", target: "endingDigits" }] },
        removals: [{ number: 7, inclusionSources: ["Drought-break shortlist"], exclusionSources: ["HC3"] }], onReview, onDismissRemovals,
      })));
      expect(container.textContent).toContain("7 from Drought-break shortlist · excluded by HC3");
      const buttons = [...container.querySelectorAll("button")];
      await act(async () => buttons.find((button) => button.textContent === "Review rule")!.click());
      await act(async () => buttons.find((button) => button.textContent === "Review sources")!.click());
      await act(async () => buttons.find((button) => button.textContent === "Dismiss notice")!.click());
      expect(onReview.mock.calls).toEqual([["endingDigits"], ["forcedExcluded"]]); expect(onDismissRemovals).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); container.remove(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous; }
  });
  it("renders output-only compositions without made-up monthly zeros or altered inputs", () => {
    const before = JSON.stringify(snapshot);
    const view = viewOf(React.createElement(RwR45OutputSummary, { snapshot }));
    expect(view.body.textContent).toContain("Unavailable"); expect(view.body.textContent).toContain("0-1-2-3-4");
    expect(view.body.textContent).toContain("settings unchanged"); expect(view.body.textContent).toContain("2026-10 before D4");
    expect(view.querySelectorAll("input, select")).toHaveLength(0);
    expect(JSON.stringify(snapshot)).toBe(before);
    const digits = viewOf(React.createElement(RwR45OutputSummary, { snapshot, view: "digits" }));
    expect(digits.querySelectorAll("tbody tr")).toHaveLength(10);
    expect(digits.querySelectorAll("tbody tr")[2].textContent).toBe("221/1");
  });
  it("separates RwR45 row counts from real-history counts and suppresses bypassed targets", () => {
    const history = [{ ...numbers, date: "2026-10-05" }];
    const shapeOptions = buildTerminalShapeOptions(history);
    const shapes = { enabled: true, selectedShapes: [snapshot.rows[0].shape], shapeOptions };
    const runs = { enabled: true, mode: "requireAll" as const, selectedRuns: [snapshot.rows[0].runs[0]], runOptions: terminalRunEvidence(history).options };
    const before = JSON.stringify({ shapes, runs });
    const shapeView = viewOf(React.createElement(TerminalShapeQuotaControls, { options: shapes, requested: 100, bypassed: true,
      outputSnapshot: snapshot, onEnabledChange: vi.fn(), onSelectionChange: vi.fn() }));
    const runView = viewOf(React.createElement(TerminalRunQuotaControls, { options: runs, sourceDraws: 1, requested: 100, bypassed: true,
      outputSnapshot: snapshot, onChange: vi.fn(), onAllObservedChange: vi.fn() }));
    [shapeView, runView].forEach((view) => {
      expect(view.body.textContent).toContain("Last RwR45 rows"); expect(view.body.textContent).not.toContain("100/100");
      expect(view.body.textContent).toContain("1/1");
      expect([...view.querySelectorAll('input[type="checkbox"]')].some((element) => (element as HTMLInputElement).checked)).toBe(true);
    });
    expect(JSON.stringify({ shapes, runs })).toBe(before);
  });
  it("wires a live preflight and captures final rows once, rather than recomputing origin buckets later", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("generationPreflight={generationPreflight}");
    expect(app).toContain("if (generationPreflight.blockers.length > 0)");
    expect(app).toContain("captureRwR45Composition(processedCandidates");
    expect(app).toContain("setRwR45Composition(composition)");
    expect(app).toContain("generatedCompositionTrace(composition)");
    expect(app).toContain("removedForcedInclusions([");
    expect(app).toContain('view="digits"'); expect(app).toContain("outputSnapshot={rwR45Composition}");
    expect(readFileSync("src/components/MonthlyDrawsSummaryPanel.tsx", "utf8")).toContain('view="monthly"');
  });
});
