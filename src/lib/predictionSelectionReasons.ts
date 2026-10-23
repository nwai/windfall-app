export const PREDICTION_JOURNAL_SELECTION_REASON_LABELS = {
  selectedRandomly: "Selected randomly",
  dgaPattern: "Observed pattern in DGA grid",
  dgaConstellationDiagnostic: "Used DGA constellation diagnostic",
  monthlyBucketStatePattern: "Observed pattern in Monthly bucket state",
  idmBuckets: "Adhered to IDM buckets",
  stageMatchAcceptancePlaybook: "Used Stage-Match Acceptance Playbook",
  latestNeighbourMainSix: "Used ± to choose main 6",
  selectionInsights: "Used Selection insights to choose numbers",
  nextDrawEvidenceEnsemble: "Used Next-Draw Evidence Ensemble",
  evidencePortfolio: "Used Evidence Portfolio",
  windfallPredictor: "Created with Windfall Predictor",
  officialQuickpickPasteWeighted: "Created official TattsLotto quickpick to generate candidates, then pasted them into Paste-weighted generator",
  other: "Other",
} as const;

export type PredictionJournalSelectionReasonKey = keyof typeof PREDICTION_JOURNAL_SELECTION_REASON_LABELS;
export interface PredictionJournalSelectionReason {
  version: 1;
  key: PredictionJournalSelectionReasonKey;
  label: string;
  detail?: string;
}

export function normalizePredictionSelectionReason(input: unknown): PredictionJournalSelectionReason | undefined {
  if (!input || typeof input !== "object") return undefined;
  const { key, detail } = input as Record<string, unknown>;
  if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(PREDICTION_JOURNAL_SELECTION_REASON_LABELS, key)) return undefined;
  const trimmed = typeof detail === "string" ? detail.trim() : "";
  return { version: 1, key: key as PredictionJournalSelectionReasonKey,
    label: PREDICTION_JOURNAL_SELECTION_REASON_LABELS[key as PredictionJournalSelectionReasonKey],
    ...(trimmed ? { detail: trimmed } : {}) };
}

export function normalizePredictionSelectionReasons(input: unknown): PredictionJournalSelectionReason[] {
  if (!Array.isArray(input)) return [];
  const unique = new Map<PredictionJournalSelectionReasonKey, PredictionJournalSelectionReason>();
  for (const value of input) {
    const reason = normalizePredictionSelectionReason(value);
    if (reason) unique.set(reason.key, reason);
  }
  return [...unique.values()];
}

export function getPredictionSelectionReasons(inputs: {
  selectionReasons?: PredictionJournalSelectionReason[];
  selectionReason?: PredictionJournalSelectionReason;
}): PredictionJournalSelectionReason[] {
  if (Array.isArray(inputs.selectionReasons)) return normalizePredictionSelectionReasons(inputs.selectionReasons);
  const legacy = normalizePredictionSelectionReason(inputs.selectionReason);
  if (!legacy) return [];
  // Older primary-reason details represented an additional Other reason.
  if (legacy.key !== "other" && legacy.detail) return [
    { version: 1, key: legacy.key, label: legacy.label },
    { version: 1, key: "other", label: "Other", detail: legacy.detail },
  ];
  return [legacy];
}

export const formatPredictionSelectionReasons = (reasons: readonly PredictionJournalSelectionReason[]): string => (
  reasons.map(reason => reason.detail ? `${reason.label} - ${reason.detail}` : reason.label).join(" + ")
);
