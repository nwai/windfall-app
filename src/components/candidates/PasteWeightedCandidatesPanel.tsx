import React, { useMemo, useState } from "react";
import type { Draw } from "../../types";
import { buildAdaptiveShapeEvidence } from "../../lib/adaptiveCandidateShapes";
import {
  generatePasteWeightedCandidates,
  parsePastedCandidateNumbers,
  type PasteWeightedGenerationResult,
  type PasteWeightedCandidateConstraintMode,
} from "../../lib/pasteWeightedCandidates";

interface PasteWeightedCandidatesPanelProps {
  onSimulateCandidate?: (numbers: number[]) => void;
  activeSimulatedKey?: string | null;
  initialPasteText?: string;
  initialCandidateCount?: number;
  fullHistory?: Draw[];
  activeHistory?: Draw[];
  activeWindowLabel?: string;
}

const candidateCountOptions = Array.from({ length: 27 }, (_, index) => index + 4);

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

export const PasteWeightedCandidatesPanel: React.FC<PasteWeightedCandidatesPanelProps> = ({
  onSimulateCandidate,
  activeSimulatedKey = null,
  initialPasteText = "",
  initialCandidateCount = 12,
  fullHistory = [],
  activeHistory = [],
  activeWindowLabel = "WFMQYH",
}) => {
  const [pasteText, setPasteText] = useState(initialPasteText);
  const [candidateCount, setCandidateCount] = useState(initialCandidateCount);
  const [ending5Mode, setEnding5Mode] = useState<PasteWeightedCandidateConstraintMode>("any");
  const [ending0Mode, setEnding0Mode] = useState<PasteWeightedCandidateConstraintMode>("any");
  const [oddEvenEnabled, setOddEvenEnabled] = useState(false);
  const [selectedOddEvenRatios, setSelectedOddEvenRatios] = useState<string[]>([]);
  const [adaptiveShapeEnabled, setAdaptiveShapeEnabled] = useState(false);
  const [adaptiveShapeMode, setAdaptiveShapeMode] = useState<"observe" | "quota">("observe");
  const [result, setResult] = useState<PasteWeightedGenerationResult | null>(null);

  const parsed = useMemo(() => parsePastedCandidateNumbers(pasteText), [pasteText]);
  const adaptiveShapeEvidence = useMemo(() => (
    fullHistory.length > 0
      ? buildAdaptiveShapeEvidence({ fullHistory, activeHistory, shrinkTargetSize: 50 })
      : null
  ), [fullHistory, activeHistory]);
  const countsForDisplay = parsed.counts;
  const oddEvenRatioOptions = parsed.oddEvenRatios;
  const adaptiveShapeProfiles = adaptiveShapeEvidence?.profileOptions ?? [];
  const adaptiveShapeProfileRows = adaptiveShapeProfiles.slice(0, 8);
  const availableOddEvenRatioSet = new Set(oddEvenRatioOptions.map((option) => option.ratio));
  const activeSelectedOddEvenRatios = selectedOddEvenRatios.filter((ratio) => availableOddEvenRatioSet.has(ratio));
  const maxCount = countsForDisplay[0]?.count ?? 0;
  const rowsWithIssues = parsed.rows.filter((row) => (
    row.numbers.length > 0
    && (!row.expectedSixNumbers || row.duplicateNumbers.length > 0 || row.outOfRangeNumbers.length > 0)
  ));
  const needsOddEvenSelection = oddEvenEnabled && activeSelectedOddEvenRatios.length === 0;
  const canGenerate = parsed.uniqueNumbers >= 6 && !needsOddEvenSelection;

  const handleGenerate = () => {
    setResult(generatePasteWeightedCandidates(pasteText, {
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
      },
    }));
  };

  const handleClear = () => {
    setPasteText("");
    setResult(null);
  };

  const updateEnding5Mode = (mode: PasteWeightedCandidateConstraintMode) => {
    setEnding5Mode(mode);
    setResult(null);
  };

  const updateEnding0Mode = (mode: PasteWeightedCandidateConstraintMode) => {
    setEnding0Mode(mode);
    setResult(null);
  };

  const updateOddEvenEnabled = (enabled: boolean) => {
    setOddEvenEnabled(enabled);
    if (enabled && activeSelectedOddEvenRatios.length === 0) {
      setSelectedOddEvenRatios(oddEvenRatioOptions.map((option) => option.ratio));
    }
    setResult(null);
  };

  const toggleOddEvenRatio = (ratio: string) => {
    setSelectedOddEvenRatios((current) => (
      current.includes(ratio)
        ? current.filter((item) => item !== ratio)
        : [...current, ratio]
    ));
    setResult(null);
  };

  const updateAdaptiveShapeEnabled = (enabled: boolean) => {
    setAdaptiveShapeEnabled(enabled);
    setResult(null);
  };

  const updateAdaptiveShapeMode = (mode: "observe" | "quota") => {
    setAdaptiveShapeMode(mode);
    setResult(null);
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

  return (
    <section className="windfall-ledger-panel" aria-label="Paste-Weighted Candidate Generator">
      <div style={headingStyle}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Paste-Weighted Candidate Generator</div>
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
            setResult(null);
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
          <div style={mutedStyle}>Invalid values</div>
          <div style={{ fontWeight: 800, color: parsed.invalidTokens.length ? "#b91c1c" : "#166534" }}>
            {parsed.invalidTokens.length}
          </div>
        </div>
      </div>

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

      {rowsWithIssues.length > 0 && (
        <div style={{ ...mutedStyle, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 8 }}>
          {rowsWithIssues.length} row{rowsWithIssues.length === 1 ? "" : "s"} need attention. Duplicate values are counted once per row; rows with fewer or more than six valid numbers are still used for weighting but marked as imperfect input.
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
                </div>
              </>
            ) : (
              <div style={mutedStyle}>Connects to WFMQYH history when draw history is available.</div>
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
          Clear
        </button>
        {!canGenerate && (
          <span style={mutedStyle}>
            {needsOddEvenSelection
              ? "Select at least one mains-only odd/even ratio."
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
