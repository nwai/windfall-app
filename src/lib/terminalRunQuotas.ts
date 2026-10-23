import solver, { type Model, type SolveResult } from "javascript-lp-solver";
import { applyCompositionQuotas, buildTerminalShapeQuotas, terminalRepetitionShape, terminalShapeSelectionError, type TerminalShapeQuotaOptions } from "./terminalShapeQuotas";
import { applyOddEvenRatioQuotas, buildOddEvenRatioQuotas, candidateOddEvenRatio, type OddEvenRatioOption } from "./oddEvenRatios";
import { buildTerminalRunQuotas, selectedMaximalRuns, satisfiesTerminalRunRule, terminalRunSelectionError, type TerminalRunRuleOptions } from "./terminalDigitRuns";

type Candidate = { main: number[]; supp?: number[]; trace?: string[]; terminalRunQuota?: string };
interface Bucket<T> { rows: { candidate: T; index: number }[]; ratio: string; shape: string; runs: string[] }
export const TERMINAL_RUN_ALLOCATION_LIMITS = { cells: 512, rows: 100000, solveMs: 250 } as const;

// Integer assignment is needed for three marginal quotas and candidates with multiple distinct runs.
// Only real, filter-passing rows enter the model; one row can receive only one run allocation.
export class RunCompositionQuotaCollector<T extends Candidate> {
  private buckets = new Map<string, Bucket<T>>();
  private retained = 0;
  private nextSolve = 0;
  private dirty = false;
  private picked: T[] = [];
  warning?: string;
  constructor(readonly requested: number, readonly ratioQuotas: Record<string, number>,
    readonly shapeQuotas: Record<string, number>, readonly runQuotas: Record<string, number>, readonly options: TerminalRunRuleOptions,
    private incremental = true) {}
  get size(): number { return this.picked.length }
  add(candidate: T): boolean {
    const numbers = [...candidate.main, ...(candidate.supp ?? [])], shape = terminalRepetitionShape(numbers);
    if (!shape) return false;
    const ratio = candidateOddEvenRatio(candidate);
    const runs = selectedMaximalRuns(numbers, this.options).filter((run) => this.runQuotas[run] > 0).sort();
    const ratioCap = Object.keys(this.ratioQuotas).length ? this.ratioQuotas[ratio] ?? 0 : this.requested;
    const shapeCap = Object.keys(this.shapeQuotas).length ? this.shapeQuotas[shape] ?? 0 : this.requested;
    const cap = Math.min(ratioCap, shapeCap, runs.reduce((sum, run) => sum + this.runQuotas[run], 0));
    if (!cap) return false;
    const key = `${Object.keys(this.ratioQuotas).length ? ratio : "*"}|${Object.keys(this.shapeQuotas).length ? shape : "*"}|${runs.join(";")}`;
    const bucket = this.buckets.get(key) ?? { rows: [], ratio, shape, runs };
    if (bucket.rows.length >= cap) return false;
    if ((!this.buckets.has(key) && this.buckets.size >= TERMINAL_RUN_ALLOCATION_LIMITS.cells)
      || this.retained >= TERMINAL_RUN_ALLOCATION_LIMITS.rows) {
      this.warning = "Terminal run allocation reserve limit reached; narrow the selected runs or quota groups. No quotas were relaxed";
      return false;
    }
    bucket.rows.push({ candidate, index: this.retained++ }); this.buckets.set(key, bucket); this.dirty = true;
    if (this.incremental && this.retained >= this.nextSolve) {
      this.solve();
      this.nextSolve = this.retained + Math.max(8, Math.ceil(this.requested / 8));
    }
    return true;
  }
  private solve(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const model: Model = { optimize: "keep", opType: "max", constraints: { total: { max: this.requested } },
      variables: {}, ints: {}, options: { timeout: TERMINAL_RUN_ALLOCATION_LIMITS.solveMs, tolerance: 0, presolve: true } };
    for (const [group, quotas] of [["ratio", this.ratioQuotas], ["shape", this.shapeQuotas], ["run", this.runQuotas]] as const) {
      Object.entries(quotas).forEach(([key, count]) => { model.constraints[`${group}:${key}`] = { max: count }; });
    }
    const entries = [...this.buckets.values()];
    const variables: { name: string; bucket: Bucket<T>; run: string }[] = [];
    entries.forEach((bucket, index) => {
      const cell = `cell:${index}`;
      model.constraints[cell] = { max: bucket.rows.length };
      bucket.runs.forEach((run) => {
        const name = `pick${variables.length}`;
        const coefficients: Record<string, number> = { keep: 1 + (entries.length - index) / ((this.requested + 1) * (entries.length + 1)), total: 1, [cell]: 1, [`run:${run}`]: 1 };
        if (Object.keys(this.ratioQuotas).length) coefficients[`ratio:${bucket.ratio}`] = 1;
        if (Object.keys(this.shapeQuotas).length) coefficients[`shape:${bucket.shape}`] = 1;
        model.variables[name] = coefficients; model.ints![name] = 1;
        variables.push({ name, bucket, run });
      });
    });
    let result: SolveResult;
    try { result = solver.Solve(model) as SolveResult; }
    catch { this.warning = "Terminal run allocator could not verify an assignment; no quotas were relaxed"; return; }
    if (!result.feasible) return;
    const usage: Record<string, number> = {};
    for (const variable of variables) {
      const raw = result[variable.name] ?? 0;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < -1e-7 || Math.abs(raw - Math.round(raw)) > 1e-7) {
        this.warning = "Terminal run allocator returned an unverified fractional assignment; no quotas were relaxed";
        return;
      }
      const count = Math.max(0, Math.round(raw));
      Object.entries(model.variables[variable.name]).forEach(([key, coefficient]) => {
        if (key !== "keep") usage[key] = (usage[key] ?? 0) + count * coefficient;
      });
    }
    if (Object.entries(usage).some(([key, count]) => count > (model.constraints[key] as { max: number }).max)) {
      this.warning = "Terminal run allocator failed quota verification; no quotas were relaxed";
      return;
    }
    const offsets = new Map<Bucket<T>, number>(), selected: { candidate: T; index: number }[] = [];
    for (const { name, bucket, run } of variables) {
      const count = Math.max(0, Math.round(Number(result[name] ?? 0))), offset = offsets.get(bucket) ?? 0;
      bucket.rows.slice(offset, offset + count).forEach(({ candidate, index }) => selected.push({ index,
        candidate: { ...candidate, terminalRunQuota: run,
          trace: [...(candidate.trace ?? []).filter((line) => !line.startsWith("Terminal run quota:")), `Terminal run quota: assigned exact maximal run ${run}; counted once`] } }));
      offsets.set(bucket, offset + count);
    }
    if (selected.length >= this.picked.length) this.picked = selected.sort((a, b) => a.index - b.index).map((row) => row.candidate);
  }
  values(): T[] { this.solve(); return this.picked.slice() }
}

