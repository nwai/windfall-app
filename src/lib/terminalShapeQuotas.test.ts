import { describe, expect, it } from "vitest";
import { TERMINAL_REPETITION_SHAPES, terminalRepetitionShape, buildTerminalShapeOptions, buildTerminalShapeQuotas,
  terminalShapeShares, terminalShapeSelectionError, CompositionQuotaCollector, applyCompositionQuotas, compositionFeasibleCount,
  type TerminalShapeQuotaOptions } from "./terminalShapeQuotas";

const a = "2+2+1+1+1+1", b = "3+1+1+1+1+1";
const candidate = (numbers: number[]) => ({ main: numbers.slice(0, 6), supp: numbers.slice(6) });
const ax = candidate([2,12,7,17,21,33,34,40]); // 4:4
const ay = candidate([2,12,7,17,21,33,35,40]); // 5:3
const bx = candidate([2,12,22,7,11,13,15,40]); // 4:4
const by = candidate([1,11,21,3,5,2,4,6]); // 5:3
const options: TerminalShapeQuotaOptions = { enabled: true, selectedShapes: [a,b],
  shapeOptions: [{ shape: a, count: 6, percent: 60 }, { shape: b, count: 4, percent: 40 }] };

describe("terminal repetition quotas", () => {
  it("enumerates exactly the 18 feasible unordered eight-number shapes", () => {
    expect(TERMINAL_REPETITION_SHAPES).toHaveLength(18);
    expect(new Set(TERMINAL_REPETITION_SHAPES).size).toBe(18);
    for (const shape of TERMINAL_REPETITION_SHAPES) {
      const parts = shape.split("+").map(Number);
      expect(parts.reduce((sum,n) => sum+n,0)).toBe(8);
      expect(Math.max(...parts)).toBeLessThanOrEqual(5);
    }
  });
  it("counts families, not digit names or order; rejects malformed eight-number rows", () => {
    expect(terminalRepetitionShape([...ax.main,...ax.supp].reverse())).toBe(a);
    expect(terminalRepetitionShape([...bx.main,...bx.supp])).toBe(b);
    expect(terminalRepetitionShape([1,1,2,3,4,5,6,7])).toBeNull();
    expect(terminalRepetitionShape([1,2,3,4,5,6])).toBeNull();
    expect(terminalRepetitionShape([1,2,3,4,5,6,7,46])).toBeNull();
  });
  it("uses only actual scheduled, valid, non-simulated draw rows", () => {
    const valid = { ...ax, date: "2026-10-05" };
    const observed = buildTerminalShapeOptions([valid, { ...valid, isSimulated: true },
      { ...valid, date: "2026-10-06" }, { ...valid, date: "bad" }, { ...valid, supp: [2,2] }]);
    expect(observed).toHaveLength(18);
    expect(observed.reduce((sum,row) => sum+row.count,0)).toBe(1);
    expect(observed.find((row) => row.shape === a)?.percent).toBe(100);
  });
  it("redistributes real counts, rounds to requested count and never invents weights", () => {
    expect(buildTerminalShapeQuotas(10,options)).toEqual({ [a]:6,[b]:4 });
    expect(buildTerminalShapeQuotas(3,options)).toEqual({ [a]:2,[b]:1 });
    expect(terminalShapeShares({ ...options, selectedShapes:[b] })).toEqual({ [b]:100 });
    expect(buildTerminalShapeQuotas(10,{ ...options, enabled:false })).toEqual({});
    const zero = { ...options, selectedShapes:["5+3"] };
    expect(buildTerminalShapeQuotas(10,zero)).toEqual({});
    expect(terminalShapeSelectionError(zero)).toContain("no real WFMQYH observations");
    expect(terminalShapeSelectionError({ ...options, selectedShapes:[] })).toContain("no shapes");
    expect(buildTerminalShapeQuotas(10, { ...options, selectedShapes:[a],
      shapeOptions:[{ shape:a, count:Infinity, percent:100 }] })).toEqual({});
  });
  it("allows explicit equal manual shape shares without changing zero historical counts", () => {
    const shapeOptions = buildTerminalShapeOptions([]);
    const plan = { enabled: true, selectedShapes: [a,b], shapeOptions, allocationBasis: "equal" as const };
    expect(terminalShapeSelectionError(plan)).toBeNull();
    expect(terminalShapeShares(plan)).toEqual({ [a]: 50, [b]: 50 });
    expect(buildTerminalShapeQuotas(5, plan)).toEqual({ [a]: 3, [b]: 2 });
    expect(shapeOptions.every(row => row.count === 0 && row.percent === 0)).toBe(true);
    expect(terminalShapeSelectionError({ ...plan, allocationBasis: "history" })).toContain("no real WFMQYH observations");
    expect(terminalShapeSelectionError({ ...plan, selectedShapes: ["bad"] })).not.toBeNull();
  });
  it("repairs a greedy marginal trap using a residual path", () => {
    const collector = new CompositionQuotaCollector(2,{ "4:4":1,"5:3":1 },{ [a]:1,[b]:1 });
    collector.add(ax); collector.add(bx); collector.add(ay);
    expect(collector.size).toBe(2);
    expect(collector.values()).toEqual([bx,ay]);
  });
  it("matches exhaustive maximum cardinality across all small joint-cell subsets", () => {
    const rows = [ax,ax,ay,ay,bx,bx,by,by];
    for (let mask=0; mask<256; mask++) {
      const present = rows.filter((_,i) => mask & (1<<i));
      const collector = new CompositionQuotaCollector(4,{ "4:4":2,"5:3":2 },{ [a]:2,[b]:2 });
      present.forEach((row) => collector.add(row));
      let best=0;
      for (let subset=0; subset<(1<<present.length); subset++) {
        const chosen = present.filter((_,i) => subset & (1<<i));
        const x=chosen.filter((row) => row===ax || row===bx).length;
        const countA=chosen.filter((row) => row===ax || row===ay).length;
        if (x<=2 && chosen.length-x<=2 && countA<=2 && chosen.length-countA<=2) best=Math.max(best,chosen.length);
      }
      expect(collector.size).toBe(best);
      expect(collector.values()).toHaveLength(best);
    }
  });
  it("jointly selects final ranked survivors and reports partial quotas without relaxing", () => {
    const result = applyCompositionQuotas([ax,bx,ay],2,["4:4","5:3"],[{ ratio:"4:4", count:1 },{ ratio:"5:3", count:1 }],
      { ...options, shapeOptions:options.shapeOptions.map((item) => ({ ...item,count:1 })) });
    expect(result.candidates).toEqual([bx,ay]); expect(result.warning).toBeUndefined();
    const partial=applyCompositionQuotas([ax],2,[],[],options);
    expect(partial.candidates).toEqual([ax]); expect(partial.warning).toContain("1/2");
    expect(partial.warning).toContain("not relaxed");
  });
  it("checks joint structural feasibility including exclusions, forced counts and digit bounds", () => {
    const pool=Array.from({length:45},(_,i)=>i+1), bounds=Array.from({length:10},()=>({min:0,max:8}));
    expect(compositionFeasibleCount(2,{ "4:4":1,"5:3":1 },{ [a]:1,[b]:1 },pool,[],bounds)).toBe(2);
    expect(compositionFeasibleCount(2,{ "4:4":2 },{ "4+4":1,[a]:1 },pool,[],bounds)).toBe(2);
    expect(compositionFeasibleCount(1,{ "3:5":1 },{ "4+4":1 },pool,[],bounds)).toBe(0);
    expect(compositionFeasibleCount(1,{}, { [a]:1 },pool,[1,11,21],bounds)).toBe(0);
    expect(compositionFeasibleCount(1,{}, { "5+3":1 },pool.filter((n)=>n%10===0||n%10===6),[],bounds)).toBe(0);
    expect(compositionFeasibleCount(1,{}, { [a]:1 },pool,[],bounds,(count)=>count===3)).toBe(0);
  });
});
