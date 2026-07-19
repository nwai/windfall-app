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
});
