import React, { useState } from "react";
import { searchForParameterMatch } from "../lib/parameterSearch";
import { BatesParameterSet } from "../lib/batesWeightsCore";
import { showToast } from "../lib/toastBus";

interface ParameterSearchPanelProps {
  userSelectedNumbers: number[];
  weightedTargets?: Record<number, number>;
  forcedNumbers: number[];
  excludedNumbers: number[];
  recentSignal?: number[];
  conditionalProb?: number[];
  onAdoptParameters?: (params: BatesParameterSet) => void;
  onProbabilityUpdate?: (p: {
    pAtLeastRaw: number;
    pAtLeastWeighted: number;
    targetRaw: number;
    targetWeighted: number;
  } | null) => void;
}

export const ParameterSearchPanel: React.FC<ParameterSearchPanelProps> = ({
  userSelectedNumbers,
  weightedTargets,
  forcedNumbers,
  excludedNumbers,
  recentSignal,
  conditionalProb,
  onAdoptParameters,
  onProbabilityUpdate
}) => {
  const [targetMatch, setTargetMatch] = useState(4);
  const [maxIterations, setMaxIterations] = useState(150);
  const [candsPerIter, setCandsPerIter] = useState(15);
  const [refineIters, setRefineIters] = useState(40);
  const [scale, setScale] = useState(0.15);
  const [seed, setSeed] = useState<number | "">("");
  const [probSim, setProbSim] = useState(10000);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof searchForParameterMatch> | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPareto, setShowPareto] = useState(true);
  const [showConvergence, setShowConvergence] = useState(true);

  const canRun = userSelectedNumbers.length > 0 && !running;

  function runSearch() {
    if (!canRun) return;
    setRunning(true);
    setTimeout(() => {
      const res = searchForParameterMatch({
        userNumbers: userSelectedNumbers,
        weightedTargets,
        forcedNumbers,
        excludedNumbers,
        recentSignal,
        conditionalProb,
        targetMatchCount: targetMatch,
        maxIterations,
        candidatesPerIter: candsPerIter,
        neighborhoodIters: refineIters,
        neighborhoodScale: scale,
        seed: seed === "" ? undefined : Number(seed),
        probabilitySimulations: probSim
      });
      setResult(res);
      onProbabilityUpdate?.(res.probability || null);
      setRunning(false);
    }, 0);
  }

  function adopt(p: BatesParameterSet) {
    onAdoptParameters?.(p);
    showToast('Parameters adopted to Bates panel');
  }

  function adoptBest() {
    if (result?.bestParams) adopt(result.bestParams);
  }

  const bestWeighted = result?.bestWeightedScore ?? 0;
  const bestRaw = result?.bestMatchCount ?? 0;

  return (
    <section style={panel}>
      <OverfitBanner />
      <h3 style={{ margin: "4px 0 10px" }}>Parameter Search Helper</h3>
      <div style={desc}>
        Finds parameter sets that increase probability of overlapping with selected numbers
        (no direct forcing). Uses random + local refinement.
      </div>

      <div style={row}>
        <label title="Raw match threshold">
          Target matches
          <input
            type="number"
            min={1}
            max={8}
            value={targetMatch}
            onChange={e => setTargetMatch(Math.min(8, Math.max(1, Number(e.target.value) || 4)))}
            style={inp}
          />
        </label>
        <label title="Number of random parameter sets explored before refinement">
          Max iters
          <input
            type="number"
            min={20}
            max={5000}
            value={maxIterations}
            onChange={e => setMaxIterations(Math.min(5000, Math.max(20, Number(e.target.value) || 150)))}
            style={inp}
          />
        </label>
        <label title="How many candidate draws sampled per parameter set">
          Cand / iter
          <input
            type="number"
            min={1}
            max={300}
            value={candsPerIter}
            onChange={e => setCandsPerIter(Math.min(300, Math.max(1, Number(e.target.value) || 15)))}
            style={inp}
          />
        </label>
        <button
          type="button"
          disabled={!canRun}
          onClick={runSearch}
          style={btn(running || !canRun ? "#bbb" : "#1976d2")}
        >
          {running ? "Searching…" : "Run Search"}
        </button>
        <button
          type="button"
          disabled={!result}
          onClick={() => setShowLog(s => !s)}
          style={btn("#455a64")}
        >
          {showLog ? "Hide Log" : "Show Log"}
        </button>
        <button
          type="button"
          disabled={!result}
          onClick={adoptBest}
          style={btn("#2e7d32")}
        >
          Adopt Best
        </button>
      </div>

      <div style={toggles}>
        <button style={miniBtn} onClick={() => setShowAdvanced(a => !a)}>
          {showAdvanced ? "Hide" : "Show"} Advanced
        </button>
        <button style={miniBtn} onClick={() => setShowPareto(p => !p)}>
          {showPareto ? "Hide" : "Show"} Pareto
        </button>
        <button style={miniBtn} onClick={() => setShowConvergence(c => !c)}>
          {showConvergence ? "Hide" : "Show"} Convergence
        </button>
      </div>

      {showAdvanced && (
        <div style={{ ...row, marginTop: 10 }}>
          <label title="Refinement iterations around best parameters">
            Refine iters
            <input
              type="number"
              min={0}
              max={1500}
              value={refineIters}
              onChange={e => setRefineIters(Math.min(1500, Math.max(0, Number(e.target.value) || 40)))}
              style={inp}
            />
          </label>
          <label title="Local perturbation scale for refinement">
            Local scale
            <input
              type="number"
              step={0.01}
              min={0.01}
              max={0.8}
              value={scale}
              onChange={e => setScale(Math.min(0.8, Math.max(0.01, Number(e.target.value) || 0.15)))}
              style={inp}
            />
          </label>
          <label title="Probability simulation count for final best parameter evaluation">
            Prob Sims
            <input
              type="number"
              min={1000}
              step={1000}
              max={300000}
              value={probSim}
              onChange={e => setProbSim(Math.min(300000, Math.max(1000, Number(e.target.value) || 10000)))}
              style={inp}
            />
          </label>
          <label title="Deterministic seed (blank = random)">
            Seed
            <input
              type="number"
              value={seed}
              onChange={e => setSeed(e.target.value === "" ? "" : Number(e.target.value))}
              style={{ ...inp, width: 90 }}
              placeholder="(opt)"
            />
          </label>
        </div>
      )}

      {result && (
        <div style={summary}>
          <div><b>Best Raw Matches:</b> {bestRaw}</div>
          <div><b>Best Weighted Score:</b> {bestWeighted.toFixed(2)}</div>
          {result.probability && (
            <div style={{ marginTop: 4, fontSize: 12 }}>
              <b>P(raw ≥ {result.probability.targetRaw}):</b>{" "}
              {(result.probability.pAtLeastRaw * 100).toFixed(2)}% |{" "}
              <b>P(weighted ≥ {result.probability.targetWeighted.toFixed(2)}):</b>{" "}
              {(result.probability.pAtLeastWeighted * 100).toFixed(2)}%
            </div>
          )}
        </div>
      )}

      {showConvergence && result && (
        <ConvergenceTrace
          raw={result.bestRawHistory}
            weighted={result.bestWeightedHistory}
        />
      )}

      {showPareto && result && result.pareto.length > 0 && (
        <ParetoList
          entries={result.pareto}
          onAdopt={p => adopt(p)}
        />
      )}

      {showLog && result && (
        <pre style={logBox}>{result.log.join("\n")}</pre>
      )}

      {!userSelectedNumbers.length && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#c00" }}>
          Select at least one user number to enable search.
        </div>
      )}
    </section>
  );
};

