import React, { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { RankingWeightsPanel, type RankingWeights } from "../src/components/RankingWeightsPanel";
import { WindowStatsPanel } from "../src/components/WindowStatsPanel";
import { windowPatternForNumbers } from "../src/lib/windowPatternMatching";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const weights: RankingWeights = { oga: 0, selHitsEnabled: false, sel: 0, recentHitsEnabled: false,
  recent: 0, selBonusThreshold: 3, selBonusWeight: 0.2 };

function RankingHarness() {
  const [state, setState] = useState(weights);
  return React.createElement(RankingWeightsPanel, { weights: state, setWeights: setState, scope: "recency", selectedNumberCount: 4 });
}

function PatternHarness() {
  const [mode, setMode] = useState<"boost" | "restrict">("boost");
  const pattern = windowPatternForNumbers([1, 2, 3, 24, 25, 26]);
  return React.createElement(WindowStatsPanel, { draws: [], patternsSelected: [pattern], constraintMode: mode,
    onConstraintModeChange: setMode, patternBoostFactor: 0.15, onPatternBoostFactorChange: () => {}, onSumToleranceChange: () => {} });
}

describe("ranking boost control feedback", () => {
  it("disables the SelHits bonus fields until SelHits is On, independent of ordinary weight", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(RankingHarness)));
      const label = Array.from(container.querySelectorAll("label")).find((item) => item.textContent?.includes("Bonus weight"))!;
      expect(label.querySelector("input")!.disabled).toBe(true);
      expect(container.textContent).toContain("SelHits bonus: Off (SelHits Off)");
      await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
      expect(label.querySelector("input")!.disabled).toBe(false);
      expect(container.textContent).toContain("SelHits bonus: +0.20 if SelHits >= 3");
      await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
      expect(container.textContent).toContain("SelHits bonus: Off (SelHits Off)");
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("reports no selection rather than claiming an applied SelHits bonus", () => {
    const html = renderToStaticMarkup(React.createElement(RankingWeightsPanel, {
      weights: { ...weights, selHitsEnabled: true }, setWeights: () => {}, scope: "recency", selectedNumberCount: 0,
    }));
    expect(html).toContain("Off (no user-selected numbers)");
  });

  it("switches the pattern action and shows its exact applied effect", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(PatternHarness)));
      expect(container.textContent).toContain("+0.15 per matching pattern after hard filters");
      const select = container.querySelector("select")!;
      await act(async () => { select.value = "restrict"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(container.textContent).toContain("Require a match; sum tolerance +/-0");
      const labels = Array.from(container.querySelectorAll("label"));
      const bonus = labels.find((label) => label.textContent === "Pattern bonus")!;
      const control = container.querySelector<HTMLInputElement>(`[id="${bonus.htmlFor}"]`)!;
      expect(control.disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
