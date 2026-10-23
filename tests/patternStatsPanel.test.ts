import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PatternStatsPanel } from "../src/components/candidates/PatternStatsPanel";
import { FAVORITE_PANEL_REGISTRY } from "../src/lib/panelFavorites";
import type { Draw } from "../src/types";

const draws: Draw[] = [
  { date: "1/1/25", main: [5, 6, 7, 18, 29, 40], supp: [2, 45] },
  { date: "1/3/25", main: [1, 10, 20, 30, 40, 45], supp: [2, 44] },
];

describe("Historical Draw Composition panel", () => {
  let container: HTMLDivElement, root: Root, previousActEnvironment: unknown;
  const render = async (props: React.ComponentProps<typeof PatternStatsPanel> = { draws }) => {
    await act(async () => root.render(React.createElement(PatternStatsPanel, props)));
  };
  const click = async (selector: string) => {
    const target = container.querySelector<HTMLElement>(selector);
    if (!target) throw new Error(`Missing control: ${selector}`);
    await act(async () => target.click());
  };
  const distribution = (title: string) => container.querySelector(`[aria-label="${title} historical distribution"]`)!;

  beforeEach(() => {
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
    previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  it("shows real scope, tied modes, whole-number categories and proportional bars", async () => {
    await render();
    expect(container.textContent).toContain("2 eligible real draws");
    expect(container.textContent).toContain("1/1/25 to 1/3/25");
    expect(container.textContent).toContain("Observe-only · No generation effect");
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')?.checked).toBe(true);
    const adjacent = distribution("Adjacent number pairs");
    expect(Array.from(adjacent.querySelectorAll("tbody th")).map(cell => cell.textContent)).toEqual(["0 pairs", "1 pair", "2 pairs", "3 pairs", "4 pairs", "5 pairs"]);
    expect(container.querySelector(".historical-composition__finding")?.textContent).toBe("Tied most common: 0 pairs; 2 pairs in 1 of 2 draws each (50.0%).");
    expect(Array.from(adjacent.querySelectorAll<HTMLElement>(".historical-composition__bar")).map(bar => bar.style.width)).toEqual(["50%", "0%", "50%", "0%", "0%", "0%"]);
    expect(adjacent.textContent).toContain("1/2");
    expect(adjacent.textContent).toContain("50.0%");
    expect(Array.from(distribution("Number sum").querySelectorAll("tbody th")).map(cell => cell.textContent)).toEqual(["100-119", "120-139", "140-159"]);
  });

  it("switches local six/eight-number scope without modifying history or selected numbers", async () => {
    const selectedNumbers = [...draws[0].main, ...draws[0].supp];
    const original = JSON.stringify({ draws, selectedNumbers });
    await render({ draws, selectedNumbers });
    await click('fieldset label:last-child input[type="radio"]');
    expect(distribution("Adjacent number pairs").querySelectorAll("tbody tr").length).toBe(8);
    expect(distribution("Even numbers").textContent).toContain("8 even / 0 odd");
    expect(container.querySelector(".historical-composition__finding")?.textContent).toBe("Most common: 2 pairs in 2 of 2 draws (100.0%).");
    expect(JSON.stringify({ draws, selectedNumbers })).toBe(original);
  });

  it("requires matching selection size, compares separate features and updates shared selection props", async () => {
    const eight = [...draws[0].main, ...draws[0].supp];
    await render({ draws, selectedNumbers: eight });
    await click('input[type="checkbox"]');
    expect(container.textContent).toContain("8 numbers selected; this scope describes 6");
    expect(container.querySelectorAll('[data-comparison="true"]').length).toBe(0);
    await click('fieldset label:last-child input[type="radio"]');
    expect(container.querySelectorAll('[data-comparison="true"]').length).toBe(4);
    expect(container.querySelector('[aria-label="Selected numbers and historical composition"]')?.textContent).toContain("152 (band 140-159)");
    expect(container.textContent).toContain("must not be added or multiplied into a winning chance");
    await render({ draws, selectedNumbers: [1, 2, 3] });
    expect(container.textContent).toContain("Compare User Selected numbers (3)");
    expect(container.textContent).toContain("3 numbers selected; this scope describes 8");
    expect(container.querySelectorAll('[data-comparison="true"]').length).toBe(0);
    await click('input[type="checkbox"]');
    expect(container.querySelector('[aria-label="Your selection comparison"]')).toBeNull();
  });

  it("does not invent frequency charts when there is no eligible evidence", async () => {
    await render({ draws: [{ ...draws[0], isSimulated: true }, { ...draws[1], date: "1/2/25" }], selectedNumbers: draws[0].main });
    expect(container.textContent).toContain("Excluded 2 input rows: 1 simulated, 0 malformed, 1 off-schedule");
    expect(container.textContent).toContain("Historical frequencies are unavailable");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".historical-composition__finding")).toBeNull();
    await click('input[type="checkbox"]');
    expect(container.textContent).toContain("No eligible historical draws are available for comparison");
  });

  it("recalculates after history changes and visibly reports zero-observed comparison bands", async () => {
    const selectedNumbers = [1, 2, 3, 4, 5, 6];
    await render({ draws, selectedNumbers });
    await click('input[type="checkbox"]');
    expect(container.querySelector('[aria-label="Selected numbers and historical composition"]')?.textContent).toContain("21 (band 21-39)");
    expect(container.querySelector('[aria-label="Selected numbers and historical composition"] tbody tr:last-child')?.textContent).toContain("0/2 (0.0%)");
    await render({ draws: [...draws, { date: "1/6/25", main: selectedNumbers, supp: [7, 8] }], selectedNumbers });
    expect(container.textContent).toContain("3 eligible real draws");
    expect(container.textContent).toContain("1/1/25 to 1/6/25");
    expect(container.querySelector('[aria-label="Selected numbers and historical composition"] tbody tr:last-child')?.textContent).toContain("1/3 (33.3%)");
    expect(container.querySelectorAll('[data-comparison="true"]').length).toBe(4);
  });

  it("makes measure definitions and illustrative examples available on click", async () => {
    await render();
    await click('button[aria-label="About adjacent number pairs"]');
    expect(container.querySelector('button[aria-label="About adjacent number pairs"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("two adjacent pairs, within one three-number run");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("not a historical observation");
    await click('button[aria-label="About adjacent number pairs"]');
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("keeps the stable panel identity, shared WFMQYH input, read-only selection and manual in sync", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('panelId="pattern-stats" title={<b>Historical Draw Composition</b>}');
    expect(app).toContain('<PatternStatsPanel draws={realFilteredHistory} selectedNumbers={userSelectedNumbers} />');
    expect(app).not.toContain('summaryHint="collapsed"');
    expect(FAVORITE_PANEL_REGISTRY.find(panel => panel.id === "pattern-stats")?.title).toBe("Historical Draw Composition");
    const manual = readFileSync("public/user-manual.html", "utf8");
    expect(manual).toContain('id="historical-draw-composition"');
    expect(manual).toContain("Pattern Stats");
    expect(manual).toContain("four percentages must not be added or multiplied");
  });
});
