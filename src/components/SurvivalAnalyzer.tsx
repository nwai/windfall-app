import React, { useState, useMemo, useEffect } from "react";
import { Draw } from "../types";
import {
  buildGPWFNumberWeights,
  buildHC3PenaltyWeights,
  buildSDE1PenaltyWeights,
  combinePerNumberWeights,
} from "../lib/numberBiases";
import { useZPASettings } from "../context/ZPASettingsContext";
import { getSavedZoneWeights, WeightsByNumber } from "../lib/zpaStorage";

/**
 * Helper utilities (top-level) for survival analysis
 */
function buildEventLog(history: Draw[], number: number) {
  return history.map((draw) =>
    draw.main.includes(number) || draw.supp.includes(number) ? 1 : 0
  );
}

function buildSurvivalData(history: Draw[], number: number) {
  const events = buildEventLog(history, number);
  let times: number[] = [];
  let censored = false;
  let current = 0;
  for (let i = 0; i < events.length; ++i) {
    current++;
    if (events[i]) {
      times.push(current);
      current = 0;
    }
  }
  if (current > 0) {
    times.push(current);
    censored = true;
  }
  return { times, censored };
}

function kaplanMeier(times: number[], _window: number) {
  let n = times.length;
  let surv = 1.0;
  let km: number[] = [1.0];
  let sorted = times.slice().sort((a, b) => a - b);
  let last = 0;
  for (let i = 0; i < sorted.length; ++i) {
    let t = sorted[i];
    if (t === last) continue;
    // single-event decrement
    surv *= (n - 1) / n;
    km.push(surv);
    n--;
    last = t;
  }
  return { curve: km, probNext: 1 - (km[1] ?? 1) };
}

