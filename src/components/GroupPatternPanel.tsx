import React, { useMemo, useState, useEffect } from "react";
import { Draw } from "../types";
import {
  analyzeGroups,
  buildDefaultGroups,
  computePatternForDraw,
  signatureOfPattern,
  ZoneGroups,
  validateGroups,
} from "../lib/groupPatterns";
import { suggestZoneWeightsFromTrends, perNumberWeightsFromZones, ZoneWeightMode } from "../lib/zoneWeights";
import { getSavedZoneWeights, setSavedZoneWeights, getSavedGroups, setSavedGroups } from "../lib/zpaStorage";

export function GroupPatternPanel({
  history,
  groups,
  title = "Zone Pattern Analysis (9 × 5)",
  showLast = 12,
  onExportWeights,
}: {
  history: Draw[];
  groups?: ZoneGroups;           // optional custom 9×5 groups
  title?: string;
  showLast?: number;             // how many recent draws to list
  onExportWeights?: (weightsByNumber: Record<number, number>, meta: any) => void;
}) {
  // Local override-able groups (persisted)
  const [customGroups, setCustomGroups] = useState<ZoneGroups | null>(null);
  useEffect(() => {
    const saved = getSavedGroups();
    if (saved && Array.isArray(saved) && saved.length === 9) setCustomGroups(saved);
  }, []);
  const localGroups = useMemo(() => customGroups ?? groups ?? buildDefaultGroups(), [customGroups, groups]);

  const summary = useMemo(() => analyzeGroups(history, { customGroups: localGroups }), [history, localGroups]);

  const [topK, setTopK] = useState(10);
  const [labelMode, setLabelMode] = useState<"indices" | "dates">("dates");
  const [toast, setToast] = useState<string | null>(null);

  const lastDraw = history[history.length - 1];
  const lastPatternMain = lastDraw ? computePatternForDraw(lastDraw.main, localGroups) : Array(9).fill(0);
  const lastPatternSupp = lastDraw ? computePatternForDraw(lastDraw.supp, localGroups) : Array(9).fill(0);

  // Build sorted top patterns (mains)
  const topMainPatterns = useMemo(() => {
    const arr = Array.from(summary.patternSummary.mainPatternCounts.entries());
    arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return arr.slice(0, topK);
  }, [summary.patternSummary.mainPatternCounts, topK]);

  // Number frequency heat for mains (1..45)
  const numHeat = useMemo(() => {
    const f = summary.perNumberFrequencies.mains;
    const vals = Object.values(f);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    return { f, min, max, mean };
  }, [summary.perNumberFrequencies.mains]);

  // Helpers: color scale for frequency
  const colorFor = (n: number) => {
    const v = numHeat.f[n] ?? 0;
    const t = numHeat.max === numHeat.min ? 0.5 : (v - numHeat.min) / (numHeat.max - numHeat.min);
    const r = Math.round(255 * t);
    const b = Math.round(255 * (1 - t));
    return `rgb(${r},90,${b})`;
  };

  // Sum-of-mains sparkline
  const sums = useMemo(() => history.map(d => d.main.reduce((a, b) => a + b, 0)), [history]);

  const Sparkline = ({ data, width = 600, height = 120, stroke = "#1976d2" }: { data: number[]; width?: number; height?: number; stroke?: string }) => {
    if (!data.length) return <svg width={width} height={height} />;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const x = (i: number) => (i / Math.max(1, data.length - 1)) * (width - 10) + 5;
    const y = (v: number) => {
      if (max === min) return height / 2;
      return height - 8 - ((v - min) / (max - min)) * (height - 16);
    };
    const d = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
    return (
      <svg width={width} height={height} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6 }}>
        <path d={d} fill="none" stroke={stroke} strokeWidth={2} />
      </svg>
    );
  };

  // Adaptive arrow logic
  const dynamicTH = (n: number) => Math.max(0.01, 0.06 / Math.sqrt(Math.max(1, n)));
  const zoneArrow = (slope: number, pValue: number, n: number) => {
    const TH = dynamicTH(n);
    const sizePx = 18;
    const style: React.CSSProperties = { fontSize: sizePx, fontWeight: 900, display: "inline-block", width: sizePx + 2, textAlign: "center", lineHeight: 1 };
    const isSig = pValue < 0.1;
    if ((isSig || slope > TH)) return <span style={{ ...style, color: "#2e7d32" }}>↑</span>;
    if ((isSig || slope < -TH)) return <span style={{ ...style, color: "#c62828" }}>↓</span>;
    return <span style={{ ...style, color: "#616161" }}>→</span>;
  };

  const fmt = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d) : "-";

  // Dynamic helper text under the heat map
  const trendingUpZones = useMemo(() => {
    const TH = dynamicTH(summary.totalDraws);
    return summary.zoneTrendsMain
      .filter(z => (z.pValue < 0.1 && z.slopePerDraw > 0) || (z.slopePerDraw > TH))
      .map(z => `G${z.zone}`);
  }, [summary.zoneTrendsMain, summary.totalDraws]);

  const trendingDownZones = useMemo(() => {
    const TH = dynamicTH(summary.totalDraws);
    return summary.zoneTrendsMain
      .filter(z => (z.pValue < 0.1 && z.slopePerDraw < 0) || (z.slopePerDraw < -TH))
      .map(z => `G${z.zone}`);
  }, [summary.zoneTrendsMain, summary.totalDraws]);

  const trendLine = useMemo(() => {
    const n = summary.totalDraws;
    const up = trendingUpZones.length ? trendingUpZones.join(", ") : "none";
    const down = trendingDownZones.length ? trendingDownZones.join(", ") : "none";
    const slope = summary.sumOfMains.slopePerDraw;
    const p = summary.sumOfMains.pValue;
    return `Color encodes frequency from min→max across ${n} draws. Zones trending up: ${up}; down: ${down}. Sum(mains) slope ${slope >= 0 ? "+" : ""}${fmt(slope, 3)} (p=${fmt(p, 3)}).`;
  }, [summary.totalDraws, trendingUpZones, trendingDownZones, summary.sumOfMains]);

  // NEW: per-zone totals for mains across all draws (PaTot)
  const zoneTotalsMain = useMemo(() => {
    const totals = Array(9).fill(0);
    for (const d of history) {
      const p = computePatternForDraw(d.main, localGroups);
      for (let z = 0; z < 9; z++) totals[z] += p[z];
    }
    return totals; // sums to draws * 6
  }, [history, localGroups]);

  // --- Zone weighting (export) ---
  const [weightMode, setWeightMode] = useState<ZoneWeightMode>("boostUp");
  const [strength, setStrength] = useState<number>(0.15);
  const [pMin, setPMin] = useState<number>(0.25);

  const zoneWeights = useMemo(
    () => suggestZoneWeightsFromTrends(summary.zoneTrendsMain, { mode: weightMode, strength, pMin, normalize: true }),
    [summary.zoneTrendsMain, weightMode, strength, pMin]
  );
  const numberWeights = useMemo(
    () => perNumberWeightsFromZones(localGroups, zoneWeights, true),
    [localGroups, zoneWeights]
  );

  async function onCopyWeights() {
    const payload = {
      weightsByNumber: numberWeights,
      meta: { mode: weightMode, strength, pMin, draws: summary.totalDraws, generatedAt: new Date().toISOString() },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setSavedZoneWeights(numberWeights);
      if (onExportWeights) onExportWeights(numberWeights, payload.meta);
      setToast("Zone weights copied to clipboard");
      setTimeout(() => setToast(null), 1600);
    } catch {
      setToast("Copy failed");
      setTimeout(() => setToast(null), 1600);
    }
  }

  // Groups editor (basic JSON)
  const [editingOpen, setEditingOpen] = useState(false);
  const [groupsJSON, setGroupsJSON] = useState<string>("");
  useEffect(() => {
    setGroupsJSON(JSON.stringify(localGroups, null, 2));
  }, [editingOpen]); // refresh when opening

  function saveGroupsJSON() {
    try {
      const parsed = JSON.parse(groupsJSON) as ZoneGroups;
      validateGroups(parsed);
      setCustomGroups(parsed);
      setSavedGroups(parsed);
      setToast("Groups saved");
      setTimeout(() => setToast(null), 1400);
    } catch (e) {
      setToast(`Invalid groups: ${String(e)}`);
      setTimeout(() => setToast(null), 2200);
    }
  }
  function loadSavedGroups() {
    const saved = getSavedGroups();
    if (saved) {
      setGroupsJSON(JSON.stringify(saved, null, 2));
      setCustomGroups(saved);
      setToast("Loaded saved groups");
      setTimeout(() => setToast(null), 1400);
    } else {
      setToast("No saved groups");
      setTimeout(() => setToast(null), 1400);
    }
  }
  function resetDefaultGroups() {
    const def = buildDefaultGroups();
    setGroupsJSON(JSON.stringify(def, null, 2));
    setCustomGroups(def);
    setSavedGroups(def);
    setToast("Reset to default groups");
    setTimeout(() => setToast(null), 1400);
  }

  return (
    <section style={{ border: "2px solid #8e24aa", borderRadius: 8, padding: 16, background: "#faf5ff", margin: "18px 0", position: "relative" }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute",
          top: 8, right: 8,
          background: "#4caf50",
          color: "#fff",
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 12,
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
        }}>
          {toast}
        </div>
      )}

      {history.length === 0 ? (
        <div>No history available.</div>
      ) : (
        <>
          {/* Summary tiles */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={tileStyle}>
              <div style={tileTitle}>Draws analyzed</div>
              <div style={tileValue}>{summary.totalDraws}</div>
            </div>
            <div style={tileStyle}>
              <div style={tileTitle}>Total mains</div>
              <div style={tileValue}>{summary.totalMainNumbers}</div>
              <div style={tileSub}>Avg per-number: {fmt(summary.avgMainFrequencyPerNumber, 3)}</div>
            </div>
            <div style={tileStyle}>
              <div style={tileTitle}>Total supps</div>
              <div style={tileValue}>{summary.totalSuppNumbers}</div>
              <div style={tileSub}>Avg per-number: {fmt(summary.avgSuppFrequencyPerNumber, 3)}</div>
            </div>
            <div style={tileStyle}>
              <div style={tileTitle}>Sum(mains)</div>
              <div style={tileSub}>range {summary.sumOfMains.min}–{summary.sumOfMains.max}</div>
              <div style={tileSub}>mean {fmt(summary.sumOfMains.mean)}</div>
              <div style={tileSub}>slope {fmt(summary.sumOfMains.slopePerDraw, 3)} (p={fmt(summary.sumOfMains.pValue, 3)})</div>
            </div>
          </div>

          {/* Manage groups */}
          <div style={{ marginTop: 12 }}>
            <details open={editingOpen} onToggle={(e) => setEditingOpen((e.target as HTMLDetailsElement).open)}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Manage groups (save / edit / load)</summary>
              <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <textarea
                  value={groupsJSON}
                  onChange={(e) => setGroupsJSON(e.target.value)}
                  rows={8}
                  style={{ width: "100%", fontFamily: "monospace", fontSize: 12, padding: 8, border: "1px solid " + (editingOpen ? "#ddd" : "#eee"), borderRadius: 6 }}
                  placeholder='Enter 9 arrays of 5 numbers (1..45), e.g., [[1,2,3,4,5], [6,7,8,9,10], ...]'
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveGroupsJSON}>Save groups</button>
                  <button onClick={loadSavedGroups}>Load saved</button>
                  <button onClick={resetDefaultGroups}>Reset default</button>
                </div>
              </div>
            </details>
          </div>

          {/* Sum(mains) sparkline */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Sum of mains per draw</div>
            <Sparkline data={sums} />
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
            {/* Zone trends */}
            <div style={{ minWidth: 300, flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Zone trends (mains)</div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thL}>Zone</th>
                    <th style={thR} title="Total mains drawn in this zone across all analyzed draws">PaTot</th>
                    <th style={thR} title="Slope of per-draw counts (0–6) over time">Slope</th>
                    <th style={thR} title="R²: fraction of variance explained by the linear trend (0–1)">R²</th>
                    <th style={thR} title="p-value: two-sided significance of slope; smaller means stronger evidence of non-zero trend">p</th>
                    <th style={thC} title="Directional arrow based on significance and an adaptive slope threshold">Dir</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.zoneTrendsMain.map((z) => (
                    <tr key={z.zone}>
                      <td style={tdL}>G{z.zone}</td>
                      <td style={tdR} title="Pattern total for this zone">{zoneTotalsMain[z.zone - 1]}</td>
                      <td style={tdR} title={`Slope per draw: ${fmt(z.slopePerDraw, 4)}`}>{fmt(z.slopePerDraw, 3)}</td>
                      <td style={tdR} title="R² is the proportion of variance explained by the linear fit">{fmt(z.r2, 3)}</td>
                      <td style={tdR} title="Two-sided p-value for slope">{fmt(z.pValue, 3)}</td>
                      <td style={tdC}>{zoneArrow(z.slopePerDraw, z.pValue, summary.totalDraws)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top patterns */}
            <div style={{ minWidth: 320, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Top patterns (mains)</div>
                <label style={{ marginLeft: "auto" }}>
                  Show top:{" "}
                  <input
                    type="number"
                    min={3}
                    max={50}
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    style={{ width: 70 }}
                  />
                </label>
              </div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
                Pattern sums to 6 across 9 groups (G1..G9). Count = number of draws with this exact pattern.
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thL}>Pattern</th>
                    <th style={thR} title="Number of draws where this pattern occurred">Count</th>
                    <th style={thR} title="Percentage of draws where this pattern occurred">% of draws</th>
                  </tr>
                </thead>
                <tbody>
                  {topMainPatterns.map(([sig, cnt]) => (
                    <tr key={sig}>
                      <td style={tdL}>{sig}</td>
                      <td style={tdR} title={`${cnt} draws`}>{cnt}</td>
                      <td style={tdR}>{((cnt / summary.totalDraws) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Latest patterns list */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontWeight: 600 }}>Recent patterns</div>
              <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "2px 8px", background: "#efe9f7", borderRadius: 6 }}>
                <label>
                  <input
                    type="radio"
                    name="label-mode"
                    checked={labelMode === "dates"}
                    onChange={() => setLabelMode("dates")}
                  />{" "}
                  Dates
                </label>
                <label>
                  <input
                    type="radio"
                    name="label-mode"
                    checked={labelMode === "indices"}
                    onChange={() => setLabelMode("indices")}
                  />{" "}
                  Indices
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
              {history.slice(-showLast).map((d, i, arr) => {
                const patM = computePatternForDraw(d.main, localGroups);
                const patS = computePatternForDraw(d.supp, localGroups);
                const idx = history.length - arr.length + i;
                const heading = labelMode === "dates" ? d.date : `#${idx + 1}`;
                return (
                  <div key={idx} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{heading}</div>
                    <div style={{ fontSize: 12, color: "#444" }}>
                      Mains: {signatureOfPattern(patM)} • Supps: {signatureOfPattern(patS)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-number heat (mains) */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Per-number frequency (mains)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 6 }}>
              {localGroups.map((grp, gi) => (
                <div key={gi} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>G{gi + 1}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                    {grp.map((n) => {
                      const v = (summary.perNumberFrequencies.mains[n] ?? 0);
                      return (
                        <div
                          key={n}
                          title={`#${n} • ${v} hits`}
                          style={{
                            textAlign: "center",
                            padding: "6px 0",
                            borderRadius: 4,
                            color: "#fff",
                            background: colorFor(n),
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {n}
                          <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.9 }}>{v}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              {trendLine}
            </div>
          </div>

          {/* Zone weighting block */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Zone weighting</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#efe9f7", borderRadius: 6 }}>
                <label><input type="radio" checked={weightMode === "boostUp"} onChange={() => setWeightMode("boostUp")} /> Boost up-trending</label>
                <label><input type="radio" checked={weightMode === "boostDown"} onChange={() => setWeightMode("boostDown")} /> Boost down-trending</label>
              </div>
              <label>Strength: <input type="number" min={0} max={0.3} step={0.01} value={strength} onChange={(e) => setStrength(Number(e.target.value))} style={{ width: 80 }} /></label>
              <label>p-min: <input type="number" min={0} max={1} step={0.01} value={pMin} onChange={(e) => setPMin(Number(e.target.value))} style={{ width: 80 }} /></label>
              <button onClick={onCopyWeights} title="Copy per-number weights JSON to clipboard">Copy JSON</button>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
              <div style={{ minWidth: 260 }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Zone weights</div>
                <table style={{ ...tableStyle }}>
                  <thead><tr><th style={thL}>Zone</th><th style={thR}>Weight</th></tr></thead>
                  <tbody>
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((z) => (
                      <tr key={z}><td style={tdL}>G{z}</td><td style={tdR}>{zoneWeights[z]?.toFixed(3)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ minWidth: 320, flex: 1 }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Per-number weights preview</div>
                {/* CHANGED: arrange groups in a 3 × 3 grid to prevent overflow */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {localGroups.map((grp, gi) => (
                    <div key={gi} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>G{gi + 1}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                        {grp.map((n) => (
                          <div key={n} style={{ textAlign: "center", padding: "6px 0", borderRadius: 4, background: "#f7f3ff", border: "1px solid #eee" }}>
                            <div style={{ fontWeight: 800 }}>{n}</div>
                            <div style={{ fontSize: 11, color: "#333" }}>{numberWeights[n]?.toFixed(3)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Latest draw pattern snapshot */}
          <div style={{ marginTop: 16, fontSize: 12, color: "#333" }}>
            <b>Latest draw</b>: {lastDraw?.date || "—"} • Pattern Mains {signatureOfPattern(lastPatternMain)} • Supps {signatureOfPattern(lastPatternSupp)}
          </div>
        </>
      )}
    </section>
  );
}

const tileStyle: React.CSSProperties = {
  minWidth: 180,
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 6,
  padding: 10,
};
const tileTitle: React.CSSProperties = { fontSize: 12, color: "#666" };
const tileValue: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: "#4a148c" };
const tileSub: React.CSSProperties = { fontSize: 12, color: "#444" };

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  border: "1px solid #e0e0e0",
  fontSize: 13,
};
const thL: React.CSSProperties = { textAlign: "left", padding: "4px 8px", background: "#f4e9ff" };
const thR: React.CSSProperties = { textAlign: "right", padding: "4px 8px", background: "#f4e9ff" };
const thC: React.CSSProperties = { textAlign: "center", padding: "4px 8px", background: "#f4e9ff" };
const tdL: React.CSSProperties = { textAlign: "left", padding: "4px 8px" };
const tdR: React.CSSProperties = { textAlign: "right", padding: "4px 8px" };
const tdC: React.CSSProperties = { textAlign: "center", padding: "4px 8px" };