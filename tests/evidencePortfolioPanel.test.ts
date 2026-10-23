import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import EvidencePortfolioPanel, { EvidencePortfolioRecord, type EvidencePortfolioSimulationSource } from "../src/components/EvidencePortfolioPanel";
import { getPanelOwnership } from "../src/lib/evidenceFamilyRegistry";
import type { AppPresetSnapshot } from "../src/lib/presets";
import { buildEvidencePortfolio, portfolioIsoDate, preparePortfolioHistory } from "../src/lib/evidencePortfolio";
import { parseCSVorJSON } from "../src/parseCSVorJSON";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Evidence Portfolio surface", () => {
  it("explains experimental roles, actual constraints, and progressive audit before running", () => {
    const html = renderToStaticMarkup(React.createElement(EvidencePortfolioPanel, { history: [], activeHistory: [], targetDate: "2026-10-07", windowLabel: "All history", forcedNumbers: [], excludedNumbers: [], getSetupSnapshot: () => ({} as AppPresetSnapshot), onSave: () => {}, onViewJournal: () => {} }));
    expect(html).toContain("Experimental");
    expect(html).toContain("only main-generator constraints applied here");
    expect(html).toContain("Build four candidates");
    expect(html).toContain("Progressive family audit");
    expect(html).toContain("No evidence portfolios saved yet");
  });
  it("has one registered home between Validation and Generation", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(app.indexOf('panelId="evidence-portfolio"')).toBeGreaterThan(app.indexOf('panelId="prediction-journal"'));
    expect(app.indexOf('panelId="evidence-portfolio"')).toBeLessThan(app.indexOf('id="workflow-generation"'));
    expect(getPanelOwnership("evidence-portfolio")).toMatchObject({ role: "aggregator", primaryFamily: "evidence-aggregation" });
  });

  it("simulates every portfolio and shadow row with unchanged roles and an isolated copy", async () => {
    const recorded = preparePortfolioHistory(parseCSVorJSON(readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8")) as Draw[]).draws;
    const history = recorded.slice(0, 80);
    const snapshot = buildEvidencePortfolio({ history, activeHistory: history.slice(-26), targetDate: portfolioIsoDate(recorded[80].date),
      seed: 17, now: `${portfolioIsoDate(history[history.length - 1].date)}T01:00:00Z`, windowLabel: "Recorded 26-draw window", settingsSnapshot: {} as AppPresetSnapshot });
    const frozen = JSON.stringify(snapshot);
    const simulations: Array<{ main: number[]; supp: number[]; source: EvidencePortfolioSimulationSource }> = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(EvidencePortfolioRecord, { snapshot, history, onSimulate: (candidate, source) => {
        simulations.push({ main: candidate.main.slice(), supp: candidate.supp.slice(), source });
        candidate.main.reverse();
        candidate.supp.push(0);
        candidate.contributions["frequency-state"] = 0;
      } })));
      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".ep-simulate"));
      expect(buttons).toHaveLength(8);
      expect(container.textContent).toContain("Recorded 26-draw window");
      expect(container.textContent).toContain("Ticket M / S hits");
      expect(container.textContent).toContain("Cross-group Support");
      expect(container.textContent).toContain("Unplayed experimental challenger");
      expect(container.textContent).toContain("coverage fallback");
      for (const button of buttons) await act(async () => button.click());
      expect(simulations).toEqual([...snapshot.candidates.map(row => ({ main: row.main, supp: row.supp, source: "portfolio" })),
        ...snapshot.shadowBaseline.map(row => ({ main: row.main, supp: row.supp, source: "shadow-baseline" }))]);
      expect(JSON.stringify(snapshot)).toBe(frozen);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("does not invent an experimental challenger when viewing a legacy journal entry", () => {
    const recorded = preparePortfolioHistory(parseCSVorJSON(readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8")) as Draw[]).draws;
    const history = recorded.slice(0, 80);
    const { challenger: _challenger, ...snapshot } = buildEvidencePortfolio({ history, activeHistory: history.slice(-26), targetDate: portfolioIsoDate(recorded[80].date),
      seed: 17, now: `${portfolioIsoDate(history[history.length - 1].date)}T01:00:00Z`, windowLabel: "Recorded 26-draw window", settingsSnapshot: {} as AppPresetSnapshot });
    const html = renderToStaticMarkup(React.createElement(EvidencePortfolioRecord, { snapshot, history: recorded }));
    expect(html).toContain("Legacy record: no EP-R1 challenger was frozen");
    expect(html).not.toContain("Unplayed experimental challenger");
  }, 30_000);

  it("wires DGA simulation into the live panel and journal without recalculating supplementary roles", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const handler = app.slice(app.indexOf("const handleSimulateEvidencePortfolioCandidate ="), app.indexOf("function recordPredictionCaptureOutput"));
    expect(handler).toContain("main: candidate.main.slice(), supp: candidate.supp.slice()");
    expect(handler).toContain("isSimulated: true");
    expect(handler).toContain("unavailable.length === 0");
    expect(handler).toContain("syncUserSelectionForExternalSimulation(numbers)");
    expect(handler).toContain("scrollToDGA()");
    expect(handler).toContain("setDgaSectionOpen(true)");
    expect(handler).not.toContain("buildDgaSuppSuggestion");
    expect(app).toContain("onSimulate={handleSimulateEvidencePortfolioCandidate}");
    expect(app).toContain("onSimulateEvidencePortfolioCandidate={handleSimulateEvidencePortfolioCandidate}");
  });
});