export const SurvivalAnalyzer: React.FC<{
  history: Draw[];
  excludedNumbers: number[];
  probabilityHeading?: string;
  trendWeights?: Record<number, number>;
  externalWindowSize?: number;
  enableSDE1Global?: boolean;
  enableHC3Global?: boolean;
  hideBiasToggles?: boolean;
  forcedNumbers?: number[];
  selectedCheckNumbers?: number[];
  focusNumber?: number | null; // highlight number in table
}> = ({
  history,
  excludedNumbers,
  probabilityHeading,
  trendWeights,
  externalWindowSize,
  enableSDE1Global,
  enableHC3Global,
  hideBiasToggles = true,
  forcedNumbers = [],
  selectedCheckNumbers = [],
  focusNumber = null,
}) => {
  const windowDefault = externalWindowSize ?? 20;
  const [windowSize, setWindowSize] = useState<number>(windowDefault);
  const [results, setResults] = useState<any[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Bias controls (local)
  const [useTrendBias, setUseTrendBias] = useState<boolean>(true);
  const [useGPWF, setUseGPWF] = useState<boolean>(false);
  const [useHC3Bias, setUseHC3Bias] = useState<boolean>(true);
  const [useSDE1Bias, setUseSDE1Bias] = useState<boolean>(false);
  const [gamma, setGamma] = useState<number>(2);

  // Optional custom trend window (derive alt weights)
  const [useCustomTrendWindow, setUseCustomTrendWindow] = useState<boolean>(false);
  const [trendFrom, setTrendFrom] = useState<number>(14);
  const [trendTo, setTrendTo] = useState<number>(30);

  const [sortBy, setSortBy] = useState<"biased" | "base" | "number">("biased");

  // Global zone weighting (single source) + saved per-number weights
  const { zoneWeightingEnabled, zoneGamma } = useZPASettings();
  const savedZoneWeights: WeightsByNumber | null = useMemo(() => {
    try { return getSavedZoneWeights(); } catch { return null; }
  }, []);

  // Enforce valid [from, to]
  useEffect(() => {
    if (trendFrom >= trendTo) {
      setTrendTo(Math.min(history.length, trendFrom + 1));
    }
  }, [trendFrom, trendTo, history.length]);

  // Keep window locked to external, if provided
  useEffect(() => {
    if (externalWindowSize && externalWindowSize !== windowSize) {
      setWindowSize(externalWindowSize);
    }
  }, [externalWindowSize, windowSize]);

  const canRun = windowSize >= 2 && windowSize <= history.length;
  const recent = useMemo(() => history.slice(-windowSize), [history, windowSize]);

  // Compute base stats per number
  useEffect(() => {
    if (!canRun) {
      setResults(null);
      return;
    }
    setIsRunning(true);
    setTimeout(() => {
      const computed = Array.from({ length: 45 }, (_, i) => {
        const n = i + 1;
        if (excludedNumbers.includes(n)) {
          return {
            number: n,
            probNext: 0,
            lastSeen: null,
          };
        }
        const { times } = buildSurvivalData(recent, n);
        const { probNext } = kaplanMeier(times, recent.length);
        let lastSeen: number | null = null;
        for (let j = recent.length - 1; j >= 0; --j) {
          if (recent[j].main.includes(n) || recent[j].supp.includes(n)) {
            lastSeen = recent.length - j;
            break;
          }
        }
        return { number: n, probNext, lastSeen };
      });
      setResults(computed);
      setIsRunning(false);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize, excludedNumbers, history]);

  // Build bias maps
  const gpwfWeights = useMemo(() => buildGPWFNumberWeights(recent), [recent]);
  const hc3Weights = useMemo(() => buildHC3PenaltyWeights(history), [history]);
  const sde1Weights = useMemo(() => buildSDE1PenaltyWeights(history), [history]);

  // Optionally derive a custom trend weights slice
  const customTrendWeights = useMemo(() => {
    if (!useCustomTrendWindow) return undefined;
    const to = Math.max(1, Math.min(trendTo, history.length));
    const from = Math.max(0, Math.min(trendFrom, to - 1));
    const hiSlice = history.slice(-to);
    const loSlice = history.slice(-from);
    const count = (arr: Draw[], n: number) =>
      arr.reduce(
        (acc, d) => acc + (d.main.includes(n) || d.supp.includes(n) ? 1 : 0),
        0
      );
    const w: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) {
      const v = count(hiSlice, n) - count(loSlice, n);
      w[n] = Math.max(0, v + 1); // keep positive
    }
    return w;
  }, [useCustomTrendWindow, trendFrom, trendTo, history]);

  const combinedBiasWeights = useMemo(() => {
    const trend = useTrendBias
      ? customTrendWeights ?? trendWeights ?? undefined
      : undefined;
    return combinePerNumberWeights(
      trend,
      useGPWF ? gpwfWeights : undefined,
      (enableHC3Global ?? false)
        ? hc3Weights
        : useHC3Bias
        ? hc3Weights
        : undefined,
      (enableSDE1Global ?? false)
        ? sde1Weights
        : useSDE1Bias
        ? sde1Weights
        : undefined
    );
  }, [
    useTrendBias,
    useGPWF,
    useHC3Bias,
    useSDE1Bias,
    trendWeights,
    customTrendWeights,
    gpwfWeights,
    hc3Weights,
    sde1Weights,
    enableHC3Global,
    enableSDE1Global,
  ]);

  // Build final rows with biases + global ZPA weighting (no placeholders)
  const enriched = useMemo(() => {
    if (!results) return [];
    return results.map((r) => {
      const biasW = combinedBiasWeights[r.number] ?? 1;
      const zpaW = zoneWeightingEnabled && savedZoneWeights ? (savedZoneWeights[r.number] ?? 1) : 1;
      const biased = r.probNext
        * Math.pow(biasW, gamma)      // local biases exponent
        * Math.pow(zpaW, zoneGamma);  // global zone weighting exponent
      return { ...r, biasedProb: biased, baseProb: r.probNext };
    });
  }, [results, combinedBiasWeights, gamma, zoneWeightingEnabled, zoneGamma, savedZoneWeights]);

  const sortedStats = useMemo(() => {
    const arr = enriched.slice();
    if (sortBy === "biased")
      arr.sort((a, b) => b.biasedProb - a.biasedProb || a.number - b.number);
    else if (sortBy === "base")
      arr.sort((a, b) => b.baseProb - a.baseProb || a.number - b.number);
    else arr.sort((a, b) => a.number - b.number);
    return arr;
  }, [enriched, sortBy]);

  // Split into 3 columns
  const columns = useMemo(() => {
    const numCols = 3;
    const rowsPerCol = Math.ceil(sortedStats.length / numCols) || 15;
    return Array.from({ length: numCols }, (_, colIdx) =>
      sortedStats.slice(colIdx * rowsPerCol, (colIdx + 1) * rowsPerCol)
    );
  }, [sortedStats]);

  return (
    <section
      style={{
        border: "2px solid #00bcd4",
        borderRadius: 8,
        padding: 24,
        margin: "24px 0",
        background: "#e0f7fa",
      }}
    >
      <h3>Survival Analysis: Time-to-Event Probability</h3>

      {/* Global badges + context */}
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(enableSDE1Global ?? false) ? (
          <span
            style={{
              background: "#ffe6cc",
              color: "#a04c00",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            SDE1 Active
          </span>
        ) : (
          <span
            style={{
              background: "#f2f2f2",
              color: "#555",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            SDE1 Off
          </span>
        )}
        {(enableHC3Global ?? false) ? (
          <span
            style={{
              background: "#e8f5e9",
              color: "#2e7d32",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            HC3 Active
          </span>
        ) : (
          <span
            style={{
              background: "#f2f2f2",
              color: "#555",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            HC3 Off
          </span>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12 }}>
          <b>Excluded:</b>{" "}
          {excludedNumbers.length ? (
            excludedNumbers.join(", ")
          ) : (
            <span style={{ color: "#888" }}>none</span>
          )}
          {"   "}
          <b>Forced:</b>{" "}
          {forcedNumbers.length ? (
            forcedNumbers.join(", ")
          ) : (
            <span style={{ color: "#888" }}>none</span>
          )}
          {"   "}
          <b>Selected:</b>{" "}
          {selectedCheckNumbers.length ? (
            selectedCheckNumbers.join(", ")
          ) : (
            <span style={{ color: "#888" }}>none</span>
          )}
        </span>
      </div>

      {/* Locked window display */}
      <div style={{ marginBottom: 10 }}>
        <b>Draws to analyze:</b>{" "}
        {externalWindowSize ? (
          <span style={{ fontWeight: 600 }}>
            {externalWindowSize} (locked by WFMQY)
          </span>
        ) : (
          <span>{windowSize}</span>
        )}
      </div>

      {/* Biases */}
      <div
        style={{
          margin: "8px 0 10px 0",
          padding: "8px 10px",
          background: "#dbf5f9",
          border: "1px solid #90e0ef",
          borderRadius: 6,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <b>Biases:</b>
        <label>
          <input
            type="checkbox"
            checked={useTrendBias}
            onChange={(e) => setUseTrendBias(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Trend
        </label>

        <label title="Enable custom trend window (from..to draws)">
          <input
            type="checkbox"
            checked={useCustomTrendWindow}
            onChange={(e) => setUseCustomTrendWindow(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Custom Window
        </label>
        <span style={{ opacity: useCustomTrendWindow ? 1 : 0.4, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="number"
            min={1}
            max={history.length}
            value={trendFrom}
            onChange={(e) => setTrendFrom(Number(e.target.value))}
            style={{ width: 60 }}
            title="From (older)"
          />
          →
          <input
            type="number"
            min={Math.max(2, trendFrom + 1)}
            max={history.length}
            value={trendTo}
            onChange={(e) => setTrendTo(Number(e.target.value))}
            style={{ width: 60 }}
            title="To (most recent)"
          />
          {/* Quick presets */}
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(3); setTrendTo(11); }} style={{ fontSize: 12 }}>3→11</button>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(6); setTrendTo(9); }} style={{ fontSize: 12 }}>6→9</button>
            <button type="button" onClick={() => { setUseCustomTrendWindow(true); setTrendFrom(11); setTrendTo(13); }} style={{ fontSize: 12 }}>11→13</button>
          </span>
        </span>

        {!hideBiasToggles && (
          <>
            <label>
              <input
                type="checkbox"
                checked={useGPWF}
                onChange={(e) => setUseGPWF(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              GPWF
            </label>
            <label>
              <input
                type="checkbox"
                checked={enableHC3Global ? true : useHC3Bias}
                onChange={(e) => setUseHC3Bias(e.target.checked)}
                style={{ marginRight: 6 }}
                disabled={enableHC3Global}
                title={enableHC3Global ? "Controlled by WFMQY" : ""}
              />
              HC3
            </label>
            <label>
              <input
                type="checkbox"
                checked={enableSDE1Global ? true : useSDE1Bias}
                onChange={(e) => setUseSDE1Bias(e.target.checked)}
                style={{ marginRight: 6 }}
                disabled={enableSDE1Global}
                title={enableSDE1Global ? "Controlled by WFMQY" : ""}
              />
              SDE1
            </label>
          </>
        )}

        <span style={{ marginLeft: 8 }}>
          <b>Gamma:</b>{" "}
          <input
            type="number"
            min={-10}
            max={100}
            step={0.1}
            value={gamma}
            onChange={(e) => setGamma(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </span>
        <span style={{ marginLeft: "auto" }}>
          <b>Sort by:</b>{" "}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ fontSize: 14 }}
          >
            <option value="biased">Biased Prob</option>
            <option value="base">Base Prob</option>
            <option value="number">Number</option>
          </select>
        </span>
      </div>

      {canRun && results ? (
        <div>
          <h4>
            {probabilityHeading ??
              "Probability of Appearance in Next Draw (Per Number):"}
          </h4>

          {/* Small hint showing global zone weighting status */}
          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Using global zone weighting: {zoneWeightingEnabled ? `On (γ=${zoneGamma})` : "Off"}
          </div>

          <div
            style={{
              display: "flex",
              gap: 28,
              marginTop: 18,
              flexWrap: "wrap",
            }}
          >
            {columns.map((col, colIdx) => (
              <table
                key={colIdx}
                style={{
                  borderCollapse: "collapse",
                  fontSize: 15,
                  minWidth: 260,
                  background: "#fff",
                  border: "1px solid #b2ebf2",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "2px 8px" }}>#</th>
                    <th style={{ textAlign: "left", padding: "2px 8px" }}>
                      Number
                    </th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>
                      Base
                    </th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>
                      Biased
                    </th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {col.map((res: any, i: number) => (
                    <tr
                      key={res.number}
                      style={res.number === focusNumber ? { background: "#FFF9C4" } : undefined}
                    >
                      <td style={{ padding: "2px 8px", color: "#1976d2" }}>
                        {colIdx * Math.ceil(enriched.length / 3) + i + 1}
                      </td>
                      <td style={{ padding: "2px 8px" }}>
                        <b>{res.number}</b>
                      </td>
                      <td style={{ padding: "2px 8px", textAlign: "right" }}>
                        {(res.baseProb * 100).toFixed(2)}%
                      </td>
                      <td
                        style={{
                          padding: "2px 8px",
                          textAlign: "right",
                          color: "#00796b",
                          fontWeight: 700,
                        }}
                      >
                        {(res.biasedProb * 100).toFixed(2)}%
                      </td>
                      <td style={{ padding: "2px 8px", textAlign: "right" }}>
                        {res.lastSeen ? `${res.lastSeen} draws ago` : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Base = Kaplan–Meier probability. Biased = Base × (combined bias)^γ × (ZPA weight)^γ.
          </div>
        </div>
      ) : (
        <div style={{ color: "#c00" }}>Not enough draws to run analysis.</div>
      )}
    </section>
  );
}