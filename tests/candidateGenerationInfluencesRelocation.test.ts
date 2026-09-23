import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = (): string => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const registrySource = (): string => readFileSync(resolve(process.cwd(), "src/lib/panelFavorites.ts"), "utf8");
const monthlySummarySource = (): string => readFileSync(resolve(process.cwd(), "src/components/MonthlyDrawsSummaryPanel.tsx"), "utf8");
const stylesSource = (): string => readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

const blockBetween = (source: string, start: string, end: string): string => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("Candidate Generation Influences control relocation", () => {
  it("removes the standalone Operator controls panel from App and favorites", () => {
    const app = appSource();

    expect(app).not.toContain('import { OperatorsPanel } from "./components/OperatorsPanel";');
    expect(app).not.toContain('panelId="operators-panel"');
    expect(app).not.toContain("<OperatorsPanel");
    expect(registrySource()).not.toContain('id: "operators-panel"');
  });

  it("places generation setup before candidate generators and keeps generator panels output-focused", () => {
    const app = appSource();
    const setupIndex = app.indexOf('panelId="candidate-generation-influences"');
    const pasteIndex = app.indexOf('panelId="paste-weighted-candidate-generator"');
    const portfolioIndex = app.indexOf('panelId="portfolio-compression"');
    const generatedIndex = app.indexOf('panelId="generated-candidates"');

    expect(setupIndex).toBeGreaterThanOrEqual(0);
    expect(setupIndex).toBeLessThan(pasteIndex);
    expect(setupIndex).toBeLessThan(portfolioIndex);
    expect(setupIndex).toBeLessThan(generatedIndex);
    expect(app).toContain('title={<b>Candidate Generation Setup</b>}');
    expect(app).toContain('summaryHint="Configure filters, weighting, evidence, and forced/excluded numbers before generation"');

    const influencesBlock = blockBetween(
      app,
      'panelId="candidate-generation-influences"',
      '{/* [ORDER-ANCHOR] 23.5 Paste-Weighted Candidate Generator */}',
    );
    const generatedBlock = blockBetween(
      app,
      'panelId="generated-candidates"',
      '{/* [ORDER-ANCHOR] 24.5 Pick Six */}',
    );

    expect(influencesBlock).toContain('title="Engine & Ranking"');
    expect(influencesBlock).toContain('title="Hard Filters"');
    expect(influencesBlock).toContain('title="Shape & Bucket Quotas"');
    expect(influencesBlock).toContain('title="Number Biases"');
    expect(influencesBlock).toContain('title="Recency & Latest Draw Rules"');
    expect(influencesBlock).toContain('title="Active Setup Summary"');
    expect(influencesBlock).toContain("OGA Reference And Ranking");
    expect(influencesBlock).toContain("value={ogaRefMode}");
    expect(influencesBlock).toContain("setOgaRefMode");
    expect(influencesBlock).toContain("value={ogaSpokeCount}");
    expect(influencesBlock).toContain("setOgaSpokeCount");
    expect(influencesBlock).toContain("<RankingWeightsPanel");
    expect(influencesBlock).toContain("weights={rankingWeights}");
    expect(influencesBlock).toContain("setWeights={setRankingWeights}");
    expect(influencesBlock).toContain('scope="oga"');
    expect(influencesBlock).toContain('title="OGA Survivor Weight"');
    expect(influencesBlock).toContain("checked={lambdaEnabled}");
    expect(influencesBlock).toContain("setLambdaEnabled");
    expect(influencesBlock).toContain("value={lambda}");
    expect(influencesBlock).toContain("checked={gpwfEnabled}");
    expect(influencesBlock).toContain("setGPWFEnabled");
    expect(influencesBlock).toContain("value={gpwf_window_size}");
    expect(influencesBlock).toContain("setGPWFWindowSize");
    expect(influencesBlock).toContain("value={octagonalTop}");
    expect(influencesBlock).toContain("setOctagonalTop");
    expect(influencesBlock).toContain("previewStats.entropy");
    expect(influencesBlock).toContain("previewStats.hamming");
    expect(influencesBlock).toContain("previewStats.jaccard");

    expect(generatedBlock).not.toContain('panelId="candidate-generation-influences"');
    expect(generatedBlock).not.toContain("OGA Reference And Ranking");
    expect(generatedBlock).not.toContain("<RankingWeightsPanel");
  });

  it("renders Active Setup Summary provenance and generation trace as grouped readable sections", () => {
    const app = appSource();
    const influencesBlock = blockBetween(
      app,
      'panelId="candidate-generation-influences"',
      '{/* [ORDER-ANCHOR] 23.5 Paste-Weighted Candidate Generator */}',
    );

    expect(influencesBlock).toContain("windfall-influence-provenance__grid");
    expect(influencesBlock).toContain("activeSetupProvenanceGroups.map");
    expect(app).toContain('title: "History & Source"');
    expect(app).toContain('title: "Filters & Distance"');
    expect(app).toContain('title: "Recency & Latest Draw"');
    expect(app).toContain('title: "Ending Digits & Buckets"');
    expect(app).toContain('title: "Monthly & Carry-over"');
    expect(app).toContain("formatGenerationTraceLines");
    expect(app).toContain("Rejects · hard filters");
    expect(app).toContain("Rejects · digit buckets");
    expect(app).toContain("Rejects · shape/recency");
    expect(app).not.toContain("rejects — excl:${st.exclusions} sum:${st.sumRange} div5:${st.div5} main0:${st.mainZeroSet}");
  });

  it("makes every top setup-summary value a navigable HIG button with a precise destination", () => {
    const app = appSource();
    const influencesBlock = blockBetween(
      app,
      'panelId="candidate-generation-influences"',
      '{/* [ORDER-ANCHOR] 23.5 Paste-Weighted Candidate Generator */}',
    );

    expect(influencesBlock).toContain("generationSetupSummaryItems.map");
    expect(influencesBlock).toContain('className="windfall-generation-setup-summary-chip"');
    expect(influencesBlock).toContain("navigateToGenerationSetupSummaryTarget(item.target)");
    expect(influencesBlock).toContain('aria-label={`${item.targetLabel}. Current summary: ${item.text}`}');

    for (const target of [
      "forcedExcluded",
      "ratios",
      "numbersDiagnostic",
      "droughtGovernor",
      "monthlyTransition",
      "d1Sgi",
      "latestNeighbour",
      "readinessFilters",
      "carryOver",
      "stageIdm",
      "bucketPlan",
    ]) {
      expect(app).toContain(`target: "${target}"`);
    }

    expect(app).toContain("setActiveSetupSummaryExpanded(true)");
    expect(app).toContain("setEngineRankingExpanded(true)");
    expect(app).toContain("setShapeBucketQuotasExpanded(true)");
    expect(app).toContain("setRecencyLatestDrawExpanded(true)");
    expect(app).toContain("setHardFiltersExpanded(true)");
    expect(monthlySummarySource()).toContain('MONTHLY_DRAWS_STAGE_IDM_TARGET_ID = "monthly-draws-summary-stage-idm"');
    expect(stylesSource()).toContain(".windfall-generation-setup-summary-chip:hover");
  });
});
