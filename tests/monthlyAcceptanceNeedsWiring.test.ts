import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Monthly acceptance-needs MiAN wiring", () => {
  it("keeps MiAN counts at zero while disabled and syncs only selected Acceptance needs", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("const zeroMonthlyFrequencyConstraints = (): MonthlyFrequencyConstraints =>");
    expect(appSource).toContain("if (!acceptanceNeedsEnabled) {");
    expect(appSource).toContain("setAcceptanceNeedsCounts((previous) =>");
    expect(appSource).toContain("monthlyFrequencyConstraintsSignature(previous)");
    expect(appSource).toContain(": monthlyConstraintPayload.constraints");
    expect(appSource).toContain("!acceptanceNeedsEnabled");

    expect(appSource).not.toContain("const b = monthlyConstraintPayload.buckets");
    expect(appSource).not.toContain("undrawn: b.undrawn.size");
  });

  it("wires Acceptance needs Simulate 8 into the DGA simulation flow", () => {
    const appSource = readAppSource();
    const monthlySummaryCall = appSource.match(/<MonthlyDrawsSummaryPanel[\s\S]*?\/>/)?.[0] ?? "";
    const handlerStart = appSource.indexOf("const handleSimulateAcceptanceNeeds");
    const handlerEnd = appSource.indexOf("const handleSimulatePasteWeightedCandidate", handlerStart);
    const handlerBlock = appSource.slice(handlerStart, handlerEnd);

    expect(monthlySummaryCall).toContain("onSimulateNumbers={handleSimulateAcceptanceNeeds}");
    expect(handlerBlock).toContain("setUserSelectedNumbers(simulatedNumbers);");
    expect(handlerBlock).toContain("setSimulatedDraw({ main, supp, date: \"AcceptanceNeeds\", isSimulated: true }");
    expect(handlerBlock).toContain("scrollToDGA();");
  });
});
