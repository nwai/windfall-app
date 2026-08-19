import React, { useMemo, useState } from "react";

import type { CandidateSet, Draw } from "../types";
import {
  runSettingsSensitivityReplay,
  type SettingsReplayScore,
  type SettingsSensitivityReplayResult,
} from "../lib/settingsSensitivityReplay";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";

interface SettingsSensitivityReplayPanelProps {
  history: Draw[];
  activeHistory?: Draw[];
  generatedCandidates?: CandidateSet[];
  pasteWeightedCandidates?: CandidateSet[];
  historyScopeLabel?: string;
  initialTargetText?: string;
  copyText?: (text: string) => void | Promise<void>;
}

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.34)",
  borderRadius: 12,
  background: "rgba(255, 255, 255, 0.9)",
  padding: 12,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const tableWrapStyle: React.CSSProperties = {
  overflow: "auto",
  maxHeight: 360,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 10,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 860,
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  padding: "8px 10px",
  background: "#f8fafc",
  color: "#334155",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid rgba(226, 232, 240, 0.78)",
  color: "#0f172a",
  verticalAlign: "top",
};

const compactActionThStyle: React.CSSProperties = {
  ...thStyle,
  width: 76,
  minWidth: 76,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const compactActionTdStyle: React.CSSProperties = {
  ...tdStyle,
  width: 76,
  minWidth: 76,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const compactRowButtonStyle: React.CSSProperties = {
  minHeight: 24,
  padding: "2px 7px",
  fontSize: 11,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

const quietTextStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  borderRadius: 999,
  padding: "2px 8px",
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "#f8fafc",
  fontWeight: 800,
  fontSize: 12,
};

const numberPillStyle = (hit: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 24,
  height: 24,
  borderRadius: 999,
  marginRight: 4,
  marginBottom: 4,
  border: hit ? "1px solid #be123c" : "1px solid #cbd5e1",
  background: hit ? "#ffe4ec" : "#fff",
  color: hit ? "#9f1239" : "#334155",
  fontWeight: 800,
});

const formatNumbers = (numbers: readonly number[]): string => numbers.join(", ");

const writeTextToClipboard = async (
  text: string,
  copyText?: (text: string) => void | Promise<void>,
): Promise<void> => {
  if (copyText) {
    await copyText(text);
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard unavailable");
};

const divisionTone = (division: SettingsReplayScore["division"]): React.CSSProperties => {
  if (division === "Div1" || division === "Div2") {
    return { ...pillStyle, color: "#9f1239", background: "#ffe4ec", borderColor: "#f9a8d4" };
  }
  if (division === "Div3" || division === "Div4" || division === "Div5" || division === "Div6") {
    return { ...pillStyle, color: "#166534", background: "#dcfce7", borderColor: "#86efac" };
  }
  return { ...pillStyle, color: "#64748b" };
};

const shapeText = (row: SettingsReplayScore): string => (
  `OE ${row.oddEvenDelta} · LH ${row.lowHighDelta} · Sum ${row.sumDelta} · Term ${row.terminalDigitOverlap}`
);

const renderNumberPills = (row: SettingsReplayScore, targetNumbers: readonly number[]) => {
  const targetSet = new Set(targetNumbers);
  return row.selection.map((number) => (
    <span key={`${row.label}-${number}`} style={numberPillStyle(targetSet.has(number))}>
      {number}
    </span>
  ));
};

const ResultMetric: React.FC<{ label: string; value: React.ReactNode; detail?: React.ReactNode }> = ({ label, value, detail }) => (
  <div style={cardStyle}>
    <div style={{ ...quietTextStyle, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0 }}>
      {label}
    </div>
    <div style={{ marginTop: 3, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
      {value}
    </div>
    {detail ? <div style={{ ...quietTextStyle, marginTop: 3 }}>{detail}</div> : null}
  </div>
);

const ReplayTable: React.FC<{
  title: string;
  rows: SettingsReplayScore[];
  targetNumbers: number[];
  emptyText: string;
  showRationale?: boolean;
  onCopySelection?: (row: SettingsReplayScore) => void;
}> = ({ title, rows, targetNumbers, emptyText, showRationale = false, onCopySelection }) => (
  <section style={cardStyle}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      <h4 style={{ margin: 0, color: "#0f172a", fontSize: 14 }}>{title}</h4>
      <span style={quietTextStyle}>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
    </div>
    {rows.length ? (
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Profile / Row</th>
              <th style={thStyle}>Selection</th>
              <th style={thStyle}>Prize</th>
              <th style={thStyle}>Hits</th>
              <th style={thStyle}>Shape distance</th>
              <th style={thStyle}>Replay score</th>
              {onCopySelection ? <th style={compactActionThStyle}>Copy</th> : null}
              {showRationale ? <th style={thStyle}>Rationale</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.source}-${row.label}-${index}`}>
                <td style={tdStyle}>{index + 1}</td>
                <td style={{ ...tdStyle, fontWeight: 800 }}>{row.label}</td>
                <td style={tdStyle}>{renderNumberPills(row, targetNumbers)}</td>
                <td style={tdStyle}><span style={divisionTone(row.division)}>{row.division}</span></td>
                <td style={tdStyle}>{row.totalHits}/8 · M{row.mainHits} S{row.suppHits}</td>
                <td style={tdStyle}>{shapeText(row)}</td>
                <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{Math.round(row.replayScore)}</td>
                {onCopySelection ? (
                  <td style={compactActionTdStyle}>
                    <HigButton
                      size="compact"
                      variant="secondary"
                      onClick={() => onCopySelection(row)}
                      aria-label={`Copy ${row.label} replay selection`}
                      style={compactRowButtonStyle}
                    >
                      Copy row
                    </HigButton>
                  </td>
                ) : null}
                {showRationale ? <td style={{ ...tdStyle, color: "#475569", minWidth: 220 }}>{row.rationale ?? "Current candidate row."}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div style={{ ...quietTextStyle, border: "1px dashed #cbd5e1", borderRadius: 10, padding: 12 }}>
        {emptyText}
      </div>
    )}
  </section>
);

export const SettingsSensitivityReplayPanel: React.FC<SettingsSensitivityReplayPanelProps> = ({
  history,
  activeHistory,
  generatedCandidates = [],
  pasteWeightedCandidates = [],
  historyScopeLabel,
  initialTargetText = "",
  copyText,
}) => {
  const [targetText, setTargetText] = useState(initialTargetText);
  const [runTargetText, setRunTargetText] = useState(initialTargetText);
  const [copyStatus, setCopyStatus] = useState<string>("");

  const result = useMemo<SettingsSensitivityReplayResult | null>(() => {
    if (!runTargetText.trim()) return null;
    return runSettingsSensitivityReplay({
      targetInput: runTargetText,
      history,
      activeHistory,
      generatedCandidates,
      pasteWeightedCandidates,
      historyScopeLabel,
    });
  }, [activeHistory, generatedCandidates, history, historyScopeLabel, pasteWeightedCandidates, runTargetText]);

  const handleRun = () => {
    setRunTargetText(targetText);
  };

  const handleClear = () => {
    setTargetText("");
    setRunTargetText("");
    setCopyStatus("");
  };

  const handleCopyProfileSelection = async (row: SettingsReplayScore) => {
    try {
      await writeTextToClipboard(formatNumbers(row.selection), copyText);
      setCopyStatus(`Copied ${row.label} selection.`);
    } catch (error) {
      setCopyStatus(`Copy failed: ${error instanceof Error ? error.message : "clipboard unavailable"}.`);
    }
  };

  const targetNumbers = result?.target.numbers ?? [];
  const bestProfile = result?.bestProfile;
  const bestCandidate = result?.bestCandidate;

  return (
    <section aria-label="Settings Sensitivity Replay" style={panelStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>Settings Sensitivity Replay</h3>
              <InfoHelp label="Settings Sensitivity Replay help">
                Retrospective scoring only. The target draw is used after the fact to compare pre-registered profiles and current candidate rows. It does not alter generation settings or prove future predictive power.
              </InfoHelp>
            </div>
            <p style={{ ...quietTextStyle, margin: "4px 0 0" }}>
              Paste a known 8-number draw, run a replay, and compare profile rows plus current candidate rows against the target. This is a lab for learning which evidence aligned, not a promise of the next draw.
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}>
            Observe-only
          </span>
        </div>
      </div>

      <div style={{ ...cardStyle, display: "grid", gap: 10 }}>
        <HigField
          label="Target draw numbers"
          help="Enter exactly 8 unique numbers. For prize scoring, the first 6 are treated as drawn mains and the final 2 as drawn supplementaries."
          error={result && !result.target.valid ? result.target.warnings[0] : undefined}
        >
          <textarea
            value={targetText}
            onChange={(event) => setTargetText(event.target.value)}
            rows={3}
            aria-label="Settings replay target draw numbers"
            placeholder="Paste 8 numbers separated by commas, spaces, or line breaks"
            style={{
              width: "100%",
              resize: "vertical",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              padding: 10,
              font: "inherit",
              minHeight: 72,
            }}
          />
        </HigField>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <HigButton variant="primary" onClick={handleRun}>Run replay</HigButton>
          <HigButton variant="quiet" onClick={handleClear}>Clear</HigButton>
          <span style={quietTextStyle}>
            History slice: {historyScopeLabel ?? `${activeHistory?.length ?? history.length} active real draws`}
          </span>
        </div>
      </div>

      {!result ? (
        <div style={{ ...cardStyle, color: "#64748b", fontSize: 13 }}>
          No replay has been run yet. Paste a target draw to compare current candidates and pre-registered evidence profiles.
        </div>
      ) : (
        <>
          {result.warnings.length ? (
            <div style={{ ...cardStyle, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e", fontSize: 12, lineHeight: 1.45 }}>
              {result.warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          ) : null}

          {result.target.valid ? (
            <>
              <div style={gridStyle}>
                <ResultMetric
                  label="Target"
                  value={formatNumbers(result.target.numbers)}
                  detail={`Mains ${formatNumbers(result.target.main)} · Supps ${formatNumbers(result.target.supp)}`}
                />
                <ResultMetric
                  label="Best profile"
                  value={bestProfile ? `${bestProfile.totalHits}/8` : "none"}
                  detail={bestProfile ? `${bestProfile.label} · ${bestProfile.division}` : "No profile rows available"}
                />
                <ResultMetric
                  label="Best current candidate"
                  value={bestCandidate ? `${bestCandidate.totalHits}/8` : "none"}
                  detail={bestCandidate ? `${bestCandidate.label} · ${bestCandidate.division}` : "Generate candidates first to score this section"}
                />
              </div>

              <ReplayTable
                title="Pre-Registered Profile Replay"
                rows={result.profileRows}
                targetNumbers={targetNumbers}
                emptyText="No real draw history was available for profile replay."
                showRationale
                onCopySelection={handleCopyProfileSelection}
              />

              {copyStatus ? (
                <div
                  aria-live="polite"
                  style={{ ...quietTextStyle, marginTop: -6, paddingLeft: 2 }}
                >
                  {copyStatus}
                </div>
              ) : null}

              <ReplayTable
                title="Current Candidate Replay"
                rows={result.candidateRows}
                targetNumbers={targetNumbers}
                emptyText="No generated or paste-weighted candidate rows are currently available to score."
              />

              <section style={cardStyle}>
                <h4 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 14 }}>Methodology</h4>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", fontSize: 12, lineHeight: 1.5 }}>
                  {result.methodology.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            </>
          ) : null}
        </>
      )}
    </section>
  );
};

export default SettingsSensitivityReplayPanel;
