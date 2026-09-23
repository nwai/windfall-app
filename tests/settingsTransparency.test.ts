import React, { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSettingsPersistence } from "../src/hooks/useSettingsPersistence";
import { lastDrawBiasMultiplier, seededRandom, effectiveSettingsTrace, withRestoredSettingSources } from "../src/lib/settingsTransparency";
import { monteCarloWeights, simulateMonteCarlo } from "../src/lib/monteCarloModel";
import { buildTrendWeights } from "../src/lib/trendBias";
import { generateCandidates } from "../src/generateCandidates";
import { analyzeLatestNeighbourSupport } from "../src/lib/latestNeighbourSupport";
import type { Draw, Knobs } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const history: Draw[] = [{ date: "2026-09-14", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }];
const knobs: Knobs = { enableSDE1: false, enableHC3: false, enableOGA: false, enableGPWF: false, enableEntropy: false, enableHamming: false, enableJaccard: false, F: 0, M: 0, Q: 0, Y: 0, Historical_Weight: 0, gpwf_window_size: 0, gpwf_bias_factor: 0, gpwf_floor: 0, gpwf_scale_multiplier: 0, lambda: 0, octagonal_top: 9, exact_set_override: false, hamming_relax: false, gpwf_targeted_mode: false };
type Args = Parameters<typeof generateCandidates>;
function generate(options: { bias?: number; minimum?: number; maximum?: number; excluded?: number[]; strict?: Args[49]; empirical?: Args[50]; repeatMin?: number; repeatWindow?: number; seed?: number } = {}) {
  const trace: string[] = [];
  const args: Args = [30, history, knobs, message => trace.push(message), options.excluded ?? [], [], false, 0, [], [], [], undefined, 0, 0, 1, 0, [], options.minimum ?? 0, options.bias ?? 0, options.repeatWindow ?? 0, options.repeatMin ?? 0];
  args[39] = 400;
  args[41] = options.maximum;
  args[49] = options.strict;
  args[50] = options.empirical;
  args[54] = seededRandom(options.seed ?? 123456);
  return { ...generateCandidates(...args), trace };
}

