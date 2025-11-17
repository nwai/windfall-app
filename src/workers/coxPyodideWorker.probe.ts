export {}; // module scope

/* eslint-disable no-restricted-globals */
/**
 * Probe worker: confirms Python runtime variable access before any modeling.
 * Version: cox-probe-1
 */

let pyodide: any = null;

async function initPyodide() {
  if (pyodide) return;
  const mod = await import(
    /* @vite-ignore */ "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs"
  );
  const loadPyodide =
    (mod as any).loadPyodide ?? (mod as any).default?.loadPyodide;
  if (!loadPyodide) throw new Error("Failed to load Pyodide");
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/",
  });
  await pyodide.loadPackage(["pandas"]);
}

self.onmessage = async (evt: MessageEvent<any>) => {
  const start = Date.now();
  const diag: Record<string, any> = {};
  try {
    if (evt.data?.cmd !== "fit") return;
    const dataset = evt.data.dataset;
    const now = evt.data.now;

    diag.js_dataset_rows = dataset?.rows?.length ?? null;
    diag.js_dataset_cols = dataset?.columns?.length ?? null;
    diag.js_now_rows = now?.rows?.length ?? null;
    diag.js_now_cols = now?.columns?.length ?? null;

    // Early post
    (self as any).postMessage({
      ok: true,
      ver: "cox-probe-1",
      phase: "prePython",
      diag: { ...diag },
      summary: [],
      hazard_ratios: {},
      partial_hazards: [],
      numbers: [],
      corr_columns: [],
      corr_matrix: [],
    });

    await initPyodide();

    // Direct pass using JSON (revert to simplest path)
    const dsJSON = JSON.stringify(dataset || {});
    const nowJSON = JSON.stringify(now || {});
    pyodide.globals.set("dsJSON", dsJSON);
    pyodide.globals.set("nowJSON", nowJSON);

    const pyCode = `
import json, sys, traceback
py_version = sys.version
try:
    raw_dataset = json.loads(dsJSON)
    raw_now = json.loads(nowJSON)

    ds_cols = raw_dataset.get("columns", [])
    ds_rows = raw_dataset.get("rows", [])
    now_cols = raw_now.get("columns", [])
    now_rows = raw_now.get("rows", [])

    probe_lengths = {
      "len_ds_cols": len(ds_cols),
      "len_ds_rows": len(ds_rows),
      "len_now_cols": len(now_cols),
      "len_now_rows": len(now_rows)
    }

    import pandas as pd
    df_now = pd.DataFrame(now_rows, columns=now_cols)
    if 'number' in df_now.columns:
        numbers = df_now['number'].tolist()
    else:
        numbers = list(range(1, len(df_now)+1))

    ph_stub = [1.0 for _ in numbers]

    out = {
      "py_version": py_version,
      "probe_lengths": probe_lengths,
      "numbers": numbers,
      "partial_hazards": ph_stub,
      "df_now_rows": int(df_now.shape[0]),
      "df_now_cols": int(df_now.shape[1]),
      "now_columns": list(df_now.columns)
    }
except Exception as e:
    out = {
      "py_version": py_version,
      "py_error": str(e),
      "py_trace": traceback.format_exc(),
      "numbers": [],
      "partial_hazards": []
    }
`;

    await pyodide.runPythonAsync(pyCode);
    const pyOut = pyodide.globals.get("out");
    const result =
      pyOut?.toJs?.({ dict_converter: Object }) ?? pyOut ?? {};

    const numbers = Array.isArray(result.numbers) ? result.numbers : [];
    const ph = Array.isArray(result.partial_hazards)
      ? result.partial_hazards
      : [];

    (self as any).postMessage({
      ok: true,
      ver: "cox-probe-1",
      phase: "postPython",
      diag: {
        ...diag,
        py_version: result.py_version,
        probe_lengths: result.probe_lengths,
        df_now_rows: result.df_now_rows,
        df_now_cols: result.df_now_cols,
        now_columns: result.now_columns,
        py_error: result.py_error,
        py_trace: result.py_trace,
        elapsed_ms: Date.now() - start,
      },
      summary: [],
      hazard_ratios: {},
      partial_hazards: ph,
      numbers,
      corr_columns: [],
      corr_matrix: [],
    });
  } catch (e: any) {
    (self as any).postMessage({
      ok: false,
      ver: "cox-probe-1",
      phase: "jsException",
      error: String(e?.message || e),
      diag: { ...diag, elapsed_ms: Date.now() - start },
    });
  }
};