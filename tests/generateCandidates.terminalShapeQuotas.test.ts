import { describe, expect, it } from "vitest";
import { generateCandidates, type GenerateCandidatesResult } from "../src/generateCandidates";
import { seededRandom } from "../src/lib/settingsTransparency";
import { terminalRepetitionShape, type TerminalShapeQuotaOptions } from "../src/lib/terminalShapeQuotas";
import type { Knobs } from "../src/types";

const knobs: Knobs = { enableSDE1:false,enableHC3:false,enableOGA:false,enableGPWF:false,enableEntropy:false,
  enableHamming:false,enableJaccard:false,F:0,M:0,Q:0,Y:0,Historical_Weight:0,gpwf_window_size:0,
  gpwf_bias_factor:0,gpwf_floor:0,gpwf_scale_multiplier:0,lambda:0,octagonal_top:9,exact_set_override:false,
  hamming_relax:false,gpwf_targeted_mode:false };
const options: TerminalShapeQuotaOptions = { enabled:true,selectedShapes:["2+2+1+1+1+1","3+1+1+1+1+1"],
  shapeOptions:[{shape:"2+2+1+1+1+1",count:6,percent:60},{shape:"3+1+1+1+1+1",count:4,percent:40}] };
function args(count=20): Parameters<typeof generateCandidates> {
  const result: Parameters<typeof generateCandidates> = [count,[],knobs,()=>undefined,[],["4:4","5:3"],false,0,[],[],[],undefined,0,0,1,0,
    [{ratio:"4:4",count:1},{ratio:"5:3",count:1}]];
  result[39]=2000; result[54]=seededRandom(17); result[55]=options;
  return result;
}
describe("generator terminal shape quota integration", () => {
  it("fills joint quotas while honouring forced numbers, exclusions and ending counts", () => {
    const input=args(); input[4]=[45]; input[9]=[2]; input[30]={countMode:"atMost",targetCount:2};
    const trace: string[]=[]; input[3]=(line)=>trace.push(line);
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(20); expect(result.quotaWarning).toBeUndefined();
    expect(result.ratioSummary.acceptedRatios).toEqual({"4:4":10,"5:3":10});
    const counts: Record<string,number>={};
    result.candidates.forEach((candidate)=>{
      const nums=[...candidate.main,...candidate.supp];
      expect(nums).toContain(2); expect(nums).not.toContain(45);
      expect(nums.filter(n=>n%10===2).length).toBeLessThanOrEqual(2);
      const shape=terminalRepetitionShape(nums)!; counts[shape]=(counts[shape]??0)+1;
    });
    expect(counts).toEqual({"2+2+1+1+1+1":12,"3+1+1+1+1+1":8});
    expect(trace.some(line=>line.includes("Terminal shape quotas ON"))).toBe(true);
    expect(trace.some(line=>line.includes("Terminal shape quotas results"))).toBe(true);
  });
  it("does not alter the old generator when disabled, including seeded RNG placement", () => {
    const off=args(); off[55]={...options,enabled:false};
    const original=args(); original[55]=undefined;
    expect(generateCandidates(...off)).toEqual(generateCandidates(...original));
  });
  it("generates a deliberate unobserved shape plan without inventing historical counts", () => {
    const input=args(4), trace: string[]=[];
    input[3]=line=>trace.push(line); input[5]=["3:5"]; input[16]=[{ratio:"3:5",count:1}];
    input[55]={ enabled:true, selectedShapes:["1+1+1+1+1+1+1+1"], allocationBasis:"equal",
      shapeOptions:[{shape:"1+1+1+1+1+1+1+1",count:0,percent:0}] };
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates.every(row=>terminalRepetitionShape([...row.main,...row.supp])==="1+1+1+1+1+1+1+1")).toBe(true);
    expect(trace.some(line=>line.includes("equal manual shares (not historical support)"))).toBe(true);
    expect(input[55].shapeOptions[0].count).toBe(0);
  });
  it("blocks incompatible parity/shape marginals without spending an attempt budget", () => {
    const input=args(2); input[5]=["3:5"]; input[16]=[{ratio:"3:5",count:1}];
    input[55]={enabled:true,selectedShapes:["4+4"],shapeOptions:[{shape:"4+4",count:1,percent:100}]};
    const result=generateCandidates(...input);
    expect(result.candidates).toEqual([]); expect(result.rejectionStats.totalAttempts).toBe(0);
    expect(result.quotaWarning).toContain("structurally incompatible");
  });
  it("blocks zero-observed and empty selections instead of assigning fallback weight", () => {
    for(const selectedShapes of [[],["5+3"]]) {
      const input=args(); input[55]={...options,selectedShapes};
      const result=generateCandidates(...input);
      expect(result.candidates).toHaveLength(0); expect(result.quotaWarning).toBeTruthy();
      expect(result.rejectionStats.totalAttempts).toBe(0);
    }
  });
  it("emits valid quota-limited partial results for Stop and Show Partial", () => {
    const input=args(); const partials: GenerateCandidatesResult[]=[];
    input[47]=(result)=>partials.push(result);
    const result=generateCandidates(...input);
    expect(partials.length).toBeGreaterThan(0);
    for(const partial of partials) {
      expect(partial.candidates.length).toBeLessThanOrEqual(20);
      expect(partial.ratioSummary.totalAccepted).toBe(partial.candidates.length);
      expect(Object.values(partial.ratioSummary.acceptedRatios).every(count=>count<=10)).toBe(true);
      expect(partial.candidates.every(row=>options.selectedShapes.includes(terminalRepetitionShape([...row.main,...row.supp])!))).toBe(true);
    }
    expect(result.candidates).toHaveLength(20);
  });
  it("reports attempt-limited shortfalls without inserting fake candidates", () => {
    const input=args(20); input[39]=1;
    const result=generateCandidates(...input);
    expect(result.candidates.length).toBeLessThan(20); expect(result.quotaWarning).toContain("not relaxed");
    expect(result.rejectionStats.totalAttempts).toBe(20);
  });
});
