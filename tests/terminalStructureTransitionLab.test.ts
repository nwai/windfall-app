import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EndingDigitSequencePanel } from "../src/components/EndingDigitSequencePanel";
import { TerminalStructureTransitionLab } from "../src/components/TerminalStructureTransitionLab";

const history = [
  { date: "9/2/26", main: [1, 11, 22, 33, 45, 37], supp: [8, 40] },
  { date: "9/4/26", main: [21, 12, 23, 34, 36, 38], supp: [5, 30] },
  { date: "9/7/26", main: [2, 13, 24, 36, 38, 5], supp: [7, 30] },
];

describe("TerminalStructureTransitionLab", () => {
  it("renders the observe-only family run view with explicit terminology", () => {
    const html = renderToStaticMarkup(React.createElement(TerminalStructureTransitionLab, {
      draws: history,
      allDraws: history,
      includeSupp: true,
    }));

    expect(html).toContain("Terminal Structure Transition Lab");
    expect(html).toContain("No generation influence");
    expect(html).toContain("Family runs");
    expect(html).toContain("Exact motifs");
    expect(html).toContain("Motif movement");
    expect(html).toContain("unconfirmed seed");
    expect(html).toContain("simulated draw is substituted");
  });

  it("is mounted inside the Ending Digit Sequence panel with both history scopes", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/EndingDigitSequencePanel.tsx"), "utf8");

    expect(source).toContain("<TerminalStructureTransitionLab");
    expect(source).toContain("draws={draws}");
    expect(source).toContain("allDraws={allDraws}");
    expect(source).toContain("includeSupp={includeSupp}");
  });

  it("offers the approved ending-sequence half-life choices without a hidden cutoff", () => {
    const html = renderToStaticMarkup(React.createElement(EndingDigitSequencePanel, {
      draws: history,
      allDraws: history,
    }));
    const select = html.match(/<select id="ending-sequence-half-life"[^>]*>(.*?)<\/select>/)?.[1] ?? "";

    ["3", "6", "9", "12", "24", "36", "WFMQYH"].forEach((choice) => {
      expect(select).toContain(`value="${choice}"`);
    });
    expect(select).not.toContain('value="10"');
    expect(select).not.toContain('value="20"');
    expect(html).toContain("Exponential weighting has no hard zero");
  });
});
