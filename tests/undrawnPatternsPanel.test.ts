import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UndrawnPatternsPanel } from "../src/components/UndrawnPatternsPanel";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const buildDraw = (date: string, main: number[], supp: number[]): Draw => ({ date, main, supp });

describe("UndrawnPatternsPanel", () => {
  it("defaults the panel-local observed window to the latest 13 active draws", () => {
    const history = Array.from({ length: 20 }, (_, index) => (
      buildDraw(
        `2026-01-${String(index + 1).padStart(2, "0")}`,
        [1, 2, 3, 4, 5, 6],
        [7, 8],
      )
    ));

    const html = renderToStaticMarkup(
      React.createElement(UndrawnPatternsPanel, {
        history,
        windowLabel: "Custom (20)",
        loadedDrawCount: history.length,
      }),
    );

    expect(html).toContain('aria-label="Observed pattern draw count"');
    expect(html).toContain('value="13"');
    expect(html).toContain("Analysing latest 13 of 20 active draws");
    expect(html).toContain("Every card uses the newest <b>13</b> draws");
  });

  it("recalculates the cards when the local observed draw count changes", async () => {
    const history = Array.from({ length: 20 }, (_, index) => (
      buildDraw(
        `2026-01-${String(index + 1).padStart(2, "0")}`,
        [1, 2, 3, 4, 5, 6],
        [7, 8],
      )
    ));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(React.createElement(UndrawnPatternsPanel, {
        history,
        windowLabel: "Custom (20)",
        loadedDrawCount: history.length,
      })));
      const input = container.querySelector<HTMLInputElement>('[aria-label="Observed pattern draw count"]');
      expect(input).not.toBeNull();

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "5");
        input?.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(container.textContent).toContain("Analysing latest 5 of 20 active draws");
      expect(container.textContent).toContain("Every card uses the newest 5 draws");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("shows the active WFMQYH window alongside the loaded history size", () => {
    const fullHistory: Draw[] = [
      buildDraw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      buildDraw("2026-01-08", [9, 10, 11, 12, 13, 14], [15, 16]),
      buildDraw("2026-01-15", [17, 18, 19, 20, 21, 22], [23, 24]),
      buildDraw("2026-01-22", [25, 26, 27, 28, 29, 30], [31, 32]),
    ];

    const html = renderToStaticMarkup(
      React.createElement(UndrawnPatternsPanel, {
        history: fullHistory.slice(-2),
        windowLabel: "Fortnight",
        loadedDrawCount: fullHistory.length,
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const panel = document.body.firstElementChild;

    expect(html).toContain("Window: Fortnight");
    expect(html).toContain("Analysing 2 of 4 loaded draws");
    expect(panel?.classList.contains("windfall-evidence-panel")).toBe(true);
    expect(document.querySelector(".windfall-evidence-wall")).not.toBeNull();
  });

  it("computes the audit from the provided history window instead of all loaded draws", () => {
    const fullHistory: Draw[] = [
      buildDraw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      buildDraw("2026-01-08", [9, 10, 11, 12, 13, 14], [15, 16]),
      buildDraw("2026-01-15", [17, 18, 19, 20, 21, 22], [23, 24]),
    ];

    const html = renderToStaticMarkup(
      React.createElement(UndrawnPatternsPanel, {
        history: fullHistory.slice(-1),
        windowLabel: "Weekly",
        loadedDrawCount: fullHistory.length,
      }),
    );

    expect(html).toContain("Analysing 1 of 3 loaded draws");
    expect(html).toContain("Undrawn per draw: 39 (mains only)");
  });

  it("renders a real simulated snapshot and next-step guidance for non-empty history", () => {
    const history: Draw[] = [
      buildDraw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      buildDraw("2026-01-08", [1, 9, 10, 11, 12, 13], [14, 15]),
      buildDraw("2026-01-15", [1, 16, 17, 18, 19, 20], [21, 22]),
      buildDraw("2026-01-22", [1, 23, 24, 25, 26, 27], [28, 29]),
    ];

    const html = renderToStaticMarkup(
      React.createElement(UndrawnPatternsPanel, {
        history,
        windowLabel: "Month",
        loadedDrawCount: history.length,
      }),
    );

    expect(html).toContain("Trials: 2500");
    expect(html).toContain("Most often undrawn in simulation");
    expect(html).toContain("Simulation next-step indicators");
    expect(html).toContain("Highest simulated support for staying undrawn");
    expect(html).not.toContain("Empirical (no simulation); stats derived from observed history.");
  });

  it("renders month-end carry-over statistics when the active window spans consecutive months", () => {
    const history: Draw[] = [
      buildDraw("2026-01-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      buildDraw("2026-01-09", [9, 10, 11, 12, 13, 14], [15, 16]),
      buildDraw("2026-02-03", [17, 18, 19, 20, 21, 22], [23, 24]),
      buildDraw("2026-02-10", [25, 26, 27, 28, 29, 30], [31, 32]),
      buildDraw("2026-03-05", [33, 34, 35, 36, 37, 38], [39, 40]),
      buildDraw("2026-03-12", [41, 42, 43, 44, 45, 1], [2, 3]),
    ];

    const html = renderToStaticMarkup(
      React.createElement(UndrawnPatternsPanel, {
        history,
        windowLabel: "Quarter",
        loadedDrawCount: history.length,
      }),
    );

    expect(html).toContain("Month-end carry-over");
    expect(html).toContain("Transitions: 2");
    expect(html).toContain("Best-supported early next-month flips");
    expect(html).toContain("Adjusted probability is shown first");
    expect(html).toContain("Early-hit timing:");
  });
});
