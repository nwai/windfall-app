import React, { useEffect, useMemo, useState } from "react";
import { computeBatesWeights, BatesParameterSet } from "../lib/batesWeightsCore";
import { weightedSampleWithoutReplacement } from "../lib/weightedSample";
import { assessBatesGuardrails } from "../lib/batesGuardrails";

interface BatesPanelProps {
  excludedNumbers: number[];
  forcedNumbers: number[];
  recentSignal?: number[];
  conditionalProb?: number[];
  onGenerate?: (c: { main: number[]; supp: number[]; weights: number[] }) => void;
  onParamsChange?: (p: BatesParameterSet) => void;
  controlledParams?: Partial<BatesParameterSet>;

  probabilityOverlay?: {
    pAtLeastRaw: number;
    pAtLeastWeighted: number;
    targetRaw: number;
    targetWeighted: number;
  } | null;
}

const defaults: BatesParameterSet = {
  k: 3,
  dualTri: false,
  triMode: 0.5,
  triMode2: 0.2,
  dualTriWeightA: 0.5,
  mixWeight: 0.5,
  betaHot: 0,
  betaCold: 0,
  betaGlobal: 0,
  gammaConditional: 0,
  hotQuantile: 0.7,
  coldQuantile: 0.3,
  highlightHotCold: true
};

