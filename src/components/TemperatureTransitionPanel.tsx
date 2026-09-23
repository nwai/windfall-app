import React, { useMemo, useState } from "react";
import { Draw } from "../types";
import { buildTransitionMatrix, getTransitionProbability } from "../lib/temperatureTransitions";
import {
  backtestTemperatureTransitionsThreshold,
  backtestTemperatureTransitionsTopK,
} from "../lib/backtestTemperatureTransitions";
import { computeTemperatureCategories, Temperature, TemperatureClassifierOptions } from "../lib/temperatureCategories";
import { sweepWindows, WindowSweepMode, SweepMetric } from "../lib/ttpWindowSweep";
import { getSavedZoneWeights, WeightsByNumber } from "../lib/zpaStorage";
import { useZPASettings } from "../context/ZPASettingsContext";
import { filterRealDrawHistory } from "../lib/realDrawHistory";
import {
  buildTemperatureVolcanicPrecursorAdvisor,
  type TemperatureVolcanicPrecursorAdvisor,
  type TemperatureVolcanicPrecursorMetricResult,
  type TemperatureVolcanicPrecursorSelectedRead,
} from "../lib/temperatureVolcanicPrecursors";

export interface TemperatureTransitionPanelProps {
  history: Draw[];
  historyScopeLabel?: string;
  activeWindowHistory?: Draw[];
  activeWindowScopeLabel?: string;
  selectedNumbers?: number[];

  // Keep in lockstep with TemperatureHeatmap props:
  alpha?: number;
  metric?: "ema" | "recency" | "hybrid";
  buckets?: number;
  bucketStops?: number[];
  hybridWeight?: number;
  emaNormalize?: "global" | "per-number";
  enforcePeaks?: boolean;

  // Trend classification knobs (optional)
  trendLookback?: number;       // default 4
  trendDelta?: number;          // default 0.02
  trendReversal?: boolean;      // default true
}

type PredictionMode = "threshold" | "topk";
type LabelMode = "indices" | "dates";
type PrecursorScope = "baseline" | "wfmqyh";

const precursorCardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(51, 102, 204, 0.22)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.84)",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
};

