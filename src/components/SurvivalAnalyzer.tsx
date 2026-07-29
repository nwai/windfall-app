import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import {
  buildGPWFNumberWeights,
  buildHC3PenaltyWeights,
  buildSDE1PenaltyWeights,
  combinePerNumberWeights,
} from "../lib/numberBiases";
import {
  analyzeSurvival,
  calibrateSurvivalProbabilities,
  clampProbability,
  selectTopSurvivalNumbers,
  type SurvivalRow,
} from "../lib/survivalAnalysis";
import {
  analyzeMonthlyBucketTransitions,
  buildMonthlyTransitionNumberContext,
  type MonthlyTransitionNumberContext,
  type MonthlyTransitionSupport,
} from "../lib/monthlyBucketTransitions";
import { useZPASettings } from "../context/ZPASettingsContext";
import { getSavedZoneWeights, type WeightsByNumber } from "../lib/zpaStorage";

export { clampProbability };

type WindowPattern = { low: number; high: number; odd: number; even: number; sum: number };
type SortMode = "biased" | "base" | "drought" | "number";
type TrendMode = "diff" | "ratio";
type SurvivalStatsRow = { number: number; baseProb: number; biasedProb: number };

interface SurvivalAnalyzerProps {
  history: Draw[];
  excludedNumbers: number[];
  probabilityHeading?: string;
  trendWeights?: Record<number, number>;
  externalWindowSize?: number;
  historyScopeLabel?: string;
  enableSDE1Global?: boolean;
  enableHC3Global?: boolean;
  hideBiasToggles?: boolean;
  forcedNumbers?: number[];
  selectedCheckNumbers?: number[];
  focusNumber?: number | null;
  highlightColor?: string;
  onStats?: (rows: SurvivalStatsRow[]) => void;
  selectable?: boolean;
  initialSelected?: number[];
  onSelectionChange?: (nums: number[]) => void;
  patternsSelected?: WindowPattern[];
  patternSumTolerance?: number;
}

type CalibratedSurvivalRow = SurvivalRow & {
  biasWeight: number;
  rawBiasedScore: number;
  biasedProbability: number;
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe3ee",
  borderRadius: 8,
  background: "#fff",
  padding: 12,
};

const mutedStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 8px",
  borderBottom: "1px solid #d7e0ec",
  color: "#334155",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 8px",
  borderBottom: "1px solid #edf2f7",
  color: "#1f2937",
  fontSize: 13,
  verticalAlign: "middle",
};

const tdRightStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const formatPercent = (value: number, digits = 1): string => `${(clampProbability(value) * 100).toFixed(digits)}%`;
const formatNumber = (value: number, digits = 2): string => (Number.isFinite(value) ? value.toFixed(digits) : "0");
const formatSignedPercent = (value: number, digits = 1): string => {
  if (!Number.isFinite(value)) return "n/a";
  const percent = value * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(digits)}%`;
};

const uniqueValidNumbers = (values: number[] | undefined): number[] => {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values ?? []) {
    if (!Number.isInteger(value) || value < 1 || value > 45 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

function drawPattern(draw: Draw): WindowPattern {
  const all = [...draw.main, ...draw.supp].filter((number) => Number.isInteger(number) && number >= 1 && number <= 45);
  const low = all.filter((number) => number <= 22).length;
  const high = all.length - low;
  const even = all.filter((number) => number % 2 === 0).length;
  const odd = all.length - even;
  const sum = all.reduce((total, number) => total + number, 0);
  return { low, high, odd, even, sum };
}

function buildPatternBiasWeights(
  history: Draw[],
  patternsSelected: WindowPattern[],
  patternSumTolerance: number,
): Record<number, number> | undefined {
  if (patternsSelected.length === 0) return undefined;

  const patternHits = Array(45).fill(0) as number[];
  const totalHits = Array(45).fill(0) as number[];
  const tolerance = Math.max(0, Math.floor(patternSumTolerance || 0));

  for (const draw of history) {
    const pattern = drawPattern(draw);
    const isPatternMatch = patternsSelected.some((selected) => (
      selected.low === pattern.low
      && selected.high === pattern.high
      && selected.even === pattern.even
      && selected.odd === pattern.odd
      && Math.abs(selected.sum - pattern.sum) <= tolerance
    ));

    for (const number of [...draw.main, ...draw.supp]) {
      if (!Number.isInteger(number) || number < 1 || number > 45) continue;
      totalHits[number - 1] += 1;
      if (isPatternMatch) patternHits[number - 1] += 1;
    }
  }

  const weights: Record<number, number> = {};
  for (let number = 1; number <= 45; number += 1) {
    weights[number] = (patternHits[number - 1] + 1) / (totalHits[number - 1] + 1);
  }
  return weights;
}

function sameStatsRows(a: SurvivalStatsRow[] | null, b: SurvivalStatsRow[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((row, index) => {
    const next = b[index];
    return row.number === next.number
      && Math.abs(row.baseProb - next.baseProb) < 1e-12
      && Math.abs(row.biasedProb - next.biasedProb) < 1e-12;
  });
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }): JSX.Element {
  return (
    <div style={cardStyle}>
      <div style={{ ...mutedStyle, textTransform: "uppercase", letterSpacing: 0 }}>{label}</div>
      <div style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 850, marginTop: 3, color: "#111827" }}>{value}</div>
      {detail && <div style={{ ...mutedStyle, marginTop: 4 }}>{detail}</div>}
    </div>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        borderLeft: "1px solid #cbd5e1",
        background: active ? "#1d4ed8" : "#f8fafc",
        color: active ? "#fff" : "#1f2937",
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 750,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const transitionSupportCopy: Record<MonthlyTransitionSupport, { label: string; color: string; background: string; border: string }> = {
  above: { label: "Above", color: "#047857", background: "#ecfdf5", border: "#a7f3d0" },
  neutral: { label: "Neutral", color: "#475569", background: "#f8fafc", border: "#e2e8f0" },
  below: { label: "Below", color: "#b45309", background: "#fffbeb", border: "#fde68a" },
  thin: { label: "Thin", color: "#7c2d12", background: "#fff7ed", border: "#fed7aa" },
};

function TransitionSupportPill({ support }: { support: MonthlyTransitionSupport }): JSX.Element {
  const copy = transitionSupportCopy[support];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 52,
        height: 22,
        padding: "0 7px",
        borderRadius: 999,
        border: `1px solid ${copy.border}`,
        background: copy.background,
        color: copy.color,
        fontSize: 11,
        fontWeight: 850,
      }}
    >
      {copy.label}
    </span>
  );
}

function transitionContextTitle(context: MonthlyTransitionNumberContext | undefined): string {
  if (!context) return "Monthly transition context unavailable";
  return [
    `Current monthly bucket: ${context.label}`,
    `Stage movement support: ${transitionSupportCopy[context.support].label}`,
    `Smoothed movement rate: ${formatPercent(context.smoothedRate, 2)}`,
    `Stage trials: ${context.hits}/${context.trials}`,
    "Observe-only context; it does not change survival ranking.",
  ].join(" · ");
}

export const SurvivalAnalyzer: React.FC<SurvivalAnalyzerProps> = ({
  history,
  excludedNumbers,
  probabilityHeading,
  trendWeights,
  externalWindowSize,
  historyScopeLabel,
  enableSDE1Global,
  enableHC3Global,
  hideBiasToggles = true,
  forcedNumbers = [],
  selectedCheckNumbers = [],
  focusNumber = null,
  highlightColor = "#d1fae5",
  onStats,
  selectable = true,
  initialSelected,
  onSelectionChange,
  patternsSelected = [],
  patternSumTolerance = 0,
}) => {
  const [windowSize, setWindowSize] = useState<number>(externalWindowSize ?? 20);
  const [useTrendBias, setUseTrendBias] = useState<boolean>(true);
  const [useGPWF, setUseGPWF] = useState<boolean>(false);
  const [useHC3Bias, setUseHC3Bias] = useState<boolean>(true);
  const [useSDE1Bias, setUseSDE1Bias] = useState<boolean>(false);
  const [usePatternBiasInOptimizer, setUsePatternBiasInOptimizer] = useState<boolean>(true);
  const [gamma, setGamma] = useState<number>(1);
  const [useCustomTrendWindow, setUseCustomTrendWindow] = useState<boolean>(false);
  const [trendFrom, setTrendFrom] = useState<number>(6);
  const [trendTo, setTrendTo] = useState<number>(18);
  const [trendMode, setTrendMode] = useState<TrendMode>("diff");
  const [sortBy, setSortBy] = useState<SortMode>("biased");
  const [selectedNums, setSelectedNums] = useState<Set<number>>(() => new Set(initialSelected ?? []));
  const [optimizerWarning, setOptimizerWarning] = useState<string>("");
  const previousInitialKeyRef = useRef<string>("");
  const previousStatsRef = useRef<SurvivalStatsRow[] | null>(null);
  const { zoneWeightingEnabled, zoneGamma } = useZPASettings();

  useEffect(() => {
    const nextSize = externalWindowSize ?? windowSize;
    if (externalWindowSize && windowSize !== nextSize) setWindowSize(nextSize);
  }, [externalWindowSize, windowSize]);

  useEffect(() => {
    if (!initialSelected) return;
    const key = uniqueValidNumbers(initialSelected).sort((a, b) => a - b).join(",");
    if (previousInitialKeyRef.current === key) return;
    previousInitialKeyRef.current = key;
    setSelectedNums(new Set(uniqueValidNumbers(initialSelected)));
  }, [initialSelected]);

  const effectiveWindowSize = Math.max(0, Math.min(externalWindowSize ?? windowSize, history.length));
  const analysisHistory = useMemo(
    () => (effectiveWindowSize > 0 ? history.slice(-effectiveWindowSize) : []),
    [history, effectiveWindowSize],
  );
  const excluded = useMemo(() => uniqueValidNumbers(excludedNumbers), [excludedNumbers]);
  const forced = useMemo(() => uniqueValidNumbers(forcedNumbers), [forcedNumbers]);
  const analysis = useMemo(
    () => analyzeSurvival(analysisHistory, { includeSupp: true, excludedNumbers: excluded }),
    [analysisHistory, excluded],
  );
  const monthlyTransitionAnalysis = useMemo(
    () => analyzeMonthlyBucketTransitions(history, { includeSupp: true }),
    [history],
  );
  const monthlyTransitionByNumber = useMemo(
    () => buildMonthlyTransitionNumberContext(monthlyTransitionAnalysis),
    [monthlyTransitionAnalysis],
  );

  const savedZoneWeights: WeightsByNumber | null = useMemo(() => {
    try {
      return getSavedZoneWeights();
    } catch {
      return null;
    }
  }, []);

  const gpwfWeights = useMemo(() => buildGPWFNumberWeights(analysisHistory), [analysisHistory]);
  const hc3Weights = useMemo(() => buildHC3PenaltyWeights(analysisHistory), [analysisHistory]);
  const sde1Weights = useMemo(() => buildSDE1PenaltyWeights(analysisHistory), [analysisHistory]);
  const customTrendSplit = useMemo(() => {
    if (!useCustomTrendWindow || analysisHistory.length === 0) {
      return { mostRecentDraws: 0, recentSlice: 0, beforeSlice: 0 };
    }
    const mostRecentDraws = Math.max(1, Math.min(trendTo, analysisHistory.length));
    const recentSlice = Math.max(0, Math.min(trendFrom, mostRecentDraws - 1));
    return {
      mostRecentDraws,
      recentSlice,
      beforeSlice: Math.max(0, mostRecentDraws - recentSlice),
    };
  }, [analysisHistory.length, trendFrom, trendTo, useCustomTrendWindow]);
  const customTrendWeights = useMemo((): Record<number, number> | undefined => {
    if (!useCustomTrendWindow || analysisHistory.length === 0) return undefined;
    const to = customTrendSplit.mostRecentDraws;
    const from = customTrendSplit.recentSlice;
    const wider = analysisHistory.slice(-to);
    const recent = analysisHistory.slice(-from || undefined);
    const count = (draws: Draw[], number: number): number =>
      draws.reduce((total, draw) => total + (draw.main.includes(number) || draw.supp.includes(number) ? 1 : 0), 0);
    const weights: Record<number, number> = {};
    for (let number = 1; number <= 45; number += 1) {
      const widerHits = count(wider, number);
      const recentHits = count(recent, number);
      const olderHits = Math.max(0, widerHits - recentHits);
      weights[number] = trendMode === "ratio" ? (olderHits + 1) / (recentHits + 1) : Math.max(0, olderHits - recentHits + 1);
    }
    return weights;
  }, [analysisHistory, customTrendSplit.mostRecentDraws, customTrendSplit.recentSlice, trendMode, useCustomTrendWindow]);

  const patternBiasWeights = useMemo(
    () => buildPatternBiasWeights(analysisHistory, patternsSelected, patternSumTolerance),
    [analysisHistory, patternSumTolerance, patternsSelected],
  );
  const hc3Active = hideBiasToggles ? !!enableHC3Global : !!enableHC3Global || useHC3Bias;
  const sde1Active = hideBiasToggles ? !!enableSDE1Global : !!enableSDE1Global || useSDE1Bias;

  const buildBiasWeights = useCallback((includePatternBias: boolean): Record<number, number> => (
    combinePerNumberWeights(
      includePatternBias ? patternBiasWeights : undefined,
      useTrendBias ? (useCustomTrendWindow ? customTrendWeights ?? trendWeights : trendWeights) : undefined,
      useGPWF ? gpwfWeights : undefined,
      hc3Active ? hc3Weights : undefined,
      sde1Active ? sde1Weights : undefined,
    )
  ), [
    customTrendWeights,
    gpwfWeights,
    hc3Active,
    hc3Weights,
    patternBiasWeights,
    sde1Active,
    sde1Weights,
    trendWeights,
    useCustomTrendWindow,
    useGPWF,
    useTrendBias,
  ]);

  const zoneMultipliers = useMemo((): Record<number, number> | undefined => {
    if (!zoneWeightingEnabled || !savedZoneWeights) return undefined;
    const multipliers: Record<number, number> = {};
    for (let number = 1; number <= 45; number += 1) {
      const weight = savedZoneWeights[number] ?? 1;
      multipliers[number] = Math.pow(Math.max(0, Number.isFinite(weight) ? weight : 1), Math.max(0, zoneGamma));
    }
    return multipliers;
  }, [savedZoneWeights, zoneGamma, zoneWeightingEnabled]);

  const displayRows: CalibratedSurvivalRow[] = useMemo(
    () => calibrateSurvivalProbabilities(analysis.rows, {
      biasWeights: buildBiasWeights(true),
      scoreMultipliers: zoneMultipliers,
      gamma,
      expectedSelections: analysis.summary.meanValidSelections || analysis.summary.expectedSelections,
    }),
    [analysis.rows, analysis.summary.expectedSelections, analysis.summary.meanValidSelections, buildBiasWeights, gamma, zoneMultipliers],
  );

  const optimizerRows: CalibratedSurvivalRow[] = useMemo(
    () => calibrateSurvivalProbabilities(analysis.rows, {
      biasWeights: buildBiasWeights(usePatternBiasInOptimizer),
      scoreMultipliers: zoneMultipliers,
      gamma,
      expectedSelections: analysis.summary.meanValidSelections || analysis.summary.expectedSelections,
    }),
    [analysis.rows, analysis.summary.expectedSelections, analysis.summary.meanValidSelections, buildBiasWeights, gamma, usePatternBiasInOptimizer, zoneMultipliers],
  );

  const sortedRows = useMemo(() => {
    const rows = [...displayRows];
    if (sortBy === "biased") rows.sort((a, b) => b.biasedProbability - a.biasedProbability || a.number - b.number);
    else if (sortBy === "base") rows.sort((a, b) => b.baseProbability - a.baseProbability || a.number - b.number);
    else if (sortBy === "drought") rows.sort((a, b) => b.currentDrought - a.currentDrought || b.baseProbability - a.baseProbability || a.number - b.number);
    else rows.sort((a, b) => a.number - b.number);
    return rows;
  }, [displayRows, sortBy]);

  const totalBiasedProbability = displayRows.reduce((sum, row) => sum + row.biasedProbability, 0);
  const maxDrought = displayRows.reduce((max, row) => Math.max(max, row.currentDrought), 0);
  const exactEvidenceCount = displayRows.filter((row) => row.evidence === "exact").length;
  const selectedList = useMemo(() => Array.from(selectedNums).sort((a, b) => a - b), [selectedNums]);

  useEffect(() => {
    if (!onStats) return;
    const stats = displayRows.map((row) => ({
      number: row.number,
      baseProb: row.baseProbability,
      biasedProb: row.biasedProbability,
    }));
    if (sameStatsRows(previousStatsRef.current, stats)) return;
    previousStatsRef.current = stats;
    onStats(stats);
  }, [displayRows, onStats]);

  const toggleSelected = (number: number) => {
    if (!selectable) return;
    setSelectedNums((previous) => {
      const next = new Set(previous);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      onSelectionChange?.(Array.from(next).sort((a, b) => a - b));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedNums(new Set());
    setOptimizerWarning("");
    onSelectionChange?.([]);
  };

  const runOptimizer = () => {
    const result = selectTopSurvivalNumbers(optimizerRows, {
      forcedNumbers: forced,
      excludedNumbers: excluded,
      limit: 8,
    });
    setSelectedNums(new Set(result.numbers));
    setOptimizerWarning(result.warning ?? "");
    onSelectionChange?.(result.numbers);
  };

  const setPresetWindow = (from: number, to: number, mode: TrendMode) => {
    setUseTrendBias(true);
    setUseCustomTrendWindow(true);
    setTrendFrom(from);
    setTrendTo(to);
    setTrendMode(mode);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...mutedStyle, marginTop: 3 }}>
            {probabilityHeading ?? "Discrete-time drought hazard with Bayesian shrinkage and budgeted bias scores."}
          </div>
          {historyScopeLabel && (
            <div style={{ ...mutedStyle, marginTop: 3 }}>
              Scope: {historyScopeLabel}. Built-in trend bias uses this scope unless a custom trend window is enabled.
            </div>
          )}
        </div>
        <div style={{ display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
          <SegmentButton active={sortBy === "biased"} onClick={() => setSortBy("biased")}>Biased</SegmentButton>
          <SegmentButton active={sortBy === "base"} onClick={() => setSortBy("base")}>Base</SegmentButton>
          <SegmentButton active={sortBy === "drought"} onClick={() => setSortBy("drought")}>Drought</SegmentButton>
          <SegmentButton active={sortBy === "number"} onClick={() => setSortBy("number")}>Number</SegmentButton>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <Metric label="Draws" value={String(analysis.summary.draws)} detail={historyScopeLabel ? "baseline scope" : externalWindowSize ? "locked scope" : "local window"} />
        <Metric label="Mean Picks" value={formatNumber(analysis.summary.meanValidSelections, 1)} detail={`baseline ${formatPercent(analysis.summary.baselineRate, 1)}`} />
        <Metric label="Biased Budget" value={formatNumber(totalBiasedProbability, 2)} detail="sum of budgeted probabilities" />
        <Metric label="Max Drought" value={String(maxDrought)} detail={`${exactEvidenceCount}/45 exact evidence`} />
        <Metric label="Selected" value={`${selectedList.length}/8`} detail={selectedList.length ? selectedList.join(", ") : "none"} />
      </div>

      <div style={{ ...cardStyle, background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#0f172a", fontWeight: 850 }}>Monthly Transition Context</div>
            <div style={{ ...mutedStyle, marginTop: 3 }}>
              Observe-only bucket movement evidence from the Monthly Bucket Transition Lab. These columns do not change Survival Analysis scores or sorting.
            </div>
          </div>
          <div style={{ ...mutedStyle, textAlign: "right", lineHeight: 1.45 }}>
            {monthlyTransitionAnalysis.planningState ? (
              <>
                <div>
                  {monthlyTransitionAnalysis.planningState.monthLabel} · D{monthlyTransitionAnalysis.planningState.nextDrawOrdinal} of {monthlyTransitionAnalysis.planningState.expectedDrawCount}
                </div>
                <div>
                  {monthlyTransitionAnalysis.selectedMonthLength === "all" ? "All month lengths" : `${monthlyTransitionAnalysis.selectedMonthLength}d evidence`} · {monthlyTransitionAnalysis.selectedMonthCount} month{monthlyTransitionAnalysis.selectedMonthCount === 1 ? "" : "s"}
                </div>
              </>
            ) : (
              <div>No monthly transition context available.</div>
            )}
          </div>
        </div>
        {monthlyTransitionAnalysis.warnings.length > 0 && (
          <div style={{ marginTop: 6, color: "#92400e", fontSize: 12, lineHeight: 1.4 }}>
            {monthlyTransitionAnalysis.warnings.join(" ")}
          </div>
        )}
      </div>

      {analysis.caveats.length > 0 && (
        <div style={{ ...cardStyle, background: "#f8fafc" }}>
          {analysis.caveats.map((caveat) => (
            <div key={caveat} style={{ ...mutedStyle, marginBottom: 3 }}>{caveat}</div>
          ))}
        </div>
      )}

      <div style={{ ...cardStyle, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={useTrendBias} onChange={(event) => setUseTrendBias(event.target.checked)} />
          Trend
        </label>
        {!hideBiasToggles && (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={useGPWF} onChange={(event) => setUseGPWF(event.target.checked)} />
              GPWF
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={(enableHC3Global ?? false) || useHC3Bias} disabled={enableHC3Global} onChange={(event) => setUseHC3Bias(event.target.checked)} />
              HC3
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={(enableSDE1Global ?? false) || useSDE1Bias} disabled={enableSDE1Global} onChange={(event) => setUseSDE1Bias(event.target.checked)} />
              SDE1
            </label>
          </>
        )}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={usePatternBiasInOptimizer} onChange={(event) => setUsePatternBiasInOptimizer(event.target.checked)} />
          Optimizer pattern bias
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Gamma
          <input
            type="number"
            min={0}
            max={8}
            step={0.1}
            value={gamma}
            onChange={(event) => setGamma(Math.max(0, Math.min(8, Number(event.target.value) || 0)))}
            style={{ width: 64 }}
          />
        </label>
        {!externalWindowSize && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Draws
            <input
              type="number"
              min={2}
              max={history.length}
              value={windowSize}
              onChange={(event) => setWindowSize(Math.max(2, Math.min(history.length, Number(event.target.value) || 2)))}
              style={{ width: 76 }}
            />
          </label>
        )}
        <button type="button" onClick={runOptimizer} style={{ padding: "7px 11px", border: "1px solid #1d4ed8", borderRadius: 6, background: "#1d4ed8", color: "#fff", fontWeight: 800 }}>
          Optimize 8
        </button>
        <button type="button" onClick={clearSelection} disabled={selectedNums.size === 0} style={{ padding: "7px 11px", border: "1px solid #cbd5e1", borderRadius: 6, background: selectedNums.size ? "#fff" : "#f1f5f9", color: "#1f2937", fontWeight: 700 }}>
          Clear
        </button>
      </div>

      <details style={cardStyle}>
        <summary style={{ cursor: "pointer", fontWeight: 800, color: "#172033" }}>Custom Trend Split</summary>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={useCustomTrendWindow} onChange={(event) => setUseCustomTrendWindow(event.target.checked)} />
            Use this trend split
          </label>
          <label>Recent slice <input type="number" min={1} max={history.length} value={trendFrom} onChange={(event) => setTrendFrom(Math.max(1, Number(event.target.value) || 1))} style={{ width: 66, marginLeft: 4 }} /></label>
          <label>Most recent draws <input type="number" min={2} max={history.length} value={trendTo} onChange={(event) => setTrendTo(Math.max(2, Number(event.target.value) || 2))} style={{ width: 66, marginLeft: 4 }} /></label>
          <select value={trendMode} onChange={(event) => setTrendMode(event.target.value as TrendMode)}>
            <option value="diff">Diff</option>
            <option value="ratio">Ratio</option>
          </select>
          <button type="button" onClick={() => setPresetWindow(3, 11, "diff")}>3 to 11</button>
          <button type="button" onClick={() => setPresetWindow(6, 18, "ratio")}>6 to 18</button>
        </div>
        <div style={{ ...mutedStyle, marginTop: 8, lineHeight: 1.45 }}>
          Use the most recent {customTrendSplit.mostRecentDraws} draws, compare the latest {customTrendSplit.recentSlice} against the {customTrendSplit.beforeSlice} before them.
        </div>
      </details>

      {optimizerWarning && <div style={{ ...cardStyle, borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412", fontSize: 13 }}>{optimizerWarning}</div>}

      {analysis.summary.draws < 2 ? (
        <div style={{ ...cardStyle, color: "#991b1b" }}>At least two valid draws are required for survival analysis.</div>
      ) : (
        <div style={{ ...cardStyle, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
            <thead>
              <tr>
                <th style={thStyle}>Rank</th>
                <th style={thStyle}>No.</th>
                <th style={thStyle}>Base hit</th>
                <th style={thStyle}>95% interval</th>
                <th style={thStyle}>Biased hit</th>
                <th style={thStyle}>Month bucket</th>
                <th style={thStyle}>Stage move</th>
                <th style={thStyle}>Move support</th>
                <th style={thStyle}>Drought</th>
                <th style={thStyle}>Evidence</th>
                <th style={thStyle}>Bias weight</th>
                <th style={thStyle}>Raw score</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => {
                const selected = selectedNums.has(row.number);
                const focused = row.number === focusNumber;
                const background = focused ? "#fef9c3" : selected ? highlightColor : undefined;
                const transitionContext = monthlyTransitionByNumber.get(row.number);
                return (
                  <tr
                    key={row.number}
                    onClick={() => toggleSelected(row.number)}
                    style={{ background, cursor: selectable ? "pointer" : "default" }}
                    title={selectable ? "Click to toggle this number in the selected set" : undefined}
                  >
                    <td style={tdRightStyle}>{index + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 850 }}>{row.number}</td>
                    <td style={tdRightStyle}>{formatPercent(row.baseProbability, 2)}</td>
                    <td style={tdRightStyle}>{formatPercent(row.credibleInterval95[0], 1)}-{formatPercent(row.credibleInterval95[1], 1)}</td>
                    <td style={{ ...tdRightStyle, fontWeight: 850, color: "#047857" }}>{formatPercent(row.biasedProbability, 2)}</td>
                    <td style={tdStyle} title={transitionContextTitle(transitionContext)}>
                      {transitionContext ? transitionContext.label : "n/a"}
                    </td>
                    <td style={tdRightStyle} title={transitionContextTitle(transitionContext)}>
                      {transitionContext
                        ? `${formatPercent(transitionContext.smoothedRate, 1)} (${transitionContext.hits}/${transitionContext.trials})`
                        : "n/a"}
                    </td>
                    <td style={tdRightStyle} title={transitionContextTitle(transitionContext)}>
                      {transitionContext ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <span>{formatSignedPercent(transitionContext.rateLift, 1)}</span>
                          <TransitionSupportPill support={transitionContext.support} />
                        </span>
                      ) : "n/a"}
                    </td>
                    <td style={tdRightStyle}>{row.lastSeenDrawsAgo === null ? "never" : row.currentDrought}</td>
                    <td style={tdRightStyle}>{row.evidence} ({formatNumber(row.exactHits, 0)}/{formatNumber(row.exactExposure, 0)})</td>
                    <td style={tdRightStyle}>{formatNumber(row.biasWeight, 3)}</td>
                    <td style={tdRightStyle}>{formatNumber(row.rawBiasedScore, 4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ ...mutedStyle, marginTop: 8 }}>
            Base hit is the posterior mean of the current drought hazard. Biased hit is budgeted so all displayed number probabilities sum to the observed draw size instead of being falsely clamped.
            Monthly transition columns are observe-only context from bucket movement history; they do not change the survival ranking.
          </div>
        </div>
      )}

      <details style={cardStyle}>
        <summary style={{ cursor: "pointer", fontWeight: 800, color: "#172033" }}>Data Quality</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
          <Metric label="Rows Read" value={String(analysis.quality.drawsRead)} />
          <Metric label="Sim Ignored" value={String(analysis.quality.simulatedDrawsIgnored)} />
          <Metric label="Invalid Entries" value={String(analysis.quality.invalidNumberEntries)} detail={`${analysis.quality.drawsWithInvalidNumbers} rows`} />
          <Metric label="Duplicate Entries" value={String(analysis.quality.duplicateNumberEntries)} detail={`${analysis.quality.drawsWithDuplicateNumbers} rows`} />
          <Metric label="Short Rows" value={String(analysis.quality.drawsWithShortSelection)} />
          <Metric label="Long Rows" value={String(analysis.quality.drawsWithLongSelection)} />
        </div>
      </details>

      <div style={{ ...mutedStyle }}>
        Excluded: {excluded.length ? excluded.join(", ") : "none"} | Forced: {forced.length ? forced.join(", ") : "none"} | External selected: {selectedCheckNumbers.length ? selectedCheckNumbers.join(", ") : "none"}
      </div>
    </section>
  );
};

export default SurvivalAnalyzer;