export function applyTerminalRunCompositionQuotas<T extends Candidate>(candidates: T[], requested: number,
  ratios: string[], ratioOptions: OddEvenRatioOption[], shapes: TerminalShapeQuotaOptions, runs: TerminalRunRuleOptions) {
  const ratioQuotas = buildOddEvenRatioQuotas(requested, ratios, ratioOptions), shapeQuotas = buildTerminalShapeQuotas(requested, shapes);
  const runQuotas = buildTerminalRunQuotas(requested, runs), error = terminalRunSelectionError(runs) ?? (shapes.enabled ? terminalShapeSelectionError(shapes) : null);
  let kept: T[] = [], allocationWarning: string | undefined;
  if (!error) {
    if (runs.mode === "allocation") {
      const collector = new RunCompositionQuotaCollector<T>(requested, ratioQuotas, shapeQuotas, runQuotas, runs, false);
      candidates.forEach((candidate) => collector.add(candidate)); kept = collector.values(); allocationWarning = collector.warning;
    } else {
      const valid = candidates.filter((row) => satisfiesTerminalRunRule([...row.main, ...(row.supp ?? [])], runs));
      if (shapes.enabled) { const result = applyCompositionQuotas(valid, requested, ratios, ratioOptions, shapes); kept = result.candidates; allocationWarning = result.warning; }
      else kept = ratios.length ? applyOddEvenRatioQuotas(valid, requested, ratios, ratioOptions).candidates : valid.slice(0, requested);
    }
  }
  const ratioCounts: Record<string, number> = {}, shapeCounts: Record<string, number> = {}, runCounts: Record<string, number> = {};
  kept.forEach((row) => {
    const ratio = candidateOddEvenRatio(row), shape = terminalRepetitionShape([...row.main, ...(row.supp ?? [])])!;
    ratioCounts[ratio] = (ratioCounts[ratio] ?? 0) + 1; shapeCounts[shape] = (shapeCounts[shape] ?? 0) + 1;
    if (row.terminalRunQuota) runCounts[row.terminalRunQuota] = (runCounts[row.terminalRunQuota] ?? 0) + 1;
  });
  const missing = Object.entries(runQuotas).filter(([key, count]) => count > (runCounts[key] ?? 0))
    .map(([key, count]) => `${key}: ${count - (runCounts[key] ?? 0)}`).join(", ");
  const warning = error ?? allocationWarning ?? (kept.length < requested
    ? `Terminal run composition quotas kept ${kept.length}/${requested}${missing ? `; missing assigned runs [${missing}]` : ""}. Odd/even, shape and run rules were not relaxed; increase attempts/over-generation or review conflicts` : undefined);
  return { candidates: kept, ratioQuotas, shapeQuotas, runQuotas, ratioCounts, shapeCounts, runCounts, warning };
}
