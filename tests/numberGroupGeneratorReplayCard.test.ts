import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import NumberGroupGeneratorReplayCard from "../src/components/NumberGroupGeneratorReplayCard";
import { analyzeNumberGroupFrequencyAudit } from "../src/lib/numberGroupFrequencyAudit";
import { runNumberGroupGeneratorReplay } from "../src/lib/numberGroupGeneratorReplay";

function fixture() {
  const day = new Date(2024, 5, 3);
  return Array.from({ length: 101 }, (_, index) => {
    while (![1, 3, 5].includes(day.getDay())) day.setDate(day.getDate() + 1);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    day.setDate(day.getDate() + 1);
    const numbers = Array.from({ length: 8 }, (_, i) => (index * 7 + i * 4) % 45 + 1);
    return { date, main: numbers.slice(0, 6), supp: numbers.slice(6) };
  });
}
class MockWorker {
  static created: MockWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { MockWorker.created.push(this); }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); MockWorker.created = []; });

describe("NumberGroupGeneratorReplayCard", () => {
  it("is closed by default and discloses the protocol without presenting forecast scores as generator results", () => {
    const history = fixture();
    const audit = analyzeNumberGroupFrequencyAudit(history, { asOfDate: "2026-10-18" });
    const html = renderToStaticMarkup(React.createElement(NumberGroupGeneratorReplayCard, { history, audit }));
    expect(html).not.toContain(" open=");
    expect(html).toContain("No live boost toggle is enabled");
    expect(html).toContain("Test rows are generated, unplayed comparison candidates");
    expect(html).toContain("25 rows per seed per arm");
    expect(html).toContain("no current live controls are imported");
    expect(html).not.toContain("Generator comparison: complete paired targets only");
    expect(html).toContain("Current 15-group sampling preview (not applied)");
  });

  it("does not enable a run when real replay targets are unavailable", () => {
    const html = renderToStaticMarkup(React.createElement(NumberGroupGeneratorReplayCard, { history: [], audit: analyzeNumberGroupFrequencyAudit([], { asOfDate: "2026-10-18" }) }));
    expect(html).toContain("No replay targets yet");
    expect(html).toContain("No fabricated results");
    const container = document.createElement("div"); container.innerHTML = html;
    expect(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Run paired generator replay")?.disabled).toBe(true);
  });

  it("runs a worker on request, displays actual results, marks changed scopes stale, and exports the frozen result", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const global = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const old = global.IS_REACT_ACT_ENVIRONMENT; global.IS_REACT_ACT_ENVIRONMENT = true;
    const history = fixture(), audit = analyzeNumberGroupFrequencyAudit(history, { asOfDate: "2026-10-18" });
    const result = await runNumberGroupGeneratorReplay(history, { asOfDate: "2026-10-18" });
    const container = document.createElement("div"), root = createRoot(container);
    const create = vi.fn((_blob: Blob) => "blob:replay");
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const button = (text: string) => Array.from(container.querySelectorAll("button")).find(button => button.textContent === text)!;
    try {
      await act(async () => root.render(React.createElement(NumberGroupGeneratorReplayCard, { history, audit })));
      expect(MockWorker.created).toHaveLength(0);
      await act(async () => button("Run paired generator replay").click());
      const worker = MockWorker.created[0];
      expect(worker.postMessage).toHaveBeenCalledWith({ history, options: { window: "all", asOfDate: "2026-10-18", scenario: "isolated" } });
      await act(async () => worker.emit({ progress: { done: 1, total: 1 } }));
      expect(container.textContent).toContain("Replaying 1/1");
      await act(async () => worker.emit({ result }));
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(container.textContent).toContain("1 complete paired targets");
      expect(container.textContent).toContain("Live generation and journal entries remain unchanged");
      expect(container.querySelector('[aria-label="Generator comparison: complete paired targets only"] tbody')?.querySelectorAll("tr")).toHaveLength(2);
      expect(container.querySelector('[aria-label="Inspected generator replay target"]')).not.toBeNull();
      expect(container.querySelector('[aria-label^="Generated On rows"] tbody')?.querySelectorAll("tr")).toHaveLength(100);
      const selector = container.querySelector<HTMLSelectElement>("#number-group-replay-inspect-arm")!;
      await act(async () => { selector.value = "Off"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(container.querySelector('[aria-label^="Generated Off rows"] tbody')?.querySelectorAll("tr")).toHaveLength(100);
      await act(async () => button("Export generator replay JSON").click());
      const blob = create.mock.calls[0][0];
      const exported = JSON.parse(await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob);
      }));
      expect(exported).toEqual(result);
      const changed = analyzeNumberGroupFrequencyAudit(history, { asOfDate: "2026-10-18", window: 13 });
      await act(async () => root.render(React.createElement(NumberGroupGeneratorReplayCard, { history, audit: changed })));
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Retained results below belong to the earlier source/settings");
      expect(container.textContent).toContain("Completed results: isolated scenario; training all prior draws");
    } finally { await act(async () => root.unmount()); global.IS_REACT_ACT_ENVIRONMENT = old; }
  });

  it("cancels background work, ignores late messages, and terminates a worker on unmount", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const global = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const old = global.IS_REACT_ACT_ENVIRONMENT; global.IS_REACT_ACT_ENVIRONMENT = true;
    const history = fixture(), audit = analyzeNumberGroupFrequencyAudit(history, { asOfDate: "2026-10-18" });
    const container = document.createElement("div"), root = createRoot(container);
    const button = (text: string) => Array.from(container.querySelectorAll("button")).find(button => button.textContent === text)!;
    let unmounted = false;
    try {
      await act(async () => root.render(React.createElement(NumberGroupGeneratorReplayCard, { history, audit })));
      const scenario = container.querySelector<HTMLSelectElement>("#number-group-replay-scenario")!;
      await act(async () => { scenario.value = "composition"; scenario.dispatchEvent(new Event("change", { bubbles: true })); });
      await act(async () => button("Run paired generator replay").click());
      const first = MockWorker.created[0];
      expect(first.postMessage.mock.calls[0][0].options.scenario).toBe("composition");
      await act(async () => button("Cancel replay").click());
      expect(first.terminate).toHaveBeenCalledOnce();
      await act(async () => first.emit({ error: "late failure" }));
      expect(container.textContent).not.toContain("late failure");
      expect(container.textContent).toContain("no partial results were presented as a completed comparison");
      await act(async () => button("Run paired generator replay").click());
      const second = MockWorker.created[1];
      await act(async () => root.unmount()); unmounted = true;
      expect(second.terminate).toHaveBeenCalledOnce();
    } finally { if (!unmounted) await act(async () => root.unmount()); global.IS_REACT_ACT_ENVIRONMENT = old; }
  });

  it("shows worker failures without neutral substitute results and documents the no-live-wiring boundary", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const global = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const old = global.IS_REACT_ACT_ENVIRONMENT; global.IS_REACT_ACT_ENVIRONMENT = true;
    const history = fixture(), audit = analyzeNumberGroupFrequencyAudit(history, { asOfDate: "2026-10-18" });
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(NumberGroupGeneratorReplayCard, { history, audit })));
      await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Run paired generator replay")!.click());
      await act(async () => MockWorker.created[0].onerror?.());
      expect(container.textContent).toContain("No results were substituted");
      expect(container.querySelector('[aria-label="Generator comparison: complete paired targets only"]')).toBeNull();
    } finally { await act(async () => root.unmount()); global.IS_REACT_ACT_ENVIRONMENT = old; }
    expect(readFileSync("src/App.tsx", "utf8")).not.toContain("samplingAuditOptions");
    expect(readFileSync("public/user-manual.html", "utf8")).toContain("NGFA-GR1");
  });
});
