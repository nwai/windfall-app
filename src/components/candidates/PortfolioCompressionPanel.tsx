import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw, KeptGeneratedCandidateRow } from "../../types";
import {
  buildPortfolioAdjacentComboEvidence,
  type PortfolioAdjacentComboEvidence,
  type PortfolioComboCohesionStatus,
  type PortfolioComboSwapDirection,
} from "../../lib/portfolioAdjacentCombos";
import type { MonthlyBucketSets } from "../../lib/monthlyDrawSummary";
import {
  buildPortfolioMonthlyBucketEvidence,
  type PortfolioMonthlyBucketEvidence,
} from "../../lib/portfolioMonthlyBuckets";
import {
  runPortfolioCompressionBacktest,
  type PortfolioBacktestResult,
  type PortfolioStrategySummary,
} from "../../lib/portfolioBacktest";
import {
  compressPortfolioCandidates,
  type PortfolioCompressionNumber,
} from "../../lib/portfolioCompression";
import type {
  PortfolioWindowShapeEvidenceRow,
  PortfolioWindowShapeStatus,
} from "../../lib/portfolioWindowShape";
import { normalizeUserSelectedNumbers } from "../../lib/userSelectedNumbers";

export interface PortfolioCandidateSource {
  id: string;
  label: string;
  candidates: readonly (readonly number[])[];
}

interface PortfolioCompressionPanelProps {
  initialPasteText?: string;
  candidateSources?: PortfolioCandidateSource[];
  keptGeneratedRows?: readonly KeptGeneratedCandidateRow[];
  userSelectedNumbers?: readonly unknown[];
  monthEndCarryOverBiasEnabled?: boolean;
  monthEndCarryOverWeights?: Record<number, number> | undefined;
  hotColdRows?: readonly PortfolioHotColdEvidenceRow[];
  windowShapeRows?: readonly PortfolioWindowShapeEvidenceDisplayRow[];
  adjacentComboHistory?: readonly Draw[];
  monthlyBuckets?: MonthlyBucketSets | null;
  backtestHistory?: readonly Draw[];
  initialBacktestMinTrainingDraws?: number;
  initialBacktestMonteCarloIterations?: number;
  onSimulateCore?: (numbers: number[]) => void;
  activeSimulatedKey?: string | null;
  copyText?: (text: string) => void | Promise<void>;
}

interface LoadedSourceRow {
  sourceId: string;
  sourceLabel: string;
  rowText: string;
}

type EvidenceSignalKey =
  | "generatedFrequency"
  | "pasteWeightedFrequency"
  | "adjacentCombos"
  | "hotCold"
  | "windowShape"
  | "monthlyBuckets"
  | "carryOverBias"
  | "selectedBoosts";

interface EvidenceSignalDefinition {
  key: EvidenceSignalKey | "countCompression" | "backtestCalibration";
  name: string;
  evidenceType: string;
  defaultState: "always" | "off" | "disabled";
  explanation: string;
}

interface SourceFrequencySummary {
  totalRows: number;
  countsByNumber: Map<number, number>;
}

type PortfolioHotColdStatus = "hot" | "warm" | "neutral" | "cool" | "cold";

export interface PortfolioHotColdEvidenceRow {
  number: number;
  status: PortfolioHotColdStatus;
  hotScore: number;
  hotRank: number;
  recentRank: number;
  recentCount: number;
  weightedRank: number;
}

type PortfolioWindowShapeEvidenceDisplayRow = Pick<
  PortfolioWindowShapeEvidenceRow,
  "number" | "status" | "fitScore" | "bandLabel" | "parityLabel" | "meanLabel"
> & Partial<PortfolioWindowShapeEvidenceRow>;

interface EvidenceColumnDefinition {
  key: EvidenceSignalKey;
  heading: string;
  valueForNumber: (number: number) => React.ReactNode;
}

const headingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const mutedStyle: React.CSSProperties = {
  color: "#586174",
  fontSize: 12,
  lineHeight: 1.45,
};

const portfolioPasteAreaMinHeight = 150;

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: portfolioPasteAreaMinHeight,
  resize: "vertical",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: 10,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.45,
  boxSizing: "border-box",
};

const loadedSourceRowsScrollStyle: React.CSSProperties = {
  maxHeight: portfolioPasteAreaMinHeight,
  overflowX: "auto",
  overflowY: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#ffffff",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #dbe3ef",
  padding: "6px 8px",
  color: "#475569",
  background: "#f8fafc",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  padding: "6px 8px",
  verticalAlign: "top",
};

const coreChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 32,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
};

