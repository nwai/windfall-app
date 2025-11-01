import React, { useMemo, useState, useEffect } from "react";
import { Draw } from "../types";
import {
  buildDefaultGroups,
  computePatternForDraw,
  signatureOfPattern,
  ZoneGroups,
} from "../lib/groupPatterns";
import { analyzeGroupsFlex } from "../lib/groupPatternsFlex";
import { suggestZoneWeightsFromTrends, perNumberWeightsFromZones, ZoneWeightMode } from "../lib/zoneWeights";
import {
  setSavedZoneWeights,
  getSavedGroups,
  setSavedGroups,
  getSavedSelectedZones,
  setSavedSelectedZones,
  getSavedNormalizeMode,
  setSavedNormalizeMode,
  type NormalizeMode,
} from "../lib/zpaStorage";
import { validateZpaGroups, computeLayoutColumns } from "../lib/validateZpaGroups";

// Local helper to build contiguous groups matching the current scheme
function buildContiguousGroups(zones: number, size: number): number[][] {
  const total = zones * size;
  if (total !== 45) throw new Error(`zones×size must equal 45 (got ${zones}×${size})`);
  const out: number[][] = [];
  let start = 1;
  for (let z = 0; z < zones; z++) {
    const g: number[] = [];
    for (let j = 0; j < size; j++) g.push(start + j);
    out.push(g);
    start += size;
  }
  return out;
}

