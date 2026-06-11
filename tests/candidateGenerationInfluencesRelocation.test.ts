import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = (): string => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const registrySource = (): string => readFileSync(resolve(process.cwd(), "src/lib/panelFavorites.ts"), "utf8");

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

  it("moves OGA reference, spokes, ranking weights, GPWF, lambda, and OGA top into Candidate Generation Influences", () => {
    const app = appSource();
    const influencesBlock = blockBetween(
      app,
      'panelId="candidate-generation-influences"',
      '<TracePanel',
    );
    const generatedBlock = blockBetween(
      app,
      'panelId="generated-candidates"',
      'panelId="candidate-generation-influences"',
    );

    expect(influencesBlock).toContain("OGA Reference And Ranking");
    expect(influencesBlock).toContain("value={ogaRefMode}");
    expect(influencesBlock).toContain("setOgaRefMode");
    expect(influencesBlock).toContain("value={ogaSpokeCount}");
    expect(influencesBlock).toContain("setOgaSpokeCount");
    expect(influencesBlock).toContain("<RankingWeightsPanel weights={rankingWeights} setWeights={setRankingWeights} />");
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

    expect(generatedBlock).not.toContain("OGA reference:");
    expect(generatedBlock).not.toContain("<RankingWeightsPanel");
  });
});
