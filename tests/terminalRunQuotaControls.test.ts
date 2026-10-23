import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import TerminalRunQuotaControls from "../src/components/TerminalRunQuotaControls";
import { terminalRunEvidence, type TerminalRunRuleOptions } from "../src/lib/terminalDigitRuns";

const evidence=terminalRunEvidence([{date:"2026-10-05",main:[2,13,24,6,17,28],supp:[38,42]}]);
const options:TerminalRunRuleOptions={enabled:false,mode:"allocation",selectedRuns:[],runOptions:evidence.options};
const render=(override:Partial<TerminalRunRuleOptions>={},bypassed=false)=>renderToStaticMarkup(React.createElement(TerminalRunQuotaControls,{options:{...options,...override},sourceDraws:1,requested:10,bypassed,onChange:()=>undefined,onAllObservedChange:()=>undefined}));
describe("terminal run quota controls",()=>{
  it("shows real maximal-run evidence, mathematical baseline, accessible controls and default Off",()=>{
    const html=render();
    expect(html).toContain("OFF · No terminal run rule"); expect(html).toContain("Occurrence %"); expect(html).toContain("Exact random %");
    expect(html).toContain("Allocation %"); expect(html).toContain("Not observed"); expect(html).toContain("exact maximal runs only");
    expect(html).toContain("Latest occurrence");
    expect(html).toContain('D1 \u00b7 <time dateTime="2026-10-05">10/5/26</time>');
    expect(html).toContain('aria-label="Not observed in this WFMQYH window"');
    expect(html).toContain("About exact terminal run quotas"); expect(html).toContain("2-3-4-5 is one run"); expect(html).toContain("aria-label=\"Terminal run mode\"");
    expect((html.match(/exact terminal run"/g)??[]).length).toBe(10);
  });
  it("shows allocation targets, required-all mode, errors, bypass and removable hidden selections",()=>{
    expect(render({enabled:true,selectedRuns:["2-3-4"]})).toContain("10/10");
    expect(render({enabled:true,mode:"requireAll",selectedRuns:["2-3-4","6-7-8"]})).toContain("Extra separate runs are allowed");
    expect(render({enabled:true,mode:"requireAll",selectedRuns:["2-3-4","3-4-5"]})).toContain("would merge");
    expect(render({selectedRuns:["2-3-4-5"]})).toContain("Remove terminal run 2-3-4-5");
    expect(render({},true)).toContain("bypasses terminal run rules");
  });
  it("pins selected runs above numeric/latest sorting and keeps missing values last within each group",async()=>{
    const runOptions=evidence.options.filter(row=>row.digits.length===3).slice(0,5).map((row,index)=>({...row,count:index+1,
      latestOccurrence:index<3?{date:"2026-10-05",drawNumber:[9,10,100][index]}:index===3?{date:"2026-10-05",drawNumber:null}:null}));
    const onChange=vi.fn(),container=document.createElement("div");document.body.appendChild(container);
    const root=createRoot(container);
    const previousActEnvironment=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const order=()=>Array.from(container.querySelectorAll('tbody th[scope="row"]')).map(cell=>cell.textContent);
    try {
      await act(async()=>root.render(React.createElement(TerminalRunQuotaControls,{options:{...options,runOptions,selectedRuns:["1-2-3"]},sourceDraws:15,requested:10,bypassed:false,onChange,onAllObservedChange:()=>undefined})));
      expect(order()).toEqual(["1-2-3","4-5-6","3-4-5","2-3-4","0-1-2"]);
      const button=container.querySelector('button[aria-label="Sort latest occurrence by draw number"]') as HTMLButtonElement;
      expect(button.closest("th")?.getAttribute("aria-sort")).toBe("none");
      await act(async()=>button.click());
      expect(order()).toEqual(["1-2-3","2-3-4","0-1-2","4-5-6","3-4-5"]);
      expect(button.closest("th")?.getAttribute("aria-sort")).toBe("descending");
      await act(async()=>button.click());
      expect(order()).toEqual(["1-2-3","0-1-2","2-3-4","4-5-6","3-4-5"]);
      expect(button.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
      expect((container.querySelector('input[aria-label="1-2-3 exact terminal run"]') as HTMLInputElement).checked).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
      expect(runOptions.map(row=>row.run)).toEqual(["0-1-2","1-2-3","2-3-4","3-4-5","4-5-6"]);
    } finally {
      await act(async()=>root.unmount());container.remove();
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT=previousActEnvironment;
    }
  });
  it("moves selections to the top immediately and restores unselected count order without changing source rows", async () => {
    const runOptions=evidence.options.filter(row=>row.digits.length===3).slice(0,4).map((row,index)=>({...row,count:index+1}));
    const original=JSON.stringify(runOptions),container=document.createElement("div");document.body.appendChild(container);
    const root=createRoot(container),previous=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const order=()=>Array.from(container.querySelectorAll('tbody th[scope="row"]')).map(cell=>cell.textContent);
    const change=vi.fn();
    function Harness(){
      const [selectedRuns,setSelectedRuns]=React.useState<string[]>([]);
      return React.createElement(TerminalRunQuotaControls,{options:{...options,runOptions,selectedRuns},sourceDraws:10,requested:10,bypassed:false,
        onChange:(next)=>{change(next);setSelectedRuns(next.selectedRuns);},onAllObservedChange:()=>undefined});
    }
    try {
      await act(async()=>root.render(React.createElement(Harness)));
      expect(order()).toEqual(["3-4-5","2-3-4","1-2-3","0-1-2"]);
      const first=container.querySelector('input[aria-label="0-1-2 exact terminal run"]') as HTMLInputElement;
      await act(async()=>first.click());
      expect(order()).toEqual(["0-1-2","3-4-5","2-3-4","1-2-3"]);
      expect(container.querySelector('input[aria-label="0-1-2 exact terminal run"]')).toBe(first);
      await act(async()=>(container.querySelector('input[aria-label="1-2-3 exact terminal run"]') as HTMLInputElement).click());
      expect(order()).toEqual(["1-2-3","0-1-2","3-4-5","2-3-4"]);
      expect(change.mock.calls[1][0].selectedRuns).toEqual(["0-1-2","1-2-3"]);
      await act(async()=>first.click());
      expect(order()).toEqual(["1-2-3","3-4-5","2-3-4","0-1-2"]);
      expect(JSON.stringify(runOptions)).toBe(original);
    } finally { await act(async()=>root.unmount());container.remove();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previous; }
  });
  it("wires main, batch, worker, fallback and saved predictions to the same rule",()=>{
    const app=readFileSync("src/App.tsx","utf8");
    expect(app).toContain("terminalRunEvidence(realFilteredHistory, realHistory)"); expect(app).toContain("selectedTerminalRuns: [...selectedTerminalRuns]");
    expect(app).toContain("applyTerminalRunCompositionQuotas(processedCandidates, numCandidates");
    expect(app).toContain("applyTerminalRunCompositionQuotas(processed, target");
    expect(readFileSync("src/workers/generateWorker.ts","utf8")).toContain("args.terminalRunRuleOptions");
    expect(readFileSync("src/hooks/useGenerateWorker.ts","utf8")).toContain("args.terminalRunRuleOptions");
    expect(readFileSync("src/lib/predictionJournal.ts","utf8")).toContain("Exact terminal run rules:");
    expect(readFileSync("public/user-manual.html","utf8")).toContain("id=\"terminal-run-quotas\"");
  });
  it("discloses the explicit link, paused state and missing evidence instead of invented associations",()=>{
    const renderLink=(active:boolean,error:string|null=null)=>renderToStaticMarkup(React.createElement(TerminalRunQuotaControls,{
      options,sourceDraws:13,requested:10,bypassed:false,onChange:()=>undefined,onAllObservedChange:()=>undefined,
      shapeLink:{enabled:true,active,matchingDraws:2,shapeCount:1,error,onChange:()=>undefined},
    }));
    expect(renderLink(true)).toContain("Link shapes to selected runs");
    expect(renderLink(true)).toContain("1 shapes observed across 2 matching draws");
    expect(renderLink(false)).toContain("independent shape settings are restored");
    expect(renderLink(true,"No matching real draws")).toContain('role="alert">No matching real draws');
    const app=readFileSync("src/App.tsx","utf8");
    expect(app).toContain("linkedTerminalShapeEvidence(realFilteredHistory, terminalRunRuleOptions)");
    expect(app).toContain("terminalShapeLinkEvidence?.selectedShapes ?? independentSelectedTerminalShapes");
    expect(app).toContain("terminalRunShapeLinkEnabled && terminalRunRuleEnabled");
    expect(app).toContain("sourceError: terminalShapeLinkEvidence?.error");
  });
  it("allows manual unobserved choices while locking only the all-observed selection", () => {
    const manual = render({enabled:true, allocationBasis:"equal", selectedRuns:["0-1-2"]});
    expect(manual).toContain("Manual equal allocation");
    expect(manual).toContain("Zero-observed runs keep zero observations");
    expect(manual).not.toMatch(/aria-label="0-1-2 exact terminal run"[^>]*disabled/);
    expect(manual).toContain("100.0%");
    const automatic = render({useAllObservedRuns:true,selectedRuns:["2-3-4","6-7-8"]});
    expect(automatic).toContain("2 selected across all lengths");
    expect(automatic).toContain('aria-label="Terminal run mode" disabled=""');
    expect(automatic).toMatch(/aria-label="2-3-4 exact terminal run"[^>]*disabled/);
    expect(automatic).not.toContain("Remove terminal run");
    expect(automatic).toContain("OFF · No terminal run rule");
  });
  it("offers an explicit unlink action without modifying run selections", async () => {
    const onChange=vi.fn(),unlink=vi.fn(),container=document.createElement("div");document.body.appendChild(container);
    const root=createRoot(container),previous=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    try {
      await act(async()=>root.render(React.createElement(TerminalRunQuotaControls,{
        options:{...options,enabled:true,mode:"requireAll",selectedRuns:["0-1-2","4-5-6"]},sourceDraws:13,requested:10,bypassed:false,
        onChange,onAllObservedChange:()=>undefined,
        shapeLink:{enabled:true,active:true,matchingDraws:0,shapeCount:0,error:"No matching real draws",onChange:unlink},
      })));
      const button=Array.from(container.querySelectorAll("button")).find(button=>button.textContent==="Edit shapes independently")!;
      await act(async()=>button.click());
      expect(unlink).toHaveBeenCalledWith(false);expect(onChange).not.toHaveBeenCalled();
    } finally {
      await act(async()=>root.unmount());container.remove();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=previous;
    }
  });
});
