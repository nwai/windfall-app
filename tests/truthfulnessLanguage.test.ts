import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => (
  readFileSync(resolve(process.cwd(), path), "utf8")
);

describe("truthfulness wording guards", () => {
  it("keeps generated-candidate diagnostics from reading like calibrated predictions", () => {
    const source = readProjectFile("src/components/candidates/GeneratedCandidatesPanel.tsx");
    const manual = readProjectFile("public/user-manual.html");
    const combined = `${source}\n${manual}`;

    expect(combined).not.toContain("strongest prize predictor");
    expect(combined).not.toContain("strongest single predictor");
    expect(combined).not.toContain("most likely to win a prize");
    expect(combined).not.toContain("Higher = rarer numbers = 15× lift at top-50");
    expect(combined).not.toContain("6.17× lift");
    expect(combined).not.toContain("strongest prize-prediction signal");
    expect(combined).not.toContain("statistically more likely to be drawn again before the month ends");
    expect(combined).not.toContain("Most likely hits:");
    expect(combined).not.toContain("Most likely to flip early next month");

    expect(combined).toContain("candidate-pool diagnostic");
    expect(combined).toContain("not a calibrated next-draw probability");
  });

  it("does not keep unused placeholder panel components in the candidate tree", () => {
    const deletedStubPaths = [
      "src/components/candidates/CandidateGenerationControls.tsx",
      "src/components/candidates/Phase0DrawHistoryPanel.tsx",
      "src/components/candidates/OddEvenRatiosPanel.tsx",
      "src/components/candidates/WFMQYPanel.tsx",
    ];

    for (const path of deletedStubPaths) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    }
  });

  it("does not show the Monte Carlo simulation as a placeholder implementation", () => {
    const monteCarloSource = readProjectFile("src/components/candidates/MonteCarloPanel.tsx");

    expect(monteCarloSource).not.toContain("placeholder). Adjust for 6 + 2 logic");
    expect(monteCarloSource).toContain("Simulation draws {drawSize} unique numbers from the displayed weighted probabilities");
  });

  it("labels survival and temperature-transition panels as diagnostics rather than predictions", () => {
    const survivalSource = readProjectFile("src/components/SurvivalAnalyzer.tsx");
    const temperatureSource = readProjectFile("src/components/TemperatureTransitionPanel.tsx");
    const churnSource = readProjectFile("src/components/ChurnPredictor.tsx");
    const returnSource = readProjectFile("src/components/ReturnPredictor.tsx");
    const appSource = readProjectFile("src/App.tsx");
    const ttpDocs = readProjectFile("src/docs/TTP.md");
    const zpaDocs = readProjectFile("src/docs/ZPA.md");
    const zoneDemo = readProjectFile("src/lib/zoneDemo.ts");
    const implementationSummary = readProjectFile("src/IMPLEMENTATION_SUMMARY.md");

    expect(survivalSource).not.toContain("calibrated bias scores");
    expect(survivalSource).toContain("budgeted bias scores");

    expect(temperatureSource).not.toContain("Temperature Transition Predictions");
    expect(temperatureSource).toContain("Temperature Transition Diagnostics");
    expect(temperatureSource).not.toContain(">P(V | Temp)<");
    expect(temperatureSource).toContain("Empirical hit rate");
    expect(temperatureSource).not.toContain("marking a number as a predicted hit");
    expect(temperatureSource).not.toContain("Auto window (beta)");
    expect(temperatureSource).toContain("Auto-fit window (backtest)");
    expect(temperatureSource).toContain("Diagnostic shortlist");
    expect(temperatureSource).toContain("does not change User Selected Numbers or force candidate generation");
    expect(temperatureSource).toContain("descriptive evidence markers, not calibrated next-draw probabilities");

    const ttpSurface = `${ttpDocs}\n${zpaDocs}\n${zoneDemo}\n${implementationSummary}`;
    expect(ttpSurface).not.toContain("Temperature Transition Predictions");
    expect(ttpSurface).not.toContain("Pattern prediction");
    expect(ttpSurface).not.toContain("Nudge predictions");
    expect(ttpSurface).toContain("Temperature Transition Diagnostics");
    expect(ttpSurface).toContain("descriptive evidence, not a calibrated next-draw probability");

    expect(churnSource).not.toContain(">Churn Predictor");
    expect(churnSource).not.toContain("Train & Predict");
    expect(churnSource).toContain(">Churn Diagnostic");
    expect(churnSource).toContain("Train & Score");

    expect(returnSource).not.toContain(">Return Predictor");
    expect(returnSource).not.toContain("Train & Predict");
    expect(returnSource).toContain(">Return Diagnostic");
    expect(returnSource).toContain("Train & Score");

    expect(appSource).not.toContain("Advanced Survival Analysis & Churn/Return Prediction Models");
    expect(appSource).toContain("Advanced Survival Analysis & Churn/Return Diagnostic Models");
  });

  it("renames next-draw probabilities to empirical diagnostics and avoids calibrated probability wording", () => {
    const appSource = readProjectFile("src/App.tsx");
    const panelSource = readProjectFile("src/components/NextDrawProbabilitiesPanel.tsx");
    const favoritesSource = readProjectFile("src/lib/panelFavorites.ts");
    const combined = `${appSource}\n${panelSource}\n${favoritesSource}`;

    expect(combined).toContain("Next Draw Empirical Diagnostics");
    expect(combined).not.toContain("Next Draw Probabilities");
    expect(panelSource).not.toContain("Next OGA probabilities");
    expect(panelSource).not.toContain("KDE Prob%");
    expect(panelSource).not.toContain("Prob%</th>");
    expect(panelSource).toContain("KDE support %");
    expect(panelSource).toContain("Empirical share %");
    expect(panelSource).toContain("filterRealDrawHistory");
  });

  it("keeps scoring system diagnostics observe-only and terminal-digit framed", () => {
    const componentSource = readProjectFile("src/components/ScoringSystemDiagnosticsPanel.tsx");
    const libSource = readProjectFile("src/lib/scoringSystemDiagnostics.ts");

    expect(componentSource).toContain("Observe-only");
    expect(componentSource).toContain("not calibrated next-draw probabilities");
    expect(componentSource).toContain("terminal digit");
    expect(componentSource).not.toMatch(/probability of next draw/i);
    expect(componentSource).not.toMatch(/guaranteed|guarantee/i);
    expect(componentSource).not.toMatch(/ending-family|ending family/i);
    expect(libSource).not.toMatch(/prediction/i);
  });

  it("keeps survival/churn documentation framed as diagnostics rather than prediction certainty", () => {
    const docs = readProjectFile("src/docs/SURVIVAL_CHURN_MODELS.md");

    expect(docs).not.toContain("prediction models");
    expect(docs).not.toContain("Predicts which");
    expect(docs).not.toContain("most likely to reappear");
    expect(docs).not.toContain("strong prediction");
    expect(docs).not.toContain("predictions are more reliable");
    expect(docs).toContain("diagnostic models");
    expect(docs).toContain("score is descriptive");
  });
});
