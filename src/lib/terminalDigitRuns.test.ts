import { describe, expect, it } from "vitest";
import { maximalTerminalDigitRuns, terminalRunEvidence, terminalRunSelectionError, terminalRunShares, buildTerminalRunQuotas,
  satisfiesTerminalRunRule, terminalRunAvailabilityError, linkedTerminalShapeEvidence, observedTerminalRunKeys, type TerminalRunRuleOptions } from "./terminalDigitRuns";
import { buildTerminalShapeQuotas, terminalShapeSelectionError, terminalShapeShares } from "./terminalShapeQuotas";
import { analyzeEndingDigitSequences } from "./endingDigitSequences";

const draw = (numbers: number[], date = "2026-10-05") => ({ date, main: numbers.slice(0,6), supp: numbers.slice(6) });
const a = draw([2,13,24,6,17,28,38,42]);
const b = draw([2,13,24,35,6,17,28,38], "2026-10-07");
const evidence = terminalRunEvidence([a,b]);
const options: TerminalRunRuleOptions = { enabled: true, mode: "allocation", selectedRuns: ["2-3-4","6-7-8"], runOptions: evidence.options };

describe("maximal terminal digit runs", () => {
  it("counts whole circular runs once, never overlapping sub-runs", () => {
    expect(maximalTerminalDigitRuns([2,13,24,35]).map((r) => r.key)).toEqual(["2-3-4-5"]);
    expect(maximalTerminalDigitRuns([9,10,21,32]).map((r) => r.key)).toEqual(["9-0-1-2"]);
    expect(maximalTerminalDigitRuns([2,13,24,5,16,27]).map((r) => r.key)).toEqual(["2-3-4-5-6-7"]);
    expect(maximalTerminalDigitRuns([2,13,24,6,17,28,38,42]).map((r) => [r.key,r.coveredNumbers]))
      .toEqual([["2-3-4",4],["6-7-8",4]]);
    expect(maximalTerminalDigitRuns([1,11,21,4,14,7])).toEqual([]);
  });
  it("exposes unequal separate runs while keeping the old strongest-run calculation", () => {
    const row = analyzeEndingDigitSequences([draw([10,21,32,43,5,16,27,37])]).perDraw[0];
    expect(row.allRuns.map((run) => run.digits)).toEqual([[0,1,2,3],[5,6,7]]);
    expect(row.maxRuns.map((run) => run.digits)).toEqual([[0,1,2,3]]);
  });
  it("uses real scheduled eight-number rows and does not split a longer run for evidence", () => {
    const result = terminalRunEvidence([a,b,{...a,isSimulated:true},{...a,date:"2026-10-06"},{...a,date:"bad"},{...a,supp:[2,2]},a]);
    expect(result.draws).toBe(2); expect(result.options).toHaveLength(70);
    expect(result.options.find((r) => r.run === "2-3-4")?.count).toBe(1);
    expect(result.options.find((r) => r.run === "3-4-5")?.count).toBe(0);
    expect(result.options.find((r) => r.run === "6-7-8")?.percent).toBe(50);
    expect(result.options.find((r) => r.run === "2-3-4")?.latestOccurrence).toEqual({date:"2026-10-05",drawNumber:1});
    expect(result.options.find((r) => r.run === "3-4-5")?.latestOccurrence).toBeNull();
  });
  it("finds the latest exact occurrence by date and keeps full-history draw numbering in smaller windows", () => {
    const newest={...a,date:"10/9/26"};
    const full=[newest,b,a];
    const source=terminalRunEvidence([newest,a],full);
    expect(source.options.find(row=>row.run==="2-3-4")?.latestOccurrence).toEqual({date:"2026-10-09",drawNumber:3});
    expect(terminalRunEvidence([a],full).options.find(row=>row.run==="2-3-4")?.latestOccurrence)
      .toEqual({date:"2026-10-05",drawNumber:1});
    // A longer run on the later draw is not an occurrence of its shorter sub-run.
    expect(terminalRunEvidence([b,a],full).options.find(row=>row.run==="2-3-4")?.latestOccurrence)
      .toEqual({date:"2026-10-05",drawNumber:1});
    expect(terminalRunEvidence([b],full).options.find(row=>row.run==="2-3-4")?.latestOccurrence).toBeNull();
  });
  it("does not invent draw numbers when the reference history has no matching date", () => {
    expect(terminalRunEvidence([a],[b]).options.find(row=>row.run==="2-3-4")?.latestOccurrence)
      .toEqual({date:"2026-10-05",drawNumber:null});
  });
  it("matches exact combinatorial expectations for every run without simulated samples", () => {
    const choose = (n:number,k:number) => { let x=1; for(let i=1;i<=k;i++) x=x*(n-i+1)/i; return Math.round(x); };
    const totals = new Map<string,number>(); let denominator=0;
    for(let mask=1;mask<1024;mask++) {
      let p=[1,...Array<number>(8).fill(0)]; const digits:number[]=[];
      for(let digit=0;digit<10;digit++) if(mask & (1<<digit)) {
        digits.push(digit); const size=digit>=1&&digit<=5?5:4, next=Array<number>(9).fill(0);
        for(let used=0;used<=8;used++) for(let count=1;count<=size&&used+count<=8;count++) next[used+count]+=p[used]*choose(size,count);
        p=next;
      }
      denominator+=p[8];
      maximalTerminalDigitRuns(digits.map((d)=>d||10)).forEach((run)=>totals.set(run.key,(totals.get(run.key)??0)+p[8]));
    }
    expect(denominator).toBe(choose(45,8));
    evidence.options.forEach((row)=>expect(row.expectedPercent).toBeCloseTo((totals.get(row.run)??0)/denominator*100,10));
  });
  it("separates occurrence rates from allocations and never gives zero counts fallback weight", () => {
    expect(terminalRunShares(options)).toEqual({"2-3-4":50,"6-7-8":50});
    expect(buildTerminalRunQuotas(3,options)).toEqual({"2-3-4":2,"6-7-8":1});
    expect(buildTerminalRunQuotas(10,{...options,selectedRuns:["3-4-5"]})).toEqual({});
    expect(terminalRunSelectionError({...options,selectedRuns:[]})).toContain("no runs");
    expect(buildTerminalRunQuotas(10,{...options,runOptions:options.runOptions.map(row=>({...row,count:Infinity}))})).toEqual({});
  });
  it("requires missing boundary endings and detects touching/overlapping selections", () => {
    const all={...options,mode:"requireAll" as const};
    expect(terminalRunSelectionError(all)).toBeNull();
    expect(satisfiesTerminalRunRule([...a.main,...a.supp],all)).toBe(true);
    expect(satisfiesTerminalRunRule([...b.main,...b.supp],all)).toBe(false);
    for(const selectedRuns of [["2-3-4","3-4-5"],["2-3-4","5-6-7"],["9-0-1","2-3-4"]]) {
      expect(terminalRunSelectionError({...all,selectedRuns})).toContain("merge");
    }
    const pool=Array.from({length:45},(_,i)=>i+1);
    expect(terminalRunAvailabilityError(options,pool,[5])).toContain("forced adjacent");
    expect(terminalRunAvailabilityError(options,pool.filter(n=>n%10!==3),[])).toContain("2-3-4");
    expect(terminalRunSelectionError({...all,selectedRuns:["3-4-5"]})).toBeNull();
  });
  it("selects all genuinely observed runs across lengths and updates when the real window changes", () => {
    expect(observedTerminalRunKeys(evidence.options)).toEqual(["2-3-4", "6-7-8", "2-3-4-5-6-7-8"]);
    expect(observedTerminalRunKeys(terminalRunEvidence([b]).options)).toEqual(["2-3-4-5-6-7-8"]);
    expect(observedTerminalRunKeys(terminalRunEvidence([]).options)).toEqual([]);
    expect(observedTerminalRunKeys(evidence.options.map(row => ({...row, count: Infinity})))).toEqual([]);
    expect(observedTerminalRunKeys([{...evidence.options[0], run: "invalid", count: 1}])).toEqual([]);
  });
  it("allocates unobserved runs equally only by explicit user choice, without modifying evidence", () => {
    const rules = {...options, selectedRuns: ["0-1-2", "4-5-6", "0-1-2"], allocationBasis: "equal" as const};
    const original = structuredClone(evidence.options);
    expect(terminalRunSelectionError(rules)).toBeNull();
    expect(terminalRunShares(rules)).toEqual({"0-1-2": 50, "4-5-6": 50});
    expect(buildTerminalRunQuotas(5, rules)).toEqual({"0-1-2": 3, "4-5-6": 2});
    expect(buildTerminalRunQuotas(1, rules)).toEqual({"0-1-2": 1, "4-5-6": 0});
    for (const count of [0, -1, Infinity, NaN]) expect(buildTerminalRunQuotas(count, rules)).toEqual({});
    expect(terminalRunSelectionError({...rules, allocationBasis: "history"})).toContain("Equal selected runs");
    expect(linkedTerminalShapeEvidence([a,b], rules).matchingDraws).toBe(0);
    expect(linkedTerminalShapeEvidence([a,b], rules).selectedShapes).toEqual([]);
    expect(evidence.options).toEqual(original);
    expect(rules.runOptions.filter(row=>rules.selectedRuns.includes(row.run)).every(row=>row.count===0 && row.percent===0 && row.latestOccurrence===null)).toBe(true);
  });
});

