import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TerminalDigitStageSplitCard } from "../src/components/TerminalDigitStageSplitCard";

describe("TerminalDigitStageSplitCard", () => {
  it("renders dynamic exploratory controls without claiming generation influence", () => {
    const html = renderToStaticMarkup(React.createElement(TerminalDigitStageSplitCard, {
      draws: [],
      allDraws: [],
      includeSupp: true,
    }));

    expect(html).toContain("Monthly Terminal Digit Stage-Split Diagnostic");
    expect(html).toContain("Observe only");
    expect(html).toContain("Early block ends");
    expect(html).toContain("Bottom 3 + ties");
    expect(html).toContain("Draw presence");
    expect(html).toContain("Cutoff comparison");
    expect(html).toContain("No score from this card changes candidate generation");
    expect(html).toContain("not corrected for trying several split points");
  });

  it("is mounted inside Ending Digit Sequences with baseline and WFMQYH inputs", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/EndingDigitSequencePanel.tsx"), "utf8");

    expect(source).toContain("<TerminalDigitStageSplitCard");
    expect(source).toContain("draws={draws}");
    expect(source).toContain("allDraws={allDraws}");
    expect(source).toContain("includeSupp={includeSupp}");
  });
});
