import { describe, expect, it } from "vitest";
import { monthlyDigitVectorFeasible, terminalCompositionPreview } from "./terminalCompositionPlanner";
import { terminalRunEvidence, type TerminalRunRuleOptions } from "./terminalDigitRuns";
import { MONTHLY_BUCKET_KEYS, type MonthlyBucketSets } from "./monthlyDrawSummary";
import { analyzeGenerationPreflight } from "./generationPreflight";
const available = Array.from({ length: 45 }, (_, i) => i+1);
const zeroMonthlyFrequencyConstraints = () => ({ undrawn: 0, times1: 0, times2: 0, times3: 0, times4: 0, times5: 0, times6: 0, times7: 0, times8: 0 });
const runs: TerminalRunRuleOptions = { enabled: true, mode: "requireAll", selectedRuns: ["2-3-4-5-6", "8-9-0"], runOptions: terminalRunEvidence([]).options };
describe("terminal composition planner structural checks", () => {
  it("identifies the eight-distinct-digit composition without needing historical observations", () => {
    const preview = terminalCompositionPreview(runs, available, []);
    expect(preview.error).toBeNull(); expect(preview.shapes).toEqual(["1+1+1+1+1+1+1+1"]); expect(preview.ratios).toEqual(["3:5"]);
    expect(terminalCompositionPreview({ ...runs, selectedRuns: ["2-3-4-5", "4-5-6", "8-9-0"] }, available, []).mergedRuns).toEqual(["2-3-4-5-6", "8-9-0"]);
    expect(terminalCompositionPreview({ ...runs, mode: "allocation", allocationBasis: "history" }, available, []).error).not.toBeNull();
    expect(terminalCompositionPreview({ ...runs, mode: "allocation", allocationBasis: "equal" }, available, []).error).toBeNull();
  });
  it("cross-checks monthly minima and forced numbers against digit capacity", () => {
    const buckets = Object.fromEntries(MONTHLY_BUCKET_KEYS.map(key => [key, new Set<number>()])) as MonthlyBucketSets;
    available.forEach(n => (n%2 ? buckets.times1 : buckets.undrawn).add(n));
    const monthly = { counts: { ...zeroMonthlyFrequencyConstraints(), times1: 4 }, buckets };
    const vector = [1,0,1,1,1,1,1,0,1,1];
    expect(monthlyDigitVectorFeasible(vector, available, [], monthly)).toBe(false);
    expect(terminalCompositionPreview(runs, available, [], monthly).ratios).toEqual([]);
    monthly.counts.times1 = 3;
    expect(monthlyDigitVectorFeasible(vector, available, [2,3], monthly)).toBe(true);
    expect(monthlyDigitVectorFeasible(vector, available, [2,12], monthly)).toBe(false);
    expect(analyzeGenerationPreflight({ mode: "standard", requested: 4, forcedNumbers: [], excludedNumbers: [], runs,
      monthly: { ...monthly, counts: { ...monthly.counts, times1: 4 } } }).blockers).not.toEqual([]);
  });
  it("matches exhaustive row feasibility for a bounded real-number test pool", () => {
    const pool = [1,2,3,4,5,6,7,8,9,10];
    const buckets = Object.fromEntries(MONTHLY_BUCKET_KEYS.map(key => [key, new Set<number>()])) as MonthlyBucketSets;
    pool.forEach(n => (n <= 4 ? buckets.times1 : buckets.undrawn).add(n));
    for (let required=0; required<=5; required++) {
      const monthly = { counts: { ...zeroMonthlyFrequencyConstraints(), times1: required }, buckets };
      const vectors = new Map<string, number[]>();
      const good = new Set<string>();
      for (let a=0; a<10; a++) for (let b=a+1; b<10; b++) {
        const row = pool.filter((_,i) => i!==a && i!==b);
        const vector = Array<number>(10).fill(0); row.forEach(n=>vector[n%10]++);
        vectors.set(vector.join(), vector);
        if (row.filter(n=>buckets.times1.has(n)).length>=required) good.add(vector.join());
      }
      for (const [key, vector] of vectors) expect(monthlyDigitVectorFeasible(vector,pool,[],monthly)).toBe(good.has(key));
    }
  });
});
