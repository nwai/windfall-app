export {}; // module scope

/* eslint-disable no-restricted-globals */
/**
 * Debug worker to isolate data transfer into Pyodide.
 * Version: cox-debug-1
 * Phases posted:
 *  - prePython: shows raw JS dataset/now counts
 *  - postPython: after building pandas DataFrames in Python (stub scores)
 *  - pythonError: if Python raised
 *  - jsFallback: if Python completely skipped
 */

let pyodide: any = null;

interface Tabular {
  columns: string[];
  rows: (number | string | boolean | null)[];
}

interface FitRequest {
  cmd: "fit";
  dataset: { columns: string[]; rows: (number | string | boolean | null)[][] };
  now: { columns: string[]; rows: (number | string | boolean | null)[][] };
  fitConfig?: any;
}

interface BasePayload {
  ok: true;
  ver: string;
  phase: string;
  diag: Record<string, any>;
  summary: any[];
  hazard_ratios: Record<string, number>;
  partial_hazards: number[];
  numbers: number[];
  corr_columns: string[];
  corr_matrix: number[][];
}

interface ErrorPayload {
  ok: false;
  ver: string;
  phase: string;
  error: string;
  diag: Record<string, any>;
}

async function initPyodide() {
  if (pyodide) return;
  const mod = await import(
    /* @vite-ignore */ "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs"
  );
  const loadPyodide =
    (mod as any).loadPyodide ?? (mod as any).default?.loadPyodide;
  if (!loadPyodide) throw new Error("Failed to import loadPyodide");

  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/",
  });
  await pyodide.loadPackage(["pandas"]); // minimal
}

function postMessageSafe(msg: any) {
  (self as any).postMessage(msg);
}

self.onmessage = async (evt: MessageEvent<FitRequest>) => {
  const start = Date.now();
  const diag: Record<string, any> = {};
  try {
    const { cmd, dataset, now } = evt.data;
    if (cmd !== "fit") return;

    // Phase: prePython (JS)
    diag.js_dataset_cols = dataset?.columns?.length ?? null;
    diag.js_dataset_rows = dataset?.rows?.length ?? null;
    diag.js_now_cols = now?.columns?.length ?? null;
    diag.js_now_rows = now?.rows?.length ?? null;

    postMessageSafe({
      ok: true,
      ver: "cox-debug-1",
      phase: "prePython",
      diag: { ...diag },
      summary: [],
      hazard_ratios: {},
      partial_hazards: [],
      numbers: [],
      corr_columns: [],
      corr_matrix: [],
    } satisfies BasePayload);

    await initPyodide();

    // Directly pass arrays (no JSON) to Python
    // Convert to Python objects
    const pyDatasetCols = pyodide.toPy(dataset.columns);
    const pyDatasetRows = pyodide.toPy(dataset.rows);
    const pyNowCols = pyodide.toPy(now.columns);
    const pyNowRows = pyodide.toPy(now.rows);

    pyodide.globals.set("_ds_cols", pyDatasetCols);
    pyodide.globals.set("_ds_rows", pyDatasetRows);
    pyodide.globals.set("_now_cols", pyNowCols);
    pyodide.globals.set("_now_rows", pyNowRows);

    // Clear any stale 'out'
    if (pyodide.globals.has("out")) {
      pyodide.globals.delete("out");
    }

    const pyCode = `
import pandas as pd, math, traceback
try:
    ds_cols = list(_ds_cols)
    ds_rows = list(_ds_rows)
    now_cols = list(_now_cols)
    now_rows = list(_now_rows)

    df_raw = pd.DataFrame(ds_rows, columns=ds_cols)
    df_now = pd.DataFrame(now_rows, columns=now_cols)

    if 'number' in df_now.columns:
        numbers = df_now['number'].tolist()
    else:
        numbers = list(range(1, len(df_now)+1))

    # stub partial hazards
    ph = [1.0 for _ in numbers]

    out = {
      "diag": {
        "py_df_raw_rows": int(df_raw.shape[0]),
        "py_df_raw_cols": int(df_raw.shape[1]),
        "py_df_now_rows": int(df_now.shape[0]),
        "py_df_now_cols": int(df_now.shape[1]),
        "py_now_columns": list(df_now.columns)
      },
      "numbers": numbers,
      "partial_hazards": ph
    }
except Exception as e:
    out = {
      "diag": {
        "py_error": str(e),
        "py_trace": traceback.format_exc()
      },
      "numbers": [],
      "partial_hazards": []
    }
`;

    await pyodide.runPythonAsync(pyCode);

    if (!pyodide.globals.has("out")) {
      postMessageSafe({
        ok: true,
        ver: "cox-debug-1",
        phase: "pythonNoOut",
        diag: { ...diag, note: "'out' missing in Python globals" },
        summary: [],
        hazard_ratios: {},
        partial_hazards: [],
        numbers: [],
        corr_columns: [],
        corr_matrix: [],
      } satisfies BasePayload);
      return;
    }

    const pyOut = pyodide.globals.get("out");
    const result = pyOut.toJs({ dict_converter: Object }) as any;

    const pyDiag = result?.diag ?? {};
    const numbers = Array.isArray(result?.numbers) ? result.numbers : [];
    const ph = Array.isArray(result?.partial_hazards)
      ? result.partial_hazards
      : [];

    postMessageSafe({
      ok: true,
      ver: "cox-debug-1",
      phase: pyDiag.py_error ? "pythonError" : "postPython",
      diag: { ...diag, ...pyDiag, elapsed_ms: Date.now() - start },
      summary: [],
      hazard_ratios: {},
      partial_hazards: ph,
      numbers,
      corr_columns: [],
      corr_matrix: [],
    } satisfies BasePayload);
  } catch (e: any) {
    postMessageSafe({
      ok: false,
      ver: "cox-debug-1",
      phase: "jsException",
      error: String(e?.message || e),
      diag: { ...diag, elapsed_ms: Date.now() - start },
    } satisfies ErrorPayload);
  }
};