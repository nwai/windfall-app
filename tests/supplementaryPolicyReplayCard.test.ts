import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Draw } from "../src/types";
import { parseCSVorJSON } from "../src/parseCSVorJSON";
import { preparePortfolioHistory } from "../src/lib/evidencePortfolio";
import { runSupplementaryPolicyReplay, type SupplementaryPolicyReplayResult } from "../src/lib/supplementaryPolicyReplay";
import { SupplementaryPolicyReplayCard } from "../src/components/SupplementaryPolicyReplayCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const history = preparePortfolioHistory(parseCSVorJSON(readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8")) as Draw[]).draws.slice(0, 64);
let report: SupplementaryPolicyReplayResult;
const workers: ReplayWorkerStub[] = [];
class ReplayWorkerStub {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  request: unknown;
  constructor() { workers.push(this); }
  postMessage(request: unknown) { this.request = request; }
  terminate() { this.terminated = true; }
  send(data: unknown) { this.onmessage?.({ data }); }
}
const mount = async (props = { fullHistory: history, activeDrawCount: 13 }) => {
  vi.stubGlobal("Worker", ReplayWorkerStub);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(SupplementaryPolicyReplayCard, props)));
  const button = (text: string) => [...container.querySelectorAll("button")].find(element => element.textContent === text)!;
  const cleanup = async () => { await act(async () => root.unmount()); container.remove(); };
  return { container, root, button, cleanup };
};

