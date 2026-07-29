import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Prediction Journal app wiring", () => {
  it("places the journal under Validation using real history", () => {
    const app = readProjectFile("src/App.tsx");

    expect(app).toContain('import { PredictionJournalPanel, type PredictionJournalDraftRequest } from "./components/PredictionJournalPanel";');
    expect(app).toContain('panelId="prediction-journal"');
    expect(app.indexOf('id="workflow-validation"')).toBeLessThan(app.indexOf('panelId="prediction-journal"'));
    expect(app.indexOf('panelId="prediction-journal"')).toBeLessThan(app.indexOf('panelId="backtest-validation"'));
    expect(app).toContain("getSetupSnapshot={() => buildSnapshot({ includePanelFavorites: true, includeDerivedPredictionEvidence: true })}");
  });

  it("registers the journal as a favoriteable Validation panel", () => {
    const registry = readProjectFile("src/lib/panelFavorites.ts");

    expect(registry).toContain('id: "prediction-journal"');
    expect(registry).toContain('title: "Prediction Journal & Scorecard"');
    expect(registry).toContain('workflow: "Validation"');
  });

  it("captures Acceptance Needs construction state in the saved setup snapshot", () => {
    const app = readProjectFile("src/App.tsx");
    const snapshotBlock = app.slice(app.indexOf("function buildSnapshot"), app.indexOf("function applySnapshot"));

    expect(snapshotBlock).toContain("monthlyConstructiveEnabled");
    expect(snapshotBlock).toContain("acceptanceNeedsEnabled");
    expect(snapshotBlock).toContain("acceptanceNeedsCounts");
  });

  it("captures derived generation inclusions and exclusions for new prediction provenance", () => {
    const app = readProjectFile("src/App.tsx");
    const snapshotBlock = app.slice(app.indexOf("function buildSnapshot"), app.indexOf("function applySnapshot"));

    expect(snapshotBlock).toContain("includeDerivedPredictionEvidence");
    expect(snapshotBlock).toContain("snapshot.generationForcedNumbers");
    expect(snapshotBlock).toContain("snapshot.generationExcludedNumbers");
    expect(snapshotBlock).toContain("snapshot.allExcludedNumbers");
    expect(snapshotBlock).toContain("snapshot.sde1Exclusions");
    expect(snapshotBlock).toContain("snapshot.hc3Exclusions");
    expect(snapshotBlock).toContain("snapshot.droughtBreakStrictShortlistNumbers");
    expect(snapshotBlock).toContain("snapshot.droughtBreakEmpiricalHazardNumbers");
  });
});
