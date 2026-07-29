import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw, KeptGeneratedCandidateRow } from "../../types";
import { buildAdaptiveShapeEvidence } from "../../lib/adaptiveCandidateShapes";
import {
  bucketLabelForTimes,
  MONTHLY_BUCKET_KEYS,
  type MonthlyBucketSets,
  type MonthlyFrequencyConstraints,
  type StageIdealDrawState,
} from "../../lib/monthlyDrawSummary";
import {
  generatePasteWeightedCandidates,
  normalizeMonthlyAcceptanceNeedsCounts,
  parsePastedCandidateNumbers,
  reconcileStageIdmTargetCounts,
  type PasteWeightedGenerationResult,
  type PasteWeightedCandidateConstraintMode,
  type PastedCandidateRow,
} from "../../lib/pasteWeightedCandidates";
import { normalizeUserSelectedNumbers } from "../../lib/userSelectedNumbers";
import { formatUserExclusionReminder, normalizeUserExclusionLocks } from "../../lib/userExclusionLocks";

interface PasteWeightedCandidatesPanelProps {
  onSimulateCandidate?: (numbers: number[]) => void;
  onGeneratedCandidatesChange?: (candidates: PasteWeightedGenerationResult["candidates"]) => void;
  forcedNumbers?: number[];
  excludedNumbers?: number[];
  onToggleForcedNumber?: (number: number) => void;
  activeSimulatedKey?: string | null;
  keptGeneratedRows?: readonly KeptGeneratedCandidateRow[];
  initialPasteText?: string;
  initialCandidateCount?: number;
  fullHistory?: Draw[];
  activeHistory?: Draw[];
  activeWindowLabel?: string;
  stageIdealDrawState?: StageIdealDrawState | null;
  monthlyBucketSets?: MonthlyBucketSets | null;
  monthlyAcceptanceNeeds?: MonthlyFrequencyConstraints | null;
}

const candidateCountOptions = Array.from({ length: 27 }, (_, index) => index + 4);
const stageBucketCountOptions = Array.from({ length: 7 }, (_, index) => index);
const lotteryNumbers = Array.from({ length: 45 }, (_, index) => index + 1);

const appendTextRows = (current: string, rows: readonly string[]): string => {
  const existing = current.trim();
  return [existing, ...rows].filter(Boolean).join("\n");
};

const formatKeptPasteWeightedRow = (row: KeptGeneratedCandidateRow): string | null => {
  const main = row.main.filter((number) => Number.isInteger(number) && number >= 1 && number <= 45);
  return main.length === 6 ? main.join(",") : null;
};

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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 140,
  resize: "vertical",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: 10,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.45,
  boxSizing: "border-box",
};

const numberChipStyle = (prominence: number): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minWidth: 54,
  padding: "4px 7px",
  borderRadius: 6,
  border: "1px solid #c7d2fe",
  background: `rgba(219, 234, 254, ${Math.min(0.95, 0.25 + prominence * 0.7)})`,
  color: "#172554",
  fontSize: 12,
  fontWeight: 700,
});

const missingNumberButtonStyle = (
  active: boolean,
  disabled: boolean,
): React.CSSProperties => ({
  minHeight: 34,
  minWidth: 38,
  borderRadius: 6,
  border: active ? "1px solid #111827" : disabled ? "1px solid #d7dee8" : "1px solid #cbd5e1",
  background: active ? "#111827" : disabled ? "#f1f5f9" : "#fff",
  color: active ? "#fff" : disabled ? "#94a3b8" : "#0f172a",
  fontWeight: 800,
  fontSize: 12,
  cursor: disabled ? "not-allowed" : "pointer",
});

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
};

const constraintGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const constraintControlStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  paddingTop: 8,
  borderTop: "1px solid #e2e8f0",
};

const selectStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
};

const compactBucketLabel = (times: number): string => (
  times <= 0 ? "0x" : bucketLabelForTimes(times)
);

const rowIssueListStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  maxHeight: 180,
  overflowY: "auto",
  paddingRight: 2,
};

const pastedRowIssueStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #f59e0b",
  borderLeft: "4px solid #d97706",
  background: "#fff7ed",
  color: "#78350f",
};

const pastedRowIssueMetaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const pastedRowRawStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.35,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "#111827",
};

