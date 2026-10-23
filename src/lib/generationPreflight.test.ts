import { describe, expect, it } from "vitest";
import { analyzeGenerationPreflight, generationPreflightTrace, removedForcedInclusions, type GenerationPreflightOptions } from "./generationPreflight";
import { createEmptyMonthlyBucketSets } from "./monthlyDrawSummary";
import { terminalRunEvidence } from "./terminalDigitRuns";

const options = (extra: Partial<GenerationPreflightOptions> = {}): GenerationPreflightOptions => ({
  mode: "standard", requested: 4, forcedNumbers: [], excludedNumbers: [], ...extra,
});
const check = (extra: Partial<GenerationPreflightOptions> = {}) => analyzeGenerationPreflight(options(extra));
const zeroMonthlyFrequencyConstraints = () => ({ undrawn: 0, times1: 0, times2: 0, times3: 0, times4: 0, times5: 0, times6: 0, times7: 0, times8: 0 });
describe("generation preflight necessary-condition checks", () => {
  it("blocks forced/excluded conflicts, overflow and insufficient eligible selections", () => {
    expect(check({ forcedNumbers: [7], excludedNumbers: [7] }).blockers[0].message).toContain("7");
    expect(check({ forcedNumbers: [1,2,3,4,5,6,7,8,9] }).blockers[0].message).toContain("9 forced");
    expect(check({ excludedNumbers: Array.from({ length: 38 }, (_, i) => i + 1) }).eligibleCount).toBe(7);
    expect(check({ excludeUnselected: true, userSelectedNumbers: [1,2,3,4,5,6,7] }).blockers).not.toEqual([]);
  });
  it("detects drought inclusions exceeding exact terminal counts but permits at-least rules", () => {
    const endingDigits = Array.from({ length: 10 }, () => ({}));
    endingDigits[7] = { countMode: "exactly", targetCount: 1 };
    expect(check({ forcedNumbers: [7,17], endingDigits }).blockers[0].message).toContain("2 forced numbers");
    endingDigits[7] = { countMode: "atLeast", targetCount: 1 };
    expect(check({ forcedNumbers: [7,17], endingDigits }).blockers).toEqual([]);
  });
  it("uses the engine structural check for shapes, ratios and forced run boundaries", () => {
    expect(check({ forcedNumbers: [7,17], shapes: { enabled: true, selectedShapes: ["1+1+1+1+1+1+1+1"], shapeOptions: [{ shape: "1+1+1+1+1+1+1+1", count: 1, percent: 100 }] } }).blockers).not.toEqual([]);
    expect(check({ forcedNumbers: [7], ratios: ["0:8"], ratioOptions: [{ ratio: "0:8", count: 1 }] }).blockers[0].target).toBe("ratios");
    const runs = { enabled: true, mode: "requireAll" as const, selectedRuns: ["2-3-4"], runOptions: terminalRunEvidence([]).options };
    expect(check({ forcedNumbers: [25], runs }).blockers[0].message).toContain("forced adjacent endings");
    expect(check({ forcedNumbers: [22], runs }).blockers).toEqual([]);
  });
  it("detects bucket shortages and forced picks leaving insufficient monthly slots", () => {
    const buckets = createEmptyMonthlyBucketSets();
    buckets.undrawn = new Set(Array.from({ length: 37 }, (_, i) => i + 1));
    buckets.times1 = new Set([38,39,40,41,42,43,44,45]);
    const counts = { ...zeroMonthlyFrequencyConstraints(), undrawn: 6, times1: 2 };
    expect(check({ forcedNumbers: [38,39,40], monthly: { buckets, counts } }).blockers).not.toEqual([]);
    expect(check({ forcedNumbers: [38,39], monthly: { buckets, counts } }).blockers).toEqual([]);
    expect(check({ monthly: { buckets, counts: { ...counts, times1: 3 } } }).blockers[0].message).toContain("total 9");
  });
  it("accounts for overlap rather than adding strict/empirical quotas blindly", () => {
    const requirements = [
      { label: "Strict", numbers: [1,2,3,4,5], min: 5, target: "droughtGovernor" as const },
      { label: "Empirical", numbers: [5,6,7,8,9], min: 5, target: "droughtGovernor" as const },
    ];
    expect(check({ requirements }).blockers[0].message).toContain("more distinct numbers");
    requirements[1].numbers = [4,5,6,7,8];
    expect(check({ requirements }).blockers).toEqual([]);
  });
  it("catches repeat-pool vs monthly contradictions before sampling", () => {
    const buckets = createEmptyMonthlyBucketSets(); buckets.undrawn = new Set([1,2,3,4]);
    const result = check({ monthly: { counts: { ...zeroMonthlyFrequencyConstraints(), undrawn: 2 }, buckets },
      requirements: [{ label: "Newest-draw pool", numbers: [10,11,12,13,14,15,16,17], min: 8, target: "overlap" }] });
    expect(result.blockers.some((issue) => issue.message.includes("more distinct numbers"))).toBe(true);
  });
  it("does not enforce bypassed terminal/overlap rules in RwR45 but retains actual hard checks", () => {
    const result = check({ mode: "rwr45", forcedNumbers: [7,17], shapes: { enabled: true, selectedShapes: [], shapeOptions: [] },
      endingDigits: Array.from({ length: 10 }, () => ({ countMode: "exactly", targetCount: 0 })),
      requirements: [{ label: "Overlap", numbers: [], min: 8, target: "overlap" }], bypassedRules: ["Terminal shape quotas"] });
    expect(result.blockers).toEqual([]); expect(result.notices.join(" ")).toContain("Configured but bypassed");
    expect(check({ mode: "rwr45", forcedNumbers: [7], excludedNumbers: [7] }).blockers).not.toEqual([]);
  });
  it("records source-specific removals and never claims complete feasibility", () => {
    expect(removedForcedInclusions([{ label: "Drought", numbers: [7,17] }, { label: "Trends", numbers: [7] }], [{ label: "HC3", numbers: [7] }]))
      .toEqual([{ number: 7, inclusionSources: ["Drought", "Trends"], exclusionSources: ["HC3"] }]);
    expect(generationPreflightTrace(check())[0]).toContain("not a complete feasibility proof");
    expect(generationPreflightTrace(check({ forcedNumbers: [7], excludedNumbers: [7] }))[0]).toContain("BLOCKED");
  });
});
