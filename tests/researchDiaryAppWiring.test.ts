import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Research Diary app wiring", () => {
  it("places the research diary under Validation using real history and setup snapshots", () => {
    const app = readProjectFile("src/App.tsx");

    expect(app).toContain('import { ResearchDiaryPanel } from "./components/ResearchDiaryPanel";');
    expect(app).toContain('panelId="research-diary"');
    expect(app.indexOf('panelId="prediction-journal"')).toBeLessThan(app.indexOf('panelId="research-diary"'));
    expect(app.indexOf('panelId="research-diary"')).toBeLessThan(app.indexOf('panelId="backtest-validation"'));
    expect(app).toContain("<ResearchDiaryPanel");
    expect(app).toContain("history={realHistory}");
    expect(app).toContain("getSetupSnapshot={() => buildSnapshot({ includePanelFavorites: true })}");
  });

  it("registers the research diary as a favoriteable Validation panel", () => {
    const registry = readProjectFile("src/lib/panelFavorites.ts");

    expect(registry).toContain('id: "research-diary"');
    expect(registry).toContain('title: "Research Diary & Draw Reminders"');
    expect(registry).toContain('workflow: "Validation"');
  });

  it("documents the research diary in the user manual", () => {
    const manual = readProjectFile("public/user-manual.html");

    expect(manual).toContain('href="#research-diary"');
    expect(manual).toContain('id="research-diary"');
    expect(manual).toContain("Research Diary &amp; Draw Reminders");
    expect(manual).toContain("does not influence candidate generation");
  });
});