const describePastedRowIssues = (row: PastedCandidateRow): string[] => {
  const issues: string[] = [];
  if (row.numbers.length !== 6) {
    issues.push(`${row.numbers.length} unique valid number${row.numbers.length === 1 ? "" : "s"}; expected exactly 6`);
  }
  if (row.duplicateNumbers.length > 0) {
    issues.push(`duplicate value${row.duplicateNumbers.length === 1 ? "" : "s"} counted once: ${row.duplicateNumbers.join(", ")}`);
  }
  if (row.outOfRangeNumbers.length > 0) {
    issues.push(`ignored out-of-range value${row.outOfRangeNumbers.length === 1 ? "" : "s"}: ${row.outOfRangeNumbers.join(", ")}`);
  }
  return issues.length > 0 ? issues : ["Review this row before relying on it."];
};

const formatStageIdmCounts = (counts: readonly number[]): string => (
  counts
    .map((count, times) => `${compactBucketLabel(times)} ${count}`)
    .join(" · ")
);

const formatAcceptanceNeedsCounts = (counts: readonly number[]): string => {
  const activeCounts = counts
    .map((count, times) => ({ count, label: compactBucketLabel(times) }))
    .filter(({ count }) => count > 0);
  return activeCounts.length > 0
    ? activeCounts.map(({ count, label }) => `${label}≥${count}`).join(" · ")
    : "none selected";
};