// Small linear regression helper (slope, r2, p-value) using a normal approximation
function linreg(y: number[]) {
  const n = y.length;
  if (n <= 1) return { slope: 0, r2: 0, p: 1 };
  const x = Array.from({ length: n }, (_, i) => i + 1);
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    num += dx * (y[i] - my);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;

  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yiHat = my + slope * (x[i] - mx);
    ssRes += (y[i] - yiHat) ** 2;
    ssTot += (y[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  let p = 1;
  if (n > 2 && den > 0) {
    const se = Math.sqrt((ssRes / (n - 2)) / den);
    if (se > 0) {
      const t = slope / se;
      const z = Math.abs(t);
      const cdf = (zv: number) => 0.5 * (1 + erf(zv / Math.SQRT2));
      function erf(zv: number) {
        const sign = zv < 0 ? -1 : 1;
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p5 = 0.3275911;
        const t = 1 / (1 + p5 * Math.abs(zv));
        const yv = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-zv * zv);
        return sign * yv;
      }
      p = 2 * (1 - cdf(z));
    }
  }
  return { slope, r2, p };
}

export function GroupPatternPanel({
  history,
  groups,
  title = "Zone Pattern Analysis",
  showLast = 12,
  onExportWeights,
}: {
  history: Draw[];
  groups?: ZoneGroups;           // optional custom groups (any allowed scheme)
  title?: string;
  showLast?: number;             // how many recent draws to list
  onExportWeights?: (weightsByNumber: Record<number, number>, meta: any) => void;
}) {
  // Use saved groups if present; fall back to prop or default 9×5
  const [customGroups, setCustomGroups] = useState<ZoneGroups | null>(null);
  useEffect(() => {
    try {
      const saved = getSavedGroups();
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setCustomGroups(saved);
      }
    } catch {
      // ignore; fallback below
    }
  }, []);
  const localGroups = useMemo<ZoneGroups>(() => customGroups ?? groups ?? buildDefaultGroups(), [customGroups, groups]);

  // Scheme info
  const scheme = useMemo(() => validateZpaGroups(localGroups), [localGroups]);
  const zones = scheme.zones;
  const size = scheme.size;
  const colsZones = computeLayoutColumns(zones);
  const colsPerGroup = Math.min(size, 5); // wrap numbers into rows of up to 5

  // Flexible summary (no rigid 9×5 requirement)
  const summary = useMemo(() => analyzeGroupsFlex(history, localGroups), [history, localGroups]);

  const [topK, setTopK] = useState(10);
  const [labelMode, setLabelMode] = useState<"indices" | "dates">("dates");
  const [toast, setToast] = useState<string | null>(null);

  // Groups editor (JSON)
  const [editingOpen, setEditingOpen] = useState(false);
  const [groupsJSON, setGroupsJSON] = useState<string>("");

  useEffect(() => {
    setGroupsJSON(JSON.stringify(localGroups, null, 2));
  }, [editingOpen, localGroups]);

  const lastDraw = history[history.length - 1];
  const lastPatternMain = lastDraw ? computePatternForDraw(lastDraw.main, localGroups) : Array(zones).fill(0);
  const lastPatternSupp = lastDraw ? computePatternForDraw(lastDraw.supp, localGroups) : Array(zones).fill(0);

  // Recent-only zone trends used for the visible table and helper text
  const TREND_WINDOW = 180;
  const zoneTrendsRecent = useMemo(() => {
    const used = Math.min(history.length, TREND_WINDOW);
    // If too few draws, just return neutral rows for all zones so we render G1..G{zones}
    if (used <= 1) {
      return Array.from({ length: zones }, (_, zi) => ({
        zoneIdx: zi,
        slope: 0,
        rSquared: 0,
        pValue: 1,
      }));
    }
    const draws = history.slice(-used);
    // Build per-zone series (0..6 per draw) for mains only
    const seriesByZone: number[][] = Array.from({ length: zones }, () => []);
    for (const d of draws) {
      const patM = computePatternForDraw(d.main, localGroups);
      for (let z = 0; z < zones; z++) {
        seriesByZone[z].push(patM[z] ?? 0);
      }
    }
    return seriesByZone.map((series, zi) => {
      const { slope, r2, p } = linreg(series);
      return { zoneIdx: zi, slope, rSquared: r2, pValue: p };
    });
  }, [history, localGroups, zones]);

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

  // Adaptive arrow logic (slightly looser so subtle recent trends show)
  const dynamicTH = (n: number) => Math.max(0.003, 0.12 / Math.sqrt(Math.max(1, n)));
  const zoneArrow = (slope: number, pValue: number, n: number) => {
    const TH = dynamicTH(n);
    const sizePx = 18;
    const style: React.CSSProperties = { fontSize: sizePx, fontWeight: 900, display: "inline-block", width: sizePx + 2, textAlign: "center", lineHeight: 1 };
    const isSig = pValue < 0.2;
    if ((isSig || slope > TH)) return <span style={{ ...style, color: "#2e7d32" }}>↑</span>;
    if ((isSig || slope < -TH)) return <span style={{ ...style, color: "#c62828" }}>↓</span>;
    return <span style={{ ...style, color: "#616161" }}>→</span>;
  };

  const fmt = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d) : "-";

  // RECENT helper text under the heat map (uses zoneTrendsRecent)
  const usedN = Math.min(history.length, TREND_WINDOW);
  const trendingUpZones = useMemo(() => {
    const TH = dynamicTH(usedN);
    return zoneTrendsRecent
      .filter(z => (z.pValue < 0.2 && z.slope > 0) || (z.slope > TH))
      .map(z => `G${z.zoneIdx + 1}`);
  }, [zoneTrendsRecent, usedN]);

  const trendingDownZones = useMemo(() => {
    const TH = dynamicTH(usedN);
    return zoneTrendsRecent
      .filter(z => (z.pValue < 0.2 && z.slope < 0) || (z.slope < -TH))
      .map(z => `G${z.zoneIdx + 1}`);
  }, [zoneTrendsRecent, usedN]);

  const trendLine = useMemo(() => {
    const up = trendingUpZones.length ? trendingUpZones.join(", ") : "none";
    const down = trendingDownZones.length ? trendingDownZones.join(", ") : "none";
    // Keep sum-of-mains stats from summary (it’s fine to stay on all draws)
    const slope = summary.sumOfMains.slopePerDraw;
    const p = summary.sumOfMains.pValue;
    return `Color encodes frequency from min→max across ${summary.totalDraws} draws. (Recent trends: last ${usedN}) Zones trending up: ${up}; down: ${down}. Sum(mains) slope ${slope >= 0 ? "+" : ""}${fmt(slope, 3)} (p=${fmt(p, 3)}).`;
  }, [summary.totalDraws, summary.sumOfMains, trendingUpZones, trendingDownZones, usedN]);

  // Per-zone totals for mains across all draws (PaTot)
  const zoneTotalsMain = useMemo(() => {
    const totals = Array(zones).fill(0);
    for (const d of history) {
      const p = computePatternForDraw(d.main, localGroups);
      for (let z = 0; z < zones; z++) totals[z] += p[z] ?? 0;
    }
    return totals; // sums to draws * 6
  }, [history, localGroups, zones]);

  // --- Zone weighting (export) ---
  const [weightMode, setWeightMode] = useState<ZoneWeightMode>("boostUp");
  const [strength, setStrength] = useState<number>(0.15);
  const [pMin, setPMin] = useState<number>(0.25);

  // NOTE: this still uses your analyzeGroups summary.trends format (zone: 1..zones, slopePerDraw)
  const zoneWeights = useMemo(
    () => suggestZoneWeightsFromTrends(summary.zoneTrendsMain as any, { mode: weightMode, strength, pMin, normalize: true }),
    [summary.zoneTrendsMain, weightMode, strength, pMin]
  );

  // NEW: zone selector and normalization mode, persisted
  const [selectedZones, setSelectedZones] = useState<boolean[]>(() => getSavedSelectedZones() ?? Array(zones).fill(true));
  const [normalizeMode, setNormalizeMode] = useState<NormalizeMode>(() => getSavedNormalizeMode() ?? "all");

  useEffect(() => {
    // Ensure length matches current scheme
    const out = Array(zones).fill(true).map((_, i) => selectedZones[i] ?? true);
    setSavedSelectedZones(out);
    if (out.length !== selectedZones.length) setSelectedZones(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones]);

  useEffect(() => {
    setSavedSelectedZones(selectedZones);
  }, [selectedZones]);

  useEffect(() => {
    setSavedNormalizeMode(normalizeMode);
  }, [normalizeMode]);

  // Mask zoneWeights by selection; normalize optionally among selected only
  const maskedZoneWeights = useMemo(() => {
    const masked: Record<number, number> = {};
    for (let z = 1; z <= zones; z++) {
      const w = zoneWeights[z] ?? 1.0;
      masked[z] = selectedZones[z - 1] ? w : 1.0;
    }
    if (normalizeMode === "selected") {
      const selIdxs = Array.from({ length: zones }, (_, i) => i + 1).filter(z => selectedZones[z - 1]);
      if (selIdxs.length > 0) {
        const meanSel = selIdxs.reduce((s, z) => s + (masked[z] ?? 1), 0) / selIdxs.length;
        if (meanSel > 0) {
          for (const z of selIdxs) masked[z] = (masked[z] ?? 1) / meanSel;
        }
      }
    }
    return masked;
  }, [zoneWeights, selectedZones, normalizeMode, zones]);

  const numberWeights = useMemo(
    () => perNumberWeightsFromZones(localGroups, maskedZoneWeights, true),
    [localGroups, maskedZoneWeights]
  );

  async function onCopyWeights() {
    const payload = {
      weightsByNumber: numberWeights,
      meta: {
        mode: weightMode,
        strength,
        pMin,
        draws: summary.totalDraws,
        selectedZones,
        normalizeMode,
        generatedAt: new Date().toISOString(),
        scheme: `${zones}×${size}`,
      },
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

  function saveGroupsJSON() {
    try {
      const parsed = JSON.parse(groupsJSON) as ZoneGroups;
      const sc = validateZpaGroups(parsed);
      setCustomGroups(parsed);
      setSavedGroups(parsed);
      setToast(`Groups saved (${sc.zones}×${sc.size})`);
      setTimeout(() => setToast(null), 1400);
    } catch (e) {
      setToast(`Invalid groups: ${String(e)}`);
      setTimeout(() => setToast(null), 2200);
    }
  }
  function loadSavedGroups() {
    try {
      const saved = getSavedGroups();
      if (saved && Array.isArray(saved) && saved.length > 0) {
        const sc = validateZpaGroups(saved);
        setGroupsJSON(JSON.stringify(saved, null, 2));
        setCustomGroups(saved);
        setToast(`Loaded saved groups (${sc.zones}×${sc.size})`);
      } else {
        setToast("No saved groups");
      }
      setTimeout(() => setToast(null), 1400);
    } catch (e) {
      setToast(`Load failed: ${String(e)}`);
      setTimeout(() => setToast(null), 1800);
    }
  }
  function resetDefaultGroups() {
    // Reset to a contiguous partition using current scheme if possible,
    // otherwise fall back to 9×5 default.
    try {
      const def = buildContiguousGroups(zones, size);
      setGroupsJSON(JSON.stringify(def, null, 2));
      setCustomGroups(def);
      setSavedGroups(def);
      setToast(`Reset to contiguous default (${zones}×${size})`);
    } catch {
      const d9 = buildDefaultGroups();
      setGroupsJSON(JSON.stringify(d9, null, 2));
      setCustomGroups(d9);
      setSavedGroups(d9);
      setToast("Reset to 9×5 default");
    }
    setTimeout(() => setToast(null), 1400);
  }

  return (
    <section style={{ border: "2px solid #8e24aa", borderRadius: 8, padding: 16, background: "#faf5ff", margin: "18px 0", position: "relative" }}>
      <h3 style={{ marginTop: 0 }}>{title} ({zones} × {size})</h3>

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
                  placeholder={`Enter ${zones} arrays of ${size} numbers (1..45), e.g., [[1,2,...], ...]`}
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
            {/* Zone trends (RECENT) */}
            <div style={{ minWidth: 0, flex: 1, overflowX: "auto" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Zone trends (mains) — last {Math.min(history.length, TREND_WINDOW)} draws</div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thL}>Zone</th>
                    <th style={thR} title="Total mains drawn in this zone across all analyzed draws">PaTot</th>
                    <th style={thR} title="Slope of per-draw counts (0–6) over time">Slope</th>
                    <th style={thR} title="R²: fraction of variance explained by the linear trend (0–1)">R²</th>
                    <th style={thR} title="p-value: two-sided significance of slope">p</th>
                    <th style={thC} title="Directional arrow">Dir</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneTrendsRecent.map((z) => (
                    <tr key={z.zoneIdx}>
                      <td style={tdL}>G{z.zoneIdx + 1}</td>
                      <td style={tdR} title="Pattern total for this zone">{zoneTotalsMain[z.zoneIdx]}</td>
                      <td style={tdR} title={`Slope per draw: ${fmt(z.slope, 4)}`}>{fmt(z.slope, 3)}</td>
                      <td style={tdR} title="R² is the proportion of variance explained by the linear fit">{fmt(z.rSquared, 3)}</td>
                      <td style={tdR} title="Two-sided p-value for slope">{fmt(z.pValue, 3)}</td>
                      <td style={tdC}>{zoneArrow(z.slope, z.pValue, Math.min(history.length, TREND_WINDOW))}</td>
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
                Pattern sums to 6 across {zones} groups (G1..G{zones}). Count = number of draws with this exact pattern.
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

          {/* Recent patterns */}
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

          {/* Per-number frequency (mains) */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Per-number frequency (mains)</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${colsZones}, minmax(140px, 1fr))`, gap: 6 }}>
              {localGroups.map((grp, gi) => (
                <div key={gi} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>G{gi + 1}</div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${colsPerGroup}, minmax(26px, 1fr))`, gap: 6 }}>
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

            {/* Controls row */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#efe9f7", borderRadius: 6 }}>
                <label><input type="radio" checked={weightMode === "boostUp"} onChange={() => setWeightMode("boostUp")} /> Boost up-trending</label>
                <label><input type="radio" checked={weightMode === "boostDown"} onChange={() => setWeightMode("boostDown")} /> Boost down-trending</label>
              </div>
              <label>Strength: <input type="number" min={0} max={0.3} step={0.01} value={strength} onChange={(e) => setStrength(Number(e.target.value))} style={{ width: 80 }} /></label>
              <label>p-min: <input type="number" min={0} max={1} step={0.01} value={pMin} onChange={(e) => setPMin(Number(e.target.value))} style={{ width: 80 }} /></label>
              <button onClick={onCopyWeights} title="Copy per-number weights JSON to clipboard">Copy JSON</button>
            </div>

            {/* Zone selector + normalize mode */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 10 }}>
              <div style={{ minWidth: 260, minHeight: 0 }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Apply to zones</div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(5, colsZones)}, 1fr)`, gap: 6 }}>
                  {Array.from({ length: zones }, (_, i) => i + 1).map((z) => (
                    <label key={`selz-${z}`} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: "6px 8px" }}>
                      <input
                        type="checkbox"
                        checked={selectedZones[z - 1]}
                        onChange={(e) => {
                          const next = Array(zones).fill(true).map((_, i) => (i === z - 1 ? e.target.checked : (selectedZones[i] ?? true)));
                          setSelectedZones(next);
                        }}
                      />
                      <span>G{z}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setSelectedZones(Array(zones).fill(true))}>All</button>
                  <button onClick={() => setSelectedZones(Array(zones).fill(false))}>None</button>
                  <button onClick={() => setSelectedZones(selectedZones.map(v => !v))}>Invert</button>
                </div>
                <div style={{ marginTop: 10, display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#f9f4ff", borderRadius: 6 }}>
                  <label title="Normalize resulting weights so the overall average remains neutral">
                    <input type="radio" checked={normalizeMode === "all"} onChange={() => setNormalizeMode("all")} /> Normalize: All zones
                  </label>
                  <label title="Normalize only among selected zones; unselected zones stay 1.0">
                    <input type="radio" checked={normalizeMode === "selected"} onChange={() => setNormalizeMode("selected")} /> Normalize: Selected only
                  </label>
                </div>
              </div>

              {/* Zone weights table (masked) */}
              <div style={{ minWidth: 220, minHeight: 0, overflowX: "auto" }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Zone weights</div>
                <table style={{ ...tableStyle }}>
                  <thead><tr><th style={thL}>Zone</th><th style={thR}>Weight</th></tr></thead>
                  <tbody>
                    {Array.from({ length: zones }, (_, i) => i + 1).map((z) => (
                      <tr key={`zw-${z}`}><td style={tdL}>G{z}</td><td style={tdR}>{(maskedZoneWeights[z] ?? 1).toFixed(3)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Per-number weights preview; lay out zone tiles responsively */}
              <div style={{ minWidth: 0, flex: 1, overflowX: "auto" }}>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Per-number weights preview</div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${colsZones}, minmax(160px, 1fr))`, gap: 8 }}>
                  {localGroups.map((grp, gi) => (
                    <div key={`grp-${gi}`} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 6, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>G{gi + 1}</div>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${colsPerGroup}, minmax(26px, 1fr))`, gap: 6 }}>
                        {grp.map((n) => (
                          <div key={`n-${n}`} style={{ textAlign: "center", padding: "6px 0", borderRadius: 4, background: "#f7f3ff", border: "1px solid #eee" }}>
                            <div style={{ fontWeight: 800 }}>{n}</div>
                            <div style={{ fontSize: 11, color: "#333" }}>{(numberWeights[n] ?? 1).toFixed(3)}</div>
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