import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DGAConstellationDiagnosticPanel } from "../src/components/DGAConstellationDiagnosticPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DGAConstellationDiagnosticPanel", () => {
  it("renders mapped cells with number rows and draw columns like the DGA grid", () => {
    const history = [
      draw("D1", [14, 1, 2, 3, 4, 5], [6, 7]),
      draw("D2", [15, 1, 2, 3, 4, 5], [6, 7]),
      draw("D3", [16, 1, 2, 3, 4, 5], [6, 7]),
    ];

    const html = renderToStaticMarkup(React.createElement(DGAConstellationDiagnosticPanel, { history }));
    const mappedStart = html.indexOf("Mapped cells");
    const tableStart = html.indexOf("<table", mappedStart);
    const headerEnd = html.indexOf("</thead>", tableStart);
    const firstBodyRowStart = html.indexOf("<tr", headerEnd);
    const firstBodyRowEnd = html.indexOf("</tr>", firstBodyRowStart);
    const headerHtml = html.slice(tableStart, headerEnd);
    const firstBodyRowHtml = html.slice(firstBodyRowStart, firstBodyRowEnd);

    expect(headerHtml).toContain("Number");
    expect(headerHtml).toContain("D1");
    expect(headerHtml).toContain("D2");
    expect(headerHtml).toContain("D3");
    expect(headerHtml).toContain("D4");
    expect(headerHtml).toContain("next");
    expect(html).toContain("Band horizon h3");
    expect(html).toContain("Lead-in band r3 / h3");
    expect(html).toContain("Follow-through band r3 / h3");
    expect(html).toContain("max 156");
    expect(html).toContain("max 156 draws");
    expect(html.match(/max="156"/g)).toHaveLength(2);
    expect(html).toContain("radius above 44 adds draw columns, not extra numbers");
    expect(html).toContain("not WFMQYH or generation");
    expect(html).toContain("Mapped-cell navigation");
    expect(html).toContain("Use D1 number 20 as constellation centre");
    expect(html).not.toContain("Use D4 number 20 as constellation centre");
    expect(firstBodyRowHtml).not.toContain("D1</th>");
    const document = new DOMParser().parseFromString(html, "text/html");
    const select = [...document.querySelectorAll("select")].find(element => document.querySelector(`label[for="${element.id}"]`)?.textContent === "Centre number");
    expect(select).toBeTruthy();
    expect([...select!.options].map(option => option.value)).toEqual(Array.from({length:45}, (_,index) => String(index + 1)));
    expect(select!.value).toBe("23");
  });
  it("keeps the number selector and mapped-cell centre navigation synchronized", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(DGAConstellationDiagnosticPanel,{history:[draw("D1",[1,2,3,4,5,6],[7,8]),draw("D2",[1,2,3,4,5,6],[7,8])]})));
      const select = container.querySelector("select")!;
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Use D1 number 20 as constellation centre"]')!.click());
      expect(select.value).toBe("20");
      await act(async () => { select.value = "45"; select.dispatchEvent(new Event("change", {bubbles:true})); });
      expect(select.value).toBe("45");
      expect(container.textContent).toContain("N45");
    } finally { await act(async () => root.unmount()); }
  });
});
