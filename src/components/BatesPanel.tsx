import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BATES_PARAMETERS,
  computeBatesWeights,
  normalizeBatesParameters,
  type BatesParameterSet,
} from "../lib/batesWeightsCore";
import { assessBatesGuardrails } from "../lib/batesGuardrails";
import { buildBatesCandidate, uniqueValidNumbers, type BatesCandidate } from "../lib/batesCandidate";
import { showToast } from "../lib/toastBus";
import { computeBatesDiagnostics, type BatesDiagnostics } from "../lib/batesDiagnostics";

interface BatesPanelProps {
  excludedNumbers: number[];
  forcedNumbers: number[];
  recentSignal?: number[] | null;
  conditionalProb?: number[] | null;
  onGenerate?: (candidate: { main: number[]; supp: number[]; weights: number[] }) => void;
  onParamsChange?: (params: Partial<BatesParameterSet>) => void;
  controlledParams?: Partial<BatesParameterSet>;
  probabilityOverlay?: {
    pAtLeastRaw: number;
    pAtLeastWeighted: number;
    targetRaw: number;
    targetWeighted: number;
  } | null;
  onDiagnostics?: (diagnostics: BatesDiagnostics) => void;
}

type NumericParamKey =
  | "k"
  | "triMode"
  | "triMode2"
  | "dualTriWeightA"
  | "mixWeight"
  | "betaHot"
  | "betaCold"
  | "betaGlobal"
  | "gammaConditional"
  | "hotQuantile"
  | "coldQuantile";

export const BatesPanel: React.FC<BatesPanelProps> = ({
  excludedNumbers,
  forcedNumbers,
  recentSignal,
  conditionalProb,
  onGenerate,
  onParamsChange,
  controlledParams,
  probabilityOverlay,
  onDiagnostics,
}) => {
  const [params, setParams] = useState<BatesParameterSet>(DEFAULT_BATES_PARAMETERS);
  const [lastCandidate, setLastCandidate] = useState<BatesCandidate | null>(null);
  const [generationError, setGenerationError] = useState<string>("");

  useEffect(() => {
    if (!controlledParams) return;
    setParams((prev) => normalizeBatesParameters({ ...prev, ...controlledParams }));
  }, [controlledParams]);

  const weightsResult = useMemo(
    () =>
      computeBatesWeights(params, {
        recentSignal: recentSignal ?? undefined,
        conditionalProb: conditionalProb ?? undefined,
      }),
    [params, recentSignal, conditionalProb],
  );
  const activeParams = weightsResult.normalizedParams;
  const guardrail = useMemo(() => assessBatesGuardrails(activeParams), [activeParams]);
  const forced = useMemo(() => uniqueValidNumbers(forcedNumbers), [forcedNumbers]);
  const excluded = useMemo(() => new Set(uniqueValidNumbers(excludedNumbers)), [excludedNumbers]);
  const availablePoolCount = useMemo(() => {
    const forcedSet = new Set(forced);
    let count = forced.length;
    for (let number = 1; number <= 45; number += 1) {
      if (!excluded.has(number) && !forcedSet.has(number)) count += 1;
    }
    return count;
  }, [excluded, forced]);
  const candidateIssue = forced.length > 8
    ? `Only 8 forced numbers can fit in one Bates ticket; ${forced.length} are selected.`
    : availablePoolCount < 8
      ? `Only ${availablePoolCount} eligible numbers are available; 8 are required.`
      : "";
  const topWeights = useMemo(
    () => weightsResult.finalWeights
      .map((weight, index) => ({ number: index + 1, weight }))
      .sort((a, b) => b.weight - a.weight || a.number - b.number)
      .slice(0, 8),
    [weightsResult.finalWeights],
  );
  const effectiveNumbers = useMemo(() => {
    const sumSquares = weightsResult.finalWeights.reduce((sum, weight) => sum + weight * weight, 0);
    return sumSquares > 0 ? 1 / sumSquares : 0;
  }, [weightsResult.finalWeights]);

  useEffect(() => {
    if (!onDiagnostics) return;
    onDiagnostics(computeBatesDiagnostics(activeParams, weightsResult.finalWeights, {
      recentSignal: recentSignal ?? null,
      conditionalProb: conditionalProb ?? null,
    }));
  }, [activeParams, conditionalProb, onDiagnostics, recentSignal, weightsResult.finalWeights]);

  function updateParam<K extends NumericParamKey>(key: K, value: number) {
    setParams((prev) => {
      const next = normalizeBatesParameters({ ...prev, [key]: value });
      onParamsChange?.(next);
      return next;
    });
  }

  function updateBoolean<K extends "dualTri" | "highlightHotCold">(key: K, value: boolean) {
    setParams((prev) => {
      const next = normalizeBatesParameters({ ...prev, [key]: value });
      onParamsChange?.(next);
      return next;
    });
  }

  function handleGenerate() {
    const result = buildBatesCandidate({
      weights: weightsResult.finalWeights,
      forcedNumbers,
      excludedNumbers,
    });
    if (!result.ok) {
      setGenerationError(result.reason);
      showToast(`Bates generation blocked: ${result.reason}`);
      return;
    }

    setGenerationError("");
    setLastCandidate(result.candidate);
    onGenerate?.({
      main: result.candidate.main,
      supp: result.candidate.supp,
      weights: weightsResult.finalWeights,
    });
    showToast("Bates candidate generated");
  }

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <h3 style={title}>Bates Weighting Panel</h3>
          <p style={subtitle}>
            Weighted sampling from the current historical signals. It describes the configured distribution; it does not predict future draws.
          </p>
        </div>
        <button type="button" onClick={handleGenerate} disabled={!!candidateIssue} style={buttonStyle(!!candidateIssue)}>
          Generate
        </button>
      </div>

      <div style={metricGrid}>
        <Metric label="Shape" value={activeParams.dualTri ? "Dual triangular + Bates" : "Triangular + Bates"} />
        <Metric label="Effective numbers" value={effectiveNumbers.toFixed(1)} />
        <Metric label="Eligible pool" value={`${availablePoolCount}/45`} />
        <Metric label="Top weight" value={topWeights[0] ? `${topWeights[0].number} (${formatPercent(topWeights[0].weight)})` : "none"} />
      </div>

      {probabilityOverlay && (
        <div style={infoBox}>
          Search overlay: P(raw {"\u003e="} {probabilityOverlay.targetRaw}) {formatPercent(probabilityOverlay.pAtLeastRaw)}; P(weighted {"\u003e="} {probabilityOverlay.targetWeighted.toFixed(2)}) {formatPercent(probabilityOverlay.pAtLeastWeighted)}
        </div>
      )}

      {(candidateIssue || generationError || guardrail.warnings.length > 0) && (
        <div style={calloutStyle(guardrail.severity, !!candidateIssue || !!generationError)}>
          {candidateIssue || generationError || guardrail.warnings.join(" ")}
        </div>
      )}

      <div style={controlsGrid}>
        <section style={controlGroup}>
          <h4 style={groupTitle}>Distribution</h4>
          <div style={fieldGrid}>
            <NumberField label="Bates k" value={activeParams.k} min={1} max={60} step={1} onChange={(value) => updateParam("k", value)} />
            <NumberField label="Mix tri" value={activeParams.mixWeight} min={0} max={1} step={0.05} onChange={(value) => updateParam("mixWeight", value)} />
            <ToggleField label="Dual tri" checked={activeParams.dualTri} onChange={(checked) => updateBoolean("dualTri", checked)} />
            <NumberField label={activeParams.dualTri ? "Mode A" : "Mode"} value={activeParams.triMode} min={0} max={1} step={0.01} onChange={(value) => updateParam("triMode", value)} />
            {activeParams.dualTri && (
              <>
                <NumberField label="Mode B" value={activeParams.triMode2} min={0} max={1} step={0.01} onChange={(value) => updateParam("triMode2", value)} />
                <NumberField label="A weight" value={activeParams.dualTriWeightA} min={0} max={1} step={0.05} onChange={(value) => updateParam("dualTriWeightA", value)} />
              </>
            )}
          </div>
        </section>

        <section style={controlGroup}>
          <h4 style={groupTitle}>Modulation</h4>
          <div style={fieldGrid}>
            <NumberField label="Hot beta" value={activeParams.betaHot} min={0} max={3} step={0.05} onChange={(value) => updateParam("betaHot", value)} />
            <NumberField label="Cold beta" value={activeParams.betaCold} min={0} max={3} step={0.05} onChange={(value) => updateParam("betaCold", value)} />
            <NumberField label="Global beta" value={activeParams.betaGlobal} min={0} max={2} step={0.05} onChange={(value) => updateParam("betaGlobal", value)} />
            <NumberField label="Conditional gamma" value={activeParams.gammaConditional} min={0} max={3} step={0.05} onChange={(value) => updateParam("gammaConditional", value)} />
            <NumberField label="Hot q" value={activeParams.hotQuantile} min={0.5} max={0.95} step={0.01} onChange={(value) => updateParam("hotQuantile", value)} />
            <NumberField label="Cold q" value={activeParams.coldQuantile} min={0.05} max={0.5} step={0.01} onChange={(value) => updateParam("coldQuantile", value)} />
            <ToggleField label="Hot/cold sets" checked={activeParams.highlightHotCold} onChange={(checked) => updateBoolean("highlightHotCold", checked)} />
          </div>
        </section>
      </div>

      <section style={weightStrip}>
        <div style={stripLabel}>Top weighted numbers</div>
        <div style={weightGrid}>
          {topWeights.map(({ number, weight }) => (
            <div key={number} style={weightItem}>
              <b>{number}</b>
              <span>{formatPercent(weight)}</span>
            </div>
          ))}
        </div>
      </section>

      {lastCandidate && (
        <div style={candidateBox}>
          <b>Last candidate</b>
          <span>Main [{lastCandidate.main.join(", ")}]</span>
          <span>Supp [{lastCandidate.supp.join(", ")}]</span>
        </div>
      )}
    </section>
  );
};

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, min, max, step, onChange }: NumberFieldProps): JSX.Element {
  return (
    <label style={field}>
      <span>{label}</span>
      <input
        type="number"
        value={formatInputValue(value)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={input}
      />
    </label>
  );
}

interface ToggleFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleField({ label, checked, onChange }: ToggleFieldProps): JSX.Element {
  return (
    <label style={toggleField}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={metric}>
      <span style={metricLabel}>{label}</span>
      <b style={metricValue}>{value}</b>
    </div>
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatInputValue(value: number): number | string {
  return Number.isInteger(value) ? value : Number(value.toFixed(4));
}

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 34,
    padding: "6px 14px",
    border: `1px solid ${disabled ? "#cbd5e1" : "#1d4ed8"}`,
    borderRadius: 6,
    background: disabled ? "#f1f5f9" : "#2563eb",
    color: disabled ? "#94a3b8" : "#fff",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  };
}

function calloutStyle(severity: "ok" | "caution" | "risk", hardBlock: boolean): React.CSSProperties {
  if (hardBlock || severity === "risk") {
    return { ...callout, borderColor: "#fecaca", background: "#fff1f2", color: "#991b1b" };
  }
  if (severity === "caution") {
    return { ...callout, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" };
  }
  return { ...callout, borderColor: "#bfdbfe", background: "#eff6ff", color: "#1e3a8a" };
}

const panel: React.CSSProperties = {
  display: "grid",
  gap: 12,
  border: "1px solid #dbe3ef",
  borderRadius: 6,
  padding: 14,
  background: "#fff",
  marginTop: 12,
  color: "#111827",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: 12,
  flexWrap: "wrap",
};
const title: React.CSSProperties = { margin: 0, fontSize: 17, lineHeight: 1.2 };
const subtitle: React.CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.4 };
const metricGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
};
const metric: React.CSSProperties = {
  display: "grid",
  gap: 3,
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "8px 10px",
  background: "#f8fafc",
};
const metricLabel: React.CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase" };
const metricValue: React.CSSProperties = { color: "#0f172a", fontSize: 14 };
const infoBox: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  padding: "7px 9px",
  background: "#eff6ff",
  color: "#1e3a8a",
  fontSize: 12,
};
const callout: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 12,
  lineHeight: 1.35,
};
const controlsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 10,
};
const controlGroup: React.CSSProperties = {
  display: "grid",
  gap: 8,
  alignContent: "start",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: 10,
};
const groupTitle: React.CSSProperties = { margin: 0, fontSize: 13, color: "#334155" };
const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
  alignItems: "end",
  alignContent: "start",
};
const field: React.CSSProperties = { display: "grid", gap: 4, color: "#475569", fontSize: 12, fontWeight: 650 };
const toggleField: React.CSSProperties = {
  display: "inline-flex",
  gap: 6,
  alignItems: "center",
  minHeight: 52,
  color: "#475569",
  fontSize: 12,
  fontWeight: 650,
};
const input: React.CSSProperties = {
  width: "100%",
  minHeight: 30,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "4px 7px",
  boxSizing: "border-box",
};
const weightStrip: React.CSSProperties = { display: "grid", gap: 6 };
const stripLabel: React.CSSProperties = { color: "#475569", fontSize: 12, fontWeight: 750 };
const weightGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(82px, 1fr))",
  gap: 6,
};
const weightItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "5px 7px",
  fontSize: 12,
  background: "#fff",
};
const candidateBox: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  border: "1px solid #bbf7d0",
  borderRadius: 6,
  padding: "8px 10px",
  background: "#f0fdf4",
  color: "#14532d",
  fontSize: 12,
};