describe("settings truthfulness regression", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

  it("restores before autosave and saves current edits through strict-mode reload", async () => {
    vi.useFakeTimers();
    const key = "test:settings";
    localStorage.setItem(key, JSON.stringify({ mode: "normal" }));
    function Harness() {
      const [mode, setMode] = useState("off");
      const { status } = useSettingsPersistence(key, () => ({ mode }), value => setMode(value.mode));
      return React.createElement("button", { onClick: () => setMode("strong") }, `${mode}; ${status}`);
    }
    const container = document.createElement("div");
    let root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(StrictMode, null, React.createElement(Harness))));
      expect(container.textContent).toContain("normal; Restored");
      await act(async () => container.querySelector("button")!.click());
      await act(async () => vi.advanceTimersByTime(2100));
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ mode: "strong" });
      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => root.render(React.createElement(Harness)));
      expect(container.textContent).toContain("strong; Restored");
    } finally { await act(async () => root.unmount()); }
  });

  it.each([0, 0.5, 1, 2, 5])("bias %s never defeats a legal Exactly 2 overlap", bias => {
    const result = generate({ bias, minimum: 2, maximum: 2 });
    expect(result.candidates).toHaveLength(30);
    for (const row of result.candidates) expect([...row.main, ...row.supp].filter(n => n <= 8)).toHaveLength(2);
    expect(result.rejectionStats.recentBias).toBe(0);
    expect(lastDrawBiasMultiplier(bias, 0)).toBeGreaterThan(0);
  });

  it.each(["restore", "save"])("reports %s storage failures rather than claiming success", async failure => {
    vi.useFakeTimers();
    const restore = vi.fn();
    if (failure === "restore") localStorage.setItem("test:error", "not json");
    else vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    function Harness() {
      const { error } = useSettingsPersistence("test:error", () => ({ count: 13 }), restore);
      return React.createElement("div", { role: "alert" }, error);
    }
    const rootElement = document.createElement("div");
    const root = createRoot(rootElement);
    try {
      await act(async () => root.render(React.createElement(Harness)));
      await act(async () => vi.advanceTimersByTime(2100));
      expect(rootElement.textContent).toContain(failure === "restore" ? "could not be restored" : "could not be saved");
      expect(restore).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); }
  });

  it("keeps impossible drought and repeat requests, blocks without spending attempts", () => {
    for (const options of [
      { strict: { enabled: true, minCount: 3, shortlist: [1, 2, 3] }, excluded: [1] },
      { empirical: { enabled: true, minCount: 3, shortlist: [1, 2, 3] }, excluded: [1] },
      { repeatMin: 8, repeatWindow: 1, excluded: [1] },
      { repeatMin: 1, repeatWindow: 0 },
    ]) {
      const result = generate(options);
      expect(result.candidates).toHaveLength(0);
      expect(result.rejectionStats.totalAttempts).toBe(0);
      expect(result.trace.join(" ")).toContain("not relaxed");
    }
  });

  it("replays the same seed and exposes neutral or enabled sampling factors", () => {
    const first = generate();
    expect(first.candidates).toEqual(generate().candidates);
    expect(first.candidates).not.toEqual(generate({ seed: 13 }).candidates);
    expect(first.trace.flatMap(line => line.split("\n")).filter(line => line.includes("Sampling weight "))).toHaveLength(45);
    expect(first.trace.find(line => line.includes("Sampling weight 1:"))).toContain("neutral 1x");
    expect(generate({ bias: 2, minimum: 1 }).trace.find(line => line.includes("Sampling weight 1:"))).toContain("lastDraw=3.00000x");
    expect(analyzeLatestNeighbourSupport(history, undefined, { enabled: true }).supportBoostFactor).toBe(1);
  });

  it("uses actual available trend denominators", () => {
    const weights = buildTrendWeights([
      { number: 1, fortnight: 6, month: 13, recentDrawCount: 6, comparisonDrawCount: 13 },
      { number: 2, fortnight: 2, month: 2, recentDrawCount: 2, comparisonDrawCount: 2 },
      { number: 3, fortnight: 0, month: 0, recentDrawCount: 0, comparisonDrawCount: 0 },
    ]);
    expect(weights).toEqual({ 1: 1, 2: 1, 3: 1 });
  });

  it("Monte Carlo retains unseen numbers, honours exclusions and terminates safely", () => {
    const weights = monteCarloWeights(history, [45]);
    expect(weights[43]).toBeGreaterThan(0);
    expect(weights[44]).toBe(0);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const counts = simulateMonteCarlo(weights, 1000, 8, seededRandom(42));
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(8000);
    expect([...counts.values()].every(n => n <= 1000)).toBe(true);
    expect(counts.has(45)).toBe(false);
    expect(counts).toEqual(simulateMonteCarlo(weights, 1000, 8, seededRandom(42)));
    expect(() => simulateMonteCarlo(monteCarloWeights(history, Array.from({ length: 38 }, (_, i) => i + 1)), 1, 8, seededRandom(1))).toThrow("only 7 available");
    expect(monteCarloWeights([{ ...history[0], isSimulated: true }], [])).toEqual(monteCarloWeights([], []));
  });

  it("Trace and snapshots use a serializable, versioned ledger", () => {
    const ledger = { version: "test-version", rows: [{ id: "quota", label: "Quota", requested: "3", applied: "BLOCKED: 1 eligible", source: "Control" as const, effect: "Hard minimum", scope: "Current shortlist", reason: "No automatic relaxation" }] };
    const snapshot = JSON.parse(JSON.stringify({ effectiveSettingsLedger: ledger }));
    expect(snapshot.effectiveSettingsLedger).toEqual(ledger);
    expect(effectiveSettingsTrace(ledger).join(" ")).toContain("requested 3; applied BLOCKED: 1 eligible");
    expect(withRestoredSettingSources(ledger, ledger).rows[0].source).toBe("Restored");
    expect(withRestoredSettingSources({ ...ledger, rows: [{ ...ledger.rows[0], requested: "2" }] }, ledger).rows[0].source).toBe("Control");
  });
});