describe("linked exact-run repetition shape evidence", () => {
  const source = [
    draw([2,12,3,13,4,6,7,8], "2026-10-05"),
    draw([2,12,22,32,3,13,4,7], "2026-10-07"),
    draw([6,16,26,7,17,8,18,1], "2026-10-09"),
    draw([2,3,4,5,6,7,8,9], "2026-10-12"),
  ];
  const rules = { ...options, runOptions: terminalRunEvidence(source).options };
  it("derives several shapes from an exact run and uses only matching draws for shares", () => {
    const evidence = linkedTerminalShapeEvidence(source, { ...rules, selectedRuns: ["2-3-4"] });
    expect(evidence.sourceDraws).toBe(4); expect(evidence.matchingDraws).toBe(2);
    expect(evidence.error).toBeNull(); expect(evidence.shapeOptions).toHaveLength(18);
    expect(new Set(evidence.selectedShapes)).toEqual(new Set(["2+2+1+1+1+1", "4+2+1+1"]));
    const quotas = { enabled: true, ...evidence };
    expect(terminalShapeShares(quotas)).toEqual({ "4+2+1+1": 50, "2+2+1+1+1+1": 50 });
    expect(Object.values(buildTerminalShapeQuotas(10, quotas))).toEqual([5,5]);
  });
  it("counts a draw with multiple selected runs once and respects any versus all", () => {
    const any = linkedTerminalShapeEvidence(source, rules);
    expect(any.matchingDraws).toBe(3);
    expect(any.shapeOptions.reduce((sum, row) => sum + row.count, 0)).toBe(3);
    const all = linkedTerminalShapeEvidence(source, { ...rules, mode: "requireAll" });
    expect(all.matchingDraws).toBe(1);
    expect(all.selectedShapes).toEqual(["2+2+1+1+1+1"]);
    expect(all.shapeOptions.find(row => row.count)?.percent).toBe(100);
  });
  it("excludes invalid, simulated, off-schedule and duplicate rows without sub-run credit", () => {
    const mixed = [...source, source[0], { ...source[0], date: "2026-10-14", isSimulated: true },
      { ...source[0], date: "2026-10-06" }, { ...source[0], date: "invalid" },
      { ...source[0], date: "2026-10-16", supp: [2,2] }];
    expect(linkedTerminalShapeEvidence(mixed, rules)).toEqual(linkedTerminalShapeEvidence(source, rules));
    const longer = linkedTerminalShapeEvidence([source[3]], { ...rules, mode: "requireAll", selectedRuns: ["2-3-4"] });
    expect(longer.matchingDraws).toBe(0); expect(longer.selectedShapes).toEqual([]);
  });
  it("updates for a changed window and gives no fallback on an empty or incompatible joint sample", () => {
    expect(linkedTerminalShapeEvidence([source[1]], rules).selectedShapes).toEqual(["4+2+1+1"]);
    const noJointSample = linkedTerminalShapeEvidence(source.slice(1), { ...rules, mode: "requireAll" });
    expect(noJointSample.matchingDraws).toBe(0); expect(noJointSample.selectedShapes).toEqual([]);
    expect(noJointSample.error).toContain("No fallback");
    const quotas = { enabled: true, ...noJointSample, sourceError: noJointSample.error };
    expect(terminalShapeSelectionError(quotas)).toBe(noJointSample.error);
    expect(buildTerminalShapeQuotas(10, quotas)).toEqual({});
    expect(linkedTerminalShapeEvidence(source, { ...rules, selectedRuns: [] }).error).toContain("no runs");
    expect(linkedTerminalShapeEvidence(source, { ...rules, mode: "requireAll", selectedRuns: ["2-3-4", "3-4-5"] }).error).toContain("merge");
  });
});
