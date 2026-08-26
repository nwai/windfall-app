import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DGAConstellationDiagnosticPanel } from "../src/components/DGAConstellationDiagnosticPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

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
    expect(html).toContain("max 8");
    expect(html).toContain("Mapped-cell navigation");
    expect(html).toContain("Use D1 number 20 as constellation centre");
    expect(html).not.toContain("Use D4 number 20 as constellation centre");
    expect(firstBodyRowHtml).not.toContain("D1</th>");
  });
});
