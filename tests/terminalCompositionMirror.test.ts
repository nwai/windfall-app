import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import TerminalCompositionMirror from "../src/components/TerminalCompositionMirror";
import { buildTerminalShapeOptions, type TerminalShapeQuotaOptions } from "../src/lib/terminalShapeQuotas";
import { terminalRunEvidence, linkedTerminalShapeEvidence, type TerminalRunRuleOptions } from "../src/lib/terminalDigitRuns";
import type { Draw } from "../src/types";

const draws: Draw[] = [
  { date: "10/7/26", main: [22,2,16,33,1,43], supp: [11,6] },
  { date: "10/9/26", main: [28,33,36,15,40,18], supp: [44,4] },
];
const shapes: TerminalShapeQuotaOptions = { enabled: true, selectedShapes: ["2+2+2+2", "2+2+1+1+1+1"], shapeOptions: buildTerminalShapeOptions(draws) };
const runs: TerminalRunRuleOptions = { enabled: true, mode: "allocation", selectedRuns: ["1-2-3", "3-4-5-6"], runOptions: terminalRunEvidence(draws).options };
const props = { shapes, runs, requested: 10, bypassed: false, linked: false, onEdit: () => undefined };
const render = (overrides: Partial<React.ComponentProps<typeof TerminalCompositionMirror>> = {}) => {
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(React.createElement(TerminalCompositionMirror, { ...props, ...overrides }));
  return element;
};

