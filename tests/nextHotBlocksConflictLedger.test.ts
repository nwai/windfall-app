import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextHotBlocksPanel } from "../src/components/NextHotBlocksPanel";
import { buildNumberConflictLedger } from "../src/lib/numberConflictLedger";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = [44, 45]): Draw => ({ date, main, supp });

describe("NextHotBlocksPanel conflict ledger", () => {
  it("shows global include/exclude context and blocks excluding blocks with hard inclusions", () => {
    const history = [
      draw("2026-06-01", [1, 6, 11, 16, 21, 26]),
      draw("2026-06-03", [2, 7, 12, 17, 22, 27]),
      draw("2026-06-05", [3, 8, 13, 18, 23, 28]),
    ];
    const ledger = buildNumberConflictLedger([
      { kind: "hardInclude", label: "Drought-break shortlist", numbers: [7] },
      { kind: "hardExclude", label: "User Exclusions", numbers: [8] },
    ]);

    const html = renderToStaticMarkup(
      React.createElement(NextHotBlocksPanel, {
        history,
        excludedNumbers: [8],
        setExcludedNumbers: () => undefined,
        numberConflictLedger: ledger,
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const blockInput = document.querySelector("input[aria-label='Exclude block 6-10']");

    expect(document.body.textContent).toContain("Active elsewhere");
    expect(document.body.textContent).toContain("Included 7");
    expect(document.body.textContent).toContain("Excluded 8");
    expect(document.body.textContent).toContain("Cannot exclude 6-10");
    expect(blockInput?.getAttribute("disabled")).not.toBeNull();
    expect(blockInput?.getAttribute("title")).toContain("Drought-break shortlist");
  });
});
