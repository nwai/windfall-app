import React, { useMemo, useRef, useState } from "react";
import { Draw } from "../types";
import { buildCoxDataset, CoxCovariateConfig } from "../lib/coxDataset";
import { fitJsCox } from "../lib/jsCox";
import { ZONE_RANGES, getZoneLabel } from "../lib/zoneAnalysis";

/* ---------- Types ---------- */
interface SurvivalCoxPanelProps {
  history: Draw[];
  excludedNumbers?: number[];
}
interface FitSummaryRow {
  covariate: string;
  coef: number;
  ["exp(coef)"]?: number;
  exp_coef?: number;
  z?: number;
  p?: number;
  [k: string]: any;
}
interface JsCoxInput {
  durations: number[];
  events: number[];
  X: number[][];
  nowX: number[][];
  colNames: string[];
}
interface JsCoxFallbackInfo {
  prepared?: boolean;
  durations?: number;
  eventsCount?: number;
  Xrows?: number;
  Xcols?: number;
  nowRows?: number;
  colNames?: string[];
  converged?: boolean;
  iterations?: number;
  coefficients?: Record<string, number>;
}
interface DiagState {
  [k: string]: any;
  mode_selected?: "auto" | "python" | "js";
  path_used?: "python" | "js" | "js_fallback";
  python_empty_reason?: string;
  timing_ms_python?: number;
  timing_ms_js?: number;
  jsCox_used?: boolean;
  jsCox_converged?: boolean;
  jsCox_iterations?: number;
}