export const PasteWeightedCandidatesPanel: React.FC<PasteWeightedCandidatesPanelProps> = ({
  onSimulateCandidate,
  onGeneratedCandidatesChange,
  forcedNumbers = [],
  excludedNumbers = [],
  onToggleForcedNumber,
  activeSimulatedKey = null,
  keptGeneratedRows = [],
  initialPasteText = "",
  initialCandidateCount = 12,
  fullHistory = [],
  activeHistory = [],
  activeWindowLabel = "WFMQYH",
  stageIdealDrawState = null,
  monthlyBucketSets = null,
  monthlyAcceptanceNeeds = null,
}) => {
  const consumedKeptRowIdsRef = useRef<Set<string>>(new Set());
  const [pasteText, setPasteText] = useState(initialPasteText);
  const [candidateCount, setCandidateCount] = useState(initialCandidateCount);
  const [ending5Mode, setEnding5Mode] = useState<PasteWeightedCandidateConstraintMode>("any");
  const [ending0Mode, setEnding0Mode] = useState<PasteWeightedCandidateConstraintMode>("any");
  const [oddEvenEnabled, setOddEvenEnabled] = useState(false);
  const [selectedOddEvenRatios, setSelectedOddEvenRatios] = useState<string[]>([]);
  const [adaptiveShapeEnabled, setAdaptiveShapeEnabled] = useState(false);
  const [adaptiveShapeMode, setAdaptiveShapeMode] = useState<"observe" | "quota">("observe");
  const [stageIdmEnabled, setStageIdmEnabled] = useState(false);
  const [stageIdmTargetCounts, setStageIdmTargetCounts] = useState<number[] | null>(null);
  const [monthlyAcceptanceNeedsEnabled, setMonthlyAcceptanceNeedsEnabled] = useState(false);
  const [result, setResult] = useState<PasteWeightedGenerationResult | null>(null);

  const parsed = useMemo(() => parsePastedCandidateNumbers(pasteText), [pasteText]);
  const countedNumberSet = useMemo(
    () => new Set(parsed.counts.map((item) => item.number)),
    [parsed.counts],
  );
  const missingNumbers = useMemo(
    () => lotteryNumbers.filter((number) => !countedNumberSet.has(number)),
    [countedNumberSet],
  );
  const pasteForcedNumbers = useMemo(
    () => normalizeUserSelectedNumbers(forcedNumbers),
    [forcedNumbers],
  );
  const pasteForcedSet = useMemo(() => new Set(pasteForcedNumbers), [pasteForcedNumbers]);
  const excludedNumberList = useMemo(
    () => normalizeUserExclusionLocks(excludedNumbers),
    [excludedNumbers],
  );
  const excludedNumberSet = useMemo(() => new Set(excludedNumberList), [excludedNumberList]);
  const userExclusionReminder = useMemo(
    () => formatUserExclusionReminder(excludedNumberList),
    [excludedNumberList],
  );
  const adaptiveShapeEvidence = useMemo(() => (
    fullHistory.length > 0
      ? buildAdaptiveShapeEvidence({ fullHistory, activeHistory, shrinkTargetSize: 50 })
      : null
  ), [fullHistory, activeHistory]);
  const countsForDisplay = parsed.counts;
  const oddEvenRatioOptions = parsed.oddEvenRatios;
  const adaptiveShapeProfiles = adaptiveShapeEvidence?.profileOptions ?? [];
  const adaptiveShapeProfileRows = adaptiveShapeProfiles.slice(0, 32);
  const defaultStageIdmTargetCounts = useMemo(
    () => reconcileStageIdmTargetCounts(stageIdealDrawState?.idealDrawBucketCounts, 6),
    [stageIdealDrawState],
  );
  const monthlyAcceptanceNeedsCounts = useMemo(
    () => normalizeMonthlyAcceptanceNeedsCounts(monthlyAcceptanceNeeds),
    [monthlyAcceptanceNeeds],
  );
  const activeStageIdmTargetCounts = stageIdmTargetCounts ?? defaultStageIdmTargetCounts;
  const stageIdmTargetTotal = activeStageIdmTargetCounts.reduce((sum, count) => sum + count, 0);
  const monthlyAcceptanceNeedsTotal = monthlyAcceptanceNeedsCounts.reduce((sum, count) => sum + count, 0);
  const stageIdmAvailable = stageIdealDrawState !== null;
  const monthlyAcceptanceNeedsAvailable = monthlyAcceptanceNeeds !== null && monthlyBucketSets !== null;
  const availableOddEvenRatioSet = new Set(oddEvenRatioOptions.map((option) => option.ratio));
  const activeSelectedOddEvenRatios = selectedOddEvenRatios.filter((ratio) => availableOddEvenRatioSet.has(ratio));
  const maxCount = countsForDisplay[0]?.count ?? 0;
  const rowsWithIssues = parsed.rows.filter((row) => (
    row.numbers.length > 0
    && (!row.expectedSixNumbers || row.duplicateNumbers.length > 0 || row.outOfRangeNumbers.length > 0)
  ));
  const needsOddEvenSelection = oddEvenEnabled && activeSelectedOddEvenRatios.length === 0;
  const needsStageIdmState = stageIdmEnabled && !stageIdmAvailable;
  const needsStageIdmSixMains = stageIdmEnabled && stageIdmTargetTotal !== 6;
  const needsMonthlyAcceptanceNeedsState = monthlyAcceptanceNeedsEnabled && !monthlyAcceptanceNeedsAvailable;
  const needsMonthlyAcceptanceNeedsPossible = monthlyAcceptanceNeedsEnabled && monthlyAcceptanceNeedsTotal > 6;
  const canGenerate = parsed.uniqueNumbers >= 6
    && !needsOddEvenSelection
    && !needsStageIdmState
    && !needsStageIdmSixMains
    && !needsMonthlyAcceptanceNeedsState
    && !needsMonthlyAcceptanceNeedsPossible;

  useEffect(() => {
    const newRows = keptGeneratedRows
      .filter((row) => !consumedKeptRowIdsRef.current.has(row.id))
      .map((row) => ({ id: row.id, text: formatKeptPasteWeightedRow(row) }))
      .filter((row): row is { id: string; text: string } => row.text !== null);

    if (newRows.length === 0) return;

    newRows.forEach((row) => consumedKeptRowIdsRef.current.add(row.id));
    setPasteText((current) => appendTextRows(current, newRows.map((row) => row.text)));
    setResult(null);
    onGeneratedCandidatesChange?.([]);
  }, [keptGeneratedRows, onGeneratedCandidatesChange]);

  const clearResult = () => {
    setResult(null);
    onGeneratedCandidatesChange?.([]);
  };

  const handleGenerate = () => {
    const nextResult = generatePasteWeightedCandidates(pasteText, {
      candidateCount,
      constraints: {
        ending5: ending5Mode,
        ending0: ending0Mode,
        oddEven: {
          enabled: oddEvenEnabled,
          selectedRatios: activeSelectedOddEvenRatios,
          ratioOptions: oddEvenRatioOptions,
        },
        adaptiveShape: {
          enabled: adaptiveShapeEnabled && adaptiveShapeEvidence !== null,
          mode: adaptiveShapeMode,
          profileOptions: adaptiveShapeProfiles,
        },
        stageIdm: {
          enabled: stageIdmEnabled,
          bucketSets: stageIdealDrawState?.bucketSets ?? null,
          targetCounts: activeStageIdmTargetCounts,
        },
        monthlyAcceptanceNeeds: {
          enabled: monthlyAcceptanceNeedsEnabled,
          bucketSets: monthlyBucketSets,
          targetCounts: monthlyAcceptanceNeedsCounts,
        },
      },
    });
    setResult(nextResult);
    onGeneratedCandidatesChange?.(nextResult.candidates);
  };

  const handleClear = () => {
    setPasteText("");
    clearResult();
  };

  const updateEnding5Mode = (mode: PasteWeightedCandidateConstraintMode) => {
    setEnding5Mode(mode);
    clearResult();
  };

  const updateEnding0Mode = (mode: PasteWeightedCandidateConstraintMode) => {
    setEnding0Mode(mode);
    clearResult();
  };

  const updateOddEvenEnabled = (enabled: boolean) => {
    setOddEvenEnabled(enabled);
    if (enabled && activeSelectedOddEvenRatios.length === 0) {
      setSelectedOddEvenRatios(oddEvenRatioOptions.map((option) => option.ratio));
    }
    clearResult();
  };

  const toggleOddEvenRatio = (ratio: string) => {
    setSelectedOddEvenRatios((current) => (
      current.includes(ratio)
        ? current.filter((item) => item !== ratio)
        : [...current, ratio]
    ));
    clearResult();
  };

  const updateAdaptiveShapeEnabled = (enabled: boolean) => {
    setAdaptiveShapeEnabled(enabled);
    clearResult();
  };

  const updateAdaptiveShapeMode = (mode: "observe" | "quota") => {
    setAdaptiveShapeMode(mode);
    clearResult();
  };

  const updateStageIdmEnabled = (enabled: boolean) => {
    setStageIdmEnabled(enabled);
    clearResult();
  };

  const updateMonthlyAcceptanceNeedsEnabled = (enabled: boolean) => {
    setMonthlyAcceptanceNeedsEnabled(enabled);
    clearResult();
  };

  const updateStageIdmTargetCount = (times: number, count: number) => {
    setStageIdmTargetCounts((current) => {
      const next = [...(current ?? defaultStageIdmTargetCounts)];
      next[times] = count;
      return next;
    });
    clearResult();
  };

  const resetStageIdmTargetCounts = () => {
    setStageIdmTargetCounts(null);
    clearResult();
  };

  const oddEvenSummaryRows = result?.oddEvenRatioSummary?.targetRatios
    ? Object.entries(result.oddEvenRatioSummary.targetRatios)
      .map(([ratio, target]) => ({
        ratio,
        target,
        accepted: result.oddEvenRatioSummary?.acceptedRatios[ratio] ?? 0,
      }))
    : [];
  const adaptiveShapeSummaryRows = result?.adaptiveShapeSummary
    ? Object.entries(result.adaptiveShapeSummary.targetRatios ?? result.adaptiveShapeSummary.acceptedRatios)
      .map(([profile, targetOrAccepted]) => ({
        profile,
        target: result.adaptiveShapeSummary?.targetRatios?.[profile] ?? null,
        accepted: result.adaptiveShapeSummary?.acceptedRatios[profile] ?? targetOrAccepted,
      }))
    : [];
  const stageIdmSummary = result?.stageIdmSummary;
  const monthlyAcceptanceNeedsSummary = result?.monthlyAcceptanceNeedsSummary;

  return (
    <section className="windfall-ledger-panel windfall-generator-panel" aria-label="Paste-Weighted Candidate Generator">
      <div style={headingStyle}>
        <div>
          <div style={mutedStyle}>
            Paste candidate rows, count valid numbers, then generate six-number candidates weighted by those empirical counts.
          </div>
        </div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
          Candidate rows
          <select
            value={candidateCount}
            onChange={(event) => setCandidateCount(Number(event.target.value))}
            style={{ marginLeft: 8, padding: "5px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
          >
            {candidateCountOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }}>
        Paste candidate rows
        <textarea
          value={pasteText}
          onChange={(event) => {
            setPasteText(event.target.value);
            clearResult();
          }}
          placeholder="Paste one row per line. Commas, spaces, and punctuation typos are treated as separators."
          spellCheck={false}
          style={textareaStyle}
        />
      </label>

      <div className="windfall-status-strip">
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Rows parsed</div>
          <div style={{ fontWeight: 800 }}>{parsed.acceptedRows}</div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Unique numbers</div>
          <div style={{ fontWeight: 800 }}>{parsed.uniqueNumbers}</div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Counted values</div>
          <div style={{ fontWeight: 800 }}>{parsed.totalCountedNumbers}</div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Missing numbers</div>
          <div style={{ fontWeight: 800 }}>{missingNumbers.length}</div>
        </div>
        <div className="windfall-status-chip">
          <div style={mutedStyle}>Invalid values</div>
          <div style={{ fontWeight: 800, color: parsed.invalidTokens.length ? "#b91c1c" : "#166534" }}>
            {parsed.invalidTokens.length}
          </div>
        </div>
      </div>

      {rowsWithIssues.length > 0 && (
        <div style={{ ...mutedStyle, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 8, display: "grid", gap: 8 }}>
          <div>
            {rowsWithIssues.length === 1 ? "1 row needs attention." : `${rowsWithIssues.length} rows need attention.`} Duplicate values are counted once per row; rows with fewer or more than six valid numbers are still used for weighting but marked as imperfect input.
          </div>
          <div style={{ fontWeight: 800, fontSize: 12, color: "#78350f" }}>Rows needing review</div>
          <div style={rowIssueListStyle} aria-label="Pasted rows needing attention">
            {rowsWithIssues.map((row) => (
              <div
                key={`${row.lineNumber}-${row.raw}`}
                data-testid="paste-weighted-row-issue"
                style={pastedRowIssueStyle}
                title={`Line ${row.lineNumber}: ${describePastedRowIssues(row).join("; ")}`}
              >
                <div style={pastedRowIssueMetaStyle}>
                  <span>Line {row.lineNumber}</span>
                  <span>{row.numbers.length}/6 unique valid</span>
                </div>
                <div style={pastedRowRawStyle}>{row.raw}</div>
                <div style={{ fontSize: 11, lineHeight: 1.35 }}>
                  {describePastedRowIssues(row).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {countsForDisplay.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Number count ranking</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {countsForDisplay.map((item) => (
              <span
                key={item.number}
                style={numberChipStyle(maxCount > 0 ? item.count / maxCount : 0)}
                title={`Number ${item.number}: ${item.count} counted occurrence${item.count === 1 ? "" : "s"} (${(item.share * 100).toFixed(1)}%)`}
              >
                {item.number}
                <span style={{ color: "#334155", fontWeight: 600 }}>x{item.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.totalCountedNumbers > 0 && (
        <div style={{ display: "grid", gap: 8, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              Missing from pasted rows ({missingNumbers.length})
            </div>
            <div style={mutedStyle}>
              These are valid 1-45 numbers that do not appear in the pasted rows. Click one to add or remove it as a Paste-Weighted hard forced inclusion for candidate generation; this does not change the pasted count ranking.
            </div>
            {userExclusionReminder && (
              <div style={{ ...mutedStyle, color: "#475569", marginTop: 4 }}>
                {userExclusionReminder}. Excluded numbers are unavailable here until the exclusion is cleared.
              </div>
            )}
          </div>
          {missingNumbers.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {missingNumbers.map((number) => {
                const active = pasteForcedSet.has(number);
                const excluded = excludedNumberSet.has(number);
                const disabled = !active && (!onToggleForcedNumber || excluded);
                return (
                  <button
                    key={number}
                    type="button"
                    aria-label={
                      excluded && !active
                        ? `Number ${number} is excluded and cannot be forced from Paste-Weighted missing numbers`
                        : active
                          ? `Remove Paste-Weighted forced inclusion ${number}`
                          : `Add Paste-Weighted forced inclusion ${number}`
                    }
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() => onToggleForcedNumber?.(number)}
                    title={
                      excluded && !active
                        ? `Clear the active exclusion before selecting ${number}.`
                        : active
                          ? `Remove ${number} from Paste-Weighted forced inclusions.`
                          : `Force ${number} into generated candidates.`
                    }
                    style={missingNumberButtonStyle(active, disabled)}
                  >
                    {number}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={mutedStyle}>Every number from 1 to 45 appears at least once in the pasted rows.</div>
          )}
          {pasteForcedNumbers.length > 0 && (
            <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
              Active Paste-Weighted forced inclusions: {pasteForcedNumbers.map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => onToggleForcedNumber?.(number)}
                  disabled={!onToggleForcedNumber}
                  style={{
                    ...missingNumberButtonStyle(true, !onToggleForcedNumber),
                    minHeight: 28,
                    minWidth: 32,
                    marginLeft: 5,
                  }}
                  aria-label={`Remove Paste-Weighted forced inclusion ${number}`}
                >
                  {number}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {parsed.invalidTokens.length > 0 && (
        <div style={{ ...mutedStyle, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 8 }}>
          Ignored out-of-range value{parsed.invalidTokens.length === 1 ? "" : "s"}: {parsed.invalidTokens.join(", ")}.
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Paste constraints</div>
          <div style={mutedStyle}>When a rule is off, it has no effect on generation.</div>
        </div>
        <div style={constraintGridStyle}>
          <div style={constraintControlStyle}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#334155" }}>
              <input
                type="checkbox"
                checked={ending5Mode !== "any"}
                onChange={(event) => updateEnding5Mode(event.target.checked ? "require" : "any")}
              />
              Ending 5
            </label>
            <select
              value={ending5Mode === "any" ? "require" : ending5Mode}
              disabled={ending5Mode === "any"}
              onChange={(event) => updateEnding5Mode(event.target.value as PasteWeightedCandidateConstraintMode)}
              style={{ ...selectStyle, opacity: ending5Mode === "any" ? 0.55 : 1 }}
              aria-label="Ending 5 constraint mode"
            >
              <option value="require">Require at least 1</option>
              <option value="exclude">Exclude</option>
            </select>
            <div style={mutedStyle}>5, 15, 25, 35, 45</div>
          </div>
          <div style={constraintControlStyle}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#334155" }}>
              <input
                type="checkbox"
                checked={ending0Mode !== "any"}
                onChange={(event) => updateEnding0Mode(event.target.checked ? "require" : "any")}
              />
              Ending 0
            </label>
            <select
              value={ending0Mode === "any" ? "require" : ending0Mode}
              disabled={ending0Mode === "any"}
              onChange={(event) => updateEnding0Mode(event.target.value as PasteWeightedCandidateConstraintMode)}
              style={{ ...selectStyle, opacity: ending0Mode === "any" ? 0.55 : 1 }}
              aria-label="Ending 0 constraint mode"
            >
              <option value="require">Require at least 1</option>
              <option value="exclude">Exclude</option>
            </select>
            <div style={mutedStyle}>10, 20, 30, 40</div>
          </div>
          <div style={{ ...constraintControlStyle, gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#334155" }}>
              <input
                type="checkbox"
                checked={oddEvenEnabled}
                onChange={(event) => updateOddEvenEnabled(event.target.checked)}
              />
              Odd/even mains
            </label>
            <div style={mutedStyle}>Mains only. Ratios come from exact six-number pasted rows.</div>
            {oddEvenRatioOptions.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {oddEvenRatioOptions.map((option) => (
                  <label
                    key={option.ratio}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      opacity: oddEvenEnabled ? 1 : 0.55,
                      fontSize: 12,
                      color: "#334155",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={activeSelectedOddEvenRatios.includes(option.ratio)}
                      disabled={!oddEvenEnabled}
                      onChange={() => toggleOddEvenRatio(option.ratio)}
                    />
                    {option.ratio} ({option.count} row{option.count === 1 ? "" : "s"}, {option.percent ?? 0}%)
                  </label>
                ))}
              </div>
            ) : (
              <div style={mutedStyle}>Paste exact six-number rows to reveal mains-only ratios.</div>
            )}
          </div>
          <div style={{ ...constraintControlStyle, gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#334155" }}>
                <input
                  type="checkbox"
                  checked={adaptiveShapeEnabled}
                  disabled={!adaptiveShapeEvidence || adaptiveShapeProfiles.length === 0}
                  onChange={(event) => updateAdaptiveShapeEnabled(event.target.checked)}
                />
                Adaptive shape
              </label>
              <select
                value={adaptiveShapeMode}
                disabled={!adaptiveShapeEnabled}
                onChange={(event) => updateAdaptiveShapeMode(event.target.value as "observe" | "quota")}
                style={{ ...selectStyle, opacity: adaptiveShapeEnabled ? 1 : 0.55 }}
                aria-label="Adaptive shape mode"
              >
                <option value="observe">Observe only</option>
                <option value="quota">Quota filter</option>
              </select>
            </div>
            {adaptiveShapeEvidence ? (
              <>
                <div style={mutedStyle}>
                  {activeWindowLabel}: {adaptiveShapeEvidence.activeDraws} active draw{adaptiveShapeEvidence.activeDraws === 1 ? "" : "s"}
                  {" "}- profile evidence
                  {adaptiveShapeEvidence.activeWeight < 1
                    ? ` shrunk toward latest ${adaptiveShapeEvidence.shrinkTargetSize}`
                    : " using the active window directly"}
                  {" "}(latest target {adaptiveShapeEvidence.latestTargetDraws} draw{adaptiveShapeEvidence.latestTargetDraws === 1 ? "" : "s"}).
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {adaptiveShapeProfileRows.map((option) => (
                    <span
                      key={option.ratio}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 7px",
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        color: "#334155",
                        fontSize: 12,
                        opacity: adaptiveShapeEnabled ? 1 : 0.72,
                      }}
                    >
                      {option.ratio} ({option.percent ?? option.count}%)
                    </span>
                  ))}
                </div>
                <div style={mutedStyle}>
                  Observe mode reports the generated mix. Quota filter mode accepts candidates according to these empirical profile percentages.
                  Only Quota filter mode uses the full profile distribution.
                </div>
              </>
            ) : (
              <div style={mutedStyle}>Connects to WFMQYH history when draw history is available.</div>
            )}
          </div>
          <div style={{ ...constraintControlStyle, gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#334155" }}>
                <input
                  type="checkbox"
                  checked={stageIdmEnabled}
                  disabled={!stageIdmAvailable}
                  onChange={(event) => updateStageIdmEnabled(event.target.checked)}
                />
                Stage IDM bucket mix
              </label>
              <button
                type="button"
                className="windfall-secondary-button"
                onClick={resetStageIdmTargetCounts}
                disabled={!stageIdmAvailable}
                style={{
                  padding: "4px 9px",
                  opacity: stageIdmAvailable ? 1 : 0.55,
                  cursor: stageIdmAvailable ? "pointer" : "not-allowed",
                }}
              >
                Reset to Stage IDM
              </button>
            </div>
            {stageIdealDrawState ? (
              <>
                <div style={mutedStyle}>
                  Descriptive next-stage monthly bucket composition. Exact mains-only quota; not a probability.
                  This is separate from Monthly Acceptance Needs.
                  {" "}{stageIdealDrawState.workingMonthLabel} · draw {stageIdealDrawState.targetStageDrawCount} of {stageIdealDrawState.expectedDrawCount}.
                </div>
                <div style={mutedStyle}>
                  Mains-only default: {formatStageIdmCounts(defaultStageIdmTargetCounts)}
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
                  gap: 8,
                }}>
                  {MONTHLY_BUCKET_KEYS.map((key, times) => {
                    return (
                      <label key={key} style={{ display: "grid", gap: 3, fontSize: 11, color: "#334155", fontWeight: 700 }}>
                        {compactBucketLabel(times)}
                        <select
                          value={activeStageIdmTargetCounts[times] ?? 0}
                          disabled={!stageIdmEnabled}
                          onChange={(event) => updateStageIdmTargetCount(times, Number(event.target.value))}
                          style={{ ...selectStyle, minHeight: 32, opacity: stageIdmEnabled ? 1 : 0.58 }}
                          aria-label={`Stage IDM ${bucketLabelForTimes(times)} main count`}
                        >
                          {stageBucketCountOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
                <div style={{
                  ...mutedStyle,
                  color: stageIdmTargetTotal === 6 ? "#166534" : "#92400e",
                  background: stageIdmTargetTotal === 6 ? "#f0fdf4" : "#fffbeb",
                  border: `1px solid ${stageIdmTargetTotal === 6 ? "#bbf7d0" : "#fde68a"}`,
                  borderRadius: 6,
                  padding: 8,
                }}>
                  Selected Stage IDM mains total: <b>{stageIdmTargetTotal}</b>/6.
                  {stageIdmTargetTotal === 6
                    ? " Enabled generation will require every candidate to match this exact bucket mix."
                    : " Adjust the dropdowns to total exactly six before generating with this filter."}
                </div>
              </>
            ) : (
              <div style={mutedStyle}>Stage IDM appears here after Monthly Draws Summary has comparable month-stage evidence.</div>
            )}
          </div>
          <div style={{ ...constraintControlStyle, gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#334155" }}>
              <input
                type="checkbox"
                checked={monthlyAcceptanceNeedsEnabled}
                disabled={!monthlyAcceptanceNeedsAvailable}
                onChange={(event) => updateMonthlyAcceptanceNeedsEnabled(event.target.checked)}
              />
              Monthly Acceptance Needs
            </label>
            {monthlyAcceptanceNeedsAvailable ? (
              <>
                <div style={mutedStyle}>
                  Literal minimums from Monthly Draws Summary. These counts are not rescaled; enabled generation requires each candidate to meet or exceed them.
                </div>
                <div style={mutedStyle}>
                  Acceptance Needs required: {formatAcceptanceNeedsCounts(monthlyAcceptanceNeedsCounts)}
                </div>
                <div style={{
                  ...mutedStyle,
                  color: monthlyAcceptanceNeedsTotal <= 6 ? "#166534" : "#92400e",
                  background: monthlyAcceptanceNeedsTotal <= 6 ? "#f0fdf4" : "#fffbeb",
                  border: `1px solid ${monthlyAcceptanceNeedsTotal <= 6 ? "#bbf7d0" : "#fde68a"}`,
                  borderRadius: 6,
                  padding: 8,
                }}>
                  Selected Acceptance Needs total: {monthlyAcceptanceNeedsTotal}/6.
                  {monthlyAcceptanceNeedsTotal <= 6
                    ? " Enabled generation treats these as minimum mains-only requirements."
                    : " This cannot run as-is because paste-weighted candidates contain only six mains."}
                </div>
              </>
            ) : (
              <div style={mutedStyle}>Acceptance Needs appears after Monthly Draws Summary provides selected bucket needs and current bucket data.</div>
            )}
          </div>
        </div>
      </div>

      <div className="windfall-action-band">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="windfall-primary-button"
          style={!canGenerate ? { opacity: 0.58, cursor: "not-allowed" } : undefined}
        >
          Generate paste-weighted candidates
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="windfall-secondary-button"
        >
          Clear pasted rows
        </button>
        {!canGenerate && (
          <span style={mutedStyle}>
            {needsOddEvenSelection
              ? "Select at least one mains-only odd/even ratio."
              : needsStageIdmState
                ? "Stage IDM is unavailable from Monthly Draws Summary."
                : needsStageIdmSixMains
                  ? "Stage IDM bucket mix must total exactly six mains."
                  : needsMonthlyAcceptanceNeedsState
                    ? "Monthly Acceptance Needs is unavailable from Monthly Draws Summary."
                    : needsMonthlyAcceptanceNeedsPossible
                      ? "Monthly Acceptance Needs must total six mains or fewer."
                      : "Paste at least six distinct valid numbers to generate."}
          </span>
        )}
      </div>

      {result && result.warnings.length > 0 && (
        <div style={{ ...mutedStyle, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 8 }}>
          {result.warnings.join(" ")}
        </div>
      )}

      {oddEvenSummaryRows.length > 0 && (
        <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          Odd/even mains accepted: {oddEvenSummaryRows
            .map((row) => `${row.ratio} ${row.accepted}/${row.target}`)
            .join(" | ")}
        </div>
      )}

      {adaptiveShapeSummaryRows.length > 0 && (
        <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          {result?.adaptiveShapeSummary?.targetRatios ? "Adaptive shape accepted: " : "Adaptive shape observed: "}
          {adaptiveShapeSummaryRows
            .map((row) => (
              row.target === null
                ? `${row.profile} ${row.accepted}`
                : `${row.profile} ${row.accepted}/${row.target}`
            ))
            .join(" | ")}
        </div>
      )}

      {stageIdmSummary && (
        <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          Stage IDM accepted: {formatStageIdmCounts(stageIdmSummary.targetCounts)}
          {" "}· {stageIdmSummary.totalAccepted}/{stageIdmSummary.requested} candidate{stageIdmSummary.requested === 1 ? "" : "s"}
        </div>
      )}

      {monthlyAcceptanceNeedsSummary && (
        <div style={{ ...mutedStyle, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
          Monthly Acceptance Needs accepted: {formatAcceptanceNeedsCounts(monthlyAcceptanceNeedsSummary.targetCounts)}
          {" "}· {monthlyAcceptanceNeedsSummary.totalAccepted}/{monthlyAcceptanceNeedsSummary.requested} candidate{monthlyAcceptanceNeedsSummary.requested === 1 ? "" : "s"}
        </div>
      )}

      {result && result.candidates.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Main numbers</th>
                <th style={thStyle}>Paste score</th>
                {onSimulateCandidate && <th style={thStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((candidate, index) => {
                const candidateKey = candidate.main.join(",");
                const isActiveSimulated = activeSimulatedKey === candidateKey;
                return (
                  <tr key={candidateKey}>
                    <td style={tdStyle}>{index + 1}</td>
                    <td style={tdStyle}>{candidate.main.join(", ")}</td>
                    <td style={tdStyle}>{candidate.score?.toFixed(0) ?? ""}</td>
                    {onSimulateCandidate && (
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => onSimulateCandidate(candidate.main)}
                          style={{
                            padding: "4px 9px",
                            borderRadius: 6,
                            border: isActiveSimulated ? "1px solid #1976d2" : "1px solid #cbd5e1",
                            background: isActiveSimulated ? "#1976d2" : "#fff",
                            color: isActiveSimulated ? "#fff" : "#334155",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {isActiveSimulated ? "Simulated" : "Simulate"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default PasteWeightedCandidatesPanel;