describe("shared terminal composition mirror", () => {
  it("reflects the exact shared choices and real-count shares without adding editable duplicate state", () => {
    const view = render();
    expect(Array.from(view.querySelectorAll("code")).map(element => element.textContent)).toEqual([...shapes.selectedShapes, ...runs.selectedRuns]);
    expect(Array.from(view.querySelectorAll("small")).map(element => element.textContent)).toEqual(Array(4).fill("50.0% · target 5/10"));
    expect(view.querySelectorAll('[data-state="on"]').length).toBe(2);
    expect(view.querySelectorAll("input, select").length).toBe(0);
    expect(view.textContent).toContain("Ending Digit Limits, repeated-family rules and boosts remain independent");
    const changed = render({ shapes: { ...shapes, selectedShapes: ["2+2+2+2"] }, runs: { ...runs, selectedRuns: ["1-2-3"] }, requested: 7 });
    expect(Array.from(changed.querySelectorAll("code")).map(element => element.textContent)).toEqual(["2+2+2+2", "1-2-3"]);
    expect(Array.from(changed.querySelectorAll("small")).map(element => element.textContent)).toEqual(Array(2).fill("100.0% · target 7/7"));
  });
  it("retains choices while Off and distinguishes them from active quotas", () => {
    const view = render({ shapes: { ...shapes, enabled: false }, runs: { ...runs, enabled: false } });
    expect(view.querySelectorAll('[data-state="off"]').length).toBe(2);
    expect(view.querySelectorAll("code").length).toBe(4);
    expect(view.querySelectorAll("small").length).toBe(0);
    expect(view.textContent).toContain("Choices retained; not applied to generation");
    const empty = render({ shapes: { ...shapes, enabled: false, selectedShapes: [] }, runs: { ...runs, enabled: false, selectedRuns: [] } });
    expect(empty.querySelectorAll(".terminal-composition-mirror__empty").length).toBe(2);
  });
  it("shows missing or conflicting evidence without substitute shares, targets or selections", () => {
    const view = render({ shapes: { ...shapes, shapeOptions: buildTerminalShapeOptions([]) }, runs: { ...runs, runOptions: terminalRunEvidence([]).options } });
    expect(view.querySelectorAll('[data-state="invalid"]').length).toBe(2);
    expect(view.querySelectorAll('[role="alert"]').length).toBe(2);
    expect(view.querySelectorAll("small").length).toBe(0);
    expect(view.querySelectorAll("code").length).toBe(4);
    expect(view.textContent).not.toMatch(/NaN|undefined/);
    const overlap = render({ runs: { ...runs, mode: "requireAll", selectedRuns: ["2-3-4", "3-4-5"] } });
    expect(overlap.querySelector('[aria-label="Mirrored Terminal Run Quotas"]')?.textContent).toContain("would merge");
  });
  it("uses linked shapes and distinguishes Require all from manual equal allocations", () => {
    const selectedRuns = { ...runs, selectedRuns: ["3-4-5-6"] };
    const link = linkedTerminalShapeEvidence(draws, selectedRuns);
    const linked = render({ linked: true, runs: selectedRuns, shapes: { enabled: true, selectedShapes: link.selectedShapes, shapeOptions: link.shapeOptions, sourceError: link.error } });
    expect(linked.textContent).toContain("Linked to selected runs");
    expect(linked.querySelector('[aria-label="Selected Terminal Repetition Shapes"] code')?.textContent).toBe("2+2+1+1+1+1");
    const required = render({ runs: { ...runs, mode: "requireAll", selectedRuns: ["0-1-2", "4-5-6"] } });
    expect(required.querySelector('[aria-label="Mirrored Terminal Run Quotas"]')?.textContent).toContain("Require all selected runs");
    expect(Array.from(required.querySelectorAll('[aria-label="Mirrored Terminal Run Quotas"] small')).map(element => element.textContent)).toEqual(["Every candidate", "Every candidate"]);
    const equal = render({ runs: { ...runs, allocationBasis: "equal", selectedRuns: ["0-1-2", "4-5-6"] } });
    expect(equal.textContent).toContain("equal user shares");
    expect(equal.querySelectorAll('[aria-label="Mirrored Terminal Run Quotas"] small').length).toBe(2);
  });
  it("marks configured quotas bypassed in RwR45 instead of claiming they are applied", () => {
    const view = render({ bypassed: true });
    expect(view.querySelectorAll('[data-state="bypassed"]').length).toBe(2);
    expect(view.querySelectorAll("small").length).toBe(0);
    expect(view.querySelectorAll("code").length).toBe(4);
    expect(view.textContent).toContain("Bypassed by RwR45");
  });
  it("routes Edit to the owning subsection and responds to new shared props without modifying them", async () => {
    const container = document.createElement("div");document.body.appendChild(container);
    const root = createRoot(container), onEdit = vi.fn();
    const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const original = JSON.stringify({ shapes, runs });
    try {
      await act(async () => root.render(React.createElement(TerminalCompositionMirror, { ...props, onEdit })));
      await act(async () => (container.querySelector('button[aria-label="Edit Terminal Repetition Shapes"]') as HTMLButtonElement).click());
      await act(async () => (container.querySelector('button[aria-label="Edit Terminal Run Quotas"]') as HTMLButtonElement).click());
      expect(onEdit.mock.calls).toEqual([["terminalShapes"], ["terminalRuns"]]);
      await act(async () => root.render(React.createElement(TerminalCompositionMirror, { ...props, shapes: { ...shapes, selectedShapes: ["2+2+2+2"] }, onEdit })));
      expect(container.querySelectorAll('[aria-label="Selected Terminal Repetition Shapes"] code').length).toBe(1);
      expect(JSON.stringify({ shapes, runs })).toBe(original);
    } finally {
      await act(async () => root.unmount());container.remove();(globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });
  it("wires the existing effective options and navigation without writing ending-digit settings", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const mirror = app.slice(app.indexOf("<TerminalCompositionMirror"), app.indexOf("/>", app.indexOf("<TerminalCompositionMirror")));
    expect(mirror).toContain("shapes={terminalShapeQuotaOptions}");expect(mirror).toContain("runs={terminalRunRuleOptions}");
    expect(mirror).toContain("linked={terminalRunShapeLinkActive}");expect(mirror).toContain("onEdit={navigateToGenerationSetupSummaryTarget}");
    expect(app).toContain('terminalShapes: "windfall-terminal-shape-quotas"');expect(app).toContain('terminalRuns: "windfall-terminal-run-quotas"');
    expect(app).toContain('target === "terminalShapes" || target === "terminalRuns"');
    const provenance = app.slice(app.indexOf('title: "Ending Digits & Buckets"'), app.indexOf('title: "Monthly & Carry-over"'));
    expect(provenance).toContain('label: "Terminal shape quotas"');expect(provenance).toContain('label: "Exact terminal runs"');
    expect(readFileSync("public/user-manual.html", "utf8")).toContain("Both views read the same settings");
  });
});
