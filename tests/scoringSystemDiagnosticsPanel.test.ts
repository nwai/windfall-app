import React, { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { ScoringSystemDiagnosticsPanel } from "../src/components/ScoringSystemDiagnosticsPanel";
import type { ScoringGenerationInfluence } from "../src/lib/scoringGenerationInfluence";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const renderPanel = (
  realHistory: Draw[],
  realFilteredHistory: Draw[],
  generationInfluence: ScoringGenerationInfluence = "off",
): HTMLDivElement => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  act(() => {
    root.render(React.createElement(ScoringSystemDiagnosticsPanel, { realHistory, realFilteredHistory, generationInfluence }));
  });
  return container;
};

afterEach(() => {
  while (mountedRoots.length) {
    const mounted = mountedRoots.pop();
    if (!mounted) continue;
    act(() => mounted.root.unmount());
    mounted.container.remove();
  }
});

const clickButton = (container: HTMLElement, label: string): void => {
  const button = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const changeSelect = (container: HTMLElement, name: string, value: string): void => {
  const select = container.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
  expect(select).toBeTruthy();
  act(() => {
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const changeInput = (container: HTMLElement, name: string, value: string): void => {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input).toBeTruthy();
  act(() => {
    if (!input) return;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const clickCheckbox = (container: HTMLElement, name: string): void => {
  const checkbox = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(checkbox).toBeTruthy();
  act(() => {
    checkbox?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("ScoringSystemDiagnosticsPanel", () => {
  const fullHistory = [
    draw("D1", [1, 11, 21, 31, 41, 2], [12, 22]),
    draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
    draw("D3", [20, 21, 22, 25, 26, 27], [28, 29]),
    draw("6/15/26", [44, 43, 32, 34, 38, 24], [33, 40]),
  ];
  const filteredHistory = [fullHistory[2]];

  it("renders observe-only language and provenance", () => {
    const container = renderPanel(fullHistory, filteredHistory);

    expect(container.textContent).toContain("Scoring System Diagnostics");
    expect(container.textContent).toMatch(/Observe-only structural and history-derived scores/i);
    expect(container.textContent).toMatch(/does not change candidate generation/i);
    expect(container.textContent).toMatch(/Full real draws/i);
    expect(container.textContent).toMatch(/WFMQYH real draws/i);
  });

  it("reflects when diagnostics are actively influencing generation", () => {
    const container = renderPanel(fullHistory, filteredHistory, "normal");

    expect(container.textContent).toContain("Influence: Normal");
    expect(container.textContent).toMatch(/currently used as Normal diagnostic evidence weighting in generation/i);
    expect(container.textContent).toMatch(/not calibrated next-draw probabilities/i);
    expect(container.textContent).not.toMatch(/StateObserve-only/);
  });

  it("shows ratio diagnostics by default", () => {
    const container = renderPanel(fullHistory, filteredHistory);

    const ratiosButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Ratios");
    expect(ratiosButton?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("th")?.textContent).toBe("Ratio");
    expect(container.textContent).toContain("4:4");
    expect(container.textContent).toContain("3005");
  });

  it("switches to number diagnostics", () => {
    const container = renderPanel(fullHistory, filteredHistory);

    clickButton(container, "Numbers");

    const numbersButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Numbers");
    expect(numbersButton?.getAttribute("aria-pressed")).toBe("true");
    expect(Array.from(container.querySelectorAll("th")).map((th) => th.textContent)).toContain("Number");
    expect(container.textContent).toContain("terminal digit base score");
  });

  it("filters terminal digit sets by length and observed-only state", () => {
    const container = renderPanel(fullHistory, filteredHistory);

    clickButton(container, "Digit Sets");
    changeSelect(container, "scoringDigitSetLength", "2");
    clickCheckbox(container, "scoringObservedOnly");

    const table = container.querySelector('table[aria-label="Terminal digit set diagnostics"]');
    expect(table?.textContent).toContain("1,2");
    expect(table?.textContent).toContain("Unique terminal digits");
    expect(table?.textContent).toContain("Full exact hits");
    expect(table?.textContent).toContain("Full contained hits");
    expect(table?.textContent).toContain("WFMQYH contained hits");
    expect(table?.textContent).toContain("3,4");
    expect(table?.querySelector("details")?.textContent).toContain("Draw: D1");
    expect(table?.querySelector("details")?.textContent).toContain("Mains: 1,11,21,31,41,2");
    expect(table?.querySelector("details")?.textContent).toContain("Supps: 12,22");
    expect(table?.querySelector("summary")?.getAttribute("title")).toContain("Draw: D1");
    const containedSummary = Array.from(table?.querySelectorAll("summary") ?? [])
      .find((summary) => summary.textContent?.trim() === "3,4");
    expect(containedSummary?.getAttribute("title")).toContain("Draw: 6/15/26");
    expect(containedSummary?.parentElement?.textContent).toContain("Contained example");
    expect(container.textContent).toMatch(/Showing/i);
  });

  it("searches terminal digit sets by month and unique terminal digits", () => {
    const container = renderPanel(fullHistory, fullHistory);

    clickButton(container, "Digit Sets");
    changeSelect(container, "scoringDigitSetLength", "2");
    changeSelect(container, "scoringTopN", "1002");
    changeInput(container, "scoringSearchMonth", "6/26");
    changeInput(container, "scoringSearchDigits", "34");
    clickButton(container, "Search");

    const table = container.querySelector('table[aria-label="Terminal digit set diagnostics"]');
    expect(container.textContent).toContain("Search active: Jun 2026; 3,4");
    expect(table?.textContent).toContain("3,4");
    expect(table?.textContent).not.toContain("1,2");

    clickButton(container, "Clear");

    expect(container.textContent).not.toContain("Search active: Jun 2026; 3,4");
    expect(table?.textContent).toContain("1,2");
  });

  it("keeps large terminal digit result tables inside a scrollable frame", () => {
    const container = renderPanel(fullHistory, fullHistory);

    clickButton(container, "Digit Sets");
    changeSelect(container, "scoringTopN", "1002");

    const scrollRegion = container.querySelector<HTMLElement>('[aria-label="Terminal digit set diagnostics scroll area"]');
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion?.style.maxHeight).toBe("58vh");
    expect(scrollRegion?.style.overflowY).toBe("auto");
  });

  it("renders observe-only rank drift snapshots without generation controls", () => {
    const container = renderPanel(fullHistory, fullHistory);

    clickButton(container, "Rank Drift");
    changeSelect(container, "rankDriftStartAfter", "2");
    changeInput(container, "rankDriftItem", "1");

    expect(container.textContent).toContain("Rank Drift");
    expect(container.textContent).toContain("Observed movement only");
    expect(container.textContent).toContain("Walk-forward snapshots");
    expect(container.textContent).toContain("Terminal digit 1");
    expect(container.textContent).toContain("Direction");
    expect(container.textContent).not.toContain("Use rank drift influence");

    const table = container.querySelector('table[aria-label="Rank drift walk-forward snapshots"]');
    const scrollRegion = container.querySelector<HTMLElement>('[aria-label="Rank drift snapshots scroll area"]');
    expect(table?.textContent).toContain("Draws");
    expect(table?.querySelector("tbody tr")?.textContent).toContain("6/15/26");
    expect(scrollRegion?.style.maxHeight).toBe("46vh");
    expect(scrollRegion?.style.overflowY).toBe("auto");
  });

  it("shows a clear message when search input cannot be normalized", () => {
    const container = renderPanel(fullHistory, fullHistory);

    clickButton(container, "Digit Sets");
    changeInput(container, "scoringSearchMonth", "not a month");
    changeInput(container, "scoringSearchDigits", "3");
    clickButton(container, "Search");

    expect(container.textContent).toContain("Enter a month like 6/26 or unique terminal digits like 3,4.");
  });

  it("supports mains-only scope without reusing eight-number ratio labels", () => {
    const container = renderPanel(fullHistory, filteredHistory);

    changeSelect(container, "scoringDiagnosticsScope", "mains");

    expect(container.textContent).toMatch(/Mains only \(6\)/i);
    expect(container.textContent).toContain("3:3");
    expect(container.textContent).not.toContain("8:0");
  });

  it("renders an empty state when no valid real draws are available", () => {
    const container = renderPanel([], []);

    expect(container.textContent).toMatch(/No valid real draw history available/i);
  });
});
