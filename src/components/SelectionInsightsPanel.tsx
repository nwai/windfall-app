import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import {
  buildSelectionInsightPredictedCompanions,
  buildSelectionInsightsAnalytics,
  type SelectionInsightAnalytics,
} from "../lib/selectionInsights";
import { computeOGA, getOGAPercentile } from "../utils/oga";

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
  // New optional trace hook
  onTrace?: (line: string) => void;
  showOgaDiagnostics?: boolean;
}

export interface SelectionInsightsPredictionPanelProps {
  windowAnalytics: SelectionInsightAnalytics;
  allHistoryAnalytics: SelectionInsightAnalytics;
  title?: string;
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
  onTrace,
  showOgaDiagnostics = false,
}) => {
  // Previous local state/hooks unchanged...
  const [info, setInfo] = useState<SelectionInsightAnalytics | null>(null);
  const [ogaRawMap, setOgaRawMap] = useState<Record<number, number>>(
    () => perNumberOGARaw || {}
  );
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const computeAbortRef = useRef<boolean>(false);

  useEffect(() => {
    if (perNumberOGARaw) setOgaRawMap(perNumberOGARaw);
  }, [perNumberOGARaw]);

  // OGA is optional here; companion counts are the direct evidence.
  useEffect(() => {
    if (!showOgaDiagnostics) {
      setOgaRawMap({});
      return;
    }
    if (!autoComputeOGARaw) return;
    if (!history.length) {
      setOgaRawMap({});
      return;
    }
    onTrace?.(`[SelectionInsights] computing per-number OGA over ${history.length} draws...`);
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
    onTrace?.(`[SelectionInsights] per-number OGA computed.`);
  }, [autoComputeOGARaw, history, ogaHistory, onComputedOGARaw, onTrace, showOgaDiagnostics]);

  // Heavy analytics (pairs/triplets/companions) – unchanged from enhanced version
  useEffect(() => {
    computeAbortRef.current = false;
    setInfo(null);
    if (!history.length || !selected.length) {
      setInfo(null);
      return;
    }
    onTrace?.(`[SelectionInsights] computing pairs/triplets/companions for ${selected.length} selected…`);
    const heavy = () => {
      if (computeAbortRef.current) return;
      const analytics = buildSelectionInsightsAnalytics(history, selected, { topKTriplets });
      if (!computeAbortRef.current) setInfo(analytics);
      onTrace?.(`[SelectionInsights] analytics ready: ${analytics.pairRows.length} pairs, ${analytics.tripletRows.length} triplets, ${analytics.companionRows.length} companions`);
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
  }, [history, selected, topKTriplets, lazyThreshold, useIdleCallback, onTrace]);

  // Compute dynamic OGA for selected 8-number set when exactly 8 selected
  const setOGARaw = useMemo(() => {
    if (!showOgaDiagnostics) return null;
    if (selected.length !== 8) return null;
    const nums = [...selected].slice(0, 8);
    try {
      const raw = computeOGA(nums, history);
      return raw;
    } catch {
      return null;
    }
  }, [selected, history, showOgaDiagnostics]);

  const pastDrawOGAs = useMemo(() => {
    if (!showOgaDiagnostics || setOGARaw == null) return [];
    // Build OGA raw distribution of past draws for percentile
    return history.map((d, idx) => computeOGA([...d.main, ...d.supp], history.slice(0, idx)));
  }, [history, setOGARaw, showOgaDiagnostics]);

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
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          Computing co-occurrence analytics…
        </div>
      </section>
    );
  }
  if (!info) return null;

  const { selectedNumbers, pairRows, tripletRows, companionRows, neverWithCount, neverWithNumbers, cappedTriplets } = info;
  const visibleDataRows =
    pairRows.length +
    tripletRows.length +
    companionRows.length +
    countWrappedChipRows(neverWithNumbers.length);
  const isCardScrollable = visibleDataRows > CARD_SCROLL_ROW_THRESHOLD;
  const cardBodyStyle = getCardBodyStyle(visibleDataRows);
  const companionListStyle = isCardScrollable ? unboundedListStyle : scrollListStyle;
  const neverChipListStyle = isCardScrollable ? unboundedChipListStyle : chipScrollStyle;

  const fmtOGARaw = (n: number) =>
    ogaRawMap[n] !== undefined ? ogaRawMap[n].toFixed(2) : "—";

  return (
    <section style={cardBodyStyle} data-scrollable={isCardScrollable || undefined}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        {historyWindowName && (
          <span style={scopePillStyle}>
            {historyWindowName}
          </span>
        )}
        {cappedTriplets && (
          <span style={warningPillStyle}>
            Triplets limited (selection &gt; 12)
          </span>
        )}
      </div>

      {showOgaDiagnostics ? (
        <details style={detailsStyle}>
          <summary style={summaryStyle}>OGA geometry diagnostic</summary>
          <div style={{ marginTop: 6 }}>
            {selected.length < 8 ? (
              <div style={mutedTextStyle}>Select exactly 8 numbers to compute the set's OGA score.</div>
            ) : selected.length > 8 ? (
              <div style={warnTextStyle}>More than 8 selected. Trim to 8 to compute OGA for a single set.</div>
            ) : setOGARaw != null ? (
              <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>Selected set OGA:</b>
                <span title="Raw OGA score for the current 8-number selection">{setOGARaw.toFixed(2)}</span>
                {setOGAPercentile != null ? (
                  <span style={{ color: "#1976d2" }} title="Percentile vs OGA scores of past draws">
                    {setOGAPercentile.toFixed(1)}%
                  </span>
                ) : null}
                <span style={mutedTextStyle}>Geometry only; not a calibrated win probability.</span>
              </div>
            ) : (
              <div style={warnTextStyle}>Failed to compute OGA for the current selection.</div>
            )}
          </div>
        </details>
      ) : null}

      {/* Pairs */}
      <div style={{ marginBottom: 10 }}>
        <h4 style={subheadStyle}>Pairs</h4>
        {pairRows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: showOgaDiagnostics ? 520 : 300, width: "100%" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thL}>Pair</th>
                  <th style={thR} title="Draws both appeared">Co-draws</th>
                  <th style={thR} title="Consecutive co-draw streaks">Consecutive</th>
                  {showOgaDiagnostics ? <th style={thR} title="Average OGA raw number A">A OGA</th> : null}
                  {showOgaDiagnostics ? <th style={thR} title="Average OGA raw number B">B OGA</th> : null}
                </tr>
              </thead>
              <tbody>
                {pairRows.map((r) => (
                  <tr key={`${r.a}-${r.b}`} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdL}>({r.a}, {r.b})</td>
                    <td style={tdR}>{r.total}</td>
                    <td style={tdR}>{r.consecutive}</td>
                    {showOgaDiagnostics ? <td style={tdR}>{fmtOGARaw(r.a)}</td> : null}
                    {showOgaDiagnostics ? <td style={tdR}>{fmtOGARaw(r.b)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <i style={{ color: "#777" }}>
            {selectedNumbers.length < 2
              ? "Select at least 2 numbers to see pairs."
              : "No selected pairs have been co-drawn in this scope."}
          </i>
        )}
      </div>

      {/* Triplets */}
      <div style={{ marginBottom: 10 }}>
        <h4 style={subheadStyle}>Triplets</h4>
        {tripletRows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: showOgaDiagnostics ? 520 : 300, width: "100%" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thL}>Triplet</th>
                  <th style={thR}>Co-draws</th>
                  {showOgaDiagnostics ? <th style={thR}>A OGA</th> : null}
                  {showOgaDiagnostics ? <th style={thR}>B OGA</th> : null}
                  {showOgaDiagnostics ? <th style={thR}>C OGA</th> : null}
                </tr>
              </thead>
              <tbody>
                {tripletRows.map((r) => (
                  <tr key={`${r.a}-${r.b}-${r.c}`} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdL}>({r.a}, {r.b}, {r.c})</td>
                    <td style={tdR}>{r.total}</td>
                    {showOgaDiagnostics ? <td style={tdR}>{fmtOGARaw(r.a)}</td> : null}
                    {showOgaDiagnostics ? <td style={tdR}>{fmtOGARaw(r.b)}</td> : null}
                    {showOgaDiagnostics ? <td style={tdR}>{fmtOGARaw(r.c)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <i style={{ color: "#777" }}>
            {selectedNumbers.length < 3
              ? "Select at least 3 numbers to see triplets."
              : cappedTriplets
                ? "Triplets are skipped for very large selections."
                : "No selected triplets have been co-drawn in this scope."}
          </i>
        )}
      </div>

      {/* Companions + Never */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h4 style={subheadStyle}>Companions ranked ({companionRows.length})</h4>
          {companionRows.length ? (
            <div style={companionListStyle} aria-label="All observed companions ranked">
              {companionRows.map((x, index) => (
                <div key={x.n} style={rankRowStyle}>
                  <span style={rankStyle}>{index + 1}</span>
                  <b>#{x.n}</b>
                  <span style={{ marginLeft: "auto" }}>{x.count} co-draws</span>
                  <span style={mutedTextStyle}>{(x.rate * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <i style={{ color: "#777" }}>No companions observed.</i>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <h4 style={subheadStyle}>Never co-drawn ({neverWithCount})</h4>
          {neverWithNumbers.length ? (
            <div style={neverChipListStyle} aria-label="All numbers never co-drawn with the current selection">
              {neverWithNumbers.map((number) => (
                <span key={number} style={numberChipStyle}>{number}</span>
              ))}
            </div>
          ) : (
            <div style={mutedTextStyle}>Every unselected number has appeared with the selection at least once.</div>
          )}
        </div>
      </div>
    </section>
  );
};

export const SelectionInsightsPredictionPanel: React.FC<SelectionInsightsPredictionPanelProps> = ({
  windowAnalytics,
  allHistoryAnalytics,
  title = "Predicted",
}) => {
  const rows = useMemo(
    () => buildSelectionInsightPredictedCompanions(windowAnalytics, allHistoryAnalytics),
    [windowAnalytics, allHistoryAnalytics],
  );
  const isCardScrollable = rows.length > CARD_SCROLL_ROW_THRESHOLD;
  const cardBodyStyle = getCardBodyStyle(rows.length);
  const predictedListStyle = isCardScrollable ? unboundedListStyle : scrollListStyle;

  return (
    <section style={cardBodyStyle} data-scrollable={isCardScrollable || undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span style={scopePillStyle}>{title}</span>
        <span style={mutedTextStyle}>{rows.length} ranked</span>
      </div>
      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.35, marginBottom: 8 }}>
        Blends Windowed and All History companion rates. This is a shortlist diagnostic, not a calibrated probability.
      </div>
      {rows.length ? (
        <div style={predictedListStyle} aria-label="Predicted companion shortlist">
          {rows.map((row, index) => (
            <div key={row.n} style={rankRowStyle}>
              <span style={rankStyle}>{index + 1}</span>
              <b>#{row.n}</b>
              <span style={{ marginLeft: "auto" }}>{row.supportScore.toFixed(1)}</span>
              <span style={mutedTextStyle}>W {row.windowCount} · All {row.allCount}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={mutedTextStyle}>Select at least one number to rank companion evidence.</div>
      )}
    </section>
  );
};

/* Styles */
const CARD_SCROLL_ROW_THRESHOLD = 12;
const CARD_SCROLL_MAX_HEIGHT = 520;

const countWrappedChipRows = (chipCount: number): number => {
  if (chipCount <= 0) return 0;
  return Math.ceil(chipCount / 8);
};

const sectionStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 0,
  padding: 10,
  background: "transparent",
  marginTop: 0,
};
const scrollableSectionStyle: React.CSSProperties = {
  ...sectionStyle,
  maxHeight: CARD_SCROLL_MAX_HEIGHT,
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
};

const getCardBodyStyle = (rowCount: number): React.CSSProperties =>
  rowCount > CARD_SCROLL_ROW_THRESHOLD ? scrollableSectionStyle : sectionStyle;

const scopePillStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#155a8a",
  background: "#eef6ff",
  border: "1px solid #cfe3f7",
  padding: "2px 8px",
  borderRadius: 999,
  fontWeight: 850,
};
const warningPillStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9a3412",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  padding: "2px 8px",
  borderRadius: 999,
  fontWeight: 850,
};
const detailsStyle: React.CSSProperties = {
  marginBottom: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "6px 8px",
  background: "#fff",
  fontSize: 12,
};
const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#334155",
  fontWeight: 850,
};
const subheadStyle: React.CSSProperties = { margin: "0 0 5px 0", fontSize: 12, color: "#26313d" };
const thL: React.CSSProperties = { textAlign: "left", padding: "4px 6px" };
const thR: React.CSSProperties = { textAlign: "right", padding: "4px 6px" };
const tdL: React.CSSProperties = { textAlign: "left", padding: "4px 6px" };
const tdR: React.CSSProperties = { textAlign: "right", padding: "4px 6px" };
const mutedTextStyle: React.CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 750 };
const warnTextStyle: React.CSSProperties = { color: "#9a3412", fontSize: 12, fontWeight: 750 };
const scrollListStyle: React.CSSProperties = {
  maxHeight: 210,
  overflowY: "auto",
  border: "1px solid #edf2f7",
  borderRadius: 8,
  background: "#fff",
};
const unboundedListStyle: React.CSSProperties = {
  border: "1px solid #edf2f7",
  borderRadius: 8,
  background: "#fff",
};
const rankRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "5px 7px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 12,
  color: "#26313d",
};
const rankStyle: React.CSSProperties = {
  minWidth: 20,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 850,
  textAlign: "right",
};
const chipScrollStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  maxHeight: 114,
  overflowY: "auto",
  border: "1px solid #edf2f7",
  borderRadius: 8,
  background: "#fff",
  padding: 6,
};
const unboundedChipListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  border: "1px solid #edf2f7",
  borderRadius: 8,
  background: "#fff",
  padding: 6,
};
const numberChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 24,
  height: 22,
  borderRadius: 999,
  border: "1px solid #dbe3ec",
  background: "#f8fafc",
  color: "#334155",
  fontSize: 11,
  fontWeight: 850,
};
