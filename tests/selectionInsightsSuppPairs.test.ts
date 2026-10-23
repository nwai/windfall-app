import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SelectionInsightsSuppPairs } from "../src/components/SelectionInsightsSuppPairs";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const selected = [1, 2, 3, 4, 5, 6, 7, 8];
const history: Draw[] = [{ date: "2026-06-01", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }];
const props = { selected, activeHistory: history, fullHistory: history, historyWindowName: "History" };

describe("Selection Insights supplementary pair comparison", () => {
  it("renders all pairs and clear scope/role labels without offering to apply a role change", () => {
    const html = renderToStaticMarkup(React.createElement(SelectionInsightsSuppPairs, props));
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelectorAll("tbody tr")).toHaveLength(28);
    expect(container.textContent).toContain("All 28 pairs, including zeros");
    expect(container.textContent).toContain("Observe-only");
    expect(container.textContent).toContain("Does not change selections");
    expect(container.textContent).toContain("Exact supps");
    expect(container.textContent).toContain("Individual supp sum");
    expect(container.querySelector("select")?.id).toBe(container.querySelector("label")?.htmlFor);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toContain("How to read");
  });

  it("explains the eight-anchor requirement and no-evidence state", () => {
    const empty = renderToStaticMarkup(React.createElement(SelectionInsightsSuppPairs, { ...props, selected: [1, 2] }));
    expect(empty).toContain("Select exactly eight anchors");
    expect(empty).not.toContain("<table");
    const noHistory = renderToStaticMarkup(React.createElement(SelectionInsightsSuppPairs, { ...props, activeHistory: [], fullHistory: [] }));
    expect(noHistory).toContain("No recommendation");
    expect(noHistory).toContain("tie: 28");
    expect(noHistory).not.toContain("Auto choice");
  });

  it("shows tied ranks and explicit numerical fallback rather than implying a unique winner", () => {
    const tied = [{ date: "2026-06-01", main: [10, 11, 12, 13, 14, 15], supp: [1, 9] }];
    const html = renderToStaticMarkup(React.createElement(SelectionInsightsSuppPairs, { ...props, activeHistory: tied, fullHistory: tied }));
    expect(html).toContain("Numerical fallback");
    expect(html).toContain("tie: 7");
    expect(html).toContain("does not shorten WFMQYH");
  });

  it("can sort and re-render on history updates without mutating inputs", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const original = JSON.stringify(props);
    try {
      await act(async () => root.render(React.createElement(SelectionInsightsSuppPairs, props)));
      expect(container.querySelector("tbody th")?.textContent).toContain("7 + 8");
      await act(async () => {
        const select = container.querySelector("select")!;
        select.value = "co-draws";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(container.querySelector("tbody th")?.textContent).toContain("1 + 2");
      const next = [...history, { date: "2026-06-03", main: [10, 11, 12, 13, 14, 15], supp: [7, 8] }];
      await act(async () => root.render(React.createElement(SelectionInsightsSuppPairs, { ...props, activeHistory: next, fullHistory: next })));
      const pair = [...container.querySelectorAll("tbody tr")].find((row) => row.querySelector("th")?.textContent?.includes("7 + 8"))!;
      expect(pair.querySelectorAll("td")[4].textContent).toBe("2");
      expect(JSON.stringify(props)).toBe(original);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("is wired once to the real window/full-history anchor selection and documented", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain("<SelectionInsightsSuppPairs");
    expect(app).toContain("selected={selectionInsightsAnchorNumbers}\n              activeHistory={realFilteredHistory}\n              fullHistory={realHistory}");
    const manual = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");
    expect(manual).toContain('id="selection-insights-supp-pairs"');
    expect(manual).toContain("numerical fallback");
  });
});
