import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("latest-draw overlap controls", () => {
  it("uses a mode/count control and allows exactly zero latest-draw repeats", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("Last draw</span> overlap rule");
    expect(appSource).toContain("Exactly 0 is the clean no-repeat setting");
    expect(appSource).toContain("applyLastDrawOverlapRule(nextMode, nextCount)");
    expect(appSource).toContain("setMaxLastDrawMatchesEnabled");
    expect(appSource).toContain("maxLastDrawMatchesEnabled ? maxLastDrawMatchesValue : undefined");
    expect(appSource).toContain("[0, 1, 2, 3, 4, 5, 6, 7, 8]");
  });

  it("retains manual requests while warning on compatibility", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("const repeatUnionInputMax = repeatUnionRawCandidateMax");
    expect(appSource).toContain('aria-label="Minimum candidate numbers from newest-draw pool"');
    expect(appSource).toContain("setMinFromRecentUnionM(Math.min(safeValue, 8))");
    expect(appSource).toContain("Larger requests are retained but block generation");
    expect(appSource).toContain("Use current-month default");
    expect(appSource).not.toContain("setMinFromRecentUnionM((current) => Math.min");
    expect(appSource).toContain("newest-draw pool minimum ${minFromRecentUnionM} exceeds feasible max ${repeatUnionCandidateMax}");
  });
});
