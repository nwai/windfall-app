import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Previous ±1 neighbour backtest app wiring", () => {
  it("places the observe-only panel in the Validation workflow", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('import { PreviousNeighbourBacktestPanel } from "./components/PreviousNeighbourBacktestPanel";');
    expect(appSource).toContain('panelId="previous-neighbour-backtest"');
    expect(appSource.indexOf('id="workflow-validation"')).toBeLessThan(
      appSource.indexOf('panelId="previous-neighbour-backtest"'),
    );
    expect(appSource).toContain("onToggleUserSelectedNumber={toggleSharedUserSelectedNumber}");
  });

  it("documents the observe-only neighbour backtest in the user manual", () => {
    const manual = readFileSync(resolve(process.cwd(), "public/user-manual.html"), "utf8");

    expect(manual).toContain('id="previous-neighbour-backtest"');
    expect(manual).toContain("does not alter candidate generation");
    expect(manual).toContain("Anti-lookahead rule");
    expect(manual).toContain("duplicated neighbour");
  });
});
