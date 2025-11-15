/* eslint-disable no-restricted-globals */
export {}; // keep this file a module

/**
 * Cox PH worker (lifelines) with direct JSON return from Python to avoid PyProxy/global issues.
 * Version: cox-return-2 (adds standardized effects and feature_stats)
 */
let pyodide: any = null;

type Tabular = { columns: string[]; rows: (number | string | boolean | null)[][] };

type FitConfig = {
  penalizer?: number;
  l1_ratio?: number;
  autoResolve?: boolean;
};

type FitRequest = {
  cmd: "fit";
  dataset: Tabular;
  now: Tabular;
  fitConfig?: FitConfig;
};

type WireResponse = {
  ok: boolean;
  ver?: string;
  summary?: Array<Record<string, any>>;
  hazard_ratios?: Record<string, number>;
  partial_hazards?: number[];
  numbers?: number[];
  corr_columns?: string[];
  corr_matrix?: number[][];
  diag?: Record<string, any>;
  error?: string;
};

async function initPyodide() {
  if (pyodide) return;
  const mod = await import(
    /* @vite-ignore */ "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs"
  );
  const loadPyodide =
    (mod as any).loadPyodide ?? (mod as any).default?.loadPyodide;
  if (!loadPyodide) throw new Error("Failed to import loadPyodide from pyodide.mjs");

  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/",
  });

  await pyodide.loadPackage(["numpy", "pandas", "scipy", "micropip"]);

  await pyodide.runPythonAsync(`
import micropip
await micropip.install('lifelines==0.27.8')
  `);
}

