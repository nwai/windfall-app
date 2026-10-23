export interface FavoritePanelMeta {
  id: string;
  title: string;
  workflow: "History" | "Signals" | "Validation" | "Generation" | "DGA" | "Patterns";
}

export const PANEL_FAVORITES_STORAGE_KEY = "windfall:panel-favorites:v1";

export const FAVORITE_PANEL_REGISTRY: FavoritePanelMeta[] = [
  { id: "windfall-predictor", title: "Windfall Predictor", workflow: "Generation" },
  { id: "draw-history-manager", title: "Draw History Manager", workflow: "History" },
  { id: "windowed-draw-filtering", title: "Windowed Draw Filtering (WFMQYH)", workflow: "History" },
  { id: "number-trends", title: "Number Trends Table", workflow: "History" },
  { id: "odd-even-ratio-filters", title: "Draw Composition Quotas", workflow: "Signals" },
  { id: "odd-even-ratio-cadence", title: "Odd/Even Ratio Cadence", workflow: "Signals" },
  { id: "scoring-system-diagnostics", title: "Scoring System Diagnostics", workflow: "Signals" },
  { id: "survival-analyzer", title: "Survival Analyzer", workflow: "Signals" },
  { id: "temperature-transition", title: "Temperature Transition", workflow: "Signals" },
  { id: "monte-carlo-analyzer", title: "Monte Carlo Analyzer", workflow: "Signals" },
  { id: "drought-break-shortlist", title: "Drought-break shortlist", workflow: "Signals" },
  { id: "most-likely-not-drawn", title: "Most Likely NOT Drawn", workflow: "Signals" },
  { id: "next-draw-evidence-ensemble", title: "Next-Draw Evidence Ensemble (6+2)", workflow: "Validation" },
  { id: "prediction-journal", title: "Prediction Journal & Scorecard", workflow: "Validation" },
  { id: "evidence-portfolio", title: "Evidence Portfolio", workflow: "Validation" },
  { id: "research-diary", title: "Research Diary & Draw Reminders", workflow: "Validation" },
  { id: "backtest-validation", title: "Backtest Validation", workflow: "Validation" },
  { id: "trend-ratio-history", title: "Trend Ratio Diagnostics", workflow: "Validation" },
  { id: "group-pattern-analyzer", title: "Group Pattern Analyzer", workflow: "Validation" },
  { id: "pattern-stats", title: "Historical Draw Composition", workflow: "Validation" },
  { id: "number-group-frequency-audit", title: "Number-Group Frequency Audit", workflow: "Validation" },
  { id: "number-frequency", title: "Number Frequency", workflow: "Validation" },
  { id: "draw-bucket-patterns", title: "Draw Bucket Patterns", workflow: "Validation" },
  { id: "ending-digit-sequences", title: "Ending Digit Sequences", workflow: "Validation" },
  { id: "terminal-family-leadership", title: "Terminal Family Leadership & Handover", workflow: "Validation" },
  { id: "adjacent-combos", title: "Adjacent Combos (Pairs / Triples)", workflow: "Validation" },
  { id: "window-stats", title: "Window Stats", workflow: "Validation" },
  { id: "signal-confluence-ledger", title: "Signal Confluence / Number Consensus Ledger", workflow: "Validation" },
  { id: "target-set-quick-stats", title: "Target Set Quick Stats", workflow: "Validation" },
  { id: "survival-churn-diagnostic-models", title: "Advanced Survival & State Diagnostics", workflow: "Validation" },
  { id: "state-presets", title: "State Presets", workflow: "Generation" },
  { id: "trend-ratio-filter", title: "Trend Ratio Filter (UP / DOWN / FLAT)", workflow: "Generation" },
  { id: "parameter-search", title: "Parameter Search", workflow: "Generation" },
  { id: "bates-weighting", title: "Bates Weighting Panel", workflow: "Generation" },
  { id: "weighted-target-list", title: "Weighted Target List", workflow: "Generation" },
  { id: "modulation-diagnostics", title: "Modulation Diagnostics", workflow: "Generation" },
  { id: "monthly-overlap", title: "Monthly Numbers Overlap", workflow: "Generation" },
  { id: "monthly-first-last-hits", title: "Monthly First <-> Last Draw Hits", workflow: "Generation" },
  { id: "monthly-draws-summary", title: "Monthly Draws Summary", workflow: "Generation" },
  { id: "monthly-bucket-transition-lab", title: "Monthly Bucket Transition Lab", workflow: "Generation" },
  { id: "decade-monthly-bucket-watch", title: "Decade × Monthly Bucket Watch", workflow: "Validation" },
  { id: "month-end-carry-over-buckets", title: "Month-End Carry-Over Buckets", workflow: "Generation" },
  { id: "monthly-digit-occurrences", title: "Monthly 1-Digit vs 2-Digit Occurrences", workflow: "Generation" },
  { id: "hot-cold-ranking", title: "Hot vs Cold Ranking", workflow: "Generation" },
  { id: "user-selected-numbers", title: "User Selected Numbers", workflow: "Generation" },
  { id: "selection-insights", title: "Selection Insights", workflow: "Generation" },
  { id: "paste-weighted-candidate-generator", title: "Paste-Weighted Candidate Generator", workflow: "Generation" },
  { id: "portfolio-compression", title: "Portfolio Compression / 12-Game Distiller", workflow: "Generation" },
  { id: "generated-candidates", title: "Generated Candidates", workflow: "Generation" },
  { id: "candidate-generation-influences", title: "Candidate Generation Setup", workflow: "Generation" },
  { id: "pick-six", title: "Pick Six", workflow: "Generation" },
  { id: "next-hot-blocks", title: "Next Hot Blocks", workflow: "DGA" },
  { id: "diamond-grid-analysis", title: "Diamond Grid Analysis (DGA)", workflow: "DGA" },
  { id: "undrawn-patterns", title: "Undrawn Patterns (Empirical)", workflow: "Patterns" },
];

const PANEL_ID_SET = new Set(FAVORITE_PANEL_REGISTRY.map((panel) => panel.id));

export function getFavoritePanelDomId(panelId: string): string {
  return `panel-${panelId}`;
}

export function getFavoritePanelMeta(panelId: string): FavoritePanelMeta | undefined {
  return FAVORITE_PANEL_REGISTRY.find((panel) => panel.id === panelId);
}

export function normalizeFavoritePanelIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of input) {
    // The retired NDED panel's OGA information now lives in generation setup.
    const id = value === "next-draw-probabilities" ? "candidate-generation-influences" : value;
    if (typeof id !== "string" || !PANEL_ID_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }

  return output;
}

export function loadFavoritePanelIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeFavoritePanelIds(JSON.parse(window.localStorage.getItem(PANEL_FAVORITES_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveFavoritePanelIds(panelIds: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PANEL_FAVORITES_STORAGE_KEY, JSON.stringify(normalizeFavoritePanelIds(panelIds)));
}
