import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("HIG contributor guardrails", () => {
  it("keeps durable HIG guidance available to collaborators", () => {
    expect(existsSync(resolve(process.cwd(), "AGENTS.md"))).toBe(true);
    expect(readRepoFile("AGENTS.md")).toContain("Apple Human Interface Guidelines");
    expect(readRepoFile("docs/HIG_UI_GUIDE.md")).toContain("Windfall HIG UI Guide");
    expect(readRepoFile(".github/copilot-instructions.md")).toContain("Apple HIG-Inspired Standards");
    expect(readRepoFile(".github/copilot-instructions.md")).toContain("React 18");
    expect(readRepoFile(".github/copilot-instructions.md")).toContain("Vite");
    expect(readRepoFile(".github/pull_request_template.md")).toContain("HIG / UI Checklist");
  });

  it("wires workflow navigation and shared HIG control primitives into the app", () => {
    const appSource = readRepoFile("src/App.tsx");
    const navSource = readRepoFile("src/components/layout/AppWorkflowNav.tsx");
    const controlsSource = readRepoFile("src/components/shared/HigControls.tsx");
    const cssSource = readRepoFile("src/index.css");

    expect(appSource).toContain("AppWorkflowNav");
    expect(appSource).toContain("WorkflowAnchor");
    expect(navSource).toContain("workflow-history");
    expect(navSource).toContain("workflow-signals");
    expect(navSource).toContain("workflow-validation");
    expect(navSource).toContain("workflow-generation");
    expect(navSource).toContain("workflow-dga");
    expect(navSource).toContain("workflow-patterns");
    expect(controlsSource).toContain("HigButton");
    expect(controlsSource).toContain("InfoHelp");
    expect(cssSource).toContain(".windfall-workflow-nav");
    expect(cssSource).toContain(".windfall-hig-button");
    expect(cssSource).toContain(".windfall-info-help");
    expect(appSource).not.toContain('fontFamily: "monospace"');
  });

  it("keeps Candidate Generation Influences on the responsive HIG layout rail", () => {
    const appSource = readRepoFile("src/App.tsx");
    const cssSource = readRepoFile("src/index.css");

    expect(appSource).toContain('className="windfall-influences-grid"');
    expect(appSource).toContain('className="windfall-influence-card windfall-influence-card--wide"');
    expect(appSource).toContain('className="windfall-influence-control-grid"');
    expect(appSource).toContain('className="windfall-influence-provenance"');
    expect(cssSource).toContain(".windfall-influences-grid");
    expect(cssSource).toContain(".windfall-influence-card--wide");
    expect(cssSource).toContain(".windfall-influence-control-grid");
    expect(cssSource).toContain("@media (max-width: 1180px)");
  });

  it("wires panel favorites into sections, the app shell, and presets", () => {
    const appSource = readRepoFile("src/App.tsx");
    const sectionSource = readRepoFile("src/components/shared/CollapsibleSection.tsx");
    const presetsSource = readRepoFile("src/lib/presets.ts");
    const registrySource = readRepoFile("src/lib/panelFavorites.ts");
    const cssSource = readRepoFile("src/index.css");

    expect(appSource).toContain("PanelFavoritesProvider");
    expect(appSource).toContain("PanelFavoritesStrip");
    expect(appSource).toContain("includePanelFavoritesInPreset");
    expect(appSource).toContain('panelId="generated-candidates"');
    expect(appSource).toContain('panelId="candidate-generation-influences"');
    expect(sectionSource).toContain("aria-pressed={isFavorite}");
    expect(sectionSource).toContain("windfall-section__favorite-button");
    expect(presetsSource).toContain("favoritePanelIds?: string[]");
    expect(presetsSource).toContain("normalizeFavoritePanelIds");
    expect(registrySource).toContain("FAVORITE_PANEL_REGISTRY");
    expect(cssSource).toContain(".windfall-favorites-strip");
    expect(cssSource).toContain(".windfall-section__favorite-text");
  });
});
