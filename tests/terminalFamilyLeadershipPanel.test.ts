import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalFamilyLeadershipPanel, TerminalFamilyLeadershipView } from "../src/components/TerminalFamilyLeadershipPanel";
import { analyzeTerminalFamilyLeadership } from "../src/lib/terminalFamilyLeadership";
import { getPanelOwnership, panelCanProvideIndependentPortfolioEvidence } from "../src/lib/evidenceFamilyRegistry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const history = [
  { date: "2026-09-02", main: [1, 11, 21, 2, 12, 22], supp: [3, 13] },
  { date: "2026-09-04", main: [1, 11, 21, 2, 12, 22], supp: [3, 13] },
  { date: "2026-09-07", main: [1, 11, 21, 2, 12, 22], supp: [3, 13] },
];
const analysis = analyzeTerminalFamilyLeadership(history);

class AuditWorker {
  static instances: AuditWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  postMessage = vi.fn();
  constructor() { AuditWorker.instances.push(this); }
  terminate() { this.terminated = true; }
}
afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); AuditWorker.instances = []; });

describe("terminal family leadership view", () => {
  it("renders real scope, local month, explicit definitions and no generation controls", () => {
    const html = renderToStaticMarkup(React.createElement(TerminalFamilyLeadershipView, { analysis }));
    expect(html).toContain("No generation influence");
    expect(html).toContain("All baseline, not WFMQYH");
    expect(html).toContain("Inspect month (local)");
    expect(html).toContain("Exact third-place ties");
    expect(html).toContain("D1 / 3 draws");
    expect(html).not.toContain("Force inclusion");
    expect(html).not.toContain("Apply boost");
    expect(html).toContain('tabindex="0"');
  });

  it("exposes duration and drought tables with different denominators and no fabricated empty rate", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(TerminalFamilyLeadershipView, { analysis })));
      const button = (label: string) => Array.from(container.querySelectorAll("button")).find(element => element.textContent === label)!;
      await act(async () => button("Duration & response").click());
      expect(container.textContent).toContain("right-censored");
      expect(container.textContent).toContain("Longest observed is not a ceiling");
      expect(container.textContent).toContain("No completed baseline months");
      await act(async () => button("Drought cross-check").click());
      expect(container.textContent).toContain("Number-draw opportunities");
      expect(container.textContent).toContain("Both lists: leading families");
      expect(container.textContent).toContain("not today’s shortlist");
      expect(container.textContent).toContain("n/a");
      expect(container.textContent).not.toContain("100.0%");
    } finally { await act(async () => root.unmount()); }
  });

  it("defers the worker until opened and discards stale results after a real-history change", async () => {
    vi.stubGlobal("Worker", AuditWorker);
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(TerminalFamilyLeadershipPanel, { history })));
      expect(AuditWorker.instances).toHaveLength(0);
      const details = container.querySelector<HTMLDetailsElement>("details")!;
      await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
      expect(AuditWorker.instances).toHaveLength(1);
      const old = AuditWorker.instances[0];
      expect(old.postMessage).toHaveBeenCalledWith({ history });
      await act(async () => old.onmessage!({ data: { result: analysis } }));
      expect(container.textContent).toContain("2026-09-07");
      const updated = [...history, { date: "2026-09-09", main: [4, 14, 24, 34, 44, 5], supp: [15, 25] }];
      await act(async () => root.render(React.createElement(TerminalFamilyLeadershipPanel, { history: updated })));
      expect(old.terminated).toBe(true);
      expect(container.textContent).toContain("Reading real-history");
      await act(async () => old.onmessage!({ data: { result: analysis } }));
      expect(container.textContent).toContain("Reading real-history");
      await act(async () => AuditWorker.instances[1].onmessage!({ data: { result: analyzeTerminalFamilyLeadership(updated) } }));
      expect(container.textContent).toContain("2026-09-09");
    } finally { await act(async () => root.unmount()); }
  });

  it("reports worker failure without inventing results and offers retry", async () => {
    vi.stubGlobal("Worker", AuditWorker);
    window.localStorage.setItem("cs-terminal-family-leadership-&-handover", "true");
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(TerminalFamilyLeadershipPanel, { history })));
      expect(AuditWorker.instances).toHaveLength(0);
      const details = container.querySelector<HTMLDetailsElement>("details")!;
      expect(details.open).toBe(false);
      await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
      expect(AuditWorker.instances).toHaveLength(1);
      await act(async () => AuditWorker.instances[0].onerror!());
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("No result was substituted");
      await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Retry audit")!.click());
      expect(AuditWorker.instances).toHaveLength(2);
    } finally { await act(async () => root.unmount()); }
  });

  it("is a registered observe-only consumer under Ending Digit Sequences, not an independent vote", () => {
    expect(getPanelOwnership("terminal-family-leadership")).toMatchObject({ primaryFamily: "terminal-digit", role: "consumer", allowedUse: "observe-only", dependencies: ["drought", "monthly-stage"] });
    expect(panelCanProvideIndependentPortfolioEvidence("terminal-family-leadership")).toBe(false);
    expect(readFileSync("src/components/EndingDigitSequencePanel.tsx", "utf8")).toContain("<TerminalFamilyLeadershipPanel history={allDraws ?? draws}");
    expect(readFileSync("public/user-manual.html", "utf8")).toContain('id="terminal-family-leadership"');
  });
});
