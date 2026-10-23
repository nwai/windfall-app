import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { useSavedZoneWeights } from "../src/hooks/useSavedZoneWeights";
import { getSavedZoneWeights, setSavedZoneWeights } from "../src/lib/zpaStorage";
import { analyzeHotColdRankingProfile, normalizeHotColdRankingSettings } from "../src/lib/hotColdRanking";
import { WindowStatsPanel } from "../src/components/WindowStatsPanel";
import { DGASimulateStrip } from "../src/components/DGANumberStrips";
import { UserSelectedNumbersPanel } from "../src/components/UserSelectedNumbersPanel";
import { PasteWeightedCandidatesPanel } from "../src/components/candidates/PasteWeightedCandidatesPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const app = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");

describe("shared setting ownership", () => {
  it("sends all hard exclusions to Bates and Parameter Search and live sum settings to both generator paths", () => {
    for (const panel of ["BatesPanel", "ParameterSearchPanel"]) {
      expect(app.match(new RegExp(`<${panel}[\\s\\S]*?/>`))?.[0]).toContain("excludedNumbers={allExclusions}");
    }
    expect(app).not.toContain("onSumFilterChange={() => {}}");
    expect(app).toContain("sumMin={sumFilter.min}");
    expect(app).toContain("sumFilter,\n");
    expect(app).not.toContain("sumFilter: { enabled: false, min: 0, max: 0, includeSupp: true }");
  });

  it("refreshes open Zone consumers with stable snapshots on same-tab and cross-tab writes", async () => {
    localStorage.removeItem("zpa:weights:v1");
    const container = document.createElement("div");
    const root = createRoot(container);
    const Consumer = () => React.createElement("span", null, JSON.stringify(useSavedZoneWeights()));
    try {
      await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(Consumer), React.createElement(Consumer))));
      expect(container.textContent).toBe("nullnull");
      await act(async () => setSavedZoneWeights({ 1: 1.5, 2: 0.5 }));
      expect(container.querySelectorAll("span")[0].textContent).toBe('{"1":1.5,"2":0.5}');
      expect(getSavedZoneWeights()).toBe(getSavedZoneWeights());
      expect(container.querySelectorAll("span")[1].textContent).toBe(container.querySelectorAll("span")[0].textContent);
      await act(async () => {
        localStorage.setItem("zpa:weights:v1", '{"1":2}');
        window.dispatchEvent(new StorageEvent("storage", { key: "zpa:weights:v1", storageArea: localStorage }));
      });
      expect(container.textContent).toBe('{"1":2}{"1":2}');
      await act(async () => {
        localStorage.removeItem("zpa:weights:v1");
        window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
      });
      expect(container.textContent).toBe("nullnull");
    } finally { await act(async () => root.unmount()); }
  });

  it("resolves Hot/Cold shortcuts from the shared profile without changing the all-real source", () => {
    const history = [
      { date: "2026-10-05", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
      { date: "2026-10-07", main: [9, 10, 11, 12, 13, 14], supp: [7, 15] },
    ];
    const settings = normalizeHotColdRankingSettings({ recentWindowChoice: "WFMQYH", halfLifeChoice: "0" });
    const combined = analyzeHotColdRankingProfile(history, settings, 1);
    const mainsOnly = analyzeHotColdRankingProfile(history, { ...settings, includeSupp: false }, 1);
    expect(combined.totalDraws).toBe(2);
    expect(combined.recentWindow).toBe(1);
    expect(combined.rows.find((row) => row.number === 7)?.weightedRate).toBe(1);
    expect(mainsOnly.rows.find((row) => row.number === 7)?.totalCount).toBe(0);
    expect(app).toContain("analyzeHotColdRankingProfile(realHistory, hotColdRankingSettings, activeWindowSize)");
    expect(app.match(/hotColdScopeLabel=\{hotColdScopeLabel\}/g)).toHaveLength(2);
    expect(app).toContain("hotColdRankingSettings: { ...hotColdRankingSettings }");
  });

  it("shows forced sources without checking DGA simulation boxes or adding user selections", () => {
    const strip = renderToStaticMarkup(React.createElement(DGASimulateStrip, { selectedNumbers: [], forcedNumbers: [7], onChange: vi.fn() }));
    const document = new DOMParser().parseFromString(strip, "text/html");
    expect((document.querySelector('[data-testid="dga-simulate-strip-number-7"]') as HTMLInputElement).checked).toBe(false);
    expect(document.querySelector('[data-testid="dga-simulate-strip-forced-7"]')?.textContent).toBe("F");
    expect(strip).toContain("0/8");
    const user = renderToStaticMarkup(React.createElement(UserSelectedNumbersPanel, {
      userSelectedNumbers: [], setUserSelectedNumbers: vi.fn(), externalSelectedNumbers: [7],
      forcedInclusionSources: [{ label: "Hot vs Cold", numbers: [7] }], onReviewForcedInclusions: vi.fn(),
    }));
    expect(user).toContain("Hot vs Cold: 7");
    expect(user).toContain("Selected set: none");
    expect(user).toContain("Review forced inclusions");
  });

  it("clears stale Paste-Weighted output, not pasted input, when shared hard numbers change", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onGeneratedCandidatesChange = vi.fn();
    const render = (excludedNumbers: number[]) => React.createElement(PasteWeightedCandidatesPanel, {
      initialPasteText: "1,2,3,4,5,6,7", generationForcedNumbers: [45], excludedNumbers, onGeneratedCandidatesChange,
    });
    try {
      await act(async () => root.render(render([])));
      const generate = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Generate paste-weighted candidates")!;
      await act(async () => generate.click());
      expect(onGeneratedCandidatesChange.mock.calls.at(-1)?.[0].length).toBeGreaterThan(0);
      await act(async () => root.render(render([1])));
      expect(onGeneratedCandidatesChange).toHaveBeenLastCalledWith([]);
      expect(container.querySelector("textarea")?.value).toBe("1,2,3,4,5,6,7");
    } finally { await act(async () => root.unmount()); }
  });

  it("applies valid sum drafts, mirrors enabled state and rejects reversed bounds", async () => {
    const apply = vi.fn();
    const Harness = () => {
      const [enabled, setEnabled] = useState(false);
      return React.createElement(WindowStatsPanel, { draws: [], sumMin: 100, sumMax: 150,
        sumFilterEnabled: enabled, onSumFilterEnabledChange: setEnabled, onSumFilterChange: apply });
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Apply to generation")!;
      await act(async () => button.click());
      expect(apply).toHaveBeenCalledWith({ min: 100, max: 150, includeSupp: true });
      const toggle = Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes("Sum filter on"))!.querySelector("input")!;
      await act(async () => toggle.click());
      expect(container.textContent).toContain("Applied sum filter: 100-150");
      await act(async () => root.render(React.createElement(WindowStatsPanel, { draws: [], sumMin: 200, sumMax: 100, onSumFilterChange: apply })));
      const invalidApply = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Apply to generation")!;
      expect(invalidApply.disabled).toBe(true);
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("no greater than maximum");
    } finally { await act(async () => root.unmount()); }
  });
});
