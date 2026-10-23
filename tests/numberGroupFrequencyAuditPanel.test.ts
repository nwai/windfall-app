import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import NumberGroupFrequencyAuditPanel from "../src/components/NumberGroupFrequencyAuditPanel";
import { getPanelOwnership, panelCanProvideIndependentPortfolioEvidence } from "../src/lib/evidenceFamilyRegistry";

function fixture() {
  const day = new Date(2024, 5, 3);
  return Array.from({ length: 104 }, (_, index) => {
    while (![1, 3, 5].includes(day.getDay())) day.setDate(day.getDate() + 1);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    day.setDate(day.getDate() + 1);
    const numbers = Array.from({ length: 8 }, (_, j) => (index * 7 + j * 4) % 45 + 1);
    return { date, main: numbers.slice(0, 6), supp: numbers.slice(6) };
  });
}

describe("NumberGroupFrequencyAuditPanel", () => {
  it("makes all three tests and model assumptions visible without calibrated prediction claims", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(React.createElement(NumberGroupFrequencyAuditPanel, { history: fixture(), today: "2026-10-18" }));
    expect(container.textContent).toContain("Observe-only. No live generation influence.");
    expect(container.textContent).toContain("4 replay targets");
    expect(container.querySelectorAll("section h3")).toHaveLength(3);
    expect(container.textContent).toContain("neutral-pull strength 30; blend 50/50");
    expect(container.textContent).toContain("not calibrated probabilities");
    expect(container.textContent).toContain("not an untouched holdout");
    expect(container.textContent).toContain("n/a (<30 targets)");
    expect(container.querySelectorAll('[role="region"][tabindex="0"]')).toHaveLength(6);
    expect(container.querySelectorAll("details")).toHaveLength(4);
    expect(container.textContent).toContain("No live boost toggle is enabled");
    expect(container.textContent).toContain("Run paired generator replay");
    expect(container.querySelectorAll("tbody")[2].querySelectorAll("tr")).toHaveLength(20);
    expect(container.querySelector(".number-group-audit__mains")).not.toBeNull();
    expect(container.querySelector(".number-group-audit__supps")).not.toBeNull();
  });

  it("does not disguise a missing sample as a measured zero", () => {
    const html = renderToStaticMarkup(React.createElement(NumberGroupFrequencyAuditPanel, { history: [], today: "2026-10-18" }));
    expect(html).toContain("Results are unavailable; no fallback evidence was substituted");
    expect(html).toContain("n/a");
    expect(html).toContain("Current estimates unavailable");
  });

  it("uses local selectors and exports a reproducible audit with actual source rows", async () => {
    const global = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const old = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const create = vi.fn((_blob: Blob) => "blob:audit");
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const container = document.createElement("div");
    const root = createRoot(container);
    const history = fixture();
    const before = JSON.stringify(history);
    try {
      await act(async () => root.render(React.createElement(NumberGroupFrequencyAuditPanel, { history, today: "2026-10-18" })));
      const window = container.querySelector<HTMLSelectElement>("#number-group-training-window")!;
      await act(async () => { window.value = "13"; window.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(container.textContent).toContain("(13 draws)");
      const scale = container.querySelector<HTMLSelectElement>("#number-group-inspect-scale")!;
      await act(async () => { scale.value = "3"; scale.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(container.textContent).toContain("1-15");
      expect(container.textContent).toContain("4 replay targets");
      const button = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Export audit JSON")!;
      await act(async () => button.click());
      expect(create).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      const blob = create.mock.calls[0][0] as Blob;
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      const saved = JSON.parse(text);
      expect(saved.modelVersion).toBe("NGFA-1");
      expect(saved.config.window).toBe(13);
      expect(saved.baseline).toEqual(history);
      expect(saved.records).toHaveLength(16);
      expect(saved.records.every((row: { trainingThrough: string; date: string }) => row.trainingThrough < row.date)).toBe(true);
      expect(container.textContent).toContain("Audit download requested");
      expect(JSON.stringify(history)).toBe(before);
    } finally {
      await act(async () => root.unmount());
      click.mockRestore();
      vi.unstubAllGlobals();
      global.IS_REACT_ACT_ENVIRONMENT = old;
    }
  });

  it("has a default-closed Validation home and cannot become an independent portfolio signal", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const manual = readFileSync("public/user-manual.html", "utf8");
    const at = app.indexOf('panelId="number-group-frequency-audit"');
    expect(at).toBeGreaterThan(app.indexOf('panelId="pattern-stats"'));
    expect(at).toBeLessThan(app.indexOf('panelId="number-frequency"'));
    expect(app.slice(at, at + 400)).toContain("defaultOpen={false} deferContentWhileCollapsed");
    expect(app.slice(at, at + 400)).toContain("history={history} today={planningDrawContext.todayIso}");
    expect(getPanelOwnership("number-group-frequency-audit")).toMatchObject({ currentHome: "validation", primaryFamily: "frequency-recency", role: "consumer", allowedUse: "observe-only" });
    expect(panelCanProvideIndependentPortfolioEvidence("number-group-frequency-audit")).toBe(false);
    expect(manual).toContain('id="number-group-frequency-audit"');
    expect(manual).toContain("NGFA-1");
  });
});
