import type { CandidateSet } from "../types";
import { terminalRepetitionShape } from "./terminalShapeQuotas";
import { maximalTerminalDigitRuns } from "./terminalDigitRuns";
import { MONTHLY_BUCKET_KEYS, type MonthlyBucketSets } from "./monthlyDrawSummary";

export interface GeneratedCompositionRow {
  position: number;
  shape: string;
  runs: string[];
  ratio: string;
  terminalCounts: number[];
  monthlyCounts: number[] | null;
  singleDigits: number;
  twoDigits: number;
}
export interface GeneratedCompositionSnapshot {
  source: "RwR45";
  context: string;
  rows: GeneratedCompositionRow[];
  invalidRows: number;
  shapeCounts: Record<string, number>;
  ratioCounts: Record<string, number>;
  runCounts: Record<string, number>;
  terminalHits: number[];
  terminalRows: number[];
}

export function captureRwR45Composition(candidates: readonly CandidateSet[], buckets: MonthlyBucketSets | null, context: string): GeneratedCompositionSnapshot {
  const rows: GeneratedCompositionRow[] = [];
  const shapeCounts: Record<string, number> = {}, runCounts: Record<string, number> = {}, ratioCounts: Record<string, number> = {};
  const terminalHits = Array<number>(10).fill(0), terminalRows = Array<number>(10).fill(0);
  candidates.forEach((candidate, index) => {
    const numbers = [...candidate.main, ...candidate.supp], shape = terminalRepetitionShape(numbers);
    if (candidate.main.length !== 6 || candidate.supp.length !== 2 || !shape) return;
    const terminalCounts = Array<number>(10).fill(0);
    numbers.forEach((n) => terminalCounts[n % 10]++);
    const runs = maximalTerminalDigitRuns(numbers).map((run) => run.key);
    const odd = numbers.filter((n) => n % 2 === 1).length;
    rows.push({ position: index + 1, shape, runs, ratio: `${odd}:${8 - odd}`, terminalCounts,
      monthlyCounts: buckets && numbers.every((n) => MONTHLY_BUCKET_KEYS.filter((key) => buckets[key].has(n)).length === 1)
        ? MONTHLY_BUCKET_KEYS.map((key) => numbers.filter((n) => buckets[key].has(n)).length) : null,
      singleDigits: numbers.filter((n) => n < 10).length, twoDigits: numbers.filter((n) => n >= 10).length });
    shapeCounts[shape] = (shapeCounts[shape] ?? 0) + 1;
    const ratio = `${odd}:${8 - odd}`;
    ratioCounts[ratio] = (ratioCounts[ratio] ?? 0) + 1;
    runs.forEach((run) => { runCounts[run] = (runCounts[run] ?? 0) + 1; });
    terminalCounts.forEach((count, digit) => { terminalHits[digit] += count; if (count) terminalRows[digit]++; });
  });
  return { source: "RwR45", context, rows, invalidRows: candidates.length - rows.length, shapeCounts, ratioCounts, runCounts, terminalHits, terminalRows };
}

export function generatedCompositionTrace(snapshot: GeneratedCompositionSnapshot): string[] {
  return snapshot.rows.map((row) => `[TRACE] RwR45 actual composition row ${row.position}: odd/even ${row.ratio}; shape ${row.shape}; exact runs ${row.runs.join(" / ") || "none"}; terminal counts ${row.terminalCounts.map((count, digit) => `${digit}:${count}`).join(" ")}; bucket origins ${row.monthlyCounts ? row.monthlyCounts.map((count, index) => `${index === 8 ? "8x+" : `${index}x`}:${count}`).join(" ") : "unavailable"}; single/two-digit ${row.singleDigits}/${row.twoDigits}; ${snapshot.context}. Observed output only; settings unchanged.`);
}