describe("three-method supplementary replay UI", () => {
  beforeAll(async () => { report = await runSupplementaryPolicyReplay(history, { windowSize: 13, seed: 1 }); }, 30_000);
  afterEach(() => { workers.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("starts collapsed with accessible local controls and does not require current eight-number anchors", async () => {
    const ui = await mount();
    try {
      expect(ui.container.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
      expect(ui.container.querySelector('[hidden]')).not.toBeNull();
      await act(async () => ui.container.querySelector("button")!.click());
      expect(ui.container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
      expect(ui.container.textContent).toContain("64 qualifying real draws");
      expect(ui.container.textContent).toContain("No current selections or hard filters");
      expect(ui.button("Run replay").disabled).toBe(false);
      for (const input of ui.container.querySelectorAll("input")) {
        expect(ui.container.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
      }
      expect(ui.container.textContent).toContain("retrospective confirmation");
      expect(ui.container.textContent).not.toContain("Adopt method");
    } finally { await ui.cleanup(); }
  });

  it("reports real progress, supports cancellation, and never writes global selections or storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const ui = await mount();
    try {
      await act(async () => ui.button("Run replay").click());
      expect(workers[0].request).toEqual({ history, options: { windowSize: 13, seed: 1 } });
      await act(async () => workers[0].send({ progress: { completed: 2, total: 4 } }));
      expect(ui.container.querySelector("progress")?.value).toBe(2);
      expect(ui.container.textContent).toContain("2 / 4 targets tested");
      await act(async () => ui.button("Cancel replay").click());
      expect(workers[0].terminated).toBe(true);
      expect(ui.container.textContent).toContain("Replay cancelled");
      await act(async () => workers[0].send({ result: report }));
      expect(ui.container.textContent).not.toContain("Development-selected method:");
      expect(storage).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });

  it("renders both real tests, the exact reference, an explicit insufficient gate and latest-first ledger", async () => {
    const ui = await mount();
    try {
      await act(async () => ui.button("Run replay").click());
      await act(async () => workers[0].send({ result: report }));
      expect(workers[0].terminated).toBe(true);
      expect(ui.container.textContent).toContain("Insufficient confirmation evidence");
      expect(ui.container.textContent).toContain("Live EP-1 and DGA Auto supps remain unchanged");
      const results = ui.container.querySelectorAll(".supp-replay-results");
      expect(results).toHaveLength(2);
      expect(results[0].querySelectorAll("tbody tr")).toHaveLength(4);
      expect(results[0].textContent).toContain("0.500");
      expect(results[0].textContent).toContain("3.6%");
      expect(results[1].textContent).toContain("six proposed mains as a playable game");
      const ledger = ui.container.querySelector(".supp-replay-ledger");
      expect(ledger?.querySelectorAll("tbody tr")).toHaveLength(2);
      expect(ledger?.querySelector("tbody th")?.textContent).toBe(report.lastTarget);
      await act(async () => {
        const block = ui.container.querySelector("select")!;
        block.value = "development";
        block.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(ledger?.querySelector("tbody th")?.textContent).toBe(report.records[1].targetDate);
      expect(ui.container.textContent).toContain("Development-selected method:");
    } finally { await ui.cleanup(); }
  });

  it("cancels on history edits, flags earlier completed reports stale and terminates on unmount", async () => {
    const ui = await mount();
    try {
      await act(async () => ui.button("Run replay").click());
      await act(async () => workers[0].send({ result: report }));
      await act(async () => ui.root.render(React.createElement(SupplementaryPolicyReplayCard, { fullHistory: history.slice(0, -1), activeDrawCount: 13 })));
      expect(ui.container.textContent).toContain("Earlier report: history, window or seed has changed");
      await act(async () => ui.button("Run replay").click());
      await act(async () => ui.root.render(React.createElement(SupplementaryPolicyReplayCard, { fullHistory: history, activeDrawCount: 13 })));
      expect(workers[1].terminated).toBe(true);
      expect(ui.container.textContent).toContain("History changed during replay");
      await act(async () => ui.button("Run replay").click());
    } finally { await ui.cleanup(); }
    expect(workers[2].terminated).toBe(true);
  });

  it("shows worker failure and never substitutes a plausible-looking report", async () => {
    const ui = await mount();
    try {
      await act(async () => ui.button("Run replay").click());
      await act(async () => workers[0].onerror?.());
      expect(ui.container.textContent).toContain("No result was fabricated");
      expect(ui.container.querySelector(".supp-replay-results")).toBeNull();
      expect(ui.button("Run replay").disabled).toBe(false);
    } finally { await ui.cleanup(); }
  });

  it("displays n/a rather than zero success when real history gaps prevent all portfolio targets", async () => {
    const withGap = history.filter((_, index) => index !== 60);
    const gapReport = await runSupplementaryPolicyReplay(withGap, { windowSize: 13, seed: 1 });
    const ui = await mount({ fullHistory: withGap, activeDrawCount: 13 });
    try {
      await act(async () => ui.button("Run replay").click());
      await act(async () => workers[0].send({ result: gapReport }));
      const portfolioTable = ui.container.querySelectorAll(".supp-replay-results")[1];
      expect(portfolioTable.textContent).toContain("0 real target draws");
      const table = portfolioTable.getElementsByTagName("table")[0];
      expect(table.tBodies[0].rows[0].cells[1].textContent).toBe("n/a");
      expect(portfolioTable.textContent).not.toContain("0.0%");
      expect(ui.container.querySelector(".supp-replay-ledger")?.textContent).toMatch(/missing|behind/);
    } finally { await ui.cleanup(); }
  });

  it("disables insufficient history and is wired/documented as a single observe-only consumer", async () => {
    const ui = await mount({ fullHistory: history.slice(0, 60), activeDrawCount: 13 });
    try {
      expect(ui.button("Run replay").disabled).toBe(true);
      expect(ui.container.textContent).toContain("At least 61 qualifying real draws");
      const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
      expect(app.match(/<SupplementaryPolicyReplayCard /g)).toHaveLength(1);
      expect(app).toContain("fullHistory={realHistory} activeDrawCount={realFilteredHistory.length}");
      const manual = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");
      expect(manual).toContain('id="supplementary-policy-replay"');
      expect(manual).toContain("No untouched holdout claim");
    } finally { await ui.cleanup(); }
  });
});
