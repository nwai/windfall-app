import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => (
  readFileSync(resolve(process.cwd(), path), "utf8")
);

describe("history scope wiring", () => {
  it("routes baseline diagnostics to baseline history and labels current-window tools", () => {
    const appSource = readProjectFile("src/App.tsx");

    expect(appSource).toContain("const baselineHistoryScope = useMemo");
    expect(appSource).toContain("const baselineHistory = baselineHistoryScope.history");
    expect(appSource).toContain("<SurvivalAnalyzer");
    expect(appSource).toContain("history={baselineHistory}");
    expect(appSource).toContain("historyScopeLabel={baselineHistoryScopeLabel}");
    expect(appSource).toContain("<TemperatureTransitionPanel");
    expect(appSource).toContain("<BacktestPanel history={baselineHistory} historyScopeLabel={baselineHistoryScopeLabel} />");
    expect(appSource).toContain("<MonteCarloPanel");
    expect(appSource).toContain("history={realFilteredHistory}");
    expect(appSource).toContain("Current WFMQYH window");
  });

  it("documents the difference between WFMQYH, real history, and baseline history", () => {
    const manual = readProjectFile("public/user-manual.html");

    expect(manual).toContain('id="history-scopes"');
    expect(manual).toContain("Current WFMQYH window");
    expect(manual).toContain("Real all history");
    expect(manual).toContain("Windfall baseline history");
    expect(manual).toContain("Monte Carlo remains a current-window weighting tool");
  });
});
