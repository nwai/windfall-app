import { describe, expect, it } from "vitest";
import { RunCompositionQuotaCollector, applyTerminalRunCompositionQuotas } from "./terminalRunQuotas";
import { terminalRunEvidence, selectedMaximalRuns, type TerminalRunRuleOptions } from "./terminalDigitRuns";
import { terminalRepetitionShape } from "./terminalShapeQuotas";
import { candidateOddEvenRatio } from "./oddEvenRatios";

const candidate=(numbers:number[])=>({main:numbers.slice(0,6),supp:numbers.slice(6)});
const rows=[
  candidate([10,21,32,5,16,27,37,40]),
  candidate([10,21,32,6,17,28,38,40]),
  candidate([10,21,32,5,15,25,35,45]),
  candidate([5,16,27,10,20,30,40,7]),
  candidate([10,21,32,5,16,27,15,25]),
  candidate([10,21,32,5,16,27,17,37]),
];
const evidence=terminalRunEvidence(rows.map((row,i)=>({...row,date:i%2?"2026-10-07":"2026-10-05"})));
const options:TerminalRunRuleOptions={enabled:true,mode:"allocation",selectedRuns:["0-1-2","5-6-7"],
  runOptions:evidence.options.map(row=>({...row,count:optionsCount(row.run)}))};
function optionsCount(run:string) { return ["0-1-2","5-6-7"].includes(run)?1:0; }

describe("joint exact run allocation",()=>{
  it("assigns a multi-run row only once and jointly obeys ratio and shape targets",()=>{
    const shape=terminalRepetitionShape([...rows[0].main,...rows[0].supp])!;
    const collector=new RunCompositionQuotaCollector(2,{"4:4":1,"2:6":1},{[shape]:2},{"0-1-2":1,"5-6-7":1},options);
    rows.slice(0,2).forEach(row=>collector.add(row));
    const result=collector.values(); expect(result).toHaveLength(2);
    expect(result.filter(row=>row.terminalRunQuota==="0-1-2")).toHaveLength(1);
    expect(result.filter(row=>row.terminalRunQuota==="5-6-7")).toHaveLength(1);
    result.forEach(row=>expect(selectedMaximalRuns([...row.main,...row.supp],options)).toContain(row.terminalRunQuota));
  });
  it("matches exhaustive small-pool assignment with three simultaneous quota groups",()=>{
    const shape=terminalRepetitionShape([...rows[0].main,...rows[0].supp])!;
    const ratioQuotas={"4:4":2,"2:6":2,"6:2":1}, shapeQuotas={[shape]:3,"5+1+1+1":1,"3+2+1+1+1":1}, runQuotas={"0-1-2":2,"5-6-7":3};
    for(let mask=0;mask<64;mask++) {
      const present=rows.filter((_,i)=>mask&(1<<i)); let best=0;
      const search=(i:number,counts:Record<string,number>,kept:number)=>{
        if(i===present.length){best=Math.max(best,kept);return;}
        search(i+1,counts,kept);
        const row=present[i], ratio=candidateOddEvenRatio(row), s=terminalRepetitionShape([...row.main,...row.supp])!;
        for(const run of selectedMaximalRuns([...row.main,...row.supp],options)) {
          const keys=[`r:${ratio}`,`s:${s}`,`t:${run}`], caps=[ratioQuotas[ratio as keyof typeof ratioQuotas]??0,shapeQuotas[s as keyof typeof shapeQuotas]??0,runQuotas[run as keyof typeof runQuotas]??0];
          if(keys.some((key,j)=>(counts[key]??0)>=caps[j])) continue;
          search(i+1,{...counts,...Object.fromEntries(keys.map(key=>[key,(counts[key]??0)+1]))},kept+1);
        }
      };
      search(0,{},0);
      const collector=new RunCompositionQuotaCollector(5,ratioQuotas,shapeQuotas,runQuotas,options);
      present.forEach(row=>collector.add(row)); expect(collector.values()).toHaveLength(best);
    }
  });
  it("reports genuine partial output and keeps require-all independent of allocations",()=>{
    const shapes={enabled:false,selectedShapes:[],shapeOptions:[]};
    const partial=applyTerminalRunCompositionQuotas([rows[2]],4,[],[],shapes,options);
    expect(partial.candidates).toHaveLength(1); expect(partial.warning).toContain("not relaxed");
    const all=applyTerminalRunCompositionQuotas(rows,2,[],[],shapes,{...options,mode:"requireAll"});
    expect(all.candidates).toHaveLength(2); expect(all.runQuotas).toEqual({});
    expect(all.candidates.every(row=>selectedMaximalRuns([...row.main,...row.supp],options).length===2)).toBe(true);
  });
});
