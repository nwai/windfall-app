import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MostLikelyNotDrawnPanel } from "../src/components/MostLikelyNotDrawnPanel";
import { MlndCalibrationAudit } from "../src/components/MlndCalibrationAudit";
import { buildMlndCalibratedAnalysis } from "../src/lib/mlndCalibration";
import { PANEL_OWNERSHIP_MANIFEST } from "../src/lib/evidenceFamilyRegistry";
import type { Draw } from "../src/types";

const fixture = (): Draw[] => {
  const date = new Date("2024-06-03T12:00:00Z");
  return Array.from({ length: 110 }, (_, index) => {
    if (index) do { date.setUTCDate(date.getUTCDate() + 1); } while (![1, 3, 5].includes(date.getUTCDay()));
    const numbers = Array.from({ length: 8 }, (_value, offset) => ((index * 7 + offset * 3) % 45) + 1);
    return { date: date.toISOString().slice(0, 10), main: numbers.slice(0, 6), supp: numbers.slice(6) };
  });
};
describe("MLND calibrated panel", () => {
  it("renders actual adjusted risks separately from original comparison indices", () => {
    const html = renderToStaticMarkup(React.createElement(MostLikelyNotDrawnPanel, { history: fixture() }));
    expect(html).toContain("Adjusted risk");
    expect(html).toContain("Raw index");
    expect(html).toContain("Raw comparison exclusions");
    expect(html).toContain("Original raw-score order; not a calibrated recommendation");
    expect(html).toContain("Calibrated exclusions at budget");
    expect(html).toContain("None supported");
    expect(html).toContain("Sequential calibration audit");
    expect(html).not.toContain("Treat this as calibrated exclusion-risk evidence");
  });

  it("discloses a flat learned map rather than inventing a safest set", () => {
    const analysis = buildMlndCalibratedAnalysis(fixture(), { minTrainingDraws: 20, asOfDate: "2026-10-20" });
    const flat = { ...analysis, status: "corrected-no-edge" as const, rows: analysis.rows.map(row => ({ ...row, adjustedRisk: 8 / 45 })) };
    const html = renderToStaticMarkup(React.createElement(MlndCalibrationAudit, { analysis: flat, budget: 37 }));
    expect(html).toContain("All 45 numbers currently share the same adjusted risk: 17.8%");
    expect(html).toContain("No safest-number ranking is manufactured");
    expect(html).toContain("None supported");
  });

  it("does not present missing data as a zero-error calibrated result", () => {
    const html = renderToStaticMarkup(React.createElement(MostLikelyNotDrawnPanel, { history: [] }));
    expect(html).toContain("Calibration is learning");
    expect(html).toContain("n/a");
    expect(html).toContain("No opening month exclusion");
    expect(html).not.toContain("0.00 drawn balls");
  });

  it("registers the nested audit as a shared observe-only validator", () => {
    expect(PANEL_OWNERSHIP_MANIFEST.find(row => row.panelId === "mlnd-calibration-audit")).toMatchObject({
      currentHome: "signals", primaryFamily: "frequency-recency", role: "validator", allowedUse: "observe-only",
    });
  });
});
