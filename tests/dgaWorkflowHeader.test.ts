import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("DGA workflow header", () => {
  it("keeps the DGA favorite control in the workflow header and removes the duplicate panel title", () => {
    const appSource = source("src/App.tsx");
    const nhbSectionStart = appSource.indexOf('panelId="next-hot-blocks"');
    const dgaAnchorStart = appSource.indexOf('<WorkflowAnchor\n        id="workflow-dga"');
    const dgaSectionStart = appSource.indexOf("{/* [ORDER-ANCHOR] 25 Diamond Grid Analysis (DGA) */}");
    const patternsStart = appSource.indexOf('<WorkflowAnchor\n        id="workflow-patterns"');

    expect(dgaAnchorStart).toBeGreaterThan(-1);
    expect(nhbSectionStart).toBeGreaterThan(dgaAnchorStart);
    expect(dgaSectionStart).toBeGreaterThan(dgaAnchorStart);
    expect(dgaSectionStart).toBeGreaterThan(nhbSectionStart);
    expect(patternsStart).toBeGreaterThan(dgaSectionStart);

    const nhbSectionBlock = appSource.slice(nhbSectionStart, dgaSectionStart);
    const dgaAnchorBlock = appSource.slice(dgaAnchorStart, dgaSectionStart);
    const dgaSectionBlock = appSource.slice(dgaSectionStart, patternsStart);

    expect(nhbSectionBlock).toContain("NextHotBlocksPanel");
    expect(dgaAnchorBlock).toContain('favoritePanelId="diamond-grid-analysis"');
    expect(dgaAnchorBlock).toContain("expanded={dgaSectionOpen}");
    expect(dgaSectionBlock).toContain('chrome="bodyOnly"');
    expect(dgaSectionBlock).toContain("open={dgaSectionOpen}");
    expect(dgaSectionBlock).not.toContain("Diamond Grid Analysis (DGA)</b>");
    expect(dgaSectionBlock).not.toContain("windfall-section__favorite-button");
    expect(dgaSectionBlock).not.toContain("NextHotBlocksPanel");
  });

  it("keeps body-only sections visible under the shared collapsible CSS", () => {
    const cssSource = source("src/index.css");

    expect(cssSource).toContain(".windfall-section:not([open]):not(.windfall-section--body-only) > .windfall-section__body");
  });

  it("keeps the workflow eyebrow-to-title spacing aligned with the title-to-summary spacing", () => {
    const cssSource = source("src/index.css");
    const titleRowStart = cssSource.indexOf(".windfall-workflow-anchor__title-row");
    const titleRowBlock = cssSource.slice(titleRowStart, cssSource.indexOf("}", titleRowStart));

    expect(titleRowStart).toBeGreaterThan(-1);
    expect(titleRowBlock).toContain("margin-top: 5px;");
    expect(cssSource).toContain(".windfall-workflow-anchor__summary");
    expect(cssSource).toContain("margin: 5px 0 0;");
  });
});
