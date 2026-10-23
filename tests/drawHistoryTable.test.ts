import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import DrawHistoryTable from "../src/components/DrawHistoryTable";
import type { Draw } from "../src/types";

const latest:Draw={date:"10/9/26",main:[28,33,36,15,40,18],supp:[44,4]};
const earlier:Draw={date:"10/7/26",main:[10,11,12,24,25,26],supp:[18,38]};
const render=(draws:Draw[],ogaHistory:Draw[]=draws,ogaScores:(number|null|undefined)[]=[])=>renderToStaticMarkup(
  React.createElement(DrawHistoryTable,{draws,ogaHistory,ogaScores}),
);
describe("right-aligned draw-history results table",()=>{
  it("shows both terminal columns from all eight recorded numbers, newest first and without changing number order",()=>{
    const input=[earlier,latest],html=render(input,input,[7.25,12.5]);
    const container=document.createElement("div");container.innerHTML=html;
    const rows=Array.from(container.querySelectorAll("tbody tr"));
    expect(rows.map(row=>Array.from(row.children).map(cell=>cell.textContent))).toEqual([
      ["10/9/26","28, 33, 36, 15, 40, 18","44, 4","12.50","2:6","2+2+1+1+1+1","3-4-5-6"],
      ["10/7/26","10, 11, 12, 24, 25, 26","18, 38","7.25","2:6","2+1+1+1+1+1+1","0-1-2 · 4-5-6"],
    ]);
    expect(input).toEqual([earlier,latest]);
    expect(html).toContain('role="region" aria-label="Draw history results" tabindex="0"');
    expect(html).toContain("About draw history columns");expect(html).toContain("Terminal shape");expect(html).toContain("Terminal runs");
  });
  it("uses the journal's main/supp colours only on the labelled number columns",()=>{
    const container=document.createElement("div");container.innerHTML=render([latest,earlier]);
    for(const row of container.querySelectorAll("tbody tr")){
      expect(row.children[1].className).toBe("draw-history-table__mains");
      expect(row.children[2].className).toBe("draw-history-table__supps");
      expect(Array.from(row.children).filter(cell=>cell.className).length).toBe(2);
    }
    expect(Array.from(container.querySelectorAll("thead th")).slice(1,3).map(cell=>cell.textContent)).toEqual(["Mains (6)","Supps (2)"]);
    const css=readFileSync("src/components/DrawHistoryTable.css","utf8");
    expect(css).toContain(".draw-history-table__mains { color: #b91c1c; }");
    expect(css).toContain(".draw-history-table__supps { color: #166534; }");
    expect(css).toContain(".draw-history-table__mains, .draw-history-table__supps { font-weight: 700; }");
    const journal=readFileSync("src/components/PredictionJournalPanel.tsx","utf8");
    expect(journal).toContain('color: "#b91c1c"');expect(journal).toContain('color: "#166534"');
  });
  it("does not shift real OGA scores onto simulated rows or turn missing scores into zero",()=>{
    const simulated={...latest,date:"10/12/26",isSimulated:true};
    const container=document.createElement("div");container.innerHTML=render([earlier,simulated,latest],[earlier,latest],[12.25,Infinity]);
    const rows=Array.from(container.querySelectorAll("tbody tr"));
    expect(rows[0].textContent).toContain("Simulated");
    expect(rows.map(row=>row.children[3].textContent)).toEqual(["—","—","12.25"]);
  });
  it("distinguishes genuinely no runs, invalid compositions and an empty active window",()=>{
    const noRuns={...earlier,main:[1,11,21,31,4,14],supp:[7,17]};
    const incomplete={...latest,supp:[44]};
    expect(render([noRuns])).toContain("None</td>");
    const container=document.createElement("div");container.innerHTML=render([incomplete]);
    expect(Array.from(container.querySelector("tbody tr")!.children).slice(4).map(cell=>cell.textContent)).toEqual(["—","—","—"]);
    expect(render([])).toContain("No draw rows in the active view");
  });
  it("wires history to the real OGA source and right-aligns headers and cells in a bounded sticky table",()=>{
    const app=readFileSync("src/App.tsx","utf8"),css=readFileSync("src/components/DrawHistoryTable.css","utf8");
    expect(app).toContain('<DrawHistoryTable draws={filteredHistory} ogaHistory={realFilteredHistory} ogaScores={pastOGAScores} />');
    expect(app).not.toContain('return `${d.date}: [${d.main.join');
    expect(css).toContain("text-align: right");expect(css).toContain("position: sticky");expect(css).toContain("overflow: auto");
    expect(readFileSync("public/user-manual.html","utf8")).toContain("terminal_shape</code> and <code>terminal_runs");
  });
});
