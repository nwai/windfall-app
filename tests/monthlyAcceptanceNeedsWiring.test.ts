import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Monthly acceptance-needs MiAN wiring", () => {
  it("keeps MiAN counts at zero while disabled and syncs only selected Acceptance needs", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("const zeroMonthlyFrequencyConstraints = (): MonthlyFrequencyConstraints =>");
    expect(appSource).toContain("if (!acceptanceNeedsEnabled) {");
    expect(appSource).toContain("setAcceptanceNeedsCounts(zeroMonthlyFrequencyConstraints());");
    expect(appSource).toContain("? monthlyConstraintPayload.constraints");
    expect(appSource).toContain("!acceptanceNeedsEnabled");

    expect(appSource).not.toContain("const b = monthlyConstraintPayload.buckets");
    expect(appSource).not.toContain("undrawn: b.undrawn.size");
  });
});
