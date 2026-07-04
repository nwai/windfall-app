import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DroughtHazardPanel } from "../src/components/DroughtHazardPanel";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("DGA drought hazard truthfulness wording", () => {
  it("labels the DGA drought table as empirical mains+supps appearance evidence", () => {
    const appSource = source("src/App.tsx");
    const panelSource = source("src/components/DroughtHazardPanel.tsx");
    const heatmapSource = source("src/components/TemperatureHeatmap.tsx");

    expect(appSource).toContain("Drought-break shortlist (mains + supps)");
    expect(appSource).not.toContain("Most likely to break a drought next draw");
    expect(panelSource).toContain("Smoothed appearance rate");
    expect(panelSource).toContain("Observed hits / trials");
    expect(heatmapSource).toContain("Smoothed drought-break appearance rate");
    expect(heatmapSource).not.toContain("Break-drought chance next draw");
  });

  it("renders drought-break shortlist numbers as capped forced-inclusion controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(DroughtHazardPanel, {
        history: [],
        top: 4,
        defaultMode: "empirical",
        forcedNumbers: [1, 2, 3],
        maxForcedSelections: 3,
        onToggleNumber: () => undefined,
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const buttons = Array.from(document.querySelectorAll("button[data-drought-number-button='true']"));

    expect(document.body.textContent).toContain("3/3 selected for forced inclusion");
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
      "true",
      "false",
    ]);
    expect(buttons[0]?.getAttribute("aria-label")).toContain("Remove drought-break forced inclusion 1");
    expect(buttons[3]?.getAttribute("disabled")).not.toBeNull();
    expect(buttons[3]?.getAttribute("aria-label")).toContain("Maximum drought-break forced inclusions reached");
  });

  it("disables drought-break forced inclusion for user-excluded numbers", () => {
    const html = renderToStaticMarkup(
      React.createElement(DroughtHazardPanel, {
        history: [],
        top: 3,
        defaultMode: "empirical",
        forcedNumbers: [2],
        excludedNumbers: [1],
        maxForcedSelections: 3,
        onToggleNumber: () => undefined,
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const excludedButton = document.querySelector("button[aria-label='Number 1 is excluded by User Exclusions']");

    expect(document.body.textContent).toContain("User exclusions active: 1");
    expect(excludedButton?.getAttribute("aria-pressed")).toBe("false");
    expect(excludedButton?.getAttribute("disabled")).not.toBeNull();
    expect(excludedButton?.getAttribute("title")).toContain("Clear it in WFMQYH User Exclusions");
  });

  it("places the drought-break shortlist under Signals before Most Likely NOT Drawn", () => {
    const appSource = source("src/App.tsx");
    const droughtPanelIndex = appSource.indexOf('panelId="drought-break-shortlist"');
    const mostLikelyNotDrawnIndex = appSource.indexOf('panelId="most-likely-not-drawn"');
    const dgaWorkflowIndex = appSource.indexOf('id="workflow-dga"');

    expect(droughtPanelIndex).toBeGreaterThan(-1);
    expect(mostLikelyNotDrawnIndex).toBeGreaterThan(-1);
    expect(droughtPanelIndex).toBeLessThan(mostLikelyNotDrawnIndex);
    expect(droughtPanelIndex).toBeLessThan(dgaWorkflowIndex);
  });

  it("wires drought-break selections into generation forcing without selected-number boosting", () => {
    const appSource = source("src/App.tsx");

    expect(appSource).toContain("droughtBreakSelectedNumbers");
    expect(appSource).toContain("...droughtBreakSelectedNumbers");
    expect(appSource).toContain("drought-break selections");
    expect(appSource).toContain("externalSelectedNumbers={droughtBreakSelectedNumbers}");
    expect(appSource).not.toContain("selectedNumbersForBoost: [...userSelectedNumbers, ...droughtBreakSelectedNumbers]");
  });
});
