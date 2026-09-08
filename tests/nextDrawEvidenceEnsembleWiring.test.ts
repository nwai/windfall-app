import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextDrawEvidenceEnsemblePanel } from "../src/components/NextDrawEvidenceEnsemblePanel";

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Next-Draw Evidence Ensemble wiring", () => {
  it("renders an explicit observe-only empty state before the user runs it", () => {
    const html = renderToStaticMarkup(React.createElement(NextDrawEvidenceEnsemblePanel, {
      history: [],
      targetDate: "2026-08-28",
    }));

    expect(html).toContain("Observe-only");
    expect(html).toContain("does not alter generation");
    expect(html).toContain("Run Fixed Replay &amp; Forecast");
    expect(html).toContain("no-lookahead");
  });

  it("is mounted in Validation and can create a journal draft without becoming a generator rule", () => {
    const app = source("src/App.tsx");
    const journal = source("src/lib/predictionJournal.ts");
    const manual = source("public/user-manual.html");

    expect(app).toContain('panelId="next-draw-evidence-ensemble"');
    expect(app).toContain("handleNextDrawEvidenceJournalDraft");
    expect(app).toContain("handleUseNextDrawEvidenceNumbers");
    expect(journal).toContain('nextDrawEvidenceEnsemble: "Used Next-Draw Evidence Ensemble"');
    expect(manual).toContain('id="next-draw-evidence-ensemble"');
    expect(manual).toContain("These are relative model marginals, not calibrated lottery probabilities.");
  });
});
