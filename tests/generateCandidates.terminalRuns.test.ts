import { describe, expect, it } from "vitest";
import { generateCandidates, type GenerateCandidatesResult } from "../src/generateCandidates";
import { seededRandom } from "../src/lib/settingsTransparency";
import { terminalRunEvidence, linkedTerminalShapeEvidence, observedTerminalRunKeys, selectedMaximalRuns, satisfiesTerminalRunRule, type TerminalRunRuleOptions } from "../src/lib/terminalDigitRuns";
import { terminalRepetitionShape, buildTerminalShapeOptions } from "../src/lib/terminalShapeQuotas";
import type { Knobs } from "../src/types";

const knobs:Knobs={enableSDE1:false,enableHC3:false,enableOGA:false,enableGPWF:false,enableEntropy:false,enableHamming:false,enableJaccard:false,
  F:0,M:0,Q:0,Y:0,Historical_Weight:0,gpwf_window_size:0,gpwf_bias_factor:0,gpwf_floor:0,gpwf_scale_multiplier:0,lambda:0,octagonal_top:9,exact_set_override:false,hamming_relax:false,gpwf_targeted_mode:false};
const evidence=terminalRunEvidence([
  {date:"2026-10-05",main:[2,13,24,6,17,28],supp:[38,42]},
  {date:"2026-10-07",main:[2,13,24,9,19,29],supp:[39,43]},
]);
const options:TerminalRunRuleOptions={enabled:true,mode:"allocation",selectedRuns:["2-3-4","6-7-8"],runOptions:evidence.options};
function args(count=12):Parameters<typeof generateCandidates> {
  const input:Parameters<typeof generateCandidates>=[count,[],knobs,()=>undefined,[],["4:4","5:3"],false,0,[],[],[],undefined,0,0,1,0,[{ratio:"4:4",count:1},{ratio:"5:3",count:1}]];
  input[39]=10000; input[54]=seededRandom(91); input[56]=options;
  return input;
}
describe("generator exact terminal runs",()=>{
  it("fills the eight-distinct-ending structural request with both exact runs and no historical fallback",()=>{
    const input=args(4); input[5]=["3:5"]; input[16]=[{ratio:"3:5",count:1}];
    const rules={enabled:true,mode:"requireAll" as const,selectedRuns:["2-3-4-5-6","8-9-0"],runOptions:terminalRunEvidence([]).options};
    input[56]=rules;
    input[55]={enabled:true,selectedShapes:["1+1+1+1+1+1+1+1"],allocationBasis:"equal",shapeOptions:buildTerminalShapeOptions([])};
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(4); expect(result.quotaWarning).toBeUndefined();
    result.candidates.forEach(row=>{
      const numbers=[...row.main,...row.supp];
      expect(satisfiesTerminalRunRule(numbers,rules)).toBe(true);
      expect(terminalRepetitionShape(numbers)).toBe("1+1+1+1+1+1+1+1");
      expect(numbers.filter(n=>n%2).length).toBe(3);
    });
    expect(rules.runOptions.every(row=>row.count===0)).toBe(true);
  });
  it("allows explicit equal test allocations for unobserved runs without inventing counts or relaxing exclusions",()=>{
    const rules={...options,allocationBasis:"equal" as const,selectedRuns:["0-1-2","4-5-6"]};
    const input=args(6),trace:string[]=[]; input[5]=[]; input[4]=[45]; input[56]=rules; input[3]=(line)=>trace.push(line);
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(6);expect(result.quotaWarning).toBeUndefined();
    expect(result.candidates.filter(row=>row.terminalRunQuota==="0-1-2")).toHaveLength(3);
    expect(result.candidates.filter(row=>row.terminalRunQuota==="4-5-6")).toHaveLength(3);
    result.candidates.forEach(row=>{
      const numbers=[...row.main,...row.supp];expect(numbers).not.toContain(45);
      expect(selectedMaximalRuns(numbers,rules)).toContain(row.terminalRunQuota);
    });
    expect(trace.some(line=>line.includes("equal user allocation, not historical support"))).toBe(true);
    expect(rules.runOptions.filter(row=>rules.selectedRuns.includes(row.run)).every(row=>row.count===0 && row.percent===0)).toBe(true);
  });
  it("can require the user's two runs and seven-family shape after unlinking an empty joint history sample",()=>{
    const source=[{date:"2026-10-05",main:[1,2,3,4,5,6],supp:[7,17]}];
    const rules={...options,mode:"requireAll" as const,selectedRuns:["0-1-2","4-5-6"],runOptions:terminalRunEvidence(source).options};
    expect(linkedTerminalShapeEvidence(source,rules).matchingDraws).toBe(0);
    const input=args(4); input[5]=[];input[56]=rules;
    input[55]={enabled:true,selectedShapes:["2+1+1+1+1+1+1"],shapeOptions:buildTerminalShapeOptions(source)};
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(4);expect(result.quotaWarning).toBeUndefined();
    result.candidates.forEach(row=>{
      const numbers=[...row.main,...row.supp];
      expect(terminalRepetitionShape(numbers)).toBe("2+1+1+1+1+1+1");
      expect(satisfiesTerminalRunRule(numbers,rules)).toBe(true);
      expect(["2:6","3:5"]).toContain(`${numbers.filter(n=>n%2).length}:${numbers.filter(n=>n%2===0).length}`);
    });
  });
  it("uses every observed run for count-based allocation, not require-all",()=>{
    const input=args(6); input[5]=[];input[56]={...options,useAllObservedRuns:true,selectedRuns:observedTerminalRunKeys(evidence.options)};
    const trace:string[]=[];input[3]=(line)=>trace.push(line);
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(6);
    expect(result.candidates.filter(row=>row.terminalRunQuota==="2-3-4")).toHaveLength(4);
    expect(result.candidates.filter(row=>row.terminalRunQuota==="6-7-8")).toHaveLength(2);
    expect(trace.some(line=>line.includes("all observed runs; real WFMQYH count shares"))).toBe(true);
  });
  it("honors matching-history linked shape quotas and blocks an empty joint sample without any attempts",()=>{
    const source=[
      {date:"2026-10-05",main:[2,12,3,13,4,6],supp:[7,8]},
      {date:"2026-10-07",main:[2,12,22,32,3,13],supp:[4,7]},
    ];
    const rules={...options,selectedRuns:["2-3-4"],runOptions:terminalRunEvidence(source).options};
    const linked=linkedTerminalShapeEvidence(source,rules),input=args(10); input[5]=[];
    input[55]={enabled:true,selectedShapes:linked.selectedShapes,shapeOptions:linked.shapeOptions,sourceError:linked.error};
    input[56]=rules;
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(10);
    expect(result.candidates.filter(row=>terminalRepetitionShape([...row.main,...row.supp])==="4+2+1+1")).toHaveLength(5);
    expect(result.candidates.every(row=>satisfiesTerminalRunRule([...row.main,...row.supp],rules))).toBe(true);
    const all={...options,mode:"requireAll" as const,runOptions:terminalRunEvidence(source).options};
    const empty=linkedTerminalShapeEvidence(source.slice(1),all);
    input[55]={enabled:true,selectedShapes:empty.selectedShapes,shapeOptions:empty.shapeOptions,sourceError:empty.error};input[56]=all;
    const blocked=generateCandidates(...input);
    expect(blocked.rejectionStats.totalAttempts).toBe(0);expect(blocked.candidates).toEqual([]);
    expect(blocked.quotaWarning).toContain("No fallback");
  });
  it("fills joint run/odd-even/shape quotas without weakening hard number rules",()=>{
    const input=args(); input[4]=[45]; input[9]=[2]; input[30]={countMode:"atMost",targetCount:2};
    input[55]={enabled:true,selectedShapes:["2+2+1+1+1+1","3+1+1+1+1+1"],shapeOptions:[{shape:"2+2+1+1+1+1",count:1,percent:50},{shape:"3+1+1+1+1+1",count:1,percent:50}]};
    const trace:string[]=[]; input[3]=(line)=>trace.push(line);
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(12); expect(result.quotaWarning).toBeUndefined();
    expect(result.ratioSummary.acceptedRatios).toEqual({"4:4":6,"5:3":6});
    const assigned:Record<string,number>={},shapes:Record<string,number>={};
    result.candidates.forEach(row=>{
      const numbers=[...row.main,...row.supp]; expect(numbers).toContain(2); expect(numbers).not.toContain(45);
      expect(selectedMaximalRuns(numbers,options)).toContain(row.terminalRunQuota);
      assigned[row.terminalRunQuota!]=(assigned[row.terminalRunQuota!]??0)+1;
      const shape=terminalRepetitionShape(numbers)!; shapes[shape]=(shapes[shape]??0)+1;
      expect(numbers.filter(n=>n%10===2).length).toBeLessThanOrEqual(2);
    });
    expect(assigned).toEqual({"2-3-4":8,"6-7-8":4});
    expect(shapes).toEqual({"2+2+1+1+1+1":6,"3+1+1+1+1+1":6});
    expect(trace.some(line=>line.includes("Terminal run quotas results"))).toBe(true);
    expect(result.rejectionStats.accepted).toBe(12);
  });
  it("requires all genuine separated runs, and never treats a longer run as a match",()=>{
    const input=args(4); input[5]=[]; input[56]={...options,mode:"requireAll"};
    const result=generateCandidates(...input);
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates.every(row=>satisfiesTerminalRunRule([...row.main,...row.supp],input[56]))).toBe(true);
    expect(result.candidates.every(row=>!row.terminalRunQuota)).toBe(true);
  });
  it("blocks missing, merged, zero-observed and forced-boundary requests immediately",()=>{
    for(const selectedRuns of [[],["3-4-5"]]) {
      const input=args(); input[56]={...options,selectedRuns};
      const result=generateCandidates(...input); expect(result.candidates).toEqual([]); expect(result.rejectionStats.totalAttempts).toBe(0);
    }
    const merged=args(); merged[56]={...options,mode:"requireAll",selectedRuns:["2-3-4","3-4-5"]};
    expect(generateCandidates(...merged).quotaWarning).toContain("merge");
    const forced=args(); forced[9]=[5];
    expect(generateCandidates(...forced).quotaWarning).toContain("forced adjacent");
  });
  it("blocks structurally impossible parity/run combinations before sampling",()=>{
    const input=args(4); input[5]=["5:3"]; input[56]={...options,mode:"requireAll"};
    const result=generateCandidates(...input);
    expect(result.candidates).toEqual([]);
    expect(result.rejectionStats.totalAttempts).toBe(0);
    expect(result.quotaWarning).toContain("structurally incompatible");
    const allocation=args(4); allocation[5]=["8:0"];
    const limited=generateCandidates(...allocation);
    expect(limited.rejectionStats.totalAttempts).toBe(0);
    expect(limited.quotaWarning).toContain("structurally incompatible");
  });
  it("keeps Off seeded behaviour unchanged and partials real and quota-limited",()=>{
    const off=args(); off[56]={...options,enabled:false}; const legacy=args(); legacy[56]=undefined;
    expect(generateCandidates(...off)).toEqual(generateCandidates(...legacy));
    const input=args(); const partials:GenerateCandidatesResult[]=[]; input[47]=(result)=>partials.push(result);
    const result=generateCandidates(...input);
    expect(partials.length).toBeGreaterThan(0);
    partials.forEach(partial=>{
      expect(partial.candidates.length).toBeLessThanOrEqual(12);
      expect(partial.candidates.every(row=>selectedMaximalRuns([...row.main,...row.supp],options).includes(row.terminalRunQuota!))).toBe(true);
    });
    expect(result.candidates).toHaveLength(12);
    const short=args(); short[39]=1;
    const limited=generateCandidates(...short); expect(limited.candidates.length).toBeLessThan(12); expect(limited.quotaWarning).toContain("not relaxed");
  });
});
