import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import TerminalCompositionPlanner from "../src/components/TerminalCompositionPlanner";
import { terminalRunEvidence } from "../src/lib/terminalDigitRuns";
const runs={enabled:true,mode:"requireAll" as const,selectedRuns:["2-3-4-5-6","8-9-0"],runOptions:terminalRunEvidence([]).options};
const props={runs,shapes:{enabled:false,selectedShapes:[],shapeOptions:[]},linked:false,bypassed:false,
  available:Array.from({length:45},(_,i)=>i+1),forced:[],selectedRatios:["4:4","3:5"],observedRatios:["4:4","3:5"],
  monthly:{counts:{undrawn:0,times1:0,times2:0,times3:0,times4:0,times5:0,times6:0,times7:0,times8:0},buckets:null},
  blockers:[],onEnabledChange:()=>{},onIntentChange:()=>{},onShapeModeChange:()=>{},onRunsChange:()=>{},onRatiosChange:()=>{}};
describe("one terminal composition plan",()=>{
  it("exposes intentions, structural compatibility and explicit ratio repair without invented evidence",()=>{
    const html=renderToStaticMarkup(React.createElement(TerminalCompositionPlanner,props));
    expect(html).toContain("Follow history");expect(html).toContain("Test alternatives");expect(html).toContain("Require together");
    expect(html).toContain("Compatible shapes:");expect(html).toContain("1+1+1+1+1+1+1+1");
    expect(html).toContain("Use compatible observed ratios: 3:5");
    expect(html).toContain("not a complete proof");
  });
  it("offers a visible maximal-run merge for overlaps and reports the RwR45 bypass",()=>{
    const html=renderToStaticMarkup(React.createElement(TerminalCompositionPlanner,{...props,runs:{...runs,selectedRuns:["2-3-4-5","4-5-6","8-9-0"]}}));
    expect(html).toContain("Merge to 2-3-4-5-6 + 8-9-0");
    expect(renderToStaticMarkup(React.createElement(TerminalCompositionPlanner,{...props,bypassed:true}))).toContain("Bypassed by RwR45");
  });
});