const hotColdBadgeStyles: Record<PortfolioHotColdStatus, {
  label: string;
  background: string;
  color: string;
  border: string;
}> = {
  hot: { label: "Hot", background: "#fee2e2", color: "#991b1b", border: "#fecaca" },
  warm: { label: "Warm", background: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  neutral: { label: "Neutral", background: "#f8fafc", color: "#334155", border: "#cbd5e1" },
  cool: { label: "Cool", background: "#e0f2fe", color: "#075985", border: "#bae6fd" },
  cold: { label: "Cold", background: "#dbeafe", color: "#1e3a8a", border: "#bfdbfe" },
};

const windowShapeBadgeStyles: Record<PortfolioWindowShapeStatus, {
  label: string;
  background: string;
  color: string;
  border: string;
}> = {
  fit: { label: "Fit", background: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  mixed: { label: "Mixed", background: "#fef9c3", color: "#854d0e", border: "#fde68a" },
  against: { label: "Against", background: "#fee2e2", color: "#991b1b", border: "#fecaca" },
};

const comboCohesionBadgeStyles: Record<PortfolioComboCohesionStatus, {
  label: string;
  background: string;
  color: string;
  border: string;
}> = {
  strong: { label: "Strong", background: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  mixed: { label: "Mixed", background: "#fef9c3", color: "#854d0e", border: "#fde68a" },
  thin: { label: "Thin", background: "#fee2e2", color: "#991b1b", border: "#fecaca" },
};

const comboSwapBadgeStyles: Record<PortfolioComboSwapDirection, {
  label: string;
  background: string;
  color: string;
  border: string;
}> = {
  improve: { label: "Improve", background: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  neutral: { label: "Neutral", background: "#f8fafc", color: "#334155", border: "#cbd5e1" },
  weaker: { label: "Weaker", background: "#fee2e2", color: "#991b1b", border: "#fecaca" },
};

const monthlyBucketBadgeStyles: Record<number, {
  background: string;
  color: string;
  border: string;
}> = {
  0: { background: "#f8fafc", color: "#334155", border: "#cbd5e1" },
  1: { background: "#e0f2fe", color: "#075985", border: "#bae6fd" },
  2: { background: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  3: { background: "#fef9c3", color: "#854d0e", border: "#fde68a" },
  4: { background: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  5: { background: "#fee2e2", color: "#991b1b", border: "#fecaca" },
  6: { background: "#fce7f3", color: "#9d174d", border: "#fbcfe8" },
  7: { background: "#ede9fe", color: "#5b21b6", border: "#ddd6fe" },
  8: { background: "#e0e7ff", color: "#3730a3", border: "#c7d2fe" },
};

const roleLabel = (row: PortfolioCompressionNumber): string => {
  if (row.role === "core") return "Core";
  if (row.role === "alternate") return "Alternate";
  return "Watch";
};

const formatCandidateRow = (numbers: readonly number[]): string => (
  Array.from(new Set(numbers
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 45)))
    .sort((left, right) => left - right)
    .join(",")
);

const rowsForSource = (source: PortfolioCandidateSource): string[] => (
  source.candidates
    .map(formatCandidateRow)
    .filter((row) => row.length > 0)
);

const appendTextRows = (current: string, rows: readonly string[]): string => {
  const existing = current.trim();
  return [existing, ...rows].filter(Boolean).join("\n");
};

const formatKeptPortfolioRow = (row: KeptGeneratedCandidateRow): string => (
  formatCandidateRow([...row.main, ...row.supp])
);

const buildSourceFrequencySummary = (rows: readonly string[]): SourceFrequencySummary => {
  const countsByNumber = new Map<number, number>();

  for (const row of rows) {
    for (const token of row.split(",")) {
      const number = Number(token);
      if (!Number.isInteger(number) || number < 1 || number > 45) continue;
      countsByNumber.set(number, (countsByNumber.get(number) ?? 0) + 1);
    }
  }

  return {
    totalRows: rows.length,
    countsByNumber,
  };
};

const evidenceSignalDefinitions: EvidenceSignalDefinition[] = [
  {
    key: "countCompression",
    name: "Count compression",
    evidenceType: "Observed",
    defaultState: "always",
    explanation: "Direct count of how many portfolio rows contain each number.",
  },
  {
    key: "generatedFrequency",
    name: "Generated frequency",
    evidenceType: "Heuristic",
    defaultState: "off",
    explanation: "Repeated numbers from generated candidate rows, including supps when the source provides them.",
  },
  {
    key: "pasteWeightedFrequency",
    name: "Paste-weighted frequency",
    evidenceType: "Heuristic",
    defaultState: "off",
    explanation: "Repeated numbers from paste-weighted generated rows, usually mains only.",
  },
  {
    key: "adjacentCombos",
    name: "Adjacent combos (mains)",
    evidenceType: "Descriptive",
    defaultState: "off",
    explanation: "Core pair/triple cohesion and alternate swap compatibility, mains only.",
  },
  {
    key: "hotCold",
    name: "Hot/cold (mains + supps)",
    evidenceType: "Descriptive",
    defaultState: "off",
    explanation: "Recent draw behaviour, mains + supps; descriptive, not a direct prediction.",
  },
  {
    key: "windowShape",
    name: "Window shape (mains)",
    evidenceType: "Descriptive",
    defaultState: "off",
    explanation: "Recent low/mid/high, odd/even, and sum profile, mains only.",
  },
  {
    key: "monthlyBuckets",
    name: "Monthly buckets",
    evidenceType: "Contextual",
    defaultState: "off",
    explanation: "Current month draw-count bucket context.",
  },
  {
    key: "carryOverBias",
    name: "Carry-over bias",
    evidenceType: "Heuristic",
    defaultState: "off",
    explanation: "Tunable month-end carry-over signal.",
  },
  {
    key: "selectedBoosts",
    name: "Selected boosts",
    evidenceType: "User prior",
    defaultState: "off",
    explanation: "Your preference signal; not statistical evidence.",
  },
  {
    key: "backtestCalibration",
    name: "Structural backtest calibration",
    evidenceType: "Validation",
    defaultState: "always",
    explanation: "Run below; validates a separate historical structural-state strategy against simple frequency and random controls.",
  },
];

const writeTextToClipboard = async (
  text: string,
  customCopyText?: (value: string) => void | Promise<void>,
): Promise<void> => {
  if (customCopyText) {
    await customCopyText(text);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard is not available in this browser.");
};

const formatDecimal = (value: number | null | undefined, digits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "-∞";
  return value.toFixed(digits);
};

const formatPercent = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "-∞";
  return `${(value * 100).toFixed(digits)}%`;
};

const strategyMonteCarloPValue = (
  result: PortfolioBacktestResult,
  strategyKey: "compressed" | "simpleFrequency" | "random",
): number => {
  if (strategyKey === "compressed") return result.monteCarlo.compressedPValue;
  if (strategyKey === "simpleFrequency") return result.monteCarlo.simpleFrequencyPValue;
  return result.monteCarlo.randomStrategyPValue;
};

const linePoints = (
  values: readonly number[],
  minValue: number,
  maxValue: number,
  width: number,
  height: number,
): string => {
  const span = Math.max(maxValue - minValue, 1);
  return values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - minValue) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

const PortfolioBacktestChart: React.FC<{
  title: string;
  series: Array<{ label: string; values: readonly number[]; color: string }>;
  percent?: boolean;
}> = ({ title, series, percent = false }) => {
  const width = 560;
  const height = 150;
  const allValues = series.flatMap((entry) => Array.from(entry.values));
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 800, fontSize: 12 }}>{title}</div>
      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: "100%",
          height: 160,
          border: "1px solid #dbe3ef",
          borderRadius: 6,
          background: "#fff",
        }}
      >
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="#e2e8f0" strokeWidth="1" />
        <line x1="0" y1="1" x2={width} y2="1" stroke="#e2e8f0" strokeWidth="1" />
        {series.map((entry) => (
          <polyline
            key={entry.label}
            points={linePoints(entry.values, minValue, maxValue, width, height)}
            fill="none"
            stroke={entry.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", ...mutedStyle }}>
        {series.map((entry) => (
          <span key={entry.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 3, background: entry.color, display: "inline-block" }} />
            {entry.label}
          </span>
        ))}
        <span>
          Range {percent ? formatPercent(minValue) : formatDecimal(minValue, 0)} to {percent ? formatPercent(maxValue) : formatDecimal(maxValue, 0)}
        </span>
      </div>
    </div>
  );
};

export const PortfolioCompressionPanel: React.FC<PortfolioCompressionPanelProps> = ({
  initialPasteText = "",
  candidateSources = [],
  keptGeneratedRows = [],
  userSelectedNumbers = [],
  monthEndCarryOverBiasEnabled = false,
  monthEndCarryOverWeights,
  hotColdRows = [],
  windowShapeRows = [],
  adjacentComboHistory = [],
  monthlyBuckets = null,
  backtestHistory = [],
  initialBacktestMinTrainingDraws = 24,
  initialBacktestMonteCarloIterations = 10_000,
  onSimulateCore,
  activeSimulatedKey = null,
  copyText,
}) => {
  const consumedKeptRowIdsRef = useRef<Set<string>>(new Set());
  const [pasteText, setPasteText] = useState(initialPasteText);
  const [loadedSourceSignatures, setLoadedSourceSignatures] = useState<string[]>([]);
  const [loadedSourceRows, setLoadedSourceRows] = useState<LoadedSourceRow[]>([]);
  const [loadMessage, setLoadMessage] = useState<string>("");
  const [copyMessage, setCopyMessage] = useState<string>("");
  const [backtestMinTrainingDraws, setBacktestMinTrainingDraws] = useState(initialBacktestMinTrainingDraws);
  const [backtestMonteCarloIterations, setBacktestMonteCarloIterations] = useState(initialBacktestMonteCarloIterations);
  const [backtestResult, setBacktestResult] = useState<PortfolioBacktestResult | null>(null);
  const [enabledEvidenceSignals, setEnabledEvidenceSignals] = useState<Record<EvidenceSignalKey, boolean>>({
    generatedFrequency: false,
    pasteWeightedFrequency: false,
    adjacentCombos: false,
    hotCold: false,
    windowShape: false,
    monthlyBuckets: false,
    carryOverBias: false,
    selectedBoosts: false,
  });
  const result = useMemo(() => compressPortfolioCandidates(pasteText), [pasteText]);
  const adjacentComboEvidence = useMemo(
    () => buildPortfolioAdjacentComboEvidence(
      adjacentComboHistory,
      result.coreNumbers,
      result.alternates.map((row) => row.number),
      { includeSupp: false },
    ),
    [adjacentComboHistory, result],
  );
  const monthlyBucketEvidence = useMemo(
    () => buildPortfolioMonthlyBucketEvidence(
      monthlyBuckets,
      result.coreNumbers,
      result.alternates.map((row) => row.number),
    ),
    [monthlyBuckets, result],
  );
  const maxGameCount = result.rankedNumbers[0]?.gameCount ?? 0;
  const rankedRows = result.rankedNumbers.slice(0, 24);
  const loadableSources = useMemo(() => (
    candidateSources
      .map((source) => {
        const rows = rowsForSource(source);
        return {
          ...source,
          rows,
          signature: `${source.id}:${rows.join("|")}`,
        };
      })
      .filter((source) => source.rows.length > 0)
  ), [candidateSources]);
  const sourceFrequencyById = useMemo(() => {
    const summaries = new Map<string, SourceFrequencySummary>();
    for (const source of loadableSources) {
      summaries.set(source.id, buildSourceFrequencySummary(source.rows));
    }
    return summaries;
  }, [loadableSources]);
  const selectedNumberSet = useMemo(
    () => new Set(normalizeUserSelectedNumbers(userSelectedNumbers)),
    [userSelectedNumbers],
  );
  const hotColdEvidenceByNumber = useMemo(() => {
    const rows = new Map<number, PortfolioHotColdEvidenceRow>();
    for (const row of hotColdRows) {
      if (!Number.isInteger(row.number) || row.number < 1 || row.number > 45) continue;
      rows.set(row.number, row);
    }
    return rows;
  }, [hotColdRows]);
  const windowShapeEvidenceByNumber = useMemo(() => {
    const rows = new Map<number, PortfolioWindowShapeEvidenceDisplayRow>();
    for (const row of windowShapeRows) {
      if (!Number.isInteger(row.number) || row.number < 1 || row.number > 45) continue;
      rows.set(row.number, row);
    }
    return rows;
  }, [windowShapeRows]);
  const availableSourceRows = loadableSources.reduce((total, source) => total + source.rows.length, 0);
  const backtestHistoryCount = backtestHistory.length;
  const activeOptionalSignalCount = Object.values(enabledEvidenceSignals).filter(Boolean).length;
  const activeSignalLabel = `${activeOptionalSignalCount} optional signal${activeOptionalSignalCount === 1 ? "" : "s"} active`;

  useEffect(() => {
    const newRows = keptGeneratedRows
      .filter((row) => !consumedKeptRowIdsRef.current.has(row.id))
      .map((row) => ({
        sourceId: row.id,
        sourceLabel: `Kept Generated #${row.sourceIndex + 1}`,
        rowText: formatKeptPortfolioRow(row),
      }))
      .filter((row) => row.rowText.length > 0);

    if (newRows.length === 0) return;

    newRows.forEach((row) => consumedKeptRowIdsRef.current.add(row.sourceId));
    setPasteText((current) => appendTextRows(current, newRows.map((row) => row.rowText)));
    setLoadedSourceRows((current) => [...current, ...newRows]);
    setLoadMessage(`${newRows.length} kept generated candidate row${newRows.length === 1 ? "" : "s"} added.`);
    setCopyMessage("");
    setBacktestResult(null);
  }, [keptGeneratedRows]);

  const sourceFrequencyLabel = (sourceId: string, number: number): string => {
    const summary = sourceFrequencyById.get(sourceId);
    if (!summary || summary.totalRows === 0) return "No source";
    const count = summary.countsByNumber.get(number) ?? 0;
    return `${count}/${summary.totalRows}`;
  };

  const carryOverEvidenceLabel = (number: number): string => {
    if (!monthEndCarryOverBiasEnabled) return "Bias off";
    const rawFactor = Number(monthEndCarryOverWeights?.[number]);
    const factor = Number.isFinite(rawFactor) ? rawFactor : 1;
    const direction = factor > 1 + 1e-9
      ? "Boost"
      : factor < 1 - 1e-9
        ? "Penalty"
        : "Neutral";
    const formattedFactor = factor >= 100 ? factor.toFixed(0) : factor.toFixed(2);
    return `${direction} ×${formattedFactor}`;
  };

  const hotColdEvidenceLabel = (number: number): React.ReactNode => {
    const row = hotColdEvidenceByNumber.get(number);
    if (!row) return "No evidence";
    const statusStyle = hotColdBadgeStyles[row.status] ?? hotColdBadgeStyles.neutral;
    return (
      <span
        data-temperature-status={row.status}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
          padding: "2px 7px",
          borderRadius: 6,
          border: `1px solid ${statusStyle.border}`,
          background: statusStyle.background,
          color: statusStyle.color,
          fontSize: 11,
          fontWeight: 800,
        }}
        title={`Recent count ${row.recentCount}; hot score ${row.hotScore.toFixed(2)}; recent rank ${row.recentRank}; weighted rank ${row.weightedRank}.`}
      >
        {statusStyle.label} #{row.hotRank} · R{row.recentRank} · W{row.weightedRank}
      </span>
    );
  };

  const windowShapeEvidenceLabel = (number: number): React.ReactNode => {
    const row = windowShapeEvidenceByNumber.get(number);
    if (!row) return "No evidence";
    const statusStyle = windowShapeBadgeStyles[row.status] ?? windowShapeBadgeStyles.mixed;
    return (
      <span
        data-window-shape-status={row.status}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
          padding: "2px 7px",
          borderRadius: 6,
          border: `1px solid ${statusStyle.border}`,
          background: statusStyle.background,
          color: statusStyle.color,
          fontSize: 11,
          fontWeight: 800,
        }}
        title={[
          `Fit score ${row.fitScore}`,
          row.band ? `${row.band} band` : "",
          row.parity ? `${row.parity} parity` : "",
        ].filter(Boolean).join("; ")}
      >
        {statusStyle.label} {row.fitScore} · {row.bandLabel} · {row.parityLabel} · {row.meanLabel}
      </span>
    );
  };

  const signedDelta = (value: number): string => (
    `${value > 0 ? "+" : ""}${value}`
  );

  const renderAdjacentComboEvidence = (
    evidence: PortfolioAdjacentComboEvidence,
  ): React.ReactNode => {
    if (!evidence.available || !evidence.summary) {
      return (
        <div style={{
          ...mutedStyle,
          color: "#92400e",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 6,
          padding: 8,
        }}>
          {evidence.reason ?? "Adjacent combo evidence is not available."}
        </div>
      );
    }

    const summary = evidence.summary;
    const statusStyle = comboCohesionBadgeStyles[summary.status];
    const topPairText = summary.topPairs.length > 0
      ? summary.topPairs.map((combo) => `${combo.key} x${combo.count}`).join(", ")
      : "No supported core pairs";
    const topTripleText = summary.topTriples.length > 0
      ? summary.topTriples.map((combo) => `${combo.key} x${combo.count}`).join(", ")
      : "No supported core triples";
    const weakPairText = summary.weakPairs.length > 0
      ? summary.weakPairs.slice(0, 8).join(", ")
      : "None";

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={mutedStyle}>
          Observe-only: combo cohesion does not change the top-six core.
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 8,
        }}>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Core combo cohesion</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                data-adjacent-combo-status={summary.status}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 7px",
                  borderRadius: 6,
                  border: `1px solid ${statusStyle.border}`,
                  background: statusStyle.background,
                  color: statusStyle.color,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {statusStyle.label}
              </span>
              <span style={{ fontWeight: 800 }}>{summary.score}/100</span>
            </div>
          </div>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Pair support</div>
            <div style={{ fontWeight: 800 }}>Pairs {summary.supportedPairs}/{summary.totalPairs}</div>
          </div>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Triple support</div>
            <div style={{ fontWeight: 800 }}>Triples {summary.supportedTriples}/{summary.totalTriples}</div>
          </div>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Unseen pair risk</div>
            <div style={{ fontWeight: 800, color: summary.weakPairCount > 0 ? "#92400e" : "#166534" }}>
              Weak pairs {summary.weakPairCount}
            </div>
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
        }}>
          <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
            <div style={{ fontWeight: 800, color: "#334155", marginBottom: 4 }}>Top supported pairs</div>
            {topPairText}
          </div>
          <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
            <div style={{ fontWeight: 800, color: "#334155", marginBottom: 4 }}>Top supported triples</div>
            {topTripleText}
          </div>
          <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
            <div style={{ fontWeight: 800, color: "#334155", marginBottom: 4 }}>Weak / unseen pairs</div>
            {weakPairText}
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Alternate swap diagnostics</div>
          {evidence.bestSwaps.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Swap</th>
                    <th style={thStyle}>Direction</th>
                    <th style={thStyle}>Score delta</th>
                    <th style={thStyle}>Pair delta</th>
                    <th style={thStyle}>Triple delta</th>
                    <th style={thStyle}>Candidate</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.bestSwaps.slice(0, 8).map((swap) => {
                    const swapStyle = comboSwapBadgeStyles[swap.direction];
                    return (
                      <tr key={`${swap.alternateNumber}-${swap.removedNumber}`}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>
                          {swap.alternateNumber} for {swap.removedNumber}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 7px",
                            borderRadius: 6,
                            border: `1px solid ${swapStyle.border}`,
                            background: swapStyle.background,
                            color: swapStyle.color,
                            fontSize: 11,
                            fontWeight: 800,
                          }}>
                            {swapStyle.label}
                          </span>
                        </td>
                        <td style={tdStyle}>{signedDelta(swap.scoreDelta)}</td>
                        <td style={tdStyle}>{signedDelta(swap.pairDelta)}</td>
                        <td style={tdStyle}>{signedDelta(swap.tripleDelta)}</td>
                        <td style={{ ...tdStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
                          {swap.candidateNumbers.join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={mutedStyle}>No alternates are available to test against the core.</div>
          )}
        </div>
      </div>
    );
  };

  const monthlyBucketEvidenceLabel = (number: number): React.ReactNode => {
    if (!monthlyBucketEvidence.available) return "No data";
    const row = monthlyBucketEvidence.numbersByNumber.get(number);
    if (!row || row.times === null) return "No bucket";
    const style = monthlyBucketBadgeStyles[row.times] ?? monthlyBucketBadgeStyles[8];
    return (
      <span
        data-monthly-bucket-times={row.times}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
          padding: "2px 7px",
          borderRadius: 6,
          border: `1px solid ${style.border}`,
          background: style.background,
          color: style.color,
          fontSize: 11,
          fontWeight: 800,
        }}
        title={`Number ${number} is currently in the ${row.label} monthly bucket. Bucket size: ${row.bucketSize}.`}
      >
        {row.label} · {row.bucketSize} nums
      </span>
    );
  };

  const bucketMixText = (counts: NonNullable<PortfolioMonthlyBucketEvidence["summary"]>["coreBucketCounts"]): string => (
    counts.length > 0
      ? counts.map((entry) => `${entry.label} ${entry.count}`).join(" · ")
      : "No known bucket memberships"
  );

  const renderMonthlyBucketEvidence = (
    evidence: PortfolioMonthlyBucketEvidence,
  ): React.ReactNode => {
    if (!evidence.available || !evidence.summary) {
      return (
        <div style={{
          ...mutedStyle,
          color: "#92400e",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 6,
          padding: 8,
        }}>
          {evidence.reason ?? "No monthly bucket data is connected."}
        </div>
      );
    }

    const summary = evidence.summary;
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={mutedStyle}>
          Observe-only: monthly bucket composition does not change the top-six core.
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
        }}>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Core mix</div>
            <div style={{ fontWeight: 800 }}>{bucketMixText(summary.coreBucketCounts)}</div>
          </div>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Alternate mix</div>
            <div style={{ fontWeight: 800 }}>{bucketMixText(summary.alternateBucketCounts)}</div>
          </div>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Known monthly snapshot</div>
            <div style={{ fontWeight: 800 }}>{summary.totalKnownNumbers} numbers</div>
          </div>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>Unknown core bucket</div>
            <div style={{ fontWeight: 800, color: summary.unknownCoreCount > 0 ? "#92400e" : "#166534" }}>
              {summary.unknownCoreCount}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const activeEvidenceColumns: EvidenceColumnDefinition[] = [
    enabledEvidenceSignals.generatedFrequency
      ? {
        key: "generatedFrequency",
        heading: "Generated freq",
        valueForNumber: (number: number) => sourceFrequencyLabel("generated-candidates", number),
      }
      : null,
    enabledEvidenceSignals.pasteWeightedFrequency
      ? {
        key: "pasteWeightedFrequency",
        heading: "Paste-weighted freq",
        valueForNumber: (number: number) => sourceFrequencyLabel("paste-weighted-candidates", number),
      }
      : null,
    enabledEvidenceSignals.hotCold
      ? {
        key: "hotCold",
        heading: "Hot/cold (M+S)",
        valueForNumber: hotColdEvidenceLabel,
      }
      : null,
    enabledEvidenceSignals.windowShape
      ? {
        key: "windowShape",
        heading: "Window shape (mains)",
        valueForNumber: windowShapeEvidenceLabel,
      }
      : null,
    enabledEvidenceSignals.monthlyBuckets
      ? {
        key: "monthlyBuckets",
        heading: "Monthly bucket",
        valueForNumber: monthlyBucketEvidenceLabel,
      }
      : null,
    enabledEvidenceSignals.carryOverBias
      ? {
        key: "carryOverBias",
        heading: "Carry-over",
        valueForNumber: carryOverEvidenceLabel,
      }
      : null,
    enabledEvidenceSignals.selectedBoosts
      ? {
        key: "selectedBoosts",
        heading: "Selected boost",
        valueForNumber: (number: number) => (
          selectedNumberSet.size === 0
            ? "No selections"
            : selectedNumberSet.has(number)
              ? "Selected"
              : "Not selected"
        ),
      }
      : null,
  ].filter((column): column is EvidenceColumnDefinition => column !== null);

  const handleClear = (): void => {
    setPasteText("");
    setLoadedSourceSignatures([]);
    setLoadedSourceRows([]);
    setLoadMessage("");
    setCopyMessage("");
  };

  const toggleEvidenceSignal = (key: EvidenceSignalKey): void => {
    setEnabledEvidenceSignals((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleLoadGeneratedCandidates = (): void => {
    const newSources = loadableSources.filter((source) => !loadedSourceSignatures.includes(source.signature));
    const skippedSources = loadableSources.filter((source) => loadedSourceSignatures.includes(source.signature));

    if (newSources.length === 0) {
      setLoadMessage(
        loadableSources.length === 0
          ? "No generated candidate rows are available to load yet."
          : "No new candidate rows to load; each current source has already been loaded once.",
      );
      return;
    }

    const newLoadedRows = newSources.flatMap((source) => (
      source.rows.map((rowText) => ({
        sourceId: source.id,
        sourceLabel: source.label,
        rowText,
      }))
    ));
    const newRows = newLoadedRows.map((row) => row.rowText);
    setPasteText((current) => {
      const trimmed = current.trim();
      return [trimmed, ...newRows].filter(Boolean).join("\n");
    });
    setLoadedSourceSignatures((current) => [...current, ...newSources.map((source) => source.signature)]);
    setLoadedSourceRows((current) => [...current, ...newLoadedRows]);
    setCopyMessage("");
    setLoadMessage([
      `${newRows.length} row${newRows.length === 1 ? "" : "s"} loaded from ${newSources.map((source) => source.label).join(" + ")}.`,
      skippedSources.length > 0
        ? `${skippedSources.map((source) => source.label).join(" + ")} already loaded for the current contents.`
        : "",
    ].filter(Boolean).join(" "));
  };

  const handleRunPortfolioBacktest = (): void => {
    const result = runPortfolioCompressionBacktest(backtestHistory, {
      minTrainingDraws: backtestMinTrainingDraws,
      monteCarloIterations: backtestMonteCarloIterations,
      seed: 20260608,
    });
    setBacktestResult(result);
  };

  const coreText = result.coreNumbers.join(", ");
  const coreKey = result.coreNumbers.join(",");
  const canSimulateCore = result.coreNumbers.length === 6 && Boolean(onSimulateCore);
  const isCoreSimulated = canSimulateCore && activeSimulatedKey === coreKey;
  const alternatesText = result.alternates
    .slice(0, 12)
    .map((row) => row.number)
    .join(", ");
  const coreAndAlternatesText = alternatesText
    ? `Core: ${coreText}\nAlternates: ${alternatesText}`
    : `Core: ${coreText}`;

  const handleCopyCore = async (): Promise<void> => {
    if (result.coreNumbers.length !== 6) return;
    try {
      await writeTextToClipboard(coreText, copyText);
      setCopyMessage("Copied top-six core.");
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "Could not copy top-six core.");
    }
  };

  const handleCopyCoreAndAlternates = async (): Promise<void> => {
    if (result.coreNumbers.length !== 6) return;
    try {
      await writeTextToClipboard(coreAndAlternatesText, copyText);
      setCopyMessage("Copied core and alternates.");
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "Could not copy core and alternates.");
    }
  };

  const handleSimulateCore = (): void => {
    if (!canSimulateCore || !onSimulateCore) return;
    onSimulateCore([...result.coreNumbers]);
  };

  const renderBacktestStrategyRow = (
    strategyKey: "compressed" | "simpleFrequency" | "random",
    summary: PortfolioStrategySummary,
    currentBacktestResult: PortfolioBacktestResult,
  ): React.ReactNode => (
    <tr key={strategyKey}>
      <td style={{ ...tdStyle, fontWeight: 800 }}>{summary.label}</td>
      <td style={tdStyle}>{formatDecimal(summary.totalPrizeScore, 0)}</td>
      <td style={tdStyle}>{formatDecimal(summary.meanMatches, 2)}</td>
      <td style={tdStyle}>{formatPercent(summary.hitRate3Plus)}</td>
      <td style={tdStyle}>{formatDecimal(summary.risk.sharpe, 2)}</td>
      <td style={tdStyle}>{formatDecimal(summary.risk.sortino, 2)}</td>
      <td style={tdStyle}>{formatPercent(summary.risk.maxDrawdownPct)}</td>
      <td style={tdStyle}>{formatDecimal(summary.risk.calmar, 2)}</td>
      <td style={tdStyle}>{formatDecimal(strategyMonteCarloPValue(currentBacktestResult, strategyKey), 4)}</td>
    </tr>
  );

  return (
    <section className="windfall-ledger-panel windfall-generator-panel" aria-label="Portfolio Compression / 12-Game Distiller">
      <div style={headingStyle}>
        <div>
          <div style={mutedStyle}>V1 count compression. Counts show how many pasted games contain each number.</div>
        </div>
        <div style={{ ...mutedStyle, fontWeight: 800, color: "#334155" }}>
          Count-only evidence
        </div>
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }}>
        Paste portfolio games
        <textarea
          value={pasteText}
          onChange={(event) => {
            setPasteText(event.target.value);
            setLoadMessage("");
            setCopyMessage("");
          }}
          placeholder="Paste one portfolio game per line. Commas, spaces, punctuation, and numbered-list labels are accepted."
          spellCheck={false}
          style={textareaStyle}
        />
      </label>

      <div className="windfall-status-strip">
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Rows counted</div>
          <div style={{ fontWeight: 800 }}>{result.acceptedRows}</div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Valid game rows</div>
          <div style={{ fontWeight: 800, color: result.validGameRows === result.acceptedRows ? "#166534" : "#92400e" }}>
            {result.validGameRows}
          </div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Unique numbers</div>
          <div style={{ fontWeight: 800 }}>{result.uniqueNumbers}</div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Counted values</div>
          <div style={{ fontWeight: 800 }}>{result.totalCountedNumbers}</div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Rows to review</div>
          <div style={{ fontWeight: 800, color: result.rowIssueCount > 0 ? "#92400e" : "#166534" }}>
            {result.rowIssueCount}
          </div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Duplicate games</div>
          <div style={{ fontWeight: 800, color: result.duplicateGameCount > 0 ? "#92400e" : "#166534" }}>
            {result.duplicateGameCount}
          </div>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ ...mutedStyle, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 8 }}>
          {result.warnings.join(" ")}
        </div>
      )}

      {result.duplicateGames.length > 0 && (
        <div style={{ ...mutedStyle, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          Duplicate rows kept as repeated portfolio evidence: {result.duplicateGames
            .map((group) => `${group.signature} on rows ${group.lineNumbers.join(", ")}`)
            .join(" | ")}
        </div>
      )}

      {loadedSourceRows.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Loaded source rows</div>
            <div style={mutedStyle}>Source labels are shown beside loaded rows but are not written into the parser input.</div>
          </div>
          <div data-testid="portfolio-loaded-source-rows-scroll" style={loadedSourceRowsScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Loaded row</th>
                </tr>
              </thead>
              <tbody>
                {loadedSourceRows.map((row, index) => (
                  <tr key={`${row.sourceId}-${index}-${row.rowText}`}>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{row.sourceLabel}</td>
                    <td style={{ ...tdStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
                      {row.rowText}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Evidence readiness</div>
          <div style={mutedStyle}>
            Observe-only: enabled signals are labelled but do not change the top-six core.
          </div>
        </div>
        <div style={{ ...mutedStyle, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          {activeSignalLabel}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Signal</th>
                <th style={thStyle}>Label</th>
                <th style={thStyle}>Use</th>
                <th style={thStyle}>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {evidenceSignalDefinitions.map((signal) => {
                const isOptional = signal.defaultState === "off";
                const isEnabled = signal.defaultState === "always"
                  || (isOptional && enabledEvidenceSignals[signal.key as EvidenceSignalKey]);
                const useLabel = signal.defaultState === "always"
                  ? "Always on"
                  : signal.defaultState === "disabled"
                    ? "Disabled"
                    : isEnabled
                      ? "On"
                      : "Off";

                return (
                  <tr key={signal.key}>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{signal.name}</td>
                    <td style={tdStyle}>{signal.evidenceType}</td>
                    <td style={tdStyle}>
                      {signal.defaultState === "always" ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" checked disabled readOnly />
                          {useLabel}
                        </label>
                      ) : signal.defaultState === "disabled" ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" disabled readOnly />
                          {useLabel}
                        </label>
                      ) : (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            aria-label={`Toggle ${signal.name} evidence`}
                            onChange={() => toggleEvidenceSignal(signal.key as EvidenceSignalKey)}
                          />
                          {useLabel}
                        </label>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "#64748b" }}>{signal.explanation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Structural Strategy Backtest</div>
          <div style={mutedStyle}>
            Strict walk-forward comparison of a separate historical structural-state strategy against simple historical frequency and a seeded random ticket.
          </div>
        </div>
        <div className="windfall-status-strip">
          <label className="windfall-status-chip" style={{ display: "grid", gap: 4 }}>
            <span style={mutedStyle}>Training draws before first test</span>
            <input
              type="number"
              min={2}
              max={Math.max(2, backtestHistoryCount - 1)}
              value={backtestMinTrainingDraws}
              onChange={(event) => {
                setBacktestMinTrainingDraws(Math.max(2, Math.floor(Number(event.target.value) || 2)));
                setBacktestResult(null);
              }}
              style={{ width: 92, padding: "5px 7px", border: "1px solid #cbd5e1", borderRadius: 6 }}
            />
          </label>
          <label className="windfall-status-chip" style={{ display: "grid", gap: 4 }}>
            <span style={mutedStyle}>Monte Carlo histories</span>
            <select
              value={backtestMonteCarloIterations}
              onChange={(event) => {
                setBacktestMonteCarloIterations(Number(event.target.value));
                setBacktestResult(null);
              }}
              style={{ width: 120, padding: "5px 7px", border: "1px solid #cbd5e1", borderRadius: 6 }}
            >
              {[500, 1000, 5000, 10000].map((value) => (
                <option key={value} value={value}>{value.toLocaleString()}</option>
              ))}
            </select>
          </label>
          <div className="windfall-status-chip">
            <div style={mutedStyle}>History supplied</div>
            <div style={{ fontWeight: 800 }}>{backtestHistoryCount}</div>
          </div>
          <button
            type="button"
            onClick={handleRunPortfolioBacktest}
            className="windfall-primary-button"
            disabled={backtestHistoryCount === 0}
            style={backtestHistoryCount === 0 ? { opacity: 0.58, cursor: "not-allowed" } : undefined}
          >
            Run structural backtest
          </button>
        </div>
        <div style={{ ...mutedStyle, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          This backtests the historical structural-state strategy, not the pasted portfolio core. It does not change the Portfolio core ranking, and it never lets a tested draw influence its own selection.
        </div>

        {backtestResult && (
          <div style={{ display: "grid", gap: 10 }}>
            {backtestResult.errors.length > 0 ? (
              <div style={{ ...mutedStyle, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 8 }}>
                {backtestResult.errors.join(" ")}
              </div>
            ) : (
              <>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 8,
                }}>
                  <div className="windfall-status-chip">
                    <div style={mutedStyle}>Walk-forward results</div>
                    <div style={{ fontWeight: 800 }}>{backtestResult.drawsEvaluated} draws</div>
                  </div>
                  <div className="windfall-status-chip">
                    <div style={mutedStyle}>Structural vs simple prize delta</div>
                    <div style={{ fontWeight: 800 }}>{formatDecimal(backtestResult.compressedVsSimple.totalPrizeDelta, 0)}</div>
                  </div>
                  <div className="windfall-status-chip">
                    <div style={mutedStyle}>Structural vs simple p-value</div>
                    <div style={{ fontWeight: 800 }}>{formatDecimal(backtestResult.compressedVsSimple.pValue, 4)}</div>
                  </div>
                  <div className="windfall-status-chip">
                    <div style={mutedStyle}>Random-history diagnostic p-value</div>
                    <div style={{ fontWeight: 800 }}>{formatDecimal(backtestResult.monteCarlo.compressedPValue, 4)}</div>
                  </div>
                </div>

                {backtestResult.warnings.length > 0 && (
                  <div style={{ ...mutedStyle, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 8 }}>
                    {backtestResult.warnings.join(" ")}
                  </div>
                )}

                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Strategy</th>
                        <th style={thStyle}>Prize score</th>
                        <th style={thStyle}>Mean matches</th>
                        <th style={thStyle}>3+ hit rate</th>
                        <th style={thStyle}>Sharpe</th>
                        <th style={thStyle}>Sortino</th>
                        <th style={thStyle}>Max drawdown</th>
                        <th style={thStyle}>Calmar</th>
                        <th style={thStyle}>MC p-value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderBacktestStrategyRow("compressed", backtestResult.strategies.compressed, backtestResult)}
                      {renderBacktestStrategyRow("simpleFrequency", backtestResult.strategies.simpleFrequency, backtestResult)}
                      {renderBacktestStrategyRow("random", backtestResult.strategies.random, backtestResult)}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                  <PortfolioBacktestChart
                    title="Equity curves"
                    series={[
                      { label: "Structural", values: backtestResult.strategies.compressed.equityCurve, color: "#111827" },
                      { label: "Simple frequency", values: backtestResult.strategies.simpleFrequency.equityCurve, color: "#2563eb" },
                      { label: "Random", values: backtestResult.strategies.random.equityCurve, color: "#94a3b8" },
                    ]}
                  />
                  <PortfolioBacktestChart
                    title="Drawdown profiles"
                    percent
                    series={[
                      { label: "Structural", values: backtestResult.strategies.compressed.drawdownCurve, color: "#111827" },
                      { label: "Simple frequency", values: backtestResult.strategies.simpleFrequency.drawdownCurve, color: "#2563eb" },
                      { label: "Random", values: backtestResult.strategies.random.drawdownCurve, color: "#94a3b8" },
                    ]}
                  />
                </div>

                <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
                  {backtestResult.methodology.join(" ")}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Top-six core</div>
          <div style={mutedStyle}>
            {result.coreNumbers.length === 6
              ? "Highest row-count numbers, sorted as a playable six."
              : "Needs at least six distinct valid numbers."}
          </div>
        </div>
        {result.coreNumbers.length === 6 ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {result.coreNumbers.map((number) => (
                <span key={number} style={coreChipStyle}>{number}</span>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
              {result.coreNumbers.join(", ")}
            </div>
          </>
        ) : (
          <div style={{ ...mutedStyle, border: "1px dashed #cbd5e1", borderRadius: 6, padding: 10 }}>
            No six-number core yet.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Alternates</div>
        {result.alternates.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.alternates.slice(0, 12).map((row) => (
              <span
                key={row.number}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 7px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  fontSize: 12,
                  fontWeight: 700,
                }}
                title={`Number ${row.number}: ${row.gameCount} games (${(row.rowShare * 100).toFixed(1)}%)`}
              >
                {row.number}
                <span style={{ color: "#64748b" }}>x{row.gameCount}</span>
              </span>
            ))}
          </div>
        ) : (
          <div style={mutedStyle}>No alternates yet.</div>
        )}
      </div>

      {enabledEvidenceSignals.monthlyBuckets && (
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Monthly bucket composition</div>
            <div style={mutedStyle}>
              Current monthly frequency buckets for the count-compressed core and alternates.
            </div>
          </div>
          {renderMonthlyBucketEvidence(monthlyBucketEvidence)}
        </div>
      )}

      {enabledEvidenceSignals.adjacentCombos && (
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Adjacent combos compatibility</div>
            <div style={mutedStyle}>
              Pairs and triples observed in the active draw history, evaluated against the count-compressed core.
            </div>
          </div>
          {renderAdjacentComboEvidence(adjacentComboEvidence)}
        </div>
      )}

      {rankedRows.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {activeEvidenceColumns.length > 0 && (
            <div style={{ ...mutedStyle, color: "#334155" }}>
              Observe-only evidence columns do not change ranking.
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Rank</th>
                  <th style={thStyle}>Games</th>
                  <th style={thStyle}>Share</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Rows</th>
                  {activeEvidenceColumns.map((column) => (
                    <th key={column.key} style={thStyle}>{column.heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row) => {
                  const prominence = maxGameCount > 0 ? row.gameCount / maxGameCount : 0;
                  return (
                    <tr key={row.number}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {row.rank}. {row.number}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block",
                          minWidth: 72,
                          padding: "3px 7px",
                          borderRadius: 6,
                          background: `rgba(219, 234, 254, ${Math.min(0.95, 0.22 + prominence * 0.7)})`,
                          color: "#172554",
                          fontWeight: 800,
                        }}>
                          {row.gameCount} game{row.gameCount === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td style={tdStyle}>{(row.rowShare * 100).toFixed(1)}%</td>
                      <td style={tdStyle}>{roleLabel(row)}</td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>{row.appearances.join(", ")}</td>
                      {activeEvidenceColumns.map((column) => (
                        <td key={column.key} style={{ ...tdStyle, color: "#334155", fontWeight: 700 }}>
                          {column.valueForNumber(row.number)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="windfall-action-band">
        <button
          type="button"
          onClick={handleLoadGeneratedCandidates}
          className="windfall-primary-button"
          disabled={availableSourceRows === 0}
          style={availableSourceRows === 0 ? { opacity: 0.58, cursor: "not-allowed" } : undefined}
        >
          Load current generated candidates
        </button>
        <button
          type="button"
          onClick={() => { void handleCopyCore(); }}
          className="windfall-secondary-button"
          disabled={result.coreNumbers.length !== 6}
          style={result.coreNumbers.length !== 6 ? { opacity: 0.58, cursor: "not-allowed" } : undefined}
        >
          Copy top-six core
        </button>
        <button
          type="button"
          onClick={() => { void handleCopyCoreAndAlternates(); }}
          className="windfall-secondary-button"
          disabled={result.coreNumbers.length !== 6}
          style={result.coreNumbers.length !== 6 ? { opacity: 0.58, cursor: "not-allowed" } : undefined}
        >
          Copy core + alternates
        </button>
        <button
          type="button"
          onClick={handleSimulateCore}
          className={isCoreSimulated ? "windfall-primary-button" : "windfall-secondary-button"}
          disabled={!canSimulateCore}
          style={!canSimulateCore ? { opacity: 0.58, cursor: "not-allowed" } : undefined}
          title={result.coreNumbers.length === 6
            ? "Simulate the count-compressed six-number core"
            : "Needs a six-number core"}
        >
          {isCoreSimulated ? "Core simulated" : "Simulate top-six core"}
        </button>
        <button type="button" onClick={handleClear} className="windfall-secondary-button">
          Clear pasted rows
        </button>
        <span style={mutedStyle}>
          {availableSourceRows > 0
            ? `${availableSourceRows} generated row${availableSourceRows === 1 ? "" : "s"} available from ${loadableSources.map((source) => source.label).join(" + ")}.`
            : "V1 ranking remains count-only; optional evidence is observe-only."}
        </span>
      </div>
      {loadMessage && (
        <div style={{ ...mutedStyle, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          {loadMessage}
        </div>
      )}
      {copyMessage && (
        <div style={{ ...mutedStyle, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          {copyMessage}
        </div>
      )}
    </section>
  );
};

export default PortfolioCompressionPanel;
