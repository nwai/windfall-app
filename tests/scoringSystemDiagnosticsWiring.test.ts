import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Scoring System Diagnostics app wiring", () => {
  it("places the observe-only scoring panel after Odd/Even Ratio Cadence using real histories", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('import { ScoringSystemDiagnosticsPanel } from "./components/ScoringSystemDiagnosticsPanel";');
    expect(appSource).toContain('panelId="scoring-system-diagnostics"');
    expect(appSource.indexOf('panelId="odd-even-ratio-cadence"')).toBeLessThan(
      appSource.indexOf('panelId="scoring-system-diagnostics"'),
    );
    expect(appSource).toContain("realHistory={realHistory}");
    expect(appSource).toContain("realFilteredHistory={realFilteredHistory}");
    expect(appSource).not.toContain("setGeneratedCandidates(scoring");
  });

  it("registers the scoring panel as a favoriteable panel", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/panelFavorites.ts"), "utf8");

    expect(source).toContain('"scoring-system-diagnostics"');
    expect(source).toContain("Scoring System Diagnostics");
  });
});
