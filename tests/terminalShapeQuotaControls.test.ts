import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import TerminalShapeQuotaControls from "../src/components/TerminalShapeQuotaControls";
import { buildTerminalShapeOptions, terminalRepetitionShape, type TerminalShapeQuotaOptions } from "../src/lib/terminalShapeQuotas";

const options: TerminalShapeQuotaOptions={enabled:false,selectedShapes:[],shapeOptions:buildTerminalShapeOptions([
  {date:"2026-10-05",main:[2,12,7,17,21,33],supp:[34,40]},
])};
const render=(overrides:Partial<TerminalShapeQuotaOptions>={},bypassed=false)=>renderToStaticMarkup(React.createElement(TerminalShapeQuotaControls,{
  options:{...options,...overrides},requested:10,bypassed,onEnabledChange:()=>undefined,onSelectionChange:()=>undefined,
}));
describe("terminal shape quota controls",()=>{
  it("shows all 18 real-count shapes, zero labels, accessible controls and an off state",()=>{
    const html=render(); expect((html.match(/terminal shape"/g)??[]).length).toBe(18);
    expect(html).toContain("Not observed"); expect(html).toContain("OFF · No terminal shape quota affects generation");
    expect(html).toContain("role=\"region\""); expect(html).toContain("About terminal repetition shapes");
    expect(html).toContain("1 valid eight-number real WFMQYH draws");
  });
  it("shows activated quota targets separately from source evidence",()=>{
    const html=render({enabled:true,selectedShapes:["2+2+1+1+1+1"]});
    expect(html).toContain("10/10"); expect(html).toContain("allocated jointly");
    expect(render({enabled:true},true)).toContain("bypasses terminal shape quotas");
    expect(render({enabled:true})).toContain("role=\"alert\"");
  });
  it("explains a genuine eight-number shape without presenting the example as historical evidence",()=>{
    const html=render();
    expect(html).toContain("2, 12, 7, 17, 21, 33, 34, 40");
    expect(html).toContain("2 and 12 both end in 2; 7 and 17 both end in 7");
    expect(html).toContain("These make the four 1s");
    expect(html).toContain("Example only, not a recorded draw");
    expect(terminalRepetitionShape([2,12,7,17,21,33,34,40])).toBe("2+2+1+1+1+1");
  });
  it("wires both generation paths, saved setup and final allocation",()=>{
    const app=readFileSync("src/App.tsx","utf8");
    expect(app).toContain("title={<b>Draw Composition Quotas</b>}");
    expect(app).toContain("useState(false)");
    expect(app).toContain("applyCompositionQuotas(processedCandidates, numCandidates");
    expect(app).toContain("applyCompositionQuotas(processed, target");
    expect(app).toContain("selectedTerminalShapes: [...selectedTerminalShapes]");
    expect(app).toContain("s.terminalShapeIndependentSettings?.enabled ?? !!s.terminalShapeQuotaEnabled");
    expect(readFileSync("src/workers/generateWorker.ts","utf8")).toContain("args.terminalShapeQuotaOptions");
    expect(readFileSync("src/hooks/useGenerateWorker.ts","utf8")).toContain("args.terminalShapeQuotaOptions");
    expect(readFileSync("public/user-manual.html","utf8")).toContain("id=\"draw-composition-quotas\"");
  });
  it("shows matching-only evidence and makes linked controls read-only without losing independent controls",()=>{
    const html=renderToStaticMarkup(React.createElement(TerminalShapeQuotaControls,{
      options:{...options,enabled:true,selectedShapes:["2+2+1+1+1+1"]},requested:10,bypassed:false,
      linkedEvidence:{sourceDraws:13,matchingDraws:1},onEnabledChange:()=>undefined,onSelectionChange:()=>undefined,
    }));
    expect(html).toContain("1 shapes observed across 1 matching draws");
    expect(html).toContain("13 valid real WFMQYH draws inspected");
    expect(html).toContain("Turn off linking");
    expect(html).toMatch(/type="checkbox" disabled="" checked=""/);
    expect(render({enabled:true,selectedShapes:["2+2+1+1+1+1"]})).not.toMatch(/type="checkbox" disabled="" checked=""/);
    const empty=renderToStaticMarkup(React.createElement(TerminalShapeQuotaControls,{
      options:{...options,enabled:true,selectedShapes:[],sourceError:"No matching real draws"},requested:10,bypassed:false,
      linkedEvidence:{sourceDraws:13,matchingDraws:0},onEnabledChange:()=>undefined,onSelectionChange:()=>undefined,
    }));
    expect(empty).toContain("Edit shapes independently");
    expect(empty).not.toContain("Select observed shapes before generating");
  });
});
