/**
 * SelectionInsightsPanel – Enhanced with dynamic OGA score for selected 8-number set.
 *
 * New features:
 *  - If exactly 8 numbers are selected, compute the canonical OGA raw for that set
 *    against the chosen history (window or full), and compute its percentile vs past draws.
 *  - Display this "Selected Set OGA" card at the top, updating live when selection changes.
 *
 * Notes:
 *  - We keep the original co-occurrence analytics (pairs/triplets/companions/never).
 *  - The "per-number OGA raw" rows remain optional informational context, but the canonical
 *    set OGA is now the primary highlight when 8 numbers are selected.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import { computeOGA, getOGAPercentile } from "../utils/oga";

// Helper utilities for combinations and stable keys
function combinations2(nums: number[]): [number, number][] {
  const res: [number, number][] = [];
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      res.push([nums[i], nums[j]]);
    }
  }
  return res;
}
function combinations3(nums: number[]): [number, number, number][] {
  const res: [number, number, number][] = [];
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      for (let k = j + 1; k < nums.length; k++) {
        res.push([nums[i], nums[j], nums[k]]);
      }
    }
  }
  return res;
}
function keyPair(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
function keyTriplet(a: number, b: number, c: number): string {
  const arr = [a, b, c].sort((x, y) => x - y);
  return `${arr[0]}-${arr[1]}-${arr[2]}`;
}

export interface SelectionInsightsPanelProps {
  history: Draw[];
  selected: number[];
  topKTriplets?: number;
  historyWindowName?: string;
  perNumberOGARaw?: Record<number, number>;
  autoComputeOGARaw?: boolean;
  ogaHistory?: Draw[]; // if you want OGA base different from visible window
  onComputedOGARaw?: (map: Record<number, number>) => void;
  lazyThreshold?: number;
  useIdleCallback?: boolean;
}

interface AnalyticsInfo {
  pairRows: { a: number; b: number; total: number; consecutive: number }[];
  tripletRows: { a: number; b: number; c: number; total: number }[];
  topCompanions: { n: number; count: number }[];
  neverWithCount: number;
  neverWithSample: number[];
  cappedTriplets: boolean;
}

export const SelectionInsightsPanel: React.FC<SelectionInsightsPanelProps> = ({
  history,
  selected,
  topKTriplets = 10,
  historyWindowName,
  perNumberOGARaw,
  autoComputeOGARaw = true,
  ogaHistory,
  onComputedOGARaw,
  lazyThreshold = 400,
  useIdleCallback = true,
}) => {
  // Previous local state/hooks unchanged...
  const [info, setInfo] = useState<AnalyticsInfo | null>(null);
  const [ogaRawMap, setOgaRawMap] = useState<Record<number, number>>(
    () => perNumberOGARaw || {}
  );
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const computeAbortRef = useRef<boolean>(false);

  useEffect(() => {
    if (perNumberOGARaw) setOgaRawMap(perNumberOGARaw);
  }, [perNumberOGARaw]);

  // Auto-compute per-number OGA raw (unchanged)
  useEffect(() => {
    if (!autoComputeOGARaw) return;
    if (!history.length) {
      setOgaRawMap({});
      return;
    }
    const base = ogaHistory ?? history;
    const accum: Record<number, { sum: number; count: number }> = {};
    for (let n = 1; n <= 45; n++) accum[n] = { sum: 0, count: 0 };
    for (let i = 0; i < base.length; i++) {
      const prior = base.slice(0, i);
      const d = base[i];
      const nums = [...d.main, ...d.supp];
      let raw = 0;
      try { raw = computeOGA(nums, prior); } catch { raw = 0; }
      for (const n of nums) {
        if (n >= 1 && n <= 45) {
          accum[n].sum += raw;
          accum[n].count += 1;
        }
      }
    }
    const map: Record<number, number> = {};
    for (let n = 1; n <= 45; n++) {
      const { sum, count } = accum[n];
      map[n] = count > 0 ? sum / count : 0;
    }
    setOgaRawMap(map);
    onComputedOGARaw?.(map);
  }, [autoComputeOGARaw, history, ogaHistory, onComputedOGARaw]);

  // Heavy analytics (pairs/triplets/companions) – unchanged from enhanced version
  useEffect(() => {
    computeAbortRef.current = false;
    setInfo(null);
    if (!history.length || !selected.length) {
      setInfo(null);
      return;
    }
    const heavy = () => {
      if (computeAbortRef.current) return;
      const drawSets: Array<Set<number>> = history.map((d) => new Set([...d.main, ...d.supp]));
      const companionCount = new Array(46).fill(0) as number[];
      const sel = Array.from(new Set(selected)).sort((a, b) => a - b);
      const pairs = combinations2(sel);
      const pairTotals = new Map<string, number>();
      const pairConsecutive = new Map<string, number>();
      const triplets = sel.length <= 12 ? combinations3(sel) : [] as [number, number, number][];
      const tripletTotals = new Map<string, number>();
      for (let t = 0; t < drawSets.length; t++) {
        if (computeAbortRef.current) return;
        const s = drawSets[t];
        const selectedPresent = sel.some((n) => s.has(n));
        if (selectedPresent) {
          for (let n = 1; n <= 45; n++) if (s.has(n)) companionCount[n] += 1;
        }
        for (const [a, b] of pairs) {
          if (s.has(a) && s.has(b)) {
            const k = keyPair(a, b);
            pairTotals.set(k, (pairTotals.get(k) || 0) + 1);
            if (t + 1 < drawSets.length) {
              const s2 = drawSets[t + 1];
              if (s2.has(a) && s2.has(b)) {
                pairConsecutive.set(k, (pairConsecutive.get(k) || 0) + 1);
              }
            }
          }
        }
        if (triplets.length) {
          for (const [a, b, c] of triplets) {
            if (s.has(a) && s.has(b) && s.has(c)) {
              const k = keyTriplet(a, b, c);
              tripletTotals.set(k, (tripletTotals.get(k) || 0) + 1);
            }
          }
        }
      }
      const everCompanion = new Set<number>();
      for (let n = 1; n <= 45; n++) if (companionCount[n] > 0) everCompanion.add(n);
      for (const n of sel) everCompanion.delete(n);
      const neverWithCount = 45 - sel.length - everCompanion.size;
      const neverWithSample: number[] = [];
      for (let n = 1; n <= 45 && neverWithSample.length < 10; n++) {
        if (sel.includes(n)) continue;
        if (companionCount[n] === 0) neverWithSample.push(n);
      }
      const pairRows = pairs
        .map(([a, b]: [number, number]) => {
          const k = keyPair(a, b);
          return { a, b, total: pairTotals.get(k) || 0, consecutive: pairConsecutive.get(k) || 0 };
        })
        .sort((x: { a: number; b: number; total: number; consecutive: number }, y: { a: number; b: number; total: number; consecutive: number }) =>
          y.total - x.total || y.consecutive - x.consecutive || x.a - y.a || x.b - y.b
        );
      const tripletRows = triplets
        .map(([a, b, c]: [number, number, number]) => {
          const k = keyTriplet(a, b, c);
          return { a, b, c, total: tripletTotals.get(k) || 0 };
        })
        .sort((x: { a: number; b: number; c: number; total: number }, y: { a: number; b: number; c: number; total: number }) =>
          y.total - x.total || x.a - y.a || x.b - y.b || x.c - y.c
        )
        .slice(0, topKTriplets);
      const topCompanions = Array.from({ length: 45 }, (_, i) => i + 1)
        .filter((n) => !sel.includes(n))
        .map((n) => ({ n, count: companionCount[n] as number }))
        .filter(({ count }) => count > 0)
        .sort((a, b) => b.count - a.count || a.n - b.n)
        .slice(0, 12);
      const result: AnalyticsInfo = {
        pairRows,
        tripletRows,
        topCompanions,
        neverWithCount,
        neverWithSample,
        cappedTriplets: sel.length > 12,
      };
      if (!computeAbortRef.current) setInfo(result);
    };

    const shouldLazy = history.length > lazyThreshold;
    if (shouldLazy && useIdleCallback && "requestIdleCallback" in window) {
      setIsComputing(true);
      (window as any).requestIdleCallback(
        () => {
          heavy();
          setIsComputing(false);
        },
        { timeout: 300 }
      );
    } else if (shouldLazy && useIdleCallback) {
      setIsComputing(true);
      setTimeout(() => {
        heavy();
        setIsComputing(false);
      }, 0);
    } else {
      heavy();
    }

    return () => { computeAbortRef.current = true; };
  }, [history, selected, topKTriplets, lazyThreshold, useIdleCallback]);

  // Compute dynamic OGA for selected 8-number set when exactly 8 selected
  const setOGARaw = useMemo(() => {
    if (selected.length !== 8) return null;
    const nums = [...selected].slice(0, 8);
    try {
      const raw = computeOGA(nums, history);
      return raw;
    } catch {
      return null;
    }
  }, [selected, history]);

  const pastDrawOGAs = useMemo(() => {
    // Build OGA raw distribution of past draws for percentile
    return history.map((d, idx) => computeOGA([...d.main, ...d.supp], history.slice(0, idx)));
  }, [history]);

  const setOGAPercentile = useMemo(() => {
    if (setOGARaw == null) return null;
    try {
      return getOGAPercentile(setOGARaw, pastDrawOGAs);
    } catch {
      return null;
    }
  }, [setOGARaw, pastDrawOGAs]);

  if (!history.length || !selected.length) return null;
  if (isComputing && !info) {
    return (
      <section style={sectionStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Selection Insights</h3>
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          Computing co-occurrence analytics…
        </div>
      </section>
    );
  }
  if (!info) return null;

  const { pairRows, tripletRows, topCompanions, neverWithCount, neverWithSample, cappedTriplets } = info;

  const fmtOGARaw = (n: number) =>
    ogaRawMap[n] !== undefined ? ogaRawMap[n].toFixed(2) : "—";

  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Selection Insights</h3>
        {historyWindowName && (
          <span style={{ fontSize: 12, color: "#1a4fa3", background: "#e8eefc", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
            {historyWindowName}
          </span>
        )}
        {cappedTriplets && (
          <span style={{ fontSize: 12, color: "#a15e00", background: "#fff3e0", padding: "2px 8px", borderRadius: 6 }}>
            Triplets limited (selection &gt; 12)
          </span>
        )}
      </div>

      {/* Selected Set OGA card */}
      <div style={{ marginBottom: 12 }}>
        {selected.length < 8 ? (
          <div style={{ fontSize: 12, color: "#555" }}>
            Select exactly 8 numbers to compute the set’s OGA score.
          </div>
        ) : selected.length > 8 ? (
          <div style={{ fontSize: 12, color: "#a00" }}>
            More than 8 selected. Trim to 8 to compute OGA for a single set.
          </div>
        ) : setOGARaw != null ? (
          <div style={{ display: "inline-flex", gap: 10, alignItems: "center", background: "#f0f7ff", border: "1px solid #cfe5ff", borderRadius: 6, padding: "8px 10px" }}>
            <b>Selected Set OGA:</b>
            <span title="Raw OGA score for the current 8-number selection">{setOGARaw.toFixed(2)}</span>
            {setOGAPercentile != null && (
              <span style={{ color: "#1976d2" }} title="Percentile vs OGA scores of past draws">
                ({setOGAPercentile.toFixed(1)}%)
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#a00" }}>
            Failed to compute OGA for the current selection.
          </div>
        )}
      </div>

      {/* Pairs */}
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 6px 0" }}>Pairs (co-draws across history) + OGA raw</h4>
        {pairRows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thL}>Pair</th>
                  <th style={thR} title="Draws both appeared">Co-draws</th>
                  <th style={thR} title="Consecutive co-draw streaks">Consecutive</th>
                  <th style={thR} title="Avg OGA raw number A">A OGA raw</th>
                  <th style={thR} title="Avg OGA raw number B">B OGA raw</th>
                </tr>
              </thead>
              <tbody>
                {pairRows.map((r) => (
                  <tr key={`${r.a}-${r.b}`} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdL}>({r.a}, {r.b})</td>
                    <td style={tdR}>{r.total}</td>
                    <td style={tdR}>{r.consecutive}</td>
                    <td style={tdR}>{fmtOGARaw(r.a)}</td>
                    <td style={tdR}>{fmtOGARaw(r.b)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <i style={{ color: "#777" }}>Select at least 2 numbers to see pairs.</i>
        )}
      </div>

      {/* Triplets */}
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 6px 0" }}>Triplets (top co-draws) + OGA raw</h4>
        {tripletRows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thL}>Triplet</th>
                  <th style={thR}>Co-draws</th>
                  <th style={thR}>A OGA raw</th>
                  <th style={thR}>B OGA raw</th>
                  <th style={thR}>C OGA raw</th>
                </tr>
              </thead>
              <tbody>
                {tripletRows.map((r) => (
                  <tr key={`${r.a}-${r.b}-${r.c}`} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdL}>({r.a}, {r.b}, {r.c})</td>
                    <td style={tdR}>{r.total}</td>
                    <td style={tdR}>{fmtOGARaw(r.a)}</td>
                    <td style={tdR}>{fmtOGARaw(r.b)}</td>
                    <td style={tdR}>{fmtOGARaw(r.c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <i style={{ color: "#777" }}>Select at least 3 numbers to see triplets.</i>
        )}
      </div>

      {/* Companions + Never */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220 }}>
          <h4 style={{ margin: "0 0 6px 0" }}>Top companions (with any selected)</h4>
          {topCompanions.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {topCompanions.map((x) => (
                <li key={x.n}>
                  #{x.n} — {x.count} co-draws (OGA {fmtOGARaw(x.n)})
                </li>
              ))}
            </ul>
          ) : (
            <i style={{ color: "#777" }}>No companions observed.</i>
          )}
        </div>
        <div style={{ minWidth: 220 }}>
          <h4 style={{ margin: "0 0 6px 0" }}>Never co-drawn with selection</h4>
          <div style={{ fontSize: 12 }}>
            Count: <b>{neverWithCount}</b>
            {neverWithSample.length > 0 && (
              <>
                {" "}• Sample: <span>{neverWithSample.join(", ")}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/* Styles */
const sectionStyle: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  padding: 14,
  background: "#fdfdfd",
  marginTop: 12,
};
const thL: React.CSSProperties = { textAlign: "left", padding: "4px 8px" };
const thR: React.CSSProperties = { textAlign: "right", padding: "4px 8px" };
const tdL: React.CSSProperties = { textAlign: "left", padding: "4px 8px" };
const tdR: React.CSSProperties = { textAlign: "right", padding: "4px 8px" };

// NOTE: combinations2, combinations3, keyPair, keyTriplet helper functions are same as before (keep them above).
