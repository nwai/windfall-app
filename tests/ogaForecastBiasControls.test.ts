import React, { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OgaForecastBiasControls } from "../src/components/OgaForecastBiasControls";
import type { OgaForecastBiasOptions, PreferredOgaDecile } from "../src/lib/ogaDecileAcceptance";
import { analyzeGenerationPreflight } from "../src/lib/generationPreflight";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const options: OgaForecastBiasOptions = { enabled: true, preferredBand: "mid", evidenceDrawCount: 40,
  deciles: { thresholds: [0, 1, 2, 3, 4, 5, 6, 7, 8], probs: [] }, preferredDeciles: [] };
function Harness() {
  const [preferences, setPreferences] = useState<PreferredOgaDecile[]>([]);
  const [enabled, setEnabled] = useState(true);
  return React.createElement(OgaForecastBiasControls, { options: { ...options, enabled, preferredDeciles: preferences },
    baselineMode: "all", referenceDrawCount: 100, onEnabledChange: setEnabled,
    onBaselineModeChange: () => {}, onPreferredBandChange: () => {}, onPreferredDecilesChange: setPreferences });
}

describe("OGA score band control feedback", () => {
  it("starts collapsed and switches explicitly between broad bands and selected-only mode", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const disclosure = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
      expect(disclosure.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector('input[aria-label="Use OGA band D4"]')).toBeNull();
      expect(container.textContent).toContain("40 active WFMQYH real draws; reference: Full History (100 real draws)");
      await act(async () => disclosure.click());
      const weight = container.querySelector<HTMLInputElement>('input[id]')!;
      expect(weight.disabled).toBe(true);
      const checkbox = container.querySelector<HTMLInputElement>('input[aria-label="Use OGA band D4"]')!;
      await act(async () => checkbox.click());
      expect(container.textContent).toContain("Selected OGA bands only: D4 x1; no broad-band fallback");
      expect(container.querySelectorAll("select")[1].disabled).toBe(true);
      const clear = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Clear bands")!;
      await act(async () => clear.click());
      expect(container.querySelectorAll("select")[1].disabled).toBe(false);
      expect(container.textContent).toContain("Broad OGA band: mid");
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("reports all-zero weights and blocks standard pre-flight but not the documented RwR45 bypass", () => {
    const zeroOptions = { ...options, preferredDeciles: [{ index: 4, weight: 0 }] };
    const html = renderToStaticMarkup(React.createElement(OgaForecastBiasControls, { options: zeroOptions,
      baselineMode: "window", referenceDrawCount: 40, onEnabledChange: () => {}, onBaselineModeChange: () => {},
      onPreferredBandChange: () => {}, onPreferredDecilesChange: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Generation is blocked");
    const base = { requested: 4, forcedNumbers: [], excludedNumbers: [], ogaForecast: zeroOptions };
    expect(analyzeGenerationPreflight({ ...base, mode: "standard" }).blockers)
      .toEqual([{ target: "ogaForecast", message: expect.stringContaining("positive weight") }]);
    expect(analyzeGenerationPreflight({ ...base, mode: "rwr45" }).blockers).toEqual([]);
    expect(analyzeGenerationPreflight({ ...base, mode: "standard", ogaForecast: { ...zeroOptions, enabled: false } }).blockers).toEqual([]);
  });

  it("passes the shared baseline/configuration through worker and batch paths and snapshots", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("ogaBiasOptions: ogaForecastBiasOptions");
    expect(app).toContain("baselineHistory: ogaForecastBaselineHistory");
    expect(app).toContain("evidenceDrawCount: ogaForecastStats.n");
    expect(app).toContain("onPreferredDecilesChange={setOGAPreferredDeciles}");
    expect(app).toContain("ogaForecast: ogaForecastBiasOptions");
    expect(app).toContain("ogaForecastBiasOptions,\n      undefined");
    expect(readFileSync("src/workers/generateWorker.ts", "utf8")).toContain("ogaBiasOptions?: OgaForecastBiasOptions");
    expect(readFileSync("src/hooks/useGenerateWorker.ts", "utf8")).toContain("args.ogaBiasOptions");
    expect(app).toContain("ogaPreferredDeciles: [...ogaPreferredDeciles]");
    expect(app).toContain('label: "OGA acceptance bias"');
  });

  it("shows the actual RwR45 bypass instead of claiming an active or blocking OGA rule", () => {
    const html = renderToStaticMarkup(React.createElement(OgaForecastBiasControls, {
      options: { ...options, preferredDeciles: [{ index: 4, weight: 0 }] },
      baselineMode: "window", referenceDrawCount: 40, bypassedByRandomCoverage: true,
      onEnabledChange: () => {}, onBaselineModeChange: () => {}, onPreferredBandChange: () => {}, onPreferredDecilesChange: () => {},
    }));
    expect(html).toContain("Bypassed by RwR45/PNUaRW45");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Generation is blocked");
  });
});
