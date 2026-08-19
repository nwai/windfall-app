import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Generated Candidates IDM wiring", () => {
  it("keeps Generated Candidates connected to the Monthly Draws Summary ideal state", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const monthlySummaryCall = appSource.match(/<MonthlyDrawsSummaryPanel[\s\S]*?\/>/)?.[0] ?? "";
    const generatedCandidatesCall = appSource.match(/<GeneratedCandidatesPanel[\s\S]*?\/>/)?.[0] ?? "";

    expect(appSource).toContain("monthlyIdealDrawState");
    expect(appSource).toContain("setMonthlyIdealDrawState");
    expect(appSource).toContain("handleMonthlyIdealDrawStateChange");
    expect(monthlySummaryCall).toContain("onIdealDrawStateChange={handleMonthlyIdealDrawStateChange}");
    expect(generatedCandidatesCall).toContain("monthlyIdealDrawState={monthlyIdealDrawState}");
    expect(appSource).toContain("stageIdealDrawState");
    expect(appSource).toContain("setStageIdealDrawState");
    expect(appSource).toContain("handleStageIdealDrawStateChange");
    expect(monthlySummaryCall).toContain("onStageIdealDrawStateChange={handleStageIdealDrawStateChange}");
    expect(generatedCandidatesCall).toContain("stageIdealDrawState={stageIdealDrawState}");
  });
});
