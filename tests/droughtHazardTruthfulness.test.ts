import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DroughtHazardPanel } from "../src/components/DroughtHazardPanel";
import type { Draw } from "../src/types";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const makeDroughtHistory = (count: number): Draw[] => Array.from({ length: count }, (_, index) => {
  const epoch = Date.UTC(2026, 0, 1 + index);
  const date = new Date(epoch).toISOString().slice(0, 10);
  const numbers = index === 0
    ? Array.from({ length: 8 }, (__, numberIndex) => numberIndex + 1)
    : Array.from({ length: 8 }, (__, numberIndex) => 9 + (((index - 1) * 8 + numberIndex) % 37));
  return { date, main: numbers.slice(0, 6), supp: numbers.slice(6) };
});

describe("DGA drought hazard truthfulness wording", () => {
  it("labels the DGA drought table as empirical mains+supps appearance evidence", () => {
    const appSource = source("src/App.tsx");
    const panelSource = source("src/components/DroughtHazardPanel.tsx");
    const heatmapSource = source("src/components/TemperatureHeatmap.tsx");

    expect(appSource).toContain("Drought-break shortlist (mains + supps)");
    expect(appSource).not.toContain("Most likely to break a drought next draw");
    expect(panelSource).toContain("Smoothed appearance rate");
    expect(panelSource).toContain("Observed hits / trials");
    expect(panelSource).toContain("Replay scope: source split");
    expect(panelSource).toContain("Replay-only");
    expect(panelSource).toContain("does not recalculate the Strict drought or Empirical hazard shortlist above");
    expect(panelSource).toContain("Drought source split replay scope");
    expect(panelSource).toContain("Bucket maturity");
    expect(panelSource).toContain("separate observe-only, stage-conditioned comparison");
    expect(panelSource).toContain("does not change rank, empirical rate, forced selections, or generation");
    expect(panelSource).toContain("Drought learning and self-audit never add these numbers");
    expect(panelSource).toContain("Current forecast and latest draw replay");
    expect(panelSource).toContain("Two different time positions");
    expect(panelSource).toContain("existing Strict ordering remains the live champion");
    expect(heatmapSource).toContain("Smoothed drought-break appearance rate");
    expect(heatmapSource).not.toContain("Break-drought chance next draw");
  });

  it("separates the current forecast from the latest no-lookahead replay", () => {
    const history = makeDroughtHistory(28);
    const html = renderToStaticMarkup(
      React.createElement(DroughtHazardPanel, {
        history,
        fullHistory: history,
        baselineHistory: history,
        top: 8,
        targetDrawDate: "2/2/26",
        targetDrawOrdinal: 2,
        targetMonthExpectedDrawCount: 13,
      }),
    );
    const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";

    expect(text).toContain("Current forecast and latest draw replay");
    expect(text).toContain("Targets 2/2/26 · 13D D2");
    expect(text).toContain("Latest draw replay");
    expect(text).toContain("Rebuilt from 27 prior draws only");
    expect(text).toContain("Strict uses full-history current drought; Empirical uses the active WFMQYH window");
    expect(text).toContain("Neither policy changes generation automatically");
  });

  it("colors Strict numbers red and Empirical numbers blue while preserving selection state", () => {
    const strictHistory = makeDroughtHistory(28);
    const strictHtml = renderToStaticMarkup(
      React.createElement(DroughtHazardPanel, {
        history: strictHistory,
        fullHistory: strictHistory,
        top: 2,
        defaultMode: "strict",
        forcedNumbers: [1],
        maxForcedSelections: 3,
        onToggleNumber: () => undefined,
      }),
    );
    const strictDocument = new DOMParser().parseFromString(strictHtml, "text/html");
    const strictButton = strictDocument.querySelector("button[data-drought-number-button='true'][data-drought-source='strict']");

    const empiricalHtml = renderToStaticMarkup(
      React.createElement(DroughtHazardPanel, {
        history: [],
        top: 2,
        defaultMode: "empirical",
        maxForcedSelections: 3,
        onToggleNumber: () => undefined,
      }),
    );
    const empiricalDocument = new DOMParser().parseFromString(empiricalHtml, "text/html");
    const empiricalButton = empiricalDocument.querySelector("button[data-drought-number-button='true'][data-drought-source='empirical']");

    expect(strictButton?.getAttribute("style")).toContain("color:#b42318");
    expect(strictButton?.getAttribute("style")).toContain("box-shadow:0 0 0 2px #16a34a");
    expect(strictButton?.getAttribute("aria-pressed")).toBe("true");
    expect(empiricalButton?.getAttribute("style")).toContain("color:#1d4ed8");
    expect(empiricalButton?.getAttribute("aria-pressed")).toBe("false");
  });

  it("extends drought source colors to the latest audit-row hit numbers", () => {
    const panelSource = source("src/components/DroughtHazardPanel.tsx");
    const guideSource = source("docs/HIG_UI_GUIDE.md");
    const manualSource = source("public/user-manual.html");

    expect(panelSource).toContain("data-drought-audit-source");
    expect(panelSource).toContain('source === "strict-only"');
    expect(panelSource).toContain('source === "empirical-only"');
    expect(panelSource).toContain("linear-gradient(90deg, #fff1f1 0 50%, #eff6ff 50% 100%)");
    expect(panelSource).toContain("Strict-only rank");
    expect(panelSource).toContain("Empirical-only rank");
    expect(guideSource).toContain("Color number tokens only when the color names a specific fact");
    expect(manualSource).toContain("A split red/blue number appeared in both lists");
  });

  it("keeps drought learning versioned, walk-forward, and observe-only", () => {
    const panelSource = source("src/components/DroughtLearningAuditPanel.tsx");
    const modelSource = source("src/lib/droughtLearningAudit.ts");
    const windowSource = source("src/lib/droughtWindowEvidence.ts");
    const manualSource = source("public/user-manual.html");

    expect(panelSource).toContain("Drought Learning & Self-Audit");
    expect(panelSource).toContain("does not modify application code");
    expect(panelSource).toContain("does not affect candidate generation");
    expect(panelSource).toContain("Episodes 6+ is deliberately excluded");
    expect(panelSource).toContain("Drought State Identity Audit");
    expect(panelSource).toContain("Nested sources collapsed");
    expect(modelSource).toContain('DROUGHT_LEARNING_MODEL_VERSION = "DLA-1"');
    expect(modelSource).toContain('DROUGHT_STATE_IDENTITY_VERSION = "DSI-1"');
    expect(modelSource).toContain("gateBeforeDraw = evaluateGate(records)");
    expect(modelSource).toContain("updateLearningCounters");
    expect(modelSource).toContain("drawState.hits - (drawState.opportunities * DROUGHT_HAZARD_ANY_DRAWN_BASELINE)");
    expect(windowSource).toContain('DROUGHT_WINDOW_EVIDENCE_VERSION = "DWE-1"');
    expect(windowSource).toContain('{ id: "W", label: "W · latest 3", requestedDraws: 3, scale: "short" }');
    expect(windowSource).toContain('{ id: "F", label: "F · latest 6", requestedDraws: 6, scale: "short" }');
    expect(manualSource).toContain("Sharing a state is repeatable by definition");
    expect(manualSource).toContain("DSI-1 and DWE-1 use recorded real history only");
  });

  it("keeps empirical-hazard calibration real-only, walk-forward, and separate from generation", () => {
    const panelSource = source("src/components/DroughtHazardCalibrationAuditPanel.tsx");
    const modelSource = source("src/lib/droughtHazardCalibration.ts");
    const droughtPanelSource = source("src/components/DroughtHazardPanel.tsx");

    expect(droughtPanelSource).toContain("DroughtHazardCalibrationAuditPanel");
    expect(panelSource).toContain("Empirical Hazard Calibration Audit");
    expect(panelSource).toContain("Recorded real draws only");
    expect(panelSource).toContain("does not affect generation");
    expect(panelSource).toContain("There is no perfect finite sample size");
    expect(modelSource).toContain('DROUGHT_HAZARD_CALIBRATION_VERSION = "DHC-1"');
    expect(modelSource).toContain("selectedStrength = learnedSelectionReady");
    expect(modelSource).toContain("updateExposure(exposures, droughts[number], hit)");
    expect(modelSource).toContain("if (drought == null) return");
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

  it("keeps active forced inclusions removable when they leave the displayed shortlist", () => {
    const html = renderToStaticMarkup(
      React.createElement(DroughtHazardPanel, {
        history: [],
        top: 1,
        defaultMode: "strict",
        forcedNumbers: [44, 45],
        maxForcedSelections: 3,
        onToggleNumber: () => undefined,
        onClearForcedNumbers: () => undefined,
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const activeControls = Array.from(document.querySelectorAll("button[data-active-drought-forced-number]"));

    expect(document.body.textContent).toContain("Active forced inclusions");
    expect(document.body.textContent).toContain("Not in the current Strict top 1: 44, 45");
    expect(document.body.textContent).toContain("They remain hard inclusions until removed");
    expect(activeControls.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Remove drought-break forced inclusion 44",
      "Remove drought-break forced inclusion 45",
    ]);
    expect(document.body.textContent).toContain("Clear all");
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
    const excludedButton = document.querySelector("button[aria-label='Number 1 is unavailable because it is excluded']");

    expect(document.body.textContent).toContain("Active exclusions: 1");
    expect(excludedButton?.getAttribute("aria-pressed")).toBe("false");
    expect(excludedButton?.getAttribute("disabled")).not.toBeNull();
    expect(excludedButton?.getAttribute("title")).toContain("Clear the active exclusion");
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
    expect(appSource).toContain("externalSelectedNumbers={numberTrendExternalSelectedNumbers}");
    expect(appSource).toContain("() => generationForcedNumbers.filter((number) => !trendSelectedNumbers.includes(number))");
    expect(appSource).not.toContain("selectedNumbersForBoost: [...userSelectedNumbers, ...droughtBreakSelectedNumbers]");
  });
});
