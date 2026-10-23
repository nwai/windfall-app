import React from "react";
import type { MlndCalibratedAnalysis } from "../lib/mlndCalibration";
import {
  MLND_CALIBRATION_MAX_GAP, MLND_CALIBRATION_MIN_EVALUATION, MLND_CALIBRATION_PRIOR_WEIGHT,
  MLND_CALIBRATION_WARMUP, selectMlndCalibrationBudget,
} from "../lib/mlndCalibration";
import { HigButton } from "./shared/HigControls";
import { InlineCollapsibleCard } from "./shared/InlineCollapsibleCard";

const rate = (value: number | null) => value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const score = (value: number | null) => value == null ? "n/a" : value.toFixed(5);
const signed = (value: number | null) => value == null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(5)}`;
const fine: React.CSSProperties = { fontSize: 12, color: "#475569", lineHeight: 1.5 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" };
const cell: React.CSSProperties = { textAlign: "right", padding: "7px 9px", borderBottom: "1px solid #e2e8f0" };
const left: React.CSSProperties = { ...cell, textAlign: "left" };

export const MlndCalibrationAudit: React.FC<{ analysis: MlndCalibratedAnalysis; budget: number }> = ({ analysis, budget }) => {
  const selection = selectMlndCalibrationBudget(analysis, budget);
  const current = analysis.rows.map(row => row.adjustedRisk).filter((value): value is number => value != null);
  const groups = new Set(current.map(value => value.toFixed(12))).size;
  const title = analysis.status === "corrected-no-edge" ? "Reliability improved; no exclusion advantage"
    : analysis.status === "supported" ? "Historical calibration support; budget checks still apply"
      : analysis.status === "unproven" ? "Correction not yet supported" : "Calibration is learning";
  const exportAudit = () => {
    const blob = new Blob([JSON.stringify({ analysis, selection }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `windfall-${analysis.version}-${analysis.scope}-${analysis.asOfDate}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="MLND sequential calibration" style={{ display: "grid", gap: 10, minWidth: 0 }}>
    <div role="status" style={{ padding: "10px 12px", border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", color: "#143b64", display: "grid", gap: 5 }}>
      <strong>{title}</strong>
      <div style={fine}>{analysis.statusReason}</div>
      <div style={fine}>
        {groups === 1 ? `All 45 numbers currently share the same adjusted risk: ${rate(current[0])}. No safest-number ranking is manufactured.`
          : groups ? `${groups} distinct adjusted risk groups. Numbers within each group are tied.`
            : `${analysis.calibrationDraws}/${MLND_CALIBRATION_WARMUP} earlier scored forecasts available for the current correction.`}
      </div>
      <div style={fine}><strong>Calibrated exclusions at budget {selection.budget}:</strong>{" "}
        {selection.supported ? selection.calibratedExcluded.join(", ") : "None supported"}. {selection.reason !== analysis.statusReason ? selection.reason : ""}
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
      {[
        ["Later evaluation draws", String(analysis.evaluationDraws)],
        ["Raw Brier", score(analysis.rawBrier)], ["Adjusted Brier", score(analysis.adjustedBrier)],
        ["Neutral Brier", score(analysis.neutralBrier)], ["Reliability gap", analysis.calibrationGap == null ? "n/a" : `${(analysis.calibrationGap * 100).toFixed(2)}pp`],
      ].map(([label, value]) => <div key={label} style={{ minWidth: 0 }}><div style={fine}>{label}</div><strong style={{ fontSize: 19, fontVariantNumeric: "tabular-nums" }}>{value}</strong></div>)}
    </div>
    <InlineCollapsibleCard id="mlnd-calibration-audit" title="Sequential calibration audit" subtitle={`${analysis.version} · prior-only real draw outcomes`}>
      <div style={{ display: "grid", gap: 12, padding: 10, minWidth: 0 }}>
        <div style={fine}>
          Lower Brier is better. Raw, adjusted and neutral scores above use the same {analysis.evaluationDraws} targets, after {analysis.minTrainingDraws} initial training draws and {MLND_CALIBRATION_WARMUP} earlier out-of-sample forecasts for fitting the correction.
          Each target is forecast before its outcome can update the next correction. WFMQYH is ignored; this remains observe-only.
        </div>
        <div style={fine}>
          <strong>Fixed method:</strong> five raw-score bands, monotone pooled-adjacent-violators fitting, neutral prior weight {MLND_CALIBRATION_PRIOR_WEIGHT} per band, and a common odds adjustment so the 45 estimates sum to {analysis.scope === "mains" ? 6 : 8}.
          The prior is regularisation, not {MLND_CALIBRATION_PRIOR_WEIGHT} real or simulated observations. No coefficients are chosen to match a known target draw.
        </div>
        <div style={fine}>
          <strong>Evidence gates:</strong> at least {MLND_CALIBRATION_MIN_EVALUATION} later target draws, improvement over raw scores in both chronological halves with a positive approximate 95% draw-level interval, and a weighted raw-band reliability gap no greater than {MLND_CALIBRATION_MAX_GAP * 100}pp.
          Exclusion recommendations additionally require improvement over neutral risk and support at the chosen budget, without splitting tied groups.
          Historical replay is not independent prospective confirmation: this version was designed after examining existing history. The intervals use six-lag draw-level Newey-West estimates, not 45 independent trials per draw, and are unadjusted exploratory comparisons.
        </div>
        <div style={fine}>
          <strong>Evidence quality:</strong> {Object.entries(analysis.ignored).map(([label, count]) => `${label}: ${count}`).join(" · ")}. Gaps reset training and calibration; ambiguous duplicate dates are excluded in full.
          Current continuous training: {analysis.currentTrainingDraws} draws. Calibration training: {analysis.calibrationDraws} earlier real forecasts.
        </div>
        <div style={{ overflow: "auto", maxHeight: 300, minWidth: 0 }}>
          <table style={table}><caption style={{ ...fine, textAlign: "left", paddingBottom: 6 }}>Reliability by original raw-score band · later evaluation draws only</caption>
            <thead><tr>{["Raw band", "Number states", "Target draws", "Raw mean", "Adjusted mean", "Actually drawn"].map((label, index) => <th key={label} style={index ? cell : left}>{label}</th>)}</tr></thead>
            <tbody>{analysis.reliability.map(row => <tr key={row.lower}>
              <td style={left}>{rate(row.lower)} to {rate(row.upper)}</td><td style={cell}>{row.cases}</td><td style={cell}>{row.draws}</td>
              <td style={cell}>{rate(row.rawMean)}</td><td style={cell}>{rate(row.adjustedMean)}</td><td style={cell}>{rate(row.observed)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={fine}>
          <strong>Brier improvement versus raw:</strong> {signed(analysis.improvementVsRaw.mean)}; 95% interval {analysis.improvementVsRaw.interval95?.map(signed).join(" to ") ?? "n/a"}.{" "}
          <strong>Versus neutral:</strong> {signed(analysis.improvementVsNeutral.mean)}; 95% interval {analysis.improvementVsNeutral.interval95?.map(signed).join(" to ") ?? "n/a"}.
        </div>
        <div style={{ overflow: "auto", maxHeight: 300, minWidth: 0 }}>
          <table style={table}><caption style={{ ...fine, textAlign: "left", paddingBottom: 6 }}>Latest target decisions · newest first</caption>
            <thead><tr>{["Target", "Training through", "Prior calibration draws", "Raw Brier", "Adjusted Brier", "Neutral Brier"].map((label, index) => <th key={label} style={index < 2 ? left : cell}>{label}</th>)}</tr></thead>
            <tbody>{analysis.records.slice(-20).reverse().map(row => <tr key={row.date}>
              <td style={left}>{row.date}</td><td style={left}>{row.trainingThrough}</td><td style={cell}>{row.calibrationDrawsBefore}</td>
              <td style={cell}>{score(row.rawBrier)}</td><td style={cell}>{score(row.adjustedBrier)}</td><td style={cell}>{score(row.neutralBrier)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <HigButton size="compact" variant="secondary" onClick={exportAudit}>Export calibration audit</HigButton>
      </div>
    </InlineCollapsibleCard>
  </section>;
};