self.onmessage = async (evt: MessageEvent<FitRequest>) => {
  try {
    const { cmd, dataset, now, fitConfig } = evt.data;
    if (cmd !== "fit") return;

    await initPyodide();

    // Deep-clone to plain JSON strings for Python
    const dsJSON = JSON.stringify(dataset || {});
    const nowJSON = JSON.stringify(now || {});
    const fcJSON = JSON.stringify({
      penalizer: fitConfig?.penalizer ?? 0.1,
      l1_ratio: fitConfig?.l1_ratio ?? 0.0,
      autoResolve: fitConfig?.autoResolve ?? true,
    });

    pyodide.globals.set("dsJSON", dsJSON);
    pyodide.globals.set("nowJSON", nowJSON);
    pyodide.globals.set("fcJSON", fcJSON);

    // Return a JSON string directly
    const pyCode = `
import json, math, pandas as pd
from lifelines import CoxPHFitter
from lifelines.exceptions import ConvergenceError

def _cox_run(ds_json: str, now_json: str, fc_json: str) -> str:
    try:
        dataset = json.loads(ds_json or "{}")
        nowset = json.loads(now_json or "{}")
        fc = json.loads(fc_json or "{}")
        pen = float(fc.get("penalizer", 0.1))
        l1r = float(fc.get("l1_ratio", 0.0))
        auto = bool(fc.get("autoResolve", True))

        df_raw = pd.DataFrame(dataset.get("rows", []), columns=dataset.get("columns", []))
        df_now_raw = pd.DataFrame(nowset.get("rows", []), columns=nowset.get("columns", []))

        numbers_now = df_now_raw["number"].tolist() if "number" in df_now_raw.columns else list(range(1, len(df_now_raw)+1))
        has_zone_strata = "zone" in df_raw.columns

        df_fit = df_raw.drop(columns=[c for c in ["number"] if c in df_raw.columns], errors="ignore")
        df_now_full = df_now_raw.drop(columns=[c for c in ["number"] if c in df_now_raw.columns], errors="ignore")

        protected = set(["duration","event"])
        requested_cols = [c for c in df_fit.columns if c not in protected and (not has_zone_strata or c != "zone")]

        removed_constants = []
        X_cols = requested_cols.copy()
        for col in list(X_cols):
            if df_fit[col].nunique(dropna=False) <= 1:
                removed_constants.append(col)
        if removed_constants:
            df_fit.drop(columns=removed_constants, inplace=True, errors="ignore")
            df_now_full.drop(columns=[c for c in removed_constants if c in df_now_full.columns], inplace=True, errors="ignore")
            X_cols = [c for c in X_cols if c not in removed_constants]

        df_now_X = df_now_full[X_cols].copy() if len(X_cols) > 0 else pd.DataFrame(index=df_now_full.index)

        if len(X_cols) >= 2:
            corr = df_fit[X_cols].corr(method='pearson')
            corr_columns = list(corr.columns)
            corr_matrix = corr.values.tolist()
        else:
            corr_columns, corr_matrix = [], []

        # Pre-compute simple feature stats (mean, std) on df_fit for standardized reporting
        feature_stats = {}
        for c in X_cols:
            col = df_fit[c]
            mu = float(col.mean())
            sd = float(col.std(ddof=0))
            if sd <= 0 or math.isnan(sd):
                sd = 1.0
            feature_stats[c] = {"mean": mu, "std": sd}

        def try_fit(df_in, X_cols_in, df_now_in, pen_in, l1_in):
            cph = CoxPHFitter(penalizer=pen_in, l1_ratio=l1_in)
            if has_zone_strata:
                cph.fit(df_in, duration_col='duration', event_col='event', strata=['zone'], show_progress=False)
            else:
                cph.fit(df_in, duration_col='duration', event_col='event', show_progress=False)
            summary_df = cph.summary.reset_index().rename(columns={'index': 'covariate'})
            hr_map = {str(k): float(v) for k,v in cph.hazard_ratios_.to_dict().items()}
            ph = cph.predict_partial_hazard(df_now_in)
            return summary_df.to_dict(orient='records'), hr_map, [float(x) for x in ph.values.tolist()]

        summary_json, hr_json, ph_list = [], {}, []
        empty_reason = ""
        final_x_cols = X_cols.copy()

        def salvage_nonempty(df_in, df_now_in, base_pen, base_l1):
            candidates = ['freq_total_norm','time_since_last_norm','prev_gap','hot12','hot6','hot24','hot36','odd','low']
            usable = [c for c in candidates if c in df_in.columns and df_in[c].nunique(dropna=False) > 1]
            if len(usable) == 0:
                return None
            X2 = usable[:2]
            df_now2 = df_now_in[X2].copy() if set(X2).issubset(df_now_in.columns) else pd.DataFrame(index=df_now_in.index)
            cph = CoxPHFitter(penalizer=base_pen, l1_ratio=base_l1)
            if has_zone_strata:
                cph.fit(df_in, duration_col='duration', event_col='event', strata=['zone'], show_progress=False)
            else:
                cph.fit(df_in, duration_col='duration', event_col='event', show_progress=False)
            s = cph.summary.reset_index().rename(columns={'index': 'covariate'})
            hr = {str(k): float(v) for k,v in cph.hazard_ratios_.to_dict().items()}
            ph = cph.predict_partial_hazard(df_now2)
            return s.to_dict(orient='records'), hr, [float(x) for x in ph.values.tolist()], X2

        if len(df_now_raw.index) == 0:
            empty_reason = "python_df_now_raw_rows_0"
            summary_json, hr_json, ph_list = [], {}, []
        elif len(final_x_cols) == 0:
            empty_reason = "no_covariates_after_constant_removal"
            salv = salvage_nonempty(df_fit, df_now_full, pen, l1r)
            if salv:
                s, hr, ph, X2 = salv
                summary_json, hr_json, ph_list = s, hr, ph
                final_x_cols = X2
            else:
                ph_list = [1.0 for _ in numbers_now]
        else:
            try:
                s, hr, ph = try_fit(df_fit, final_x_cols, df_now_X, pen, l1r)
                summary_json, hr_json, ph_list = s, hr, ph
            except ConvergenceError:
                if not auto:
                    empty_reason = "convergence_error_no_auto"
                    ph_list = [1.0 for _ in numbers_now]
                else:
                    try:
                        s, hr, ph = try_fit(df_fit, final_x_cols, df_now_X, pen*10.0, l1r)
                        summary_json, hr_json, ph_list = s, hr, ph
                    except ConvergenceError:
                        empty_reason = "convergence_failure_even_after_penalty"
                        ph_list = [1.0 for _ in numbers_now]

        # Enrich summary with standardized effects if available
        # beta_std_per_SD = beta * SD
        # HR_per_SD = exp(beta * SD)
        # HR_per_0.05 = exp(beta * 0.05) for small delta interpretation on [0,1]-scaled features
        if isinstance(summary_json, list) and len(summary_json) > 0:
            for row in summary_json:
                cov = row.get("covariate")
                beta = float(row.get("coef", 0.0) or 0.0)
                sd = float(feature_stats.get(cov, {}).get("std", 1.0))
                try:
                    row["beta_std_per_SD"] = float(beta * sd)
                    row["HR_per_SD"] = float(math.exp(beta * sd))
                    row["HR_per_0.05"] = float(math.exp(beta * 0.05))
                except Exception:
                    # if math overflows or cov missing, skip
                    pass

        out = {
          "ok": True,
          "ver": "cox-return-2",
          "summary": summary_json or [],
          "hazard_ratios": hr_json or {},
          "partial_hazards": ph_list or [],
          "numbers": numbers_now or [],
          "corr_columns": corr_columns or [],
          "corr_matrix": corr_matrix or [],
          "diag": {
            "requested_cols": requested_cols,
            "final_x_cols": final_x_cols,
            "removed_constants": removed_constants,
            "empty_reason": empty_reason,
            "has_zone_strata": bool(has_zone_strata),
            "df_fit_rows": int(df_fit.shape[0]),
            "df_fit_cols": int(df_fit.shape[1]),
            "df_now_rows": int(df_now_raw.shape[0]),
            "df_now_cols": int(df_now_raw.shape[1]),
            "df_now_full_rows": int(df_now_full.shape[0]),
            "df_now_full_cols": int(df_now_full.shape[1]),
            "x_cols_len": len(final_x_cols),
            "penalizer": pen,
            "l1_ratio": l1r,
            "feature_stats": feature_stats,
            "standardized_reporting": True
          }
        }
        return json.dumps(out)
    except Exception as e:
        return json.dumps({ "ok": False, "error": str(e) })

_cox_run(dsJSON, nowJSON, fcJSON)
    `;

    const jsonStr = await pyodide.runPythonAsync(pyCode);
    let resp: WireResponse;
    try {
      resp = JSON.parse(String(jsonStr));
    } catch {
      resp = { ok: false, error: "Failed to parse Python JSON result" };
    }

    (self as any).postMessage(resp);
  } catch (err: any) {
    const resp: WireResponse = {
      ok: false,
      error: String(err?.message || err || "Unknown error"),
    };
    (self as any).postMessage(resp);
  }
};