/* ---------- Component ---------- */
export const SurvivalCoxPanel: React.FC<SurvivalCoxPanelProps> = ({
  history,
  excludedNumbers = [],
}) => {
  /* Mode selection */
  const [mode, setMode] = useState<"auto" | "python" | "js">("auto");

  /* Zone handling: strata | fixed | none */
  const [zoneMode, setZoneMode] = useState<"none" | "strata" | "fixed">("strata");

  /* Core state */
  const [pyReady, setPyReady] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<FitSummaryRow[]>([]);
  const [hazardRatios, setHazardRatios] = useState<Record<string, number>>({});
  const [numberScores, setNumberScores] = useState<{ number: number; score: number }[]>([]);
  const [workerVer, setWorkerVer] = useState<string>("");
  const [diag, setDiag] = useState<DiagState | null>(null);
  const [rawPayload, setRawPayload] = useState<string>("");

  /* Dataset debug */
  const [localDsCols, setLocalDsCols] = useState(0);
  const [localDsRows, setLocalDsRows] = useState(0);
  const [localNowCols, setLocalNowCols] = useState(0);
  const [localNowRows, setLocalNowRows] = useState(0);
  const [localNowFirstRow, setLocalNowFirstRow] = useState<(number | string | boolean | null)[] | null>(null);
  const [localNowColsNames, setLocalNowColsNames] = useState<string[]>([]);
  const [localNowAllRows, setLocalNowAllRows] = useState<(number | string | boolean | null)[][]>([]);

  /* JS Cox fallback info */
  const [jsCoxFallbackInfo, setJsCoxFallbackInfo] = useState<JsCoxFallbackInfo | null>(null);

  /* Covariates (non-zone) */
  const [useOdd, setUseOdd] = useState(true);
  const [useLow, setUseLow] = useState(true);
  const [usePrevGap, setUsePrevGap] = useState(true);
  const [useHot6, setUseHot6] = useState(false);
  const [useHot12, setUseHot12] = useState(true);
  const [useHot24, setUseHot24] = useState(false);
  const [useHot36, setUseHot36] = useState(false);
  const [useFreq, setUseFreq] = useState(true);
  const [useRecency, setUseRecency] = useState(true);

  /* Regularization */
  const [penalizer, setPenalizer] = useState(0.1);
  const [l1Ratio, setL1Ratio] = useState(0.0);
  const [autoResolve, setAutoResolve] = useState(true);

  /* Sorting */
  const [sortBy, setSortBy] = useState<"score" | "number">("score");

  /* Refs */
  const workerRef = useRef<Worker | null>(null);
  const jsCoxInputRef = useRef<JsCoxInput | null>(null);

  const numbersAllowed = useMemo(
    () =>
      new Set(
        Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !excludedNumbers.includes(n))
      ),
    [excludedNumbers]
  );
  const hasEnough = history.length >= 50;

  /* Zone mapping readout */
  const zoneMapping = useMemo(
    () =>
      ZONE_RANGES.map(([lo, hi], idx) => ({
        idx,
        label: getZoneLabel(idx),
        numbers: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
      })),
    []
  );

  /* ---------- Worker ---------- */
  function getWorker(): Worker {
    if (workerRef.current) return workerRef.current;
    const w = new Worker(
      new URL("../workers/coxPyodideWorker.return.ts?v=ret2", import.meta.url),
      { type: "module" }
    );
    w.onmessage = (evt: MessageEvent<any>) => {
      const payload = evt.data;
      if (!payload) return;

      try {
        setRawPayload(JSON.stringify(payload, null, 2));
      } catch {
        setRawPayload("(stringify failed)");
      }

      if (payload.ok === false) {
        if (mode === "auto" && jsCoxInputRef.current) {
          runJsCox("js_fallback");
          return;
        }
        setErr(payload.error || "Worker error");
        setDiag((prev) => ({
          ...(prev || {}),
          mode_selected: mode,
            path_used: "python",
          python_empty_reason: payload?.diag?.empty_reason || payload.error,
        }));
        setFitting(false);
        return;
      }

      setWorkerVer(payload.ver || "cox-return-2");

      const okNumbers: number[] = Array.isArray(payload.numbers) ? payload.numbers : [];
      const okPH: number[] = Array.isArray(payload.partial_hazards) ? payload.partial_hazards : [];
      const finalColsLen = payload?.diag?.final_x_cols ? payload.diag.final_x_cols.length : 0;

      if (okNumbers.length === 45 && okPH.length === 45 && finalColsLen > 0) {
        const scores = okNumbers.map((n, i) => ({ number: n, score: okPH[i] }));
        setNumberScores(scores);
        setSummary(payload.summary || []);
        setHazardRatios(payload.hazard_ratios || {});
        setDiag({
          ...(payload.diag || {}),
          mode_selected: mode,
          path_used: "python",
        });
        setFitting(false);
        setPyReady(true);
        setErr(null);
      } else {
        if (mode === "auto" && jsCoxInputRef.current) {
          runJsCox("js_fallback");
        } else {
          setDiag({
            ...(payload.diag || {}),
            mode_selected: mode,
            path_used: "python",
            python_empty_reason:
              payload?.diag?.empty_reason || "empty_or_invalid_partial_hazards",
          });
          setNumberScores([]);
          setSummary([]);
          setHazardRatios({});
          setFitting(false);
          setPyReady(true);
        }
      }
    };
    workerRef.current = w;
    return w;
  }

  /* ---------- Helpers ---------- */
  function buildInputs() {
    const cfg: CoxCovariateConfig = {
      useOdd,
      useLow,
      useGroups: zoneMode === "fixed",
      dropFirstGroup: zoneMode === "fixed",
      usePrevGap,
      useHot6,
      useHot12,
      useHot24,
      useHot36,
      useStrataByZone: zoneMode === "strata",
      useFreq,
      useRecency,
    };
    const { dataset, now } = buildCoxDataset(history, undefined, cfg);

    setLocalDsCols(dataset.columns.length);
    setLocalDsRows(dataset.rows.length);
    setLocalNowCols(now.columns.length);
    setLocalNowRows(now.rows.length);
    setLocalNowFirstRow(now.rows[0] ?? null);
    setLocalNowColsNames(now.columns);
    setLocalNowAllRows(now.rows);

    const durationIdx = dataset.columns.indexOf("duration");
    const eventIdx = dataset.columns.indexOf("event");
    if (durationIdx === -1 || eventIdx === -1) throw new Error("Missing duration/event columns");

    const candidateCols = dataset.columns.filter(
      (c) => c !== "duration" && c !== "event" && c !== "number" && !(zoneMode === "strata" && c === "zone")
    );

    const durations = dataset.rows.map((r) => Number(r[durationIdx]) || 0);
    const events = dataset.rows.map((r) => Number(r[eventIdx]) || 0);
    const X = dataset.rows.map((r) =>
      candidateCols.map((c) => {
        const idx = dataset.columns.indexOf(c);
        return Number(r[idx]) || 0;
      })
    );
    const nowX = now.rows.map((r) =>
      candidateCols.map((c) => {
        const idx = now.columns.indexOf(c);
        return Number(r[idx]) || 0;
      })
    );

    jsCoxInputRef.current = { durations, events, X, nowX, colNames: candidateCols };

    setJsCoxFallbackInfo({
      prepared: true,
      durations: durations.length,
      eventsCount: events.reduce((a, b) => a + b, 0),
      Xrows: X.length,
      Xcols: candidateCols.length,
      nowRows: nowX.length,
      colNames: candidateCols,
    });

    return { dataset, now };
  }

  function runJsCox(path: "js" | "js_fallback") {
    const t0 = performance.now();
    const inp = jsCoxInputRef.current;
    if (!inp) return;
    const res = fitJsCox(inp.durations, inp.events, inp.X, inp.nowX, inp.colNames, {
      penalizer: penalizer || 0.01,
    });
    const nums = Array.from({ length: inp.nowX.length }, (_, i) => i + 1);
    const scores = nums.map((n, i) => ({ number: n, score: res.riskScores[i] ?? 1 }));
    setNumberScores(scores);
    const summ: FitSummaryRow[] = Object.entries(res.coefficients).map(([cov, coef]) => ({
      covariate: cov,
      coef,
      "exp(coef)": Math.exp(coef),
      z: 0,
      p: 1,
    }));
    setSummary(summ);
    setHazardRatios(
      Object.fromEntries(
        Object.entries(res.coefficients).map(([k, v]) => [k, Math.exp(v)])
      )
    );
    setDiag((prev) => ({
      ...(prev || {}),
      mode_selected: mode,
      path_used: path,
      jsCox_used: true,
      jsCox_converged: res.converged,
      jsCox_iterations: res.iterations,
      timing_ms_js: Math.round(performance.now() - t0),
    }));
    setPyReady(true);
    setFitting(false);
    setErr(null);
  }

  function runPythonCox(dataset: any, now: any) {
    const worker = getWorker();
    worker.postMessage({
      cmd: "fit",
      dataset: JSON.parse(JSON.stringify(dataset)),
      now: JSON.parse(JSON.stringify(now)),
      fitConfig: { penalizer, l1_ratio: l1Ratio, autoResolve },
    });
  }

  function compute() {
    try {
      setFitting(true);
      setErr(null);
      const { dataset, now } = buildInputs();

      if (mode === "js") {
        runJsCox("js");
        return;
      }

      if (!Array.isArray(now.rows) || now.rows.length !== 45) {
        if (mode === "auto") runJsCox("js_fallback");
        else {
          setErr("Python mode: invalid 'now' rows (expected 45).");
          setFitting(false);
        }
        return;
      }

      runPythonCox(dataset, now);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setFitting(false);
    }
  }

  function defaultsAndCompute() {
    setUsePrevGap(true);
    setUseHot12(true);
    setUseHot6(false);
    setUseHot24(false);
    setUseHot36(false);
    setUseFreq(true);
    setUseRecency(true);
    setZoneMode("strata");
    setUseOdd(true);
    setUseLow(true);
    setPenalizer(0.1);
    setL1Ratio(0.0);
    setAutoResolve(true);
    setTimeout(compute, 0);
  }

  const sorted = useMemo(() => {
    const arr = numberScores.filter((r) => numbersAllowed.has(r.number)).slice();
    if (sortBy === "score")
      arr.sort((a, b) => b.score - a.score || a.number - b.number);
    else arr.sort((a, b) => a.number - b.number);
    return arr;
  }, [numberScores, numbersAllowed, sortBy]);

  function pathChip() {
    const path = diag?.path_used || (mode === "js" ? "js" : "python");
    const bg = path === "python" ? "#e8f5e9" : path === "js_fallback" ? "#fff3e0" : "#e3f2fd";
    const fg = path === "python" ? "#2e7d32" : path === "js_fallback" ? "#e65100" : "#1565c0";
    const label =
      path === "python"
        ? "Python (lifelines)"
        : path === "js_fallback"
        ? "JS Fallback"
        : "JS Only";
    return (
      <span style={{ padding: "2px 8px", borderRadius: 999, background: bg, color: fg, fontSize: 12 }}>
        {label}
      </span>
    );
  }

  const hasStdCols =
    summary?.some(
      (r) =>
        r["beta_std_per_SD"] !== undefined ||
        r["HR_per_SD"] !== undefined ||
        r["HR_per_0.05"] !== undefined
    ) || false;

  /* ---- Top picks + normalization helpers ---- */
  const top5 = [...numberScores]
    .filter((r) => numbersAllowed.has(r.number))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const sumScore = numberScores.reduce((acc, r) => acc + r.score, 0);
  const minScore = numberScores.length
    ? Math.min(...numberScores.map((r) => r.score))
    : 0;
  const maxScore = numberScores.length
    ? Math.max(...numberScores.map((r) => r.score))
    : 0;

  /* ---------- Render ---------- */
  return (
    <section style={{ padding: 12, background: "#fff", borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>📈 Cox Proportional Hazards</h2>

      {/* Control Bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={compute}
          disabled={!hasEnough || fitting}
          style={{ padding: "6px 12px", background: "#1976d2", color: "#fff", border: "none", borderRadius: 4 }}
        >
          {fitting ? "Fitting…" : pyReady ? "Recompute" : "Compute"}
        </button>
        <button
          onClick={defaultsAndCompute}
          disabled={fitting}
          style={{ padding: "6px 12px", background: "#455a64", color: "#fff", border: "none", borderRadius: 4 }}
        >
          Defaults + Compute
        </button>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Mode:
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            style={{ padding: "2px 6px" }}
          >
            <option value="auto">Auto (Python → JS fallback)</option>
            <option value="python">Python (lifelines)</option>
            <option value="js">JS only (fast)</option>
          </select>
        </label>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Zone handling:
          <select
            value={zoneMode}
            onChange={(e) => setZoneMode(e.target.value as any)}
            style={{ padding: "2px 6px" }}
          >
            <option value="strata">Strata (recommended)</option>
            <option value="fixed">Fixed effects (groups)</option>
            <option value="none">None</option>
          </select>
        </label>

        <div style={{ marginLeft: "auto" }}>{pathChip()}</div>

        {!hasEnough && <span style={{ color: "#c00" }}>Need ≥ 50 draws</span>}
        {err && <span style={{ color: "#c00" }}>Error: {err}</span>}
      </div>

      {/* Covariates */}
      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer" }}>Covariates</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 13 }}>
          <label><input type="checkbox" checked={useOdd} onChange={(e) => setUseOdd(e.target.checked)} /> odd</label>
          <label><input type="checkbox" checked={useLow} onChange={(e) => setUseLow(e.target.checked)} /> low</label>
          <label><input type="checkbox" checked={usePrevGap} onChange={(e) => setUsePrevGap(e.target.checked)} /> prev_gap</label>
          <label><input type="checkbox" checked={useHot6} onChange={(e) => setUseHot6(e.target.checked)} /> hot6</label>
          <label><input type="checkbox" checked={useHot12} onChange={(e) => setUseHot12(e.target.checked)} /> hot12</label>
          <label><input type="checkbox" checked={useHot24} onChange={(e) => setUseHot24(e.target.checked)} /> hot24</label>
          <label><input type="checkbox" checked={useHot36} onChange={(e) => setUseHot36(e.target.checked)} /> hot36</label>
          <label><input type="checkbox" checked={useFreq} onChange={(e) => setUseFreq(e.target.checked)} /> freq_total_norm</label>
          <label><input type="checkbox" checked={useRecency} onChange={(e) => setUseRecency(e.target.checked)} /> time_since_last_norm</label>
        </div>
      </details>

      {/* Regularization */}
      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer" }}>Regularization</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6, fontSize: 13 }}>
          <label>
            penalizer:
            <input
              type="number"
              step={0.01}
              min={0}
              value={penalizer}
              onChange={(e) => setPenalizer(Number(e.target.value))}
              style={{ width: 70, marginLeft: 6 }}
            />
          </label>
          <label>
            l1_ratio:
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={l1Ratio}
              onChange={(e) => setL1Ratio(Number(e.target.value))}
              style={{ width: 70, marginLeft: 6 }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={autoResolve}
              onChange={(e) => setAutoResolve(e.target.checked)}
            /> auto-resolve
          </label>
        </div>
      </details>

      {/* Local dataset info */}
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        Worker: {workerVer || "(not yet)"} | History length: {history.length}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>
        <b>Local dataset</b> — ds: {localDsRows}×{localDsCols}; now: {localNowRows}×{localNowCols}
        {localNowFirstRow && <div style={{ marginTop: 4 }}>first now row: {JSON.stringify(localNowFirstRow)}</div>}
      </div>

      {/* JS Cox prep banner */}
      {jsCoxFallbackInfo && (
        <div style={{ marginTop: 8, fontSize: 12, background: "#f9f9f9", padding: 8, borderRadius: 6 }}>
          <b>JS Cox prep:</b> rows={jsCoxFallbackInfo.Xrows}, cols={jsCoxFallbackInfo.Xcols}, events={jsCoxFallbackInfo.eventsCount}, nowRows={jsCoxFallbackInfo.nowRows}
          <br />
          columns: {Array.isArray(jsCoxFallbackInfo.colNames) ? jsCoxFallbackInfo.colNames.join(", ") : "—"}
          {jsCoxFallbackInfo.converged !== undefined && (
            <>
              <br />
              fallback used: converged={String(jsCoxFallbackInfo.converged)}, iterations={jsCoxFallbackInfo.iterations}
            </>
          )}
        </div>
      )}

      {/* Zone mapping */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer" }}>Zone mapping (15 zones)</summary>
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
          {zoneMapping.map((z) => (
            <div key={z.idx} style={{ marginBottom: 4 }}>
              <strong>{z.label}:</strong> {z.numbers.join(", ")}
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 11, color: "#555" }}>
            Edit zone boundaries in src/lib/zoneAnalysis.ts (ZONE_RANGES).
          </div>
        </div>
      </details>

      {/* Features at now */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer" }}>Features at now (X_now)</summary>
        <div style={{ overflowX: "auto", marginTop: 6 }}>
          <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {localNowColsNames.map((c) => (
                  <th key={c} style={{ padding: "4px 6px", borderBottom: "1px solid #ccc", textAlign: "left" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localNowAllRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  {row.map((v, j) => (
                    <td key={j} style={{ padding: "4px 6px", textAlign: j === 0 ? "left" : "right" }}>
                      {typeof v === "number" ? Number(v).toFixed(6).replace(/\.?0+$/, "") : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Diagnostics */}
      {diag && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer" }}>Diagnostics</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#fafafa", padding: 8, borderRadius: 4 }}>
{JSON.stringify(diag, null, 2)}
          </pre>
        </details>
      )}

      {/* Raw worker payload */}
      {rawPayload && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer" }}>Raw worker payload</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#fafafa", padding: 8, borderRadius: 4 }}>
{rawPayload}
          </pre>
        </details>
      )}

      {/* Model summary */}
      {summary.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: "0 0 6px 0" }}>
            Model Summary ({diag?.path_used === "python"
              ? "Python lifelines"
              : diag?.path_used === "js_fallback"
              ? "JS Fallback"
              : "JS"})
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: hasStdCols ? 760 : 520 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ccc" }}>Covariate</th>
                  <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #ccc" }}>β</th>
                  <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #ccc" }}>exp(β)</th>
                  {hasStdCols && (
                    <>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #ccc" }}>β per 1 SD</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #ccc" }}>HR per 1 SD</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #ccc" }}>HR per +0.05</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => {
                  const cov = row.covariate;
                  const coef = Number(row.coef || 0);
                  const expb = Number(row["exp(coef)"] ?? row.exp_coef ?? Math.exp(coef));
                  const bsd = row["beta_std_per_SD"] as number | undefined;
                  const hrSD = row["HR_per_SD"] as number | undefined;
                  const hr005 = row["HR_per_0.05"] as number | undefined;
                  return (
                    <tr key={cov} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 6 }}>{cov}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>{coef.toFixed(4)}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>{expb.toFixed(4)}</td>
                      {hasStdCols && (
                        <>
                          <td style={{ padding: 6, textAlign: "right" }}>{bsd !== undefined ? bsd.toFixed(4) : "—"}</td>
                          <td style={{ padding: 6, textAlign: "right" }}>{hrSD !== undefined ? hrSD.toFixed(4) : "—"}</td>
                          <td style={{ padding: 6, textAlign: "right" }}>{hr005 !== undefined ? hr005.toFixed(4) : "—"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {diag?.standardized_reporting && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#444" }}>
              Standardized metrics computed (see diag.feature_stats for mean/std).
            </div>
          )}
        </div>
      )}

      {/* Top picks */}
      {numberScores.length > 0 && sumScore > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "16px 0 6px 0" }}>
          <strong style={{ marginRight: 6 }}>Top picks:</strong>
          {top5.map((tp) => (
            <span
              key={tp.number}
              style={{
                padding: "2px 10px",
                borderRadius: 999,
                background: "#e3f2fd",
                color: "#0d47a1",
                fontSize: 12,
                boxShadow: "inset 0 0 0 1px #bbdefb",
              }}
            >
              #{tp.number} • {(100 * tp.score / sumScore).toFixed(1)}
            </span>
          ))}
          <span style={{ marginLeft: 8, fontSize: 11, color: "#666" }}>
            (scores normalized to total = 100)
          </span>
        </div>
      )}
      {numberScores.length > 0 && (
        <p style={{ fontSize: 11, color: "#555", margin: "0 0 8px 0" }}>
          Higher values mean relatively higher modeled occurrence (not guarantees). Consider selecting several from the upper tier and mixing across zones for coverage.
        </p>
      )}

      {/* Risk table */}
      {numberScores.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>Per-number Relative Risk (exp(β·X_now))</h3>
            <label style={{ marginLeft: "auto" }}>
              Sort by:
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ marginLeft: 6 }}
              >
                <option value="score">Risk (desc)</option>
                <option value="number">Number</option>
              </select>
            </label>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ccc" }}>#</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #ccc" }}>Number</th>
                <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #ccc" }}>Relative Risk / Share</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.number} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 6 }}>{i + 1}</td>
                  <td style={{ padding: 6 }}>{r.number}</td>
                  <td style={{ padding: 6, textAlign: "right", verticalAlign: "middle" }}>
                    <div
                      style={{
                        display: "inline-block",
                        width: 130,
                        height: 10,
                        background: "#eee",
                        borderRadius: 5,
                        marginRight: 8,
                        position: "relative",
                        verticalAlign: "middle",
                      }}
                      title={`Raw score ${r.score.toFixed(4)}`}
                    >
                      <div
                        style={{
                          width: `${
                            maxScore > minScore
                              ? ((r.score - minScore) / (maxScore - minScore)) * 130
                              : 130
                          }px`,
                          height: "100%",
                          background: "linear-gradient(90deg,#1976d2,#42a5f5)",
                          borderRadius: 5,
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: "monospace" }}>{r.score.toFixed(4)}</span>
                    <span style={{ marginLeft: 6, fontSize: 11, color: "#666" }}>
                      {(100 * r.score / sumScore).toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {diag?.path_used?.startsWith("js") && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#444" }}>
              {diag.path_used === "js" ? "JS mode" : "JS fallback"} used
              {diag.jsCox_converged !== undefined
                ? ` (converged=${String(diag.jsCox_converged)}, iterations=${diag.jsCox_iterations})`
                : ""}
            </div>
          )}
        </div>
      )}
    </section>
  );
};