const formatPrecursorRate = (value: number | null | undefined): string => (
  value == null || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`
);

const formatPrecursorNumber = (value: number | null | undefined): string => (
  value == null || !Number.isFinite(value) ? "n/a" : value.toFixed(1)
);

const readableLearningTone = (learnt: string): { color: string; background: string; border: string } => {
  if (learnt === "Recently rising") return { color: "#b91c1c", background: "#fff1f2", border: "#fecdd3" };
  if (learnt === "Recently falling") return { color: "#075985", background: "#eff6ff", border: "#bfdbfe" };
  if (learnt === "Stable") return { color: "#166534", background: "#f0fdf4", border: "#bbf7d0" };
  return { color: "#64748b", background: "#f8fafc", border: "#e2e8f0" };
};

function PrecursorTemperaturePill({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  const textColor = ["#fdd835", "#a6d854", "#66c2a5"].includes(color) ? "#111827" : "#fff";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 82,
        padding: "3px 8px",
        borderRadius: 999,
        background: color,
        color: textColor,
        fontSize: 12,
        fontWeight: 850,
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

function LearningPill({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  const tone = readableLearningTone(label);
  return (
    <span
      title={detail}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3px 7px",
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        background: tone.background,
        color: tone.color,
        fontSize: 11,
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function SelectedPrecursorReads({ reads }: { reads: TemperatureVolcanicPrecursorSelectedRead[] }) {
  if (reads.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
        Select numbers in a shared User Selected strip to see their current Recency, EMA, and Hybrid precursor states here.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8, marginTop: 10 }}>
      {reads.map((read) => (
        <div key={read.number} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: 9, background: "#fff" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>#{read.number}</div>
          <div style={{ display: "grid", gap: 6, marginTop: 7 }}>
            {read.metrics.map((metric) => (
              <div key={metric.metric} style={{ display: "grid", gridTemplateColumns: "54px 94px 1fr", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 850 }}>{metric.label}</span>
                <PrecursorTemperaturePill label={metric.currentLabel} color={metric.currentColor} />
                <span style={{ fontSize: 11, color: "#475569" }}>
                  next-hit {formatPrecursorRate(metric.matchingRow?.hitRate)}
                  {" · "}since hit {metric.drawsSinceNumberHit ?? "n/a"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrecursorMetricCard({ result }: { result: TemperatureVolcanicPrecursorMetricResult }) {
  return (
    <div style={{ border: "1px solid #dbe5f4", borderRadius: 10, background: "#fff", overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "9px 10px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>{result.label}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{result.transitionCount} transitions</div>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
          {result.totalHits} Volcanic hits inspected
        </div>
      </div>
      <div style={{ maxHeight: 330, overflow: "auto" }}>
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, textAlign: "left", padding: "7px 8px", fontSize: 11 }}>Prior temp</th>
              <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, textAlign: "right", padding: "7px 8px", fontSize: 11 }}>Count</th>
              <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, textAlign: "right", padding: "7px 8px", fontSize: 11 }}>Observed rate</th>
              <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, textAlign: "right", padding: "7px 8px", fontSize: 11 }}>Avg hit gap</th>
              <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, textAlign: "right", padding: "7px 8px", fontSize: 11 }}>Since hit</th>
              <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, textAlign: "left", padding: "7px 8px", fontSize: 11 }}>Learnt</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.bucketIndex}>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #edf2f7" }}>
                  <PrecursorTemperaturePill label={row.label} color={row.color} />
                </td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #edf2f7", textAlign: "right", fontWeight: 850 }}>{row.hits}</td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #edf2f7", textAlign: "right" }}>
                  <b>{formatPrecursorRate(row.hitRate)}</b>
                  <span style={{ color: "#64748b" }}> · {row.hits}/{row.trials}</span>
                </td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #edf2f7", textAlign: "right" }}>{formatPrecursorNumber(row.averageGapBetweenHits)}</td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #edf2f7", textAlign: "right" }}>
                  {row.drawsSinceMostRecentHit ?? "n/a"}
                </td>
                <td style={{ padding: "6px 8px", borderTop: "1px solid #edf2f7" }}>
                  <LearningPill label={row.learnt} detail={row.learntDetail} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VolcanicPrecursorAdvisorCard({
  advisor,
  scope,
  setScope,
  canUseWfmqyh,
}: {
  advisor: TemperatureVolcanicPrecursorAdvisor;
  scope: PrecursorScope;
  setScope: (scope: PrecursorScope) => void;
  canUseWfmqyh: boolean;
}) {
  return (
    <div style={precursorCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>Volcanic Precursor Advisor</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
            Counts the immediate temperature state before a number became Volcanic in the next recorded draw. Diagnostic evidence only.
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: 4, border: "1px solid #dbe5f4", borderRadius: 999, background: "#fff" }}>
          <button
            type="button"
            onClick={() => setScope("baseline")}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "5px 10px",
              fontWeight: 850,
              background: scope === "baseline" ? "#111827" : "transparent",
              color: scope === "baseline" ? "#fff" : "#475569",
              cursor: "pointer",
            }}
          >
            Baseline
          </button>
          <button
            type="button"
            onClick={() => setScope("wfmqyh")}
            disabled={!canUseWfmqyh}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "5px 10px",
              fontWeight: 850,
              background: scope === "wfmqyh" ? "#111827" : "transparent",
              color: !canUseWfmqyh ? "#94a3b8" : scope === "wfmqyh" ? "#fff" : "#475569",
              cursor: canUseWfmqyh ? "pointer" : "not-allowed",
            }}
          >
            WFMQYH
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 12, color: "#475569" }}>
        <span><b>Scope:</b> {advisor.scopeLabel}</span>
        <span><b>Draws:</b> {advisor.drawCount}</span>
      </div>

      {advisor.warnings.length > 0 && (
        <div style={{ marginTop: 9, fontSize: 12, color: "#6b4a00", background: "#fff9e8", border: "1px solid #e2b84f", borderRadius: 8, padding: "7px 9px" }}>
          {advisor.warnings.join(" ")}
        </div>
      )}

      <SelectedPrecursorReads reads={advisor.selectedReads} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 10, marginTop: 12 }}>
        {advisor.metricResults.map((result) => <PrecursorMetricCard key={result.metric} result={result} />)}
      </div>

      <div style={{ fontSize: 11, color: "#64748b", marginTop: 10 }}>
        Learnt compares recent transition evidence with the same scope's full evidence. It updates when real draw history changes, but it is still a diagnostic label rather than a forecast.
      </div>
    </div>
  );
}

function latestTempsFromCategories(
  categories: Record<number, Temperature[]>,
  heightNumbers = 45
): Record<number, Temperature> {
  const res: Record<number, Temperature> = {};
  for (let n = 1; n <= heightNumbers; ++n) {
    const arr = categories[n] || [];
    if (arr.length) res[n] = arr[arr.length - 1];
  }
  return res;
}

export const TemperatureTransitionPanel: React.FC<TemperatureTransitionPanelProps> = ({
  history,
  historyScopeLabel,
  activeWindowHistory,
  activeWindowScopeLabel,
  selectedNumbers = [],

  alpha = 0.25,
  metric = "hybrid",
  buckets = 10,
  bucketStops,
  hybridWeight = 0.6,
  emaNormalize = "per-number",
  enforcePeaks = true,

  trendLookback = 4,
  trendDelta = 0.02,
  trendReversal = true,
}) => {
  // Window and diagnostic-selection controls
  const [windowSize, setWindowSize] = useState(50);
  const [mode, setMode] = useState<PredictionMode>("threshold");
  const [predThreshold, setPredThreshold] = useState(0.5);
  const [topK, setTopK] = useState(8);

  // Display controls
  const [backtestShowCount, setBacktestShowCount] = useState(6);
  const [labelMode, setLabelMode] = useState<LabelMode>("indices");
  const [precursorScope, setPrecursorScope] = useState<PrecursorScope>("baseline");

  // Auto-window suggestion
  const [autoSuggestion, setAutoSuggestion] = useState<{ window: number; metric: SweepMetric; value: number } | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  // Global Zone Weighting (single source of truth)
  const { zoneWeightingEnabled, zoneGamma } = useZPASettings();

  // Load saved per-number weights (from ZPA panel) once
  const savedZoneWeights: WeightsByNumber | null = useMemo(() => {
    try { return getSavedZoneWeights(); } catch { return null; }
  }, []);

  const realHistory = useMemo(
    () => filterRealDrawHistory(history, "temperature-transition diagnostics"),
    [history],
  );

  const activeWindowRealHistory = useMemo(
    () => activeWindowHistory ? filterRealDrawHistory(activeWindowHistory, "temperature-transition active-window diagnostics") : null,
    [activeWindowHistory],
  );

  const precursorHistory = precursorScope === "wfmqyh" && activeWindowRealHistory
    ? activeWindowRealHistory.history
    : realHistory.history;
  const precursorScopeLabel = precursorScope === "wfmqyh" && activeWindowRealHistory
    ? activeWindowScopeLabel ?? `Current WFMQYH window (${activeWindowRealHistory.history.length} real draws)`
    : historyScopeLabel ?? "Windfall baseline history";
  const volcanicPrecursorAdvisor = useMemo(
    () => buildTemperatureVolcanicPrecursorAdvisor({
      history: precursorHistory,
      scopeLabel: precursorScopeLabel,
      selectedNumbers,
      alpha,
      buckets,
      bucketStops,
      hybridWeight,
      emaNormalize,
      enforcePeaks,
    }),
    [
      alpha,
      bucketStops,
      buckets,
      emaNormalize,
      enforcePeaks,
      hybridWeight,
      precursorHistory,
      precursorScopeLabel,
      selectedNumbers,
    ],
  );

  // Slice the history for the live model table (always honor small windows; clamp at least 1)
  const windowed = useMemo(
    () => realHistory.history.slice(-Math.max(1, Math.min(windowSize, realHistory.history.length))),
    [realHistory, windowSize]
  );

  const classifierOptions: TemperatureClassifierOptions = useMemo(
    () => ({
      alpha,
      heightNumbers: 45,
      metric,
      hybridWeight,
      emaNormalize,
      enforcePeaks,
      buckets,
      bucketStops,
      lookback: trendLookback,
      threshold: trendDelta,
      trendReversal,
    }),
    [alpha, metric, hybridWeight, emaNormalize, enforcePeaks, buckets, bucketStops, trendLookback, trendDelta, trendReversal]
  );

  const categories = useMemo(
    () => computeTemperatureCategories(windowed, classifierOptions),
    [windowed, classifierOptions]
  );

  const matrix = useMemo(
    () => buildTransitionMatrix(windowed, categories),
    [windowed, categories]
  );

  const latestTemps = useMemo(
    () => latestTempsFromCategories(categories),
    [categories]
  );

  // Build per-number probabilities
  const probs = useMemo(() => {
    const rows = Array.from({ length: 45 }, (_, i) => {
      const n = i + 1;
      const t = latestTemps[n] ?? "other";
      let p = getTransitionProbability(matrix, n, t);

      // Apply global ZPA bias if enabled
      if (zoneWeightingEnabled && savedZoneWeights) {
        const w = savedZoneWeights[n] ?? 1;
        p = p * Math.pow(w, zoneGamma);
      }

      return { n, temp: t, p };
    }).sort((a, b) => b.p - a.p || a.n - b.n);
    return rows;
  }, [matrix, latestTemps, zoneWeightingEnabled, savedZoneWeights, zoneGamma]);

  // Selection set based on mode
  const selectedSet = useMemo(() => {
    if (mode === "threshold") {
      return new Set<number>(probs.filter(r => r.p >= predThreshold).map(r => r.n));
    } else {
      const K = Math.max(1, Math.min(topK, probs.length));
      return new Set<number>(probs.slice(0, K).map(r => r.n));
    }
  }, [mode, probs, predThreshold, topK]);

  const predictions = useMemo(() => {
    return probs.map(row => ({
      ...row,
      predict: selectedSet.has(row.n),
    }));
  }, [probs, selectedSet]);

  // Backtest: honor small windows (min 3) and ensure we have a "next" draw (<= history.length - 1)
  const backtest = useMemo(() => {
    const w = Math.max(3, Math.min(windowSize, realHistory.history.length - 1));
    if (mode === "threshold") {
      return backtestTemperatureTransitionsThreshold(realHistory.history, w, predThreshold, classifierOptions);
    } else {
      return backtestTemperatureTransitionsTopK(realHistory.history, w, topK, classifierOptions);
    }
  }, [realHistory, windowSize, mode, predThreshold, topK, classifierOptions]);

  const fmtPct = (x: number) => (x * 100).toFixed(1) + "%";
  const safeDate = (idx: number) => realHistory.history[idx]?.date ?? "(unknown)";

  // Auto-fit window: sweep and suggest best diagnostic window by meanF1.
  async function onAutoWindow() {
    try {
      setAutoBusy(true);
      const sweepMode: WindowSweepMode = mode === "topk" ? "topk" : "threshold";
      const outcome = sweepWindows(
        realHistory.history,
        [3, 5, 7, 9, 12, 15, 20, 25, 30, 40, 50],
        sweepMode,
        {
          topK,
          threshold: predThreshold,
          classifierOptions,
        }
      );
      const best = outcome.bestByMetric.meanF1;
      if (best.windowSize > 0) {
        setAutoSuggestion({ window: best.windowSize, metric: "meanF1", value: best.value });
        setWindowSize(best.windowSize);
      } else {
        setAutoSuggestion(null);
      }
    } finally {
      setAutoBusy(false);
    }
  }

  const HeaderStats = () => (
    <span style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>
      Walk-forward over {realHistory.history.length} scoped draws: acc {fmtPct(backtest.meanAccuracy)}, prec {fmtPct(backtest.meanPrecision)}, rec {fmtPct(backtest.meanRecall)}, F1 {fmtPct(backtest.meanF1)}
    </span>
  );

  return (
    <section
      aria-label="Temperature Transition Diagnostics"
      style={{ border: "2px solid #3366cc", borderRadius: 8, padding: 18, margin: "24px 0", background: "#f3f7ff" }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Empirical transition evidence only; not a calibrated next-draw probability.
        </div>
        {historyScopeLabel && (
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
            Scope: {historyScopeLabel}.
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Window size:{" "}
          <input
            type="number"
            min={3}
            max={realHistory.history.length}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>

        <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#eef5ff", borderRadius: 6 }}>
          <label>
            <input
              type="radio"
              name="pred-mode"
              checked={mode === "threshold"}
              onChange={() => setMode("threshold")}
            />{" "}
            Threshold
          </label>
          <label>
            <input
              type="radio"
              name="pred-mode"
              checked={mode === "topk"}
              onChange={() => setMode("topk")}
            />{" "}
            Top-K
          </label>
        </div>

        {mode === "threshold" ? (
          <label>
            Threshold:{" "}
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={predThreshold}
              onChange={(e) => setPredThreshold(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </label>
        ) : (
          <label>
            K:{" "}
            <input
              type="number"
              min={1}
              max={45}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </label>
        )}

        {/* Label mode toggle */}
        <div style={{ display: "inline-flex", gap: 12, alignItems: "center", padding: "4px 8px", background: "#eef5ff", borderRadius: 6 }}>
          <label title="Show window indices in backtest cards">
            <input
              type="radio"
              name="label-mode"
              checked={labelMode === "indices"}
              onChange={() => setLabelMode("indices")}
            />{" "}
            Indices
          </label>
          <label title="Show actual draw dates in backtest cards">
            <input
              type="radio"
              name="label-mode"
              checked={labelMode === "dates"}
              onChange={() => setLabelMode("dates")}
            />{" "}
            Dates
          </label>
        </div>

        <label title="How many of the most recent backtest windows to display">
          Show last N windows:{" "}
          <input
            type="number"
            min={1}
            max={200}
            value={backtestShowCount}
            onChange={(e) => setBacktestShowCount(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>

        {/* Auto-fit window */}
        <button onClick={onAutoWindow} disabled={autoBusy} title="Sweep candidate window sizes with walk-forward backtest and choose the highest mean F1">
          {autoBusy ? "Auto-fitting..." : "Auto-fit window (backtest)"}
        </button>
        {autoSuggestion && (
          <span style={{ fontSize: 12, color: "#444" }}>
            Suggested: {autoSuggestion.window} (best {autoSuggestion.metric} {fmtPct(autoSuggestion.value)})
          </span>
        )}
        <span style={{ fontSize: 12, color: "#64748b" }}>
          Auto-fit changes this diagnostic shortlist only; it does not change User Selected Numbers or force candidate generation.
        </span>

        <HeaderStats />
      </div>
      {(realHistory.warnings.length > 0 || backtest.warnings.length > 0) && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#6b4a00", background: "#fff9e8", border: "1px solid #e2b84f", borderRadius: 6, padding: "7px 9px" }}>
          {[...new Set([...realHistory.warnings, ...backtest.warnings])].join(" ")}
        </div>
      )}

      <VolcanicPrecursorAdvisorCard
        advisor={volcanicPrecursorAdvisor}
        scope={precursorScope}
        setScope={setPrecursorScope}
        canUseWfmqyh={(activeWindowRealHistory?.history.length ?? 0) >= 3}
      />

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 14 }}>
        <table style={{ borderCollapse: "collapse", minWidth: 420, background: "#fff", border: "1px solid #cfd8dc" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Curr Temp</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Empirical hit rate</th>
              <th style={{ textAlign: "center", padding: "4px 8px" }}>Diagnostic shortlist</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((row) => (
              <tr key={row.n} style={{ background: row.predict ? "#e8f5e9" : "transparent" }}>
                <td style={{ padding: "4px 8px" }}><b>{row.n}</b></td>
                <td style={{ padding: "4px 8px" }}>{row.temp}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtPct(row.p)}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>{row.predict ? "✔" : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ minWidth: 360, flex: 1 }}>
          <h4 style={{ margin: "6px 0" }}>
            Backtest (last {Math.min(backtestShowCount, backtest.windows.length)} window{Math.min(backtestShowCount, backtest.windows.length) === 1 ? "" : "s"})
          </h4>
          <div style={{ fontSize: 13, color: "#444" }}>
            {backtest.windows.slice(-backtestShowCount).map((w, i) => {
              const idxLabel = `${w.windowStart + 1}–${w.windowEnd + 1} ➜ next ${w.nextIndex + 1}`;
              const dateLabel = `${safeDate(w.windowStart)}–${safeDate(w.windowEnd)} ➜ next ${safeDate(w.nextIndex)}`;
              const heading = labelMode === "dates" ? dateLabel : idxLabel;
              return (
                <div key={i} style={{ padding: "6px 8px", border: "1px solid #e0e0e0", background: "#fff", borderRadius: 6, marginBottom: 6 }}>
                  <div><b>Window</b> {heading}</div>
                  {labelMode === "dates" && <div style={{ color: "#666" }}>{idxLabel}</div>}
                  <div>acc {fmtPct(w.accuracy)}, prec {fmtPct(w.precision)}, rec {fmtPct(w.recall)}, F1 {fmtPct(w.f1)}</div>
                  <div>
                    {mode === "threshold" ? `thr ${predThreshold}` : `K ${topK}`}
                  </div>
                </div>
              );
            })}
            {backtest.windows.length === 0 && <div>No backtest windows available.</div>}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
        Mode tips: Threshold controls the cut-off empirical hit rate for adding a number to this diagnostic shortlist. Top-K adds the K highest empirical hit-rate numbers. These are descriptive evidence markers, not calibrated next-draw probabilities.
      </div>
    </section>
  );
};
