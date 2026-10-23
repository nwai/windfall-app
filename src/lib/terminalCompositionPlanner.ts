import { maximalTerminalDigitRuns, satisfiesTerminalRunRule, terminalRunSelectionError, type TerminalRunRuleOptions } from "./terminalDigitRuns";
import { compositionFeasibleCount, TERMINAL_REPETITION_SHAPES } from "./terminalShapeQuotas";
import { MONTHLY_BUCKET_KEYS, type MonthlyBucketSets, type MonthlyFrequencyConstraints } from "./monthlyDrawSummary";

// Exact capacity check for a digit-count vector and a partition of eligible numbers into month buckets.
// Bucket deficits and the spare-slot sink exhaust total demand, so every lower bound must be filled.
export function monthlyDigitVectorFeasible(vector: number[], available: number[], forced: number[],
  monthly?: { counts: MonthlyFrequencyConstraints; buckets: MonthlyBucketSets | null } | null): boolean {
  if (!monthly?.buckets) return true;
  const { buckets, counts } = monthly;
  const fixed = new Set(forced);
  const demands = vector.map((n, digit) => n - forced.filter(n => n % 10 === digit).length);
  if (demands.some(n => n < 0)) return false;
  const remaining = demands.reduce((a,b) => a+b, 0);
  const deficits = MONTHLY_BUCKET_KEYS.map(key => Math.max(0, counts[key] - forced.filter(n => buckets[key].has(n)).length));
  const total = deficits.reduce((a,b) => a+b, 0);
  if (total > remaining) return false;
  if (total === 0) return true;
  const sink = 21, free = 20;
  const capacity = Array.from({ length: 22 }, () => Array<number>(22).fill(0));
  demands.forEach((count, digit) => { capacity[0][digit + 1] = count; });
  for (const n of available) {
    if (fixed.has(n)) continue;
    MONTHLY_BUCKET_KEYS.forEach((key, index) => { if (buckets[key].has(n)) capacity[n % 10 + 1][11 + index]++; });
  }
  deficits.forEach((count, index) => { capacity[11 + index][sink] = count; capacity[11 + index][free] = remaining; });
  capacity[free][sink] = remaining - total;
  let flow = 0;
  for (;;) {
    const parent = Array<number>(22).fill(-1), queue = [0]; parent[0] = 0;
    for (let cursor = 0; cursor < queue.length && parent[sink] < 0; cursor++) {
      const node = queue[cursor];
      for (let next = 1; next < 22; next++) if (parent[next] < 0 && capacity[node][next] > 0) { parent[next] = node; queue.push(next); }
    }
    if (parent[sink] < 0) return flow === remaining;
    let amount = remaining;
    for (let n = sink; n !== 0; n = parent[n]) amount = Math.min(amount, capacity[parent[n]][n]);
    for (let n = sink; n !== 0; n = parent[n]) { capacity[parent[n]][n] -= amount; capacity[n][parent[n]] += amount; }
    flow += amount;
    if (flow === remaining) return true;
  }
}

export function terminalCompositionPreview(runs: TerminalRunRuleOptions, available: number[], forced: number[],
  monthly?: { counts: MonthlyFrequencyConstraints; buckets: MonthlyBucketSets | null } | null) {
  const error = runs.enabled ? terminalRunSelectionError(runs) : null;
  const cells = new Map<string, { shape: string; ratio: string }>();
  if (!error) compositionFeasibleCount(1, {}, { "*": 1 }, available, forced,
    Array.from({ length: 10 }, () => ({ min: 0, max: 8 })), undefined, vector => {
      const digits = vector.flatMap((count, digit) => count ? [digit || 10] : []);
      if (runs.enabled && !satisfiesTerminalRunRule(digits, runs)) return false;
      if (!monthlyDigitVectorFeasible(vector, available, forced, monthly)) return false;
      const shape = vector.filter(Boolean).sort((a,b) => b-a).join("+");
      const odd = vector.reduce((sum, count, digit) => sum + (digit % 2 ? count : 0), 0);
      const ratio = `${odd}:${8-odd}`;
      cells.set(`${shape}|${ratio}`, { shape, ratio });
      return true;
    });
  const rows = [...cells.values()];
  return { error, cells: rows, shapes: TERMINAL_REPETITION_SHAPES.filter(shape => rows.some(row => row.shape === shape)),
    ratios: [...new Set(rows.map(row => row.ratio))].sort(),
    mergedRuns: maximalTerminalDigitRuns(runs.selectedRuns.flatMap(run => run.split("-").map(digit => Number(digit) || 10))).map(run => run.key) };
}
