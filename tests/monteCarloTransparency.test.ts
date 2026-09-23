import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { MonteCarloPanel } from "../src/components/candidates/MonteCarloPanel";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe("Monte Carlo displayed results", () => {
  it("keeps completed-run denominator, invalidates changed evidence and blocks undersized pools", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    const history: Draw[] = [{ date: "2026-09-14", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }];
    const excluded = Array.from({ length: 37 }, (_, i) => i + 9);
    const render = (draws = history, exclusions = excluded) => root.render(React.createElement(MonteCarloPanel, { history: draws, excludedNumbers: exclusions, enableSDE1: false, trendWeights: { 1: 2 } }));
    try {
      await act(async () => render());
      expect([...container.querySelectorAll("label")].find(label => label.textContent?.includes("Trend Bias"))!.querySelector("input")!.checked).toBe(false);
      const layout = [...container.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "table"))!;
      await act(async () => Simulate.change(layout, { target: { value: "table" } } as never));
      const runs = [...container.querySelectorAll("label")].find(label => label.textContent?.includes("Runs:"))!.querySelector("input")!;
      await act(async () => Simulate.change(runs, { target: { value: "1000" } } as never));
      const run = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Run")!;
      await act(async () => run().click());
      await act(async () => vi.runAllTimersAsync());
      const simCells = () => [...container.querySelectorAll("tbody tr")].slice(0, 8).map(row => row.children[3].textContent);
      expect(simCells()).toEqual(Array(8).fill("100.00"));
      await act(async () => Simulate.change(runs, { target: { value: "2000" } } as never));
      expect(simCells()).toEqual(Array(8).fill("100.00"));
      expect(container.textContent).toContain("Completed 1,000 simulations");
      await act(async () => render([...history, { ...history[0], date: "2026-09-16" }]));
      expect(simCells()).toEqual(Array(8).fill("—"));
      await act(async () => render(history, [...excluded, 8]));
      expect(run().disabled).toBe(true);
      expect(container.textContent).toContain("only 7 available");
    } finally { await act(async () => root.unmount()); vi.useRealTimers(); }
  });
});
