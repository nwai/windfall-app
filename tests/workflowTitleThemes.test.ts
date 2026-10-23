import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppWorkflowNav, WorkflowAnchor } from "../src/components/layout/AppWorkflowNav";
import { CollapsibleSection } from "../src/components/shared/CollapsibleSection";

const sections = [
  ["history", "draw-history-manager"], ["signals", "drought-break-shortlist"],
  ["validation", "prediction-journal"], ["generation", "windfall-predictor"],
  ["dga", "diamond-grid-analysis"], ["patterns", "undrawn-patterns"],
] as const;
const parse = (html: string) => new DOMParser().parseFromString(html,"text/html");
const luminance = (hex: string) => {
  const [r,g,b] = hex.replace("#","").match(/../g)!.map(value => {
    const channel = parseInt(value,16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126*r + 0.7152*g + 0.0722*b;
};

describe("workflow title themes", () => {
  it("uses the same named workflow for navigation, headings and registered panels", () => {
    const nav = parse(renderToStaticMarkup(React.createElement(AppWorkflowNav)));
    for (const [home,panelId] of sections) {
      expect(nav.querySelector(`a[href="#workflow-${home}"]`)?.getAttribute("data-workflow-home")).toBe(home);
      const anchor = parse(renderToStaticMarkup(React.createElement(WorkflowAnchor,{id:`workflow-${home}`,title:home,summary:"Context",favoritePanelId:home === "dga" ? panelId : undefined})));
      expect(anchor.querySelector(".windfall-workflow-anchor")?.getAttribute("data-workflow-home")).toBe(home);
      const panel = parse(renderToStaticMarkup(React.createElement(CollapsibleSection,{panelId,title:home},"Body")));
      expect(panel.querySelector(".windfall-section")?.getAttribute("data-workflow-home")).toBe(home);
    }
  });
  it("has six distinct token colours with normal-text contrast on white and the page surface", () => {
    const css = readFileSync("src/index.css","utf8"), colours: string[] = [];
    for (const [home] of sections) {
      const colour = css.match(new RegExp(`--wf-workflow-${home}:\\s*(#[0-9a-f]{6});`,"i"))?.[1];
      expect(colour).toBeTruthy(); colours.push(colour!);
      expect(css).toContain(`[data-workflow-home="${home}"] { --wf-section-title: var(--wf-workflow-${home}); }`);
      for (const background of ["#ffffff","#f4f7fb"]) {
        const light = luminance(background), dark = luminance(colour!);
        expect((Math.max(light,dark)+0.05)/(Math.min(light,dark)+0.05)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(new Set(colours).size).toBe(6);
    expect(css).not.toContain("color: #053f8f;");
  });
});
