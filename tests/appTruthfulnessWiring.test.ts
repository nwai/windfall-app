import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("App truthfulness provenance wiring", () => {
  it("renders a visible draw-history provenance strip from loaded and active-window history", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('import { summarizeDrawHistoryProvenance } from "./lib/drawHistoryProvenance";');
    expect(appSource).toContain('import { filterRealDrawHistory } from "./lib/realDrawHistory";');
    expect(appSource).toContain("summarizeDrawHistoryProvenance(history)");
    expect(appSource).toContain("summarizeDrawHistoryProvenance(filteredHistory)");
    expect(appSource).toContain("const realHistory = realHistoryResult.history;");
    expect(appSource).toContain("const realFilteredHistory = realFilteredHistoryResult.history;");
    expect(appSource).not.toContain("function rowsToDraws");
    expect(appSource).not.toContain("rowsToDraws(");
    expect(appSource).toContain('data-testid="draw-history-provenance"');
    expect(appSource).toContain("Data provenance:");
    expect(appSource).toContain("Active window:");
    expect(appSource).toContain("<ChurnPredictor dataset={churnDataset} totalDraws={activeWindowProvenance.realDraws}");
    expect(appSource).toContain("<ReturnPredictor dataset={churnDataset} totalDraws={activeWindowProvenance.realDraws}");
    expect(appSource).toContain("Advanced Survival Analysis & Churn/Return Diagnostic Models");
    expect(appSource).not.toContain("Advanced Survival Analysis & Churn/Return Prediction Models");
  });
});
