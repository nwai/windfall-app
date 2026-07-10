import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("startup history fallback wiring", () => {
  it("loads the default CSV through an optional Vite raw asset so a missing file can be handled in-app", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/fetchDraws.ts"), "utf8");

    expect(source).toContain("import.meta.glob");
    expect(source).toContain("../windfall_history_lottolyzer.csv");
    expect(source).not.toContain('import fallbackCSV from "../windfall_history_lottolyzer.csv?raw";');
  });

  it("shows an explicit startup choice when no default draw history is available", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(source).toContain('data-testid="startup-history-choice"');
    expect(source).toContain("No draw history loaded");
    expect(source).toContain("Use another CSV/JSON file");
    expect(source).toContain("Load simulated demo rows");
    expect(source).toContain("handleUseSimulatedStartupHistory");
    expect(source).toContain("buildDemoDrawHistory");
  });
});
