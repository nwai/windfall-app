import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HistoricalOgaDistribution } from "../src/components/HistoricalOgaDistribution";
import { InlineCollapsibleCard } from "../src/components/shared/InlineCollapsibleCard";
import type { OGAForecast } from "../src/lib/ogaForecast";

const distribution = (): OGAForecast => ({ n: 40, scores: Array.from({ length: 40 }, (_, i) => i),
  mean: 19.5, p10: 3, p50: 19, p90: 35, bands: { low: 0.1, mid: 0.8, high: 0.1 },
  deciles: { thresholds: [3, 7, 11, 15, 19, 23, 27, 31, 35], probs: [0.05, 0.1, 0.1, 0.1, 0.15, 0.15, 0.1, 0.1, 0.1, 0.05] } });
const props = (data = distribution()) => ({ distribution: data, historyLabel: "Custom (40) (WFMQYH)",
  referenceLabel: "Full History", referenceDrawCount: 378, spokeCount: 5 });
const render = (data = distribution()) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(React.createElement(HistoricalOgaDistribution, props(data)));
  return container;
};

describe("historical OGA distribution", () => {
  it("discloses actual shared scopes and separates observed from smoothed shares", () => {
    const container = render();
    expect(container.textContent).toContain("40 real draws, mains + supps");
    expect(container.textContent).toContain("Reference: Full History (378 real draws). Number groups: 5");
    expect(container.textContent).toContain("not next-draw accuracy or winning probabilities");
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(10);
    expect(rows[0].textContent).toBe("D0<= 3410.0%5.0%");
    expect(rows[9].textContent).toBe("D9> 35410.0%5.0%");
    expect(Array.from(rows).reduce((sum, row) => sum + Number(row.querySelectorAll("td")[1].textContent), 0)).toBe(40);
    expect(container.querySelector("select, input")).toBeNull();
  });
  it("provides accessible formula and in-sample limitations instead of a geometry or forecasting claim", () => {
    const container = render();
    expect(container.textContent).toContain("does not measure angles, distances or symmetry");
    expect(container.textContent).toContain("not a no-lookahead replay");
    expect(container.textContent).toContain("cannot change any generation setting");
    expect(container.querySelector('[aria-label="What the historical OGA score measures"]')).not.toBeNull();
    expect(container.querySelector('[role="region"][tabindex="0"]')).not.toBeNull();
  });
  it("suppresses percentages for empty, one-draw and otherwise thin samples", () => {
    for (const n of [0, 1, 29]) {
      const original = distribution();
      const container = render({ ...original, n, scores: original.scores.slice(0, n) });
      expect(container.querySelector("table")).toBeNull();
      expect(container.textContent).toContain(n ? "at least 30 real draws" : "No real draw history available");
      expect(container.textContent).not.toContain("50.0%");
    }
  });
  it("does not display a collapsed or invalid score distribution as supported evidence", () => {
    const data = distribution();
    for (const invalid of [
      { ...data, p90: data.p10 },
      { ...data, mean: NaN },
      { ...data, scores: [NaN, ...data.scores.slice(1)] },
      { ...data, deciles: undefined },
      { ...data, deciles: { ...data.deciles!, probs: [NaN] } },
    ]) {
      expect(render(invalid).querySelector("table")).toBeNull();
    }
  });
  it("leaves empty tied intervals visible rather than inventing observations", () => {
    const data = distribution();
    data.deciles!.thresholds[1] = data.deciles!.thresholds[0];
    const rows = render(data).querySelectorAll("tbody tr");
    expect(rows[1].textContent).toContain("Empty interval (tied cutoffs)00.0%");
    expect(Array.from(rows).reduce((sum, row) => sum + Number(row.querySelectorAll("td")[1].textContent), 0)).toBe(40);
  });
  it("is unmounted behind the default-closed advanced disclosure", () => {
    const html = renderToStaticMarkup(React.createElement(InlineCollapsibleCard, {
      title: "Historical OGA distribution (advanced)", defaultExpanded: false,
      children: React.createElement(HistoricalOgaDistribution, props()),
    }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<table");
  });
  it("retires the standalone forecast without introducing a second engine calculation or changing its formula", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toContain('panelId="next-draw-probabilities"');
    expect(app).toContain("<HistoricalOgaDistribution distribution={ogaForecastStats}");
    expect(app).toContain("spokeCount={ogaSpokeCount}");
    expect(app).toContain("referenceDrawCount={ogaForecastBaselineHistory.length}");
    expect(app).toContain("Historical source: {historyWindowName}");
    expect(app).toContain("Source shares describe observed history, not winning probabilities");
    expect(existsSync("src/components/NextDrawProbabilitiesPanel.tsx")).toBe(false);
    expect(existsSync("tests/nextDrawEmpiricalDiagnosticsPanel.test.tsx")).toBe(false);
  });
});
