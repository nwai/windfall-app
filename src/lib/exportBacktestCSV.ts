import type { BacktestResult } from "./backtest";

/**
 * Escape a value for CSV. Wraps in quotes if it contains commas, quotes, or newlines.
 */
function csvEscape(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface ExportBacktestCSVOptions {
  /** Filename for the download (without extension) */
  filename?: string;
  /** Mode used for the backtest */
  mode?: string;
  /** Window size used */
  windowSize?: number;
}

/**
 * Build a CSV string from a BacktestResult.
 * Includes a summary header section and per-draw detail rows.
 */
export function buildBacktestCSV(
  result: BacktestResult,
  options: ExportBacktestCSVOptions = {}
): string {
  const lines: string[] = [];

  // Summary section
  lines.push("# Backtest Summary");
  if (options.mode) lines.push(`Mode,${csvEscape(options.mode)}`);
  if (options.windowSize !== undefined) lines.push(`Window Size,${options.windowSize}`);
  lines.push(`Draws Evaluated,${result.drawsEvaluated}`);
  lines.push(`Mean Excluded (Method),${result.meanExcluded.toFixed(4)}`);
  lines.push(`Mean Excluded (Random),${result.meanExcludedRandom.toFixed(4)}`);
  lines.push(`Delta Mean,${result.deltaMean.toFixed(4)}`);
  if (result.bootstrapCI) {
    lines.push(`Bootstrap CI (95%),${result.bootstrapCI[0].toFixed(4)} to ${result.bootstrapCI[1].toFixed(4)}`);
  }
  lines.push("");

  // Per-draw detail rows
  lines.push("# Per-Draw Detail");
  lines.push("Draw Index,Delta (random − method)");
  for (let i = 0; i < result.deltaPerDraw.length; i++) {
    lines.push(`${i + 1},${result.deltaPerDraw[i].toFixed(4)}`);
  }

  return lines.join("\n");
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadBacktestCSV(
  result: BacktestResult,
  options: ExportBacktestCSVOptions = {}
): void {
  const csv = buildBacktestCSV(result, options);
  const filename = (options.filename || "backtest_results") + ".csv";

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