export const BatesPanel: React.FC<BatesPanelProps> = ({
  excludedNumbers,
  forcedNumbers,
  recentSignal,
  conditionalProb,
  onGenerate,
  onParamsChange,
  controlledParams,
  probabilityOverlay
}) => {
  const [params, setParams] = useState<BatesParameterSet>(defaults);
  const [lastCandidate, setLastCandidate] = useState<{ main: number[]; supp: number[] } | null>(null);

  // Sync from outside
  useEffect(() => {
    if (controlledParams) {
      setParams(prev => ({ ...prev, ...controlledParams }));
    }
  }, [controlledParams]);

  function update<K extends keyof BatesParameterSet>(k: K, v: BatesParameterSet[K]) {
    setParams(prev => {
      const next = { ...prev, [k]: v };
      onParamsChange?.(next);
      return next;
    });
  }

  const weightsRes = useMemo(
    () => computeBatesWeights(params, { recentSignal, conditionalProb }),
    [params, recentSignal, conditionalProb]
  );

  const guardrail = assessBatesGuardrails(params);

  function handleGenerate() {
    const forcedMain = forcedNumbers.slice(0, 6);
    const forcedSupp = forcedNumbers.slice(6, 8);
    const pool = Array.from({ length: 45 }, (_, i) => i + 1)
      .filter(n => !excludedNumbers.includes(n) && !forcedNumbers.includes(n));
    const poolWeights = pool.map(n => weightsRes.finalWeights[n - 1]);

    const needMain = Math.max(0, 6 - forcedMain.length);
    const pickedMain = weightedSampleWithoutReplacement(pool, poolWeights, needMain);
    const remaining = pool.filter(n => !pickedMain.includes(n));
    const remainingWeights = remaining.map(n => weightsRes.finalWeights[n - 1]);
    const needSupp = Math.max(0, 2 - forcedSupp.length);
    const pickedSupp = weightedSampleWithoutReplacement(remaining, remainingWeights, needSupp);

    const main = [...forcedMain, ...pickedMain].slice(0, 6).sort((a, b) => a - b);
    const supp = [...forcedSupp, ...pickedSupp].slice(0, 2).sort((a, b) => a - b);
    setLastCandidate({ main, supp });
    onGenerate?.({ main, supp, weights: weightsRes.finalWeights });
  }

  const fmtProb = (p?: number) =>
    p === undefined ? "–" : (p * 100).toFixed(2) + "%";

  return (
    <section style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Bates / (Dual) Tri Sampler</h3>
        {probabilityOverlay && (
          <div style={probBox} title="Estimated probability from last parameter search">
            <b>P(≥{probabilityOverlay.targetRaw} raw):</b> {fmtProb(probabilityOverlay.pAtLeastRaw)} |{" "}
            <b>P(≥weighted {probabilityOverlay.targetWeighted.toFixed(2)}):</b>{" "}
            {fmtProb(probabilityOverlay.pAtLeastWeighted)}
          </div>
        )}
      </div>

      {guardrail.warnings.length > 0 && (
        <div
          style={{
            ...guardBox,
            borderColor: guardrail.severity === "risk" ? "#c62828" : "#e0a100",
            background:
              guardrail.severity === "risk"
                ? "#fdecea"
                : "#fff8e1",
            color: guardrail.severity === "risk" ? "#8b1d1d" : "#795c00"
          }}
        >
          <b>{guardrail.severity === "risk" ? "Parameter Risk:" : "Guardrails:"}</b>{" "}
          {guardrail.warnings.map((w, i) => (
            <span key={i} style={{ marginLeft: 6 }}>
              • {w}
            </span>
          ))}
        </div>
      )}

      <div style={row}>
        <label>k
          <input type="number" value={params.k} min={1} max={60}
            onChange={e => update("k", Math.max(1, Number(e.target.value) || 1))}
            style={inp} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={params.dualTri}
            onChange={e => update("dualTri", e.target.checked)}
            style={{ marginRight: 4 }}
          />
          Dual Tri
        </label>
        {!params.dualTri && (
          <label>Mode
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={params.triMode}
              onChange={e => update("triMode", clamp(0, 1, Number(e.target.value)))}
              style={inp}
            />
          </label>
        )}
        {params.dualTri && (
          <>
            <label>Mode A
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={params.triMode}
                onChange={e => update("triMode", clamp(0, 1, Number(e.target.value)))}
                style={inp}
              />
            </label>
            <label>Mode B
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={params.triMode2}
                onChange={e => update("triMode2", clamp(0, 1, Number(e.target.value)))}
                style={inp}
              />
            </label>
            <label>wA
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={params.dualTriWeightA}
                onChange={e => update("dualTriWeightA", clamp(0, 1, Number(e.target.value)))}
                style={inp}
              />
            </label>
          </>
        )}
        <label>Mix
          <input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={params.mixWeight}
            onChange={e => update("mixWeight", clamp(0, 1, Number(e.target.value)))}
            style={inp}
          />
        </label>
        <button type="button" onClick={handleGenerate} style={genBtn}>
          Generate
        </button>
      </div>

      <div style={row}>
        <label>βHot
          <input
            type="number"
            step={0.05}
            min={0}
            max={3}
            value={params.betaHot}
            onChange={e => update("betaHot", clamp(0, 3, Number(e.target.value)))}
            style={inp}
          />
        </label>
        <label>βCold
          <input
            type="number"
            step={0.05}
            min={0}
            max={3}
            value={params.betaCold}
            onChange={e => update("betaCold", clamp(0, 3, Number(e.target.value)))}
            style={inp}
          />
        </label>
        <label>βGlobal
          <input
            type="number"
            step={0.05}
            min={0}
            max={2}
            value={params.betaGlobal}
            onChange={e => update("betaGlobal", clamp(0, 2, Number(e.target.value)))}
            style={inp}
          />
        </label>
        <label>γCond
          <input
            type="number"
            step={0.05}
            min={0}
            max={3}
            value={params.gammaConditional}
            onChange={e => update("gammaConditional", clamp(0, 3, Number(e.target.value)))}
            style={inp}
          />
        </label>
        <label>Hot q
          <input
            type="number"
            step={0.01}
            min={0.5}
            max={0.95}
            value={params.hotQuantile}
            onChange={e => update("hotQuantile", clamp(0.5, 0.95, Number(e.target.value)))}
            style={inp}
          />
        </label>
        <label>Cold q
          <input
            type="number"
            step={0.01}
            min={0.05}
            max={0.5}
            value={params.coldQuantile}
            onChange={e => update("coldQuantile", clamp(0.05, 0.5, Number(e.target.value)))}
            style={inp}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={params.highlightHotCold}
            onChange={e => update("highlightHotCold", e.target.checked)}
            style={{ marginRight: 4 }}
          />
          Hot/Cold
        </label>
      </div>

      {lastCandidate && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          <b>Last Candidate:</b> Main [{lastCandidate.main.join(", ")}] Supp [{lastCandidate.supp.join(", ")}]
        </div>
      )}
    </section>
  );
};

function clamp(min: number, max: number, v: number) {
  return Math.min(max, Math.max(min, v));
}

const panel: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
  marginTop: 18
};
const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-end",
  marginBottom: 10,
  fontSize: 13
};
const inp: React.CSSProperties = { marginLeft: 6, width: 70 };
const genBtn: React.CSSProperties = {
  padding: "6px 14px",
  background: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer"
};
const probBox: React.CSSProperties = {
  background: "#eef6ff",
  border: "1px solid #c2dcff",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 11,
  lineHeight: 1.3
};
const guardBox: React.CSSProperties = {
  marginBottom: 10,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid",
  fontSize: 11,
  lineHeight: 1.4
};