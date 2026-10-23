export type WindfallWorkflowHome = "history" | "signals" | "validation" | "generation" | "dga" | "patterns";

export type EvidenceFamilyId =
  | "history-source"
  | "frequency-recency"
  | "odd-even"
  | "scoring"
  | "survival"
  | "temperature"
  | "stochastic-replay"
  | "drought"
  | "previous-neighbour"
  | "consecutive-run"
  | "trend-shape"
  | "structural-pattern"
  | "terminal-digit"
  | "monthly-stage"
  | "spatial-dga"
  | "evidence-aggregation"
  | "user-intent"
  | "generation-control"
  | "candidate-output"
  | "research-record"
  | "utility";

export type EvidencePortfolioPolicy =
  | "not-evidence"
  | "observe-only"
  | "requires-preregistration"
  | "eligible-after-validation";

export type PanelEvidenceRole =
  | "source"
  | "diagnostic"
  | "validator"
  | "consumer"
  | "aggregator"
  | "control"
  | "output"
  | "record"
  | "utility";

export type PanelAllowedUse =
  | "source-only"
  | "observe-only"
  | "user-directed"
  | "generation-active"
  | "output-only";

export interface EvidenceFamilyDefinition {
  id: EvidenceFamilyId;
  title: string;
  independenceGroup: string;
  portfolioPolicy: EvidencePortfolioPolicy;
  description: string;
}

export interface PanelOwnershipDefinition {
  panelId: string;
  currentHome: WindfallWorkflowHome;
  recommendedHome: WindfallWorkflowHome;
  placementStatus: "established" | "review";
  primaryFamily: EvidenceFamilyId;
  dependencies: EvidenceFamilyId[];
  role: PanelEvidenceRole;
  allowedUse: PanelAllowedUse;
}

export const EVIDENCE_PORTFOLIO_VERSION = "WF-EVIDENCE-1.0.0";

export const EVIDENCE_PORTFOLIO_RULES = {
  scoreCapPerIndependenceGroup: 1,
  withinGroupRule: "strongest-eligible-mention",
  acrossGroupRule: "equal-bounded-sum",
  aggregatorOutputRule: "context-only",
  consumerOutputRule: "context-only",
  userStateRule: "context-only",
  outcomeSelectedWeights: false,
} as const;

export const EVIDENCE_FAMILY_REGISTRY: EvidenceFamilyDefinition[] = [
  { id: "history-source", title: "History source and scope", independenceGroup: "recorded-history", portfolioPolicy: "not-evidence", description: "Recorded draw provenance, validation, and history-window selection." },
  { id: "frequency-recency", title: "Frequency and recency", independenceGroup: "frequency-state", portfolioPolicy: "requires-preregistration", description: "Counts, recency, hot/cold state, and related descriptive number evidence." },
  { id: "odd-even", title: "Odd/even composition", independenceGroup: "composition", portfolioPolicy: "eligible-after-validation", description: "Observed odd/even ratios, cadence, and user-directed composition controls." },
  { id: "scoring", title: "Number scoring", independenceGroup: "number-score", portfolioPolicy: "requires-preregistration", description: "Versioned diagnostic ranks and their validation." },
  { id: "survival", title: "Survival and state", independenceGroup: "survival-state", portfolioPolicy: "requires-preregistration", description: "Observed survival, churn, return, and state-transition evidence." },
  { id: "temperature", title: "Temperature state", independenceGroup: "frequency-state", portfolioPolicy: "requires-preregistration", description: "Recency, EMA, and hybrid temperature states derived from recorded history." },
  { id: "stochastic-replay", title: "Stochastic replay", independenceGroup: "stochastic-model", portfolioPolicy: "requires-preregistration", description: "Randomized or Monte Carlo analysis whose simulated output must remain explicitly labelled." },
  { id: "drought", title: "Drought evidence", independenceGroup: "drought-state", portfolioPolicy: "requires-preregistration", description: "Strict drought, empirical hazard, calibration, and no-lookahead drought replay." },
  { id: "previous-neighbour", title: "Previous-draw neighbour evidence", independenceGroup: "previous-neighbour", portfolioPolicy: "requires-preregistration", description: "Versioned previous-draw +/-1 and +/-2 count, direction, and shape evidence." },
  { id: "consecutive-run", title: "Consecutive whole-number runs", independenceGroup: "consecutive-run", portfolioPolicy: "observe-only", description: "Monthly occurrence and first-occurrence evidence for runs of consecutive whole numbers." },
  { id: "trend-shape", title: "Trend and shape", independenceGroup: "trend-shape", portfolioPolicy: "requires-preregistration", description: "Up/down/flat ratios, candidate shape, and related diagnostics." },
  { id: "structural-pattern", title: "Structural patterns", independenceGroup: "structural-pattern", portfolioPolicy: "requires-preregistration", description: "Within-draw groups, adjacency, windows, and structural motifs." },
  { id: "terminal-digit", title: "Terminal digits", independenceGroup: "terminal-digit", portfolioPolicy: "requires-preregistration", description: "Terminal-digit occurrence, sequence, family, and stage-split evidence." },
  { id: "monthly-stage", title: "Monthly stage and buckets", independenceGroup: "monthly-stage", portfolioPolicy: "requires-preregistration", description: "Monthly bucket state, transition, carry-over, and stage-conditioned evidence." },
  { id: "spatial-dga", title: "DGA spatial evidence", independenceGroup: "spatial-dga", portfolioPolicy: "requires-preregistration", description: "Diamond-grid and ticket-grid spatial diagnostics." },
  { id: "evidence-aggregation", title: "Evidence aggregation", independenceGroup: "aggregator", portfolioPolicy: "not-evidence", description: "Panels that compare or combine evidence families but must never create an extra independent vote." },
  { id: "user-intent", title: "User intent", independenceGroup: "user-intent", portfolioPolicy: "not-evidence", description: "Manual selections, inclusions, exclusions, and declared prediction reasoning." },
  { id: "generation-control", title: "Generation controls", independenceGroup: "generation-control", portfolioPolicy: "not-evidence", description: "User-facing construction, filtering, ranking, and weighting controls." },
  { id: "candidate-output", title: "Candidate output", independenceGroup: "candidate-output", portfolioPolicy: "not-evidence", description: "Generated, pasted, compressed, simulated, or prize-checked candidate output." },
  { id: "research-record", title: "Research records", independenceGroup: "research-record", portfolioPolicy: "not-evidence", description: "Pre-draw hypotheses, diary notes, provenance, and post-draw scorecards." },
  { id: "utility", title: "Application utilities", independenceGroup: "utility", portfolioPolicy: "not-evidence", description: "Presets, parameter exploration, and workflow support tools." },
];

const panel = (
  panelId: string,
  currentHome: WindfallWorkflowHome,
  primaryFamily: EvidenceFamilyId,
  role: PanelEvidenceRole,
  allowedUse: PanelAllowedUse,
  options: {
    dependencies?: EvidenceFamilyId[];
    recommendedHome?: WindfallWorkflowHome;
    placementStatus?: "established" | "review";
  } = {},
): PanelOwnershipDefinition => ({
  panelId,
  currentHome,
  recommendedHome: options.recommendedHome ?? currentHome,
  placementStatus: options.placementStatus ?? "established",
  primaryFamily,
  dependencies: options.dependencies ?? [],
  role,
  allowedUse,
});

export const PANEL_OWNERSHIP_MANIFEST: PanelOwnershipDefinition[] = [
  panel("guided-setup", "history", "utility", "utility", "source-only"),
  panel("trace", "patterns", "generation-control", "utility", "source-only"),
  panel("global-zone-weighting", "validation", "generation-control", "control", "user-directed"),
  panel("windfall-predictor", "generation", "evidence-aggregation", "aggregator", "output-only", { dependencies: ["monthly-stage", "previous-neighbour", "terminal-digit"] }),
  panel("draw-history-manager", "history", "history-source", "source", "source-only"),
  panel("windowed-draw-filtering", "history", "history-source", "control", "user-directed"),
  panel("number-trends", "history", "frequency-recency", "diagnostic", "user-directed", { dependencies: ["drought"] }),
  panel("number-trends-movement-replay", "history", "frequency-recency", "consumer", "observe-only"),

  panel("odd-even-ratio-filters", "signals", "odd-even", "control", "generation-active", { dependencies: ["terminal-digit"] }),
  panel("odd-even-ratio-cadence", "signals", "odd-even", "diagnostic", "observe-only"),
  panel("scoring-system-diagnostics", "signals", "scoring", "diagnostic", "user-directed"),
  panel("survival-analyzer", "signals", "survival", "consumer", "user-directed", { dependencies: ["monthly-stage"] }),
  panel("temperature-transition", "signals", "temperature", "diagnostic", "observe-only", { dependencies: ["frequency-recency"] }),
  panel("monte-carlo-analyzer", "signals", "stochastic-replay", "diagnostic", "user-directed"),
  panel("drought-break-shortlist", "signals", "drought", "diagnostic", "user-directed"),
  panel("most-likely-not-drawn", "signals", "frequency-recency", "diagnostic", "observe-only", { dependencies: ["drought", "monthly-stage"] }),
  panel("mlnd-calibration-audit", "signals", "frequency-recency", "validator", "observe-only", { dependencies: ["drought"] }),

  panel("research-diary", "validation", "research-record", "record", "observe-only"),
  panel("backtest-validation", "validation", "utility", "validator", "observe-only"),
  panel("strict-drought-shortlist-replay", "validation", "drought", "validator", "observe-only"),
  panel("settings-sensitivity-replay", "validation", "utility", "validator", "observe-only"),
  panel("previous-neighbour-backtest", "validation", "previous-neighbour", "validator", "observe-only"),
  panel("consecutive-run-monthly-watch", "validation", "consecutive-run", "validator", "observe-only", { dependencies: ["drought"] }),
  panel("trend-ratio-history", "validation", "trend-shape", "validator", "user-directed"),
  panel("group-pattern-analyzer", "validation", "structural-pattern", "diagnostic", "observe-only"),
  panel("pattern-stats", "validation", "structural-pattern", "diagnostic", "observe-only"),
  panel("number-group-frequency-audit", "validation", "frequency-recency", "consumer", "observe-only"),
  panel("number-frequency", "validation", "frequency-recency", "diagnostic", "observe-only"),
  panel("draw-bucket-patterns", "validation", "terminal-digit", "diagnostic", "user-directed"),
  panel("ending-digit-sequences", "validation", "terminal-digit", "validator", "observe-only"),
  panel("terminal-family-leadership", "validation", "terminal-digit", "consumer", "observe-only", { dependencies: ["drought", "monthly-stage"] }),
  panel("adjacent-combos", "validation", "structural-pattern", "diagnostic", "observe-only"),
  panel("window-stats", "validation", "structural-pattern", "diagnostic", "observe-only"),
  panel("target-set-quick-stats", "validation", "structural-pattern", "diagnostic", "observe-only"),
  panel("survival-churn-diagnostic-models", "validation", "survival", "validator", "observe-only"),
  panel("state-presets", "validation", "utility", "utility", "source-only", { recommendedHome: "generation", placementStatus: "review" }),
  panel("trend-ratio-filter", "validation", "trend-shape", "control", "generation-active", { recommendedHome: "generation", placementStatus: "review" }),
  panel("parameter-search", "validation", "utility", "validator", "observe-only"),
  panel("bates-weighting", "validation", "frequency-recency", "diagnostic", "observe-only", { recommendedHome: "signals", placementStatus: "review" }),
  panel("weighted-target-list", "validation", "frequency-recency", "consumer", "observe-only", { recommendedHome: "signals", placementStatus: "review" }),
  panel("modulation-diagnostics", "validation", "structural-pattern", "diagnostic", "observe-only"),
  panel("monthly-overlap", "validation", "monthly-stage", "diagnostic", "observe-only"),
  panel("monthly-first-last-hits", "validation", "monthly-stage", "diagnostic", "observe-only"),
  panel("monthly-draws-summary", "validation", "monthly-stage", "source", "user-directed"),
  panel("monthly-bucket-transition-lab", "validation", "monthly-stage", "validator", "observe-only"),
  panel("decade-monthly-bucket-watch", "validation", "monthly-stage", "consumer", "observe-only"),
  panel("month-end-carry-over-buckets", "validation", "monthly-stage", "diagnostic", "user-directed"),
  panel("monthly-digit-occurrences", "validation", "terminal-digit", "diagnostic", "observe-only"),
  panel("hot-cold-ranking", "validation", "frequency-recency", "diagnostic", "user-directed", { recommendedHome: "signals", placementStatus: "review" }),
  panel("next-draw-evidence-ensemble", "validation", "evidence-aggregation", "aggregator", "observe-only", { dependencies: ["frequency-recency", "drought", "monthly-stage", "previous-neighbour", "terminal-digit"] }),
  panel("signal-confluence-ledger", "validation", "evidence-aggregation", "aggregator", "observe-only", { dependencies: ["frequency-recency", "drought", "monthly-stage", "previous-neighbour", "terminal-digit", "survival"] }),
  panel("prediction-journal", "validation", "research-record", "record", "observe-only"),
  panel("evidence-portfolio", "validation", "evidence-aggregation", "aggregator", "output-only", { dependencies: ["frequency-recency", "drought", "previous-neighbour", "monthly-stage"] }),

  panel("user-selected-numbers", "generation", "user-intent", "control", "generation-active"),
  panel("selection-insights", "generation", "evidence-aggregation", "consumer", "observe-only", { dependencies: ["previous-neighbour", "frequency-recency", "structural-pattern"] }),
  panel("candidate-generation-influences", "generation", "generation-control", "control", "generation-active"),
  panel("historical-oga-distribution", "generation", "frequency-recency", "consumer", "observe-only"),
  panel("paste-weighted-candidate-generator", "generation", "candidate-output", "output", "output-only"),
  panel("portfolio-compression", "generation", "candidate-output", "output", "output-only"),
  panel("generated-candidates", "generation", "candidate-output", "output", "output-only"),
  panel("pick-six", "generation", "candidate-output", "output", "output-only"),

  panel("next-hot-blocks", "dga", "spatial-dga", "diagnostic", "user-directed"),
  panel("tattslotto-ticket-grid-replay", "dga", "spatial-dga", "diagnostic", "observe-only"),
  panel("diamond-grid-analysis", "dga", "spatial-dga", "diagnostic", "user-directed"),

  panel("undrawn-patterns", "patterns", "structural-pattern", "diagnostic", "observe-only", { dependencies: ["monthly-stage", "frequency-recency"] }),
];

