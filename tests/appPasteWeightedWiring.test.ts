import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("App paste-weighted panel wiring", () => {
  it("keeps the paste-weighted candidate generator imported and rendered in App", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('import { PasteWeightedCandidatesPanel } from "./components/candidates/PasteWeightedCandidatesPanel";');
    expect(appSource).toContain("handleSimulatePasteWeightedCandidate");
    expect(appSource).toContain("<PasteWeightedCandidatesPanel");
    expect(appSource).toContain("title={<b>Paste-Weighted Candidate Generator</b>}");

    const pastePanelCall = appSource.match(/<PasteWeightedCandidatesPanel[\s\S]*?\/>/)?.[0] ?? "";
    expect(pastePanelCall).toContain("stageIdealDrawState={stageIdealDrawState}");
  });

  it("replaces the shared user-selected strip when simulating a paste-weighted candidate", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const handlerStart = appSource.indexOf("const handleSimulatePasteWeightedCandidate");
    const handlerEnd = appSource.indexOf("const handleSimulatePortfolioCore", handlerStart);
    const handlerBlock = appSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerBlock).toContain("setUserSelectedNumbers(main);");
    expect(handlerBlock.indexOf("setUserSelectedNumbers(main);")).toBeLessThan(handlerBlock.indexOf("setSimulatedDraw("));
  });

  it("keeps the portfolio compression panel imported and rendered in App", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain("PortfolioCompressionPanel");
    expect(appSource).toContain('from "./components/candidates/PortfolioCompressionPanel";');
    expect(appSource).toContain("Portfolio Compression / 12-Game Distiller");
    expect(appSource).toContain("<PortfolioCompressionPanel");
    expect(appSource).toContain("pasteWeightedPortfolioCandidates");
    expect(appSource).toContain("onGeneratedCandidatesChange={setPasteWeightedPortfolioCandidates}");
    expect(appSource).toContain("handleSimulatePortfolioCore");

    const portfolioPanelCall = appSource.match(/<PortfolioCompressionPanel[\s\S]*?\/>/)?.[0] ?? "";
    expect(portfolioPanelCall).toContain("userSelectedNumbers={userSelectedNumbers}");
    expect(portfolioPanelCall).toContain("monthEndCarryOverBiasEnabled={monthEndCarryOverBiasEnabled}");
    expect(portfolioPanelCall).toContain("monthEndCarryOverWeights={monthEndCarryOverWeightsForGeneration}");
    expect(portfolioPanelCall).toContain("hotColdRows={portfolioHotColdRows}");
    expect(portfolioPanelCall).toContain("windowShapeRows={portfolioWindowShapeRows}");
    expect(portfolioPanelCall).toContain("adjacentComboHistory={realFilteredHistory}");
    expect(portfolioPanelCall).toContain("monthlyBuckets={dgaEffectiveMonthlyBuckets}");
    expect(portfolioPanelCall).toContain("backtestHistory={realHistory}");
    expect(portfolioPanelCall).toContain("onSimulateCore={handleSimulatePortfolioCore}");
    expect(portfolioPanelCall).toContain("activeSimulatedKey={activeSimulatedMainKey}");
    expect(portfolioPanelCall).toContain("...candidate.main");
    expect(portfolioPanelCall).toContain("...candidate.supp");
  });
});
