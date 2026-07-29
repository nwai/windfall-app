import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("candidate generation hard-filter defaults", () => {
  it("starts SDE1, HC3, and OGA post-filtering off", () => {
    const appSource = readFileSync(resolve(__dirname, "../src/App.tsx"), "utf8");
    const defaultKnobsBlock = appSource.match(/const defaultKnobs: Knobs = \{[\s\S]*?\n\};/)?.[0] ?? "";
    const readinessHardFiltersBlock = appSource.match(/const DEFAULT_READINESS_HARD_FILTERS: ReadinessHardFilterState = \{[\s\S]*?\n\};/)?.[0] ?? "";

    expect(defaultKnobsBlock).toContain("enableSDE1: false");
    expect(defaultKnobsBlock).toContain("enableHC3: false");
    expect(defaultKnobsBlock).toContain("enableOGA: false");
    expect(readinessHardFiltersBlock).toContain("idm: { enabled: false, thresholdPercent: 0 }");
    expect(readinessHardFiltersBlock).toContain("conv: { enabled: false, thresholdPercent: 0 }");
    expect(readinessHardFiltersBlock).toContain("oga: { enabled: false, thresholdPercent: 0 }");
  });

  it("exposes IDM, Conv, and OGA as readiness component hard filters", () => {
    const appSource = readFileSync(resolve(__dirname, "../src/App.tsx"), "utf8");

    expect(appSource).toContain("Readiness component hard filters");
    expect(appSource).toContain("IDM minimum");
    expect(appSource).toContain("Conv impact minimum");
    expect(appSource).toContain("OGA component minimum");
    expect(appSource).toContain("applyConfiguredReadinessHardFilters(processedCandidates)");
    expect(appSource).toContain("applyConfiguredReadinessHardFilters(processed)");
  });

  it("keeps disabled readiness component filters at zero threshold", () => {
    const appSource = readFileSync(resolve(__dirname, "../src/App.tsx"), "utf8");

    expect(appSource).toContain("thresholdPercent: enabled ? clampPercent(rule.thresholdPercent, 0) : 0");
    expect(appSource).toContain("thresholdPercent: event.target.checked ? previous[key].thresholdPercent : 0");
    expect(appSource).toContain("disabled={!rule.enabled}");
  });

  it("starts Rdy scoring weights neutral and preserves explicit Off controls", () => {
    const appSource = readFileSync(resolve(__dirname, "../src/App.tsx"), "utf8");
    const generatedSource = readFileSync(resolve(__dirname, "../src/components/candidates/GeneratedCandidatesPanel.tsx"), "utf8");
    const presetsSource = readFileSync(resolve(__dirname, "../src/lib/presets.ts"), "utf8");

    const defaultRdyWeightsBlock = appSource.match(/const DEFAULT_RDY_WEIGHTS: ReadinessWeights = \{[\s\S]*?\n\};/)?.[0] ?? "";
    const defaultRdyOffBlock = appSource.match(/const DEFAULT_RDY_WEIGHT_OFF_STATE: RdyWeightOffState = \{[\s\S]*?\n\};/)?.[0] ?? "";

    expect(defaultRdyWeightsBlock).toContain("idm: 0");
    expect(defaultRdyWeightsBlock).toContain("conv: 0");
    expect(defaultRdyWeightsBlock).toContain("oga: 0");
    expect(defaultRdyOffBlock).toContain("idm: true");
    expect(defaultRdyOffBlock).toContain("conv: true");
    expect(defaultRdyOffBlock).toContain("oga: true");
    expect(appSource).toContain("rdyWeights={effectiveRdyWeights}");
    expect(appSource).toContain("rdyWeightOffState: { ...rdyWeightOffState }");
    expect(generatedSource).toContain("rdyWeights = { idm: 0, conv: 0, oga: 0 }");
    expect(presetsSource).toContain("rdyWeightOffState?: Partial<Record<\"idm\" | \"conv\" | \"oga\", boolean>>");
  });
});