const FAMILY_BY_ID = new Map(EVIDENCE_FAMILY_REGISTRY.map((family) => [family.id, family]));
const PANEL_BY_ID = new Map(PANEL_OWNERSHIP_MANIFEST.map((entry) => [entry.panelId, entry]));

const INDEPENDENCE_GROUP_LABELS: Record<string, string> = {
  "recorded-history": "Recorded history",
  "frequency-state": "Frequency state",
  composition: "Composition",
  "number-score": "Number score",
  "survival-state": "Survival state",
  "stochastic-model": "Stochastic model",
  "drought-state": "Drought state",
  "previous-neighbour": "Previous-neighbour",
  "consecutive-run": "Consecutive runs",
  "trend-shape": "Trend and shape",
  "structural-pattern": "Structural patterns",
  "terminal-digit": "Terminal digits",
  "monthly-stage": "Monthly stage",
  "spatial-dga": "DGA spatial",
  aggregator: "Evidence aggregation",
  "user-intent": "User intent",
  "generation-control": "Generation controls",
  "candidate-output": "Candidate output",
  "research-record": "Research records",
  utility: "Application utilities",
};

export const getEvidenceFamily = (familyId: EvidenceFamilyId): EvidenceFamilyDefinition | undefined => (
  FAMILY_BY_ID.get(familyId)
);

export const getPanelOwnership = (panelId: string): PanelOwnershipDefinition | undefined => (
  PANEL_BY_ID.get(panelId)
);

export const getEvidenceIndependenceGroupLabel = (independenceGroup: string): string => (
  INDEPENDENCE_GROUP_LABELS[independenceGroup]
  ?? independenceGroup.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ")
);

export const panelCanProvideIndependentPortfolioEvidence = (panelId: string): boolean => {
  const ownership = getPanelOwnership(panelId);
  if (!ownership) return false;
  if (ownership.role !== "diagnostic" && ownership.role !== "validator") return false;

  const family = getEvidenceFamily(ownership.primaryFamily);
  return family?.portfolioPolicy === "requires-preregistration"
    || family?.portfolioPolicy === "eligible-after-validation";
};
