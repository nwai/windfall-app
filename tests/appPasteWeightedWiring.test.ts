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
    expect(pastePanelCall).toContain("forcedNumbers={pasteWeightedForcedNumbers}");
    expect(pastePanelCall).toContain("excludedNumbers={allExclusions}");
    expect(pastePanelCall).toContain("onToggleForcedNumber={togglePasteWeightedForcedNumber}");
    expect(pastePanelCall).toContain("keptGeneratedRows={keptGeneratedCandidateRows}");
  });

  it("wires Paste-Weighted missing-number selections into hard forced generation numbers", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain("const [pasteWeightedForcedNumbers, setPasteWeightedForcedNumbers] = useState<number[]>([]);");
    expect(appSource).toContain("...pasteWeightedForcedNumbers,");
    expect(appSource).toContain('{ kind: "hardInclude", label: "Paste-Weighted missing-number selections", numbers: pasteWeightedForcedNumbers }');
    expect(appSource).toContain("paste-weighted missing selections");
    expect(appSource).toContain("pasteWeightedForcedNumbers: [...pasteWeightedForcedNumbers]");
    expect(appSource).toContain("setPasteWeightedForcedNumbers(normalizeHotColdGenerationNumbers(s.pasteWeightedForcedNumbers));");
  });

  it("routes paste-weighted simulation through protected user-selection sync", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const handlerStart = appSource.indexOf("const handleSimulatePasteWeightedCandidate");
    const handlerEnd = appSource.indexOf("const handleSimulatePortfolioCore", handlerStart);
    const handlerBlock = appSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerBlock).toContain("syncUserSelectionForExternalSimulation(main);");
    expect(handlerBlock).not.toContain("setUserSelectedNumbers(main);");
    expect(handlerBlock.indexOf("syncUserSelectionForExternalSimulation(main);")).toBeLessThan(handlerBlock.indexOf("setSimulatedDraw("));
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
    expect(portfolioPanelCall).toContain("keptGeneratedRows={keptGeneratedCandidateRows}");
    expect(portfolioPanelCall).toContain("...candidate.main");
    expect(portfolioPanelCall).toContain("...candidate.supp");
  });

  it("wires Generated Candidates Keep into the shared keep row ledger", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const generatedPanelCall = appSource.match(/<GeneratedCandidatesPanel[\s\S]*?\/>/)?.[0] ?? "";
    const handlerStart = appSource.indexOf("const handleKeepGeneratedCandidate");
    const handlerEnd = appSource.indexOf("const handleSimulatePickSixManual", handlerStart);
    const handlerBlock = appSource.slice(handlerStart, handlerEnd);

    expect(appSource).toContain("const [keptGeneratedCandidateRows, setKeptGeneratedCandidateRows] = useState<KeptGeneratedCandidateRow[]>([]);");
    expect(generatedPanelCall).toContain("onKeepCandidate={handleKeepGeneratedCandidate}");
    expect(handlerBlock).toContain("setKeptGeneratedCandidateRows((current) => [...current, keptRow]);");
    expect(handlerBlock).toContain("appended to Portfolio Compression and Paste-Weighted rows");
  });

  it("wires Generated Candidates sessions into the same shared keep row ledger", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const generatedPanelCall = appSource.match(/<GeneratedCandidatesPanel[\s\S]*?\/>/)?.[0] ?? "";
    const exportHandlerStart = appSource.indexOf("const handleExportGenerationSession");
    const exportHandlerEnd = appSource.indexOf("const handleKeepGeneratedCandidate", exportHandlerStart);
    const exportHandlerBlock = appSource.slice(exportHandlerStart, exportHandlerEnd);

    expect(appSource).toContain("const [generationSessionActive, setGenerationSessionActive] = useState<boolean>(false);");
    expect(appSource).toContain("const [generationSessionRows, setGenerationSessionRows] = useState<KeptGeneratedCandidateRow[]>([]);");
    expect(appSource).toContain("filterCandidatesForGenerationSession");
    expect(generatedPanelCall).toContain("generationSessionActive={generationSessionActive}");
    expect(generatedPanelCall).toContain("generationSessionCount={generationSessionRows.length}");
    expect(generatedPanelCall).toContain("onStartGenerationSession={handleStartGenerationSession}");
    expect(generatedPanelCall).toContain("onEndGenerationSession={handleEndGenerationSession}");
    expect(generatedPanelCall).toContain("onClearGenerationSession={handleClearGenerationSession}");
    expect(generatedPanelCall).toContain("onExportGenerationSession={handleExportGenerationSession}");
    expect(exportHandlerBlock).toContain("setKeptGeneratedCandidateRows((current) => [...current, ...exportedRows]);");
    expect(exportHandlerBlock).toContain("setGenerationSessionRows([]);");
    expect(exportHandlerBlock).toContain("Portfolio Compression as mains+supps and Paste-Weighted as mains-only rows");
  });
});
