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
});