/* ---- Subcomponents ---- */

const OverfitBanner: React.FC = () => (
  <div style={banner}>
    <b>Overfitting Notice:</b> Parameters found here are conditioned on currently selected numbers
    (and any known but unloaded draws). Use results for exploratory analysis, not unbiased prediction.
  </div>
);

interface ParetoProps {
  entries: ReturnType<typeof searchForParameterMatch>["pareto"];
  onAdopt: (p: BatesParameterSet) => void;
}

const ParetoList: React.FC<ParetoProps> = ({ entries, onAdopt }) => {
  return (
    <div style={paretoBox}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Pareto Frontier (Raw vs Weighted)</div>
      <table style={miniTable}>
        <thead>
          <tr>
            <th style={miniTh}>ID</th>
            <th style={miniTh}>Raw</th>
            <th style={miniTh}>Weighted</th>
            <th style={miniTh}>Candidate</th>
            <th style={miniTh}>Adopt</th>
          </tr>
        </thead>
        <tbody>
          {entries
            .sort((a, b) => (b.raw * b.weighted) - (a.raw * a.weighted))
            .map(e => (
              <tr key={e.id}>
                <td style={miniTd}>{e.id}</td>
                <td style={miniTd}>{e.raw}</td>
                <td style={miniTd}>{e.weighted.toFixed(2)}</td>
                <td style={{ ...miniTd, fontSize: 11 }}>
                  [{e.candidate.main.join(",")}] | [{e.candidate.supp.join(",")}]
                </td>
                <td style={miniTd}>
                  <button
                    style={adoptBtn}
                    onClick={() => onAdopt(e.params)}
                    title="Adopt these parameters into Bates panel"
                  >
                    Adopt
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};

const ConvergenceTrace: React.FC<{ raw: number[]; weighted: number[] }> = ({ raw, weighted }) => {
  if (!raw.length || !weighted.length) return null;

  // Build small SVG sparkline
  const W = 240;
  const H = 70;
  const maxWeighted = Math.max(...weighted);
  const maxRaw = Math.max(...raw);
  const len = Math.max(raw.length, weighted.length);

  function line(values: number[], max: number, color: string) {
    if (values.length < 2) return null;
    const stepX = (W - 10) / (values.length - 1);
    const pts = values
      .map((v, i) => {
        const x = 5 + i * stepX;
        const y = H - 5 - ((v / (max || 1)) * (H - 15));
        return `${x},${y}`;
      })
      .join(" ");
    return <polyline fill="none" stroke={color} strokeWidth={2} points={pts} />;
  }

  return (
    <div style={convBox}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Convergence Trace</div>
      <svg width={W} height={H} style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 4 }}>
        {line(weighted, maxWeighted, "#1976d2")}
        {line(raw, maxRaw, "#ef6c00")}
      </svg>
      <div style={{ fontSize: 10, marginTop: 4, color: "#555" }}>
        Blue = Weighted best, Orange = Raw best (iteration progression)
      </div>
    </div>
  );
};

/* ---- Styles ---- */
const panel: React.CSSProperties = {
  border: "1px solid #d9e3f5",
  background: "#f4f9ff",
  borderRadius: 8,
  padding: 16,
  marginTop: 20
};
const desc: React.CSSProperties = { fontSize: 12, color: "#444", lineHeight: 1.35, marginBottom: 8 };
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, alignItems: "flex-end" };
const inp: React.CSSProperties = { marginLeft: 6, width: 70 };
const btn = (bg: string): React.CSSProperties => ({
  padding: "6px 14px",
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer"
});
const banner: React.CSSProperties = {
  background: "#fff3cd",
  color: "#665c00",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 11,
  marginBottom: 8,
  border: "1px solid #ffe69b",
  lineHeight: 1.3
};
const toggles: React.CSSProperties = { display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" };
const miniBtn: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  background: "#e3ecf9",
  border: "1px solid #b6c6df",
  borderRadius: 4,
  cursor: "pointer"
};
const summary: React.CSSProperties = {
  marginTop: 12,
  background: "#fff",
  border: "1px solid #e0e6ef",
  padding: 10,
  borderRadius: 6,
  fontSize: 12
};
const logBox: React.CSSProperties = {
  marginTop: 12,
  maxHeight: 240,
  overflow: "auto",
  fontSize: 11,
  background: "#fff",
  border: "1px solid #e0e0e0",
  padding: 8,
  borderRadius: 4,
  lineHeight: 1.3
};
const paretoBox: React.CSSProperties = {
  marginTop: 14,
  background: "#fff",
  padding: 10,
  border: "1px solid #dbe4f2",
  borderRadius: 6
};
const convBox: React.CSSProperties = {
  marginTop: 14,
  background: "#fff",
  padding: 10,
  border: "1px solid #dbe4f2",
  borderRadius: 6,
  width: 270
};
const miniTable: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 11
};
const miniTh: React.CSSProperties = {
  borderBottom: "1px solid #ddd",
  padding: "4px 6px",
  textAlign: "center"
};
const miniTd: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "4px 6px",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums"
};
const adoptBtn: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 11,
  border: "1px solid #1976d2",
  background: "#fff",
  color: "#1976d2",
  borderRadius: 4,
  cursor: "pointer"
};