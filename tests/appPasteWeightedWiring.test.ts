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
    expect(portfolioPanelCall).toContain("adjacentComboHistory={filteredHistory}");
    expect(portfolioPanelCall).toContain("monthlyBuckets={dgaEffectiveMonthlyBuckets}");
    expect(portfolioPanelCall).toContain("backtestHistory={history}");
    expect(portfolioPanelCall).toContain("onSimulateCore={handleSimulatePortfolioCore}");
    expect(portfolioPanelCall).toContain("activeSimulatedKey={activeSimulatedMainKey}");
  });
});
