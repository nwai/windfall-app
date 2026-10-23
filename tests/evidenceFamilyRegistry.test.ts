import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EVIDENCE_FAMILY_REGISTRY,
  EVIDENCE_PORTFOLIO_RULES,
  EVIDENCE_PORTFOLIO_VERSION,
  PANEL_OWNERSHIP_MANIFEST,
  getEvidenceFamily,
  getPanelOwnership,
  panelCanProvideIndependentPortfolioEvidence,
} from "../src/lib/evidenceFamilyRegistry";

describe("evidence family registry and panel ownership", () => {
  it("has unique families and panel ids with valid dependencies", () => {
    const familyIds = EVIDENCE_FAMILY_REGISTRY.map((family) => family.id);
    const panelIds = PANEL_OWNERSHIP_MANIFEST.map((entry) => entry.panelId);

    expect(new Set(familyIds).size).toBe(familyIds.length);
    expect(new Set(panelIds).size).toBe(panelIds.length);
    PANEL_OWNERSHIP_MANIFEST.forEach((entry) => {
      expect(getEvidenceFamily(entry.primaryFamily)).toBeDefined();
      entry.dependencies.forEach((familyId) => expect(getEvidenceFamily(familyId)).toBeDefined());
    });
  });

  it("registers every literal collapsible panel id used by App", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const panelIds = [...app.matchAll(/panelId="([^"]+)"/g)].map((match) => match[1]);
    const unregistered = [...new Set(panelIds)].filter((panelId) => !getPanelOwnership(panelId));

    expect(unregistered).toEqual([]);
  });

  it("keeps aggregators and the consecutive-run drought cross-check from becoming extra votes", () => {
    const aggregationFamily = getEvidenceFamily("evidence-aggregation");
    const runWatch = getPanelOwnership("consecutive-run-monthly-watch");
    const confluence = getPanelOwnership("signal-confluence-ledger");

    expect(aggregationFamily?.portfolioPolicy).toBe("not-evidence");
    expect(runWatch).toMatchObject({
      primaryFamily: "consecutive-run",
      dependencies: ["drought"],
      allowedUse: "observe-only",
    });
    expect(confluence).toMatchObject({
      primaryFamily: "evidence-aggregation",
      role: "aggregator",
      allowedUse: "observe-only",
    });
    expect(getPanelOwnership("number-trends")).toMatchObject({
      primaryFamily: "frequency-recency",
      dependencies: ["drought"],
      allowedUse: "user-directed",
    });
  });

  it("publishes fixed bounded portfolio rules and blocks downstream outputs from independent scoring", () => {
    expect(EVIDENCE_PORTFOLIO_VERSION).toMatch(/^WF-EVIDENCE-/);
    expect(EVIDENCE_PORTFOLIO_RULES).toMatchObject({
      scoreCapPerIndependenceGroup: 1,
      withinGroupRule: "strongest-eligible-mention",
      acrossGroupRule: "equal-bounded-sum",
      aggregatorOutputRule: "context-only",
      consumerOutputRule: "context-only",
      outcomeSelectedWeights: false,
    });
    expect(panelCanProvideIndependentPortfolioEvidence("previous-neighbour-backtest")).toBe(true);
    expect(panelCanProvideIndependentPortfolioEvidence("signal-confluence-ledger")).toBe(false);
    expect(panelCanProvideIndependentPortfolioEvidence("next-draw-evidence-ensemble")).toBe(false);
    expect(panelCanProvideIndependentPortfolioEvidence("selection-insights")).toBe(false);
    expect(panelCanProvideIndependentPortfolioEvidence("user-selected-numbers")).toBe(false);
    expect(getPanelOwnership("number-trends-movement-replay")).toMatchObject({
      primaryFamily: "frequency-recency", role: "consumer", allowedUse: "observe-only",
    });
    expect(panelCanProvideIndependentPortfolioEvidence("number-trends-movement-replay")).toBe(false);
    expect(getPanelOwnership("next-draw-probabilities")).toBeUndefined();
    expect(getPanelOwnership("historical-oga-distribution")).toMatchObject({
      currentHome: "generation", primaryFamily: "frequency-recency", role: "consumer", allowedUse: "observe-only",
    });
    expect(panelCanProvideIndependentPortfolioEvidence("historical-oga-distribution")).toBe(false);
  });
});
