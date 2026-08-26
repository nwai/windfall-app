import React, { useEffect, useMemo, useRef, useState } from "react";

import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import type { Draw } from "../types";
import type { AppPresetSnapshot } from "../lib/presets";
import { buildMonthEndCarryOverWeighting } from "../lib/monthEndCarryOver";
import {
  PREDICTION_JOURNAL_SELECTION_REASON_LABELS,
  buildPredictionJournalDraftFromSetup,
  buildPredictionJournalEntry,
  canEditPredictionJournalEntry,
  loadPredictionJournalEntries,
  normalizePredictionJournalInputs,
  parsePredictionJournalDate,
  savePredictionJournalEntries,
  scorePredictionJournalEntry,
  type PredictionBucketKey,
  type PredictionJournalEntry,
  type PredictionJournalInputs,
  type PredictionJournalProvenance,
  type PredictionJournalReviewStatus,
  type PredictionJournalSelectionReasonKey,
  type PredictionJournalStatus,
  type PredictionScoreResult,
  type PredictionTargetKind,
  type ScoredPredictionJournalEntry,
} from "../lib/predictionJournal";
import { computeResearchDiaryNextDrawContext } from "../lib/researchDiary";
import { computeTrendMap } from "../lib/trend";
import { buildTrendValueSeries } from "../lib/trendValueSeries";
import { buildPreviousNeighbourConstraintRows } from "../lib/previousNeighbourTargets";
import {
  analyzeJournalTerminalDigitHistory,
  type JournalTerminalDigitHistory,
  type JournalTerminalDigitHistoryBand,
} from "../lib/scoringSystemDiagnostics";
import {
  analyzeHistoricalPrizeCollision,
  type HistoricalPrizeCollisionHit,
  type HistoricalPrizeCollisionResult,
} from "../lib/historicalPrizeCollision";
import {
  computeWeekdayWindfallPrizeDivision,
  computeWeekdayWindfallPrizeHits,
  rankWeekdayWindfallPrizeDivision,
  type WeekdayWindfallPrizeDivision,
} from "../lib/prizeDivisions";
import {
  buildPredictionJournalFindingsReport,
  type PredictionJournalFinding,
  type PredictionJournalFindingSeverity,
  type PredictionJournalFindingsReport,
} from "../lib/predictionJournalFindings";

export interface PredictionJournalPanelProps {
  history: Draw[];
  initialEntries?: PredictionJournalEntry[];
  now?: () => string;
  getSetupSnapshot?: () => AppPresetSnapshot | undefined;
  newPredictionDraft?: PredictionJournalDraftRequest | null;
  viewEntriesRequestId?: number;
}

export interface PredictionJournalDraftRequest {
  id: number;
  setupSnapshot?: AppPresetSnapshot;
}

type PredictionJournalViewMode = "entries" | "draft";

type BucketTextState = Record<PredictionBucketKey, string>;

const BUCKET_FIELDS: Array<{ key: PredictionBucketKey; label: string }> = [
  { key: "undrawn", label: "Undrawn" },
  { key: "times1", label: "1x" },
  { key: "times2", label: "2x" },
  { key: "times3", label: "3x" },
  { key: "times4", label: "4x" },
  { key: "times5", label: "5x" },
  { key: "times6", label: "6x" },
  { key: "times7", label: "7x" },
  { key: "times8", label: "8x+" },
];

const emptyBuckets = (): BucketTextState => ({
  undrawn: "",
  times1: "",
  times2: "",
  times3: "",
  times4: "",
  times5: "",
  times6: "",
  times7: "",
  times8: "",
});

interface PredictionJournalAutoFillSnapshot {
  oddEvenRatio: string;
  terminalDigitsText: string;
  bucketText: BucketTextState;
  singleText: string;
  doubleText: string;
  sumMinText: string;
  sumMaxText: string;
  trendRatio: string;
  previousRepeatCount: string;
  previousNeighbourHitCount: string;
  droughtBreakCount: string;
  carryOverCount: string;
}

interface PredictionJournalAutoFillContext {
  bucketKeys: Map<number, PredictionBucketKey>;
  trendMap: Map<number, "UP" | "DOWN" | "FLAT">;
  latestDrawNumberSet: Set<number>;
  previousNeighbourTargetSet: Set<number>;
  strictDroughtSet: Set<number>;
  carryOverSet: Set<number>;
}

const emptyAutoFillSnapshot = (): PredictionJournalAutoFillSnapshot => ({
  oddEvenRatio: "",
  terminalDigitsText: "",
  bucketText: emptyBuckets(),
  singleText: "",
  doubleText: "",
  sumMinText: "",
  sumMaxText: "",
  trendRatio: "",
  previousRepeatCount: "",
  previousNeighbourHitCount: "",
  droughtBreakCount: "",
  carryOverCount: "",
});

const targetLabels: Record<PredictionTargetKind, string> = {
  nextDraw: "Next draw",
  next2Draws: "Next 2 draws",
  next3Draws: "Next 3 draws",
  restOfMonth: "Rest of current month",
};

const statusLabels = {
  scored: "Scored",
  pending: "Pending",
  locked: "Locked",
  void: "Void",
} as const;

const reviewStatusLabels: Record<PredictionJournalReviewStatus, string> = {
  notReviewed: "Not reviewed",
  reviewedByUser: "Reviewed by user",
};

type PredictionJournalPrimarySelectionReasonKey = Exclude<PredictionJournalSelectionReasonKey, "other">;
type PredictionJournalSelectionReasonFormValue = PredictionJournalPrimarySelectionReasonKey | "";

const SELECTION_REASON_NOTE_PREFIX = "Selection reason:";

const selectionReasonOptions = Object.entries(PREDICTION_JOURNAL_SELECTION_REASON_LABELS)
  .filter(([key]) => key !== "other")
  .map(([key, label]) => ({ key: key as PredictionJournalPrimarySelectionReasonKey, label }));

const selectionReasonSummary = (reason: PredictionJournalInputs["selectionReason"]): string => {
  if (!reason) return "";
  if (!reason.detail) return reason.label;
  return reason.key === "other" ? `${reason.label} - ${reason.detail}` : `${reason.label} + Other - ${reason.detail}`;
};

const selectionReasonNoteLine = (
  key: PredictionJournalSelectionReasonFormValue,
  includeOther: boolean,
  detail: string,
): string | null => {
  const cleanedDetail = includeOther ? detail.trim() : "";
  if (!key && !includeOther) return null;
  const primaryLabel = key ? PREDICTION_JOURNAL_SELECTION_REASON_LABELS[key] : "";
  const detailText = cleanedDetail && /[.!?]$/.test(cleanedDetail) ? cleanedDetail : `${cleanedDetail}.`;

  if (key && includeOther) {
    return cleanedDetail
      ? `${SELECTION_REASON_NOTE_PREFIX} ${primaryLabel} + Other - ${detailText}`
      : `${SELECTION_REASON_NOTE_PREFIX} ${primaryLabel} + Other.`;
  }
  if (key) return `${SELECTION_REASON_NOTE_PREFIX} ${primaryLabel}.`;
  return cleanedDetail
    ? `${SELECTION_REASON_NOTE_PREFIX} ${PREDICTION_JOURNAL_SELECTION_REASON_LABELS.other} - ${detailText}`
    : `${SELECTION_REASON_NOTE_PREFIX} ${PREDICTION_JOURNAL_SELECTION_REASON_LABELS.other}.`;
};

const notesWithoutSelectionReason = (value: string): string => (
  value
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(SELECTION_REASON_NOTE_PREFIX))
    .join("\n")
    .trimEnd()
);

const mergeSelectionReasonIntoNotes = (
  currentNotes: string,
  key: PredictionJournalSelectionReasonFormValue,
  includeOther: boolean,
  detail: string,
): string => {
  const baseNotes = notesWithoutSelectionReason(currentNotes);
  const reasonLine = selectionReasonNoteLine(key, includeOther, detail);
  if (!reasonLine) return baseNotes;
  return baseNotes ? `${baseNotes}\n${reasonLine}` : reasonLine;
};

const normalizeReviewStatus = (value: PredictionJournalEntry["reviewStatus"]): PredictionJournalReviewStatus => (
  value === "reviewedByUser" ? "reviewedByUser" : "notReviewed"
);

const statusPillStyle = (status: PredictionJournalStatus): React.CSSProperties => ({
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 800,
  background: status === "scored" ? "#e8f5e9" : status === "pending" ? "#eef6ff" : "#fff4e5",
  color: status === "scored" ? "#1b5e20" : status === "pending" ? "#155a8a" : "#8a4b00",
});

const reviewPillStyle = (status: PredictionJournalReviewStatus): React.CSSProperties => ({
  border: `1px solid ${status === "reviewedByUser" ? "#93c5fd" : "#dbe3ec"}`,
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 800,
  background: status === "reviewedByUser" ? "#eff6ff" : "#f8fafc",
  color: status === "reviewedByUser" ? "#1d4ed8" : "#526477",
});

const archivedPillStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 800,
  background: "#f3f4f6",
  color: "#4b5563",
};

type JournalLegendTone = "standard" | "soft" | "emphasis";

const journalLegendPalette: Record<JournalLegendTone, { background: string; border: string; color: string; borderWidth: number }> = {
  standard: { background: "#fff", border: "#dbe3ec", color: "#334155", borderWidth: 1 },
  soft: { background: "#f8fbff", border: "#d6e4f0", color: "#0f172a", borderWidth: 1 },
  emphasis: { background: "#eff6ff", border: "#93c5fd", color: "#1d4ed8", borderWidth: 2 },
};

const JournalLegendBox: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
  help?: React.ReactNode;
  tone?: JournalLegendTone;
  style?: React.CSSProperties;
}> = ({ title, children, className, help, tone = "standard", style }) => {
  const palette = journalLegendPalette[tone];
  return (
    <fieldset
      aria-label={title}
      className={className}
      style={{
        margin: 0,
        minWidth: 0,
        border: `${palette.borderWidth}px solid ${palette.border}`,
        borderRadius: 8,
        background: palette.background,
        padding: "12px 10px 10px",
        color: "#334155",
        ...style,
      }}
    >
      <legend style={{ padding: "0 5px", color: palette.color, fontSize: 12, fontWeight: 900, lineHeight: "16px" }}>
        <span className="windfall-prediction-journal-legend-content">
          <span>{title}</span>
          {help ? <InfoHelp label={`${title} help`}>{help}</InfoHelp> : null}
        </span>
      </legend>
      {children}
    </fieldset>
  );
};

const formatJournalNumbers = (numbers: number[] | undefined): string => (
  numbers?.length ? numbers.join(", ") : "none"
);

const pickedNumberPillStyle = (role: "main" | "supp" | "extra"): React.CSSProperties => {
  const palette = {
    main: { border: "#fecaca", background: "#fff1f2", color: "#b91c1c" },
    supp: { border: "#bbf7d0", background: "#f0fdf4", color: "#166534" },
    extra: { border: "#dbe3ec", background: "#f8fafc", color: "#475569" },
  }[role];
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    border: `1px solid ${palette.border}`,
    borderRadius: 999,
    background: palette.background,
    color: palette.color,
    fontSize: 11,
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  };
};

const renderPickedNumberGroup = (
  label: string,
  numbers: number[],
  role: "main" | "supp" | "extra",
): React.ReactNode => {
  if (numbers.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span style={{ color: role === "main" ? "#b91c1c" : role === "supp" ? "#166534" : "#64748b", fontSize: 11, fontWeight: 900 }}>
        {label}
      </span>
      {numbers.map((number) => (
        <span key={`${role}-${number}`} data-picked-role={role} style={pickedNumberPillStyle(role)}>
          {number}
        </span>
      ))}
    </span>
  );
};

const replayNumberPillStyle = (role: "main" | "supp" | "other"): React.CSSProperties => {
  const palette = {
    main: { border: "#fecaca", background: "#fff1f2", color: "#b91c1c" },
    supp: { border: "#bbf7d0", background: "#f0fdf4", color: "#166534" },
    other: { border: "#dbe3ec", background: "#f8fafc", color: "#475569" },
  }[role];
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    border: `1px solid ${palette.border}`,
    borderRadius: 999,
    background: palette.background,
    color: palette.color,
    fontSize: 11,
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  };
};

const latestDrawRoleForNumber = (
  number: number,
  latestMainSet: Set<number>,
  latestSuppSet: Set<number>,
): "main" | "supp" | "other" => {
  if (latestMainSet.has(number)) return "main";
  if (latestSuppSet.has(number)) return "supp";
  return "other";
};

const renderReplayNumberPills = (
  numbers: number[],
  latestMainSet: Set<number>,
  latestSuppSet: Set<number>,
  testIdPrefix: string,
): React.ReactNode => {
  if (numbers.length === 0) return "none";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap", verticalAlign: "middle" }}>
      {numbers.map((number) => {
        const role = latestDrawRoleForNumber(number, latestMainSet, latestSuppSet);
        return (
          <span
            key={`${testIdPrefix}-${number}`}
            data-testid={`${testIdPrefix}-${number}`}
            data-latest-draw-role={role}
            style={replayNumberPillStyle(role)}
          >
            {number}
          </span>
        );
      })}
    </span>
  );
};

const renderCollapsedPickedNumbers = (numbers: number[] | undefined): React.ReactNode => {
  if (!numbers?.length) return null;
  const mainNumbers = numbers.slice(0, 6);
  const suppNumbers = numbers.slice(6, 8);
  const extraNumbers = numbers.slice(8);
  return (
    <span
      data-testid="prediction-journal-collapsed-picked-numbers"
      title="Saved number roles: first six are treated as mains, next two as supps. Extra values are stored as broader shortlist numbers."
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        marginTop: 5,
        color: "#475569",
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 850 }}>User picked numbers:</span>
      {renderPickedNumberGroup("M", mainNumbers, "main")}
      {renderPickedNumberGroup("S", suppNumbers, "supp")}
      {renderPickedNumberGroup("+", extraNumbers, "extra")}
    </span>
  );
};

const provenanceChipStyle = (tone: "neutral" | "good" | "warn" = "neutral"): React.CSSProperties => {
  const palette = {
    neutral: { border: "#dbe3ec", bg: "#fff", fg: "#475569" },
    good: { border: "#bbf7d0", bg: "#f0fdf4", fg: "#166534" },
    warn: { border: "#fed7aa", bg: "#fff7ed", fg: "#9a3412" },
  }[tone];
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: palette.bg,
    color: palette.fg,
    fontSize: 12,
    fontWeight: 800,
  };
};

const formatProvenanceRate = (value: number | null | undefined): string => (
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-"
);

const renderStructuredProvenance = (provenance: PredictionJournalProvenance) => {
  const drought = provenance.droughtBreakShortlist;
  const strictQuota = provenance.strictDroughtQuota;
  const strictQuotaModeLabel = strictQuota?.mode === "advised"
    ? "SDSR-advised"
    : strictQuota?.mode === "manual"
      ? "Manual"
      : "Off";
  return (
    <section
      data-testid="prediction-structured-provenance"
      aria-label="Structured prediction provenance"
      style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#fff" }}
    >
      <div style={{ fontSize: 12, fontWeight: 850, color: "#334155", marginBottom: 8 }}>Structured provenance</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <span
          style={{
            ...provenanceChipStyle(),
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            borderRadius: 8,
          }}
        >
          <span>User picked numbers</span>
          {renderPickedNumberGroup("M", provenance.selectedNumbers.slice(0, 6), "main")}
          {renderPickedNumberGroup("S", provenance.selectedNumbers.slice(6, 8), "supp")}
          {renderPickedNumberGroup("+", provenance.selectedNumbers.slice(8), "extra")}
        </span>
        <span style={provenanceChipStyle(provenance.inclusionSources.effectiveGenerationForced.length ? "good" : "neutral")}>
          Forced {formatJournalNumbers(provenance.inclusionSources.effectiveGenerationForced)}
        </span>
        <span style={provenanceChipStyle(provenance.exclusionSources.effectiveGeneration.length ? "warn" : "neutral")}>
          Excluded {formatJournalNumbers(provenance.exclusionSources.effectiveGeneration)}
        </span>
      </div>
      <div style={{ borderTop: "1px solid #edf2f7", paddingTop: 8 }}>
        {provenance.dgaAutoSupps ? (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 850, color: "#334155", marginBottom: 5 }}>
              DGA Auto supps capture
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span style={provenanceChipStyle("good")}>
                Auto supps {formatJournalNumbers(provenance.dgaAutoSupps.suppNumbers)}
              </span>
              <span style={provenanceChipStyle()}>
                Main role {formatJournalNumbers(provenance.dgaAutoSupps.mainNumbers)}
              </span>
              <span style={provenanceChipStyle()}>
                Pair WFMQYH {provenance.dgaAutoSupps.activePairSuppCount ?? "?"}/{provenance.dgaAutoSupps.activePairSuppDrawCount ?? "?"}
              </span>
              <span style={provenanceChipStyle()}>
                Pair all-history {provenance.dgaAutoSupps.fullPairSuppCount ?? "?"}/{provenance.dgaAutoSupps.fullPairSuppDrawCount ?? "?"}
              </span>
              <span style={provenanceChipStyle()}>
                Pair coverage {provenance.dgaAutoSupps.activePairCoverage ?? "?"}/{provenance.dgaAutoSupps.totalPairCoverage ?? "?"} WFMQYH
              </span>
            </div>
            <div style={{ marginTop: 7, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Captured when the prediction was saved. Scored later against the first target draw's actual supplementary numbers; diagnostic only, not a probability.
            </div>
          </div>
        ) : null}
        <div style={{ fontSize: 12, fontWeight: 850, color: "#334155", marginBottom: 5 }}>
          Drought-break shortlist check
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span style={provenanceChipStyle(drought.anySelectedFromShortlist ? "good" : "neutral")}>
            Any shortlist {drought.anySelectedFromShortlist ? "yes" : "no"}
          </span>
          <span style={provenanceChipStyle(drought.allSelectedFromShortlist ? "good" : "neutral")}>
            All from shortlist {drought.allSelectedFromShortlist ? "yes" : "no"}
          </span>
          <span style={provenanceChipStyle(drought.selectedStrictDroughtNumbers.length ? "good" : "neutral")}>
            Strict drought {drought.strictThreshold}+ {formatJournalNumbers(drought.selectedStrictDroughtNumbers)}
          </span>
          <span style={provenanceChipStyle(drought.selectedEmpiricalHazardNumbers.length ? "good" : "neutral")}>
            Empirical hazard {formatJournalNumbers(drought.selectedEmpiricalHazardNumbers)}
          </span>
          <span style={provenanceChipStyle(drought.selectedOutsideShortlistNumbers.length ? "warn" : "neutral")}>
            Outside shortlist {formatJournalNumbers(drought.selectedOutsideShortlistNumbers)}
          </span>
        </div>
        {drought.classifications.length ? (
          <div style={{ marginTop: 7, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            {drought.classifications.map((item) => `${item.number}: ${item.label}`).join(" · ")}
          </div>
        ) : (
          <div style={{ marginTop: 7, fontSize: 12, color: "#64748b" }}>
            No prediction numbers were saved for this drought-break check.
          </div>
        )}
      </div>
      {strictQuota ? (
        <div style={{ borderTop: "1px solid #edf2f7", paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 850, color: "#334155", marginBottom: 5 }}>
            Strict drought quota watch
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={provenanceChipStyle(strictQuota.active ? "good" : "neutral")}>
              Mode {strictQuotaModeLabel}
            </span>
            <span style={provenanceChipStyle(strictQuota.effectiveMin > 0 ? "good" : "neutral")}>
              Effective min {strictQuota.effectiveMin}
            </span>
            <span style={provenanceChipStyle(strictQuota.eligibleNumbers.length ? "good" : "neutral")}>
              Eligible {formatJournalNumbers(strictQuota.eligibleNumbers)}
            </span>
            <span style={provenanceChipStyle(strictQuota.advice.shouldApplyQuota ? "good" : "neutral")}>
              Advice {strictQuota.advice.shouldApplyQuota ? "apply" : "observe"}
            </span>
            <span style={provenanceChipStyle()}>
              Source {strictQuota.advice.sourceLabel}
            </span>
            <span style={provenanceChipStyle()}>
              Trials {strictQuota.advice.trials}
            </span>
          </div>
          <div style={{ marginTop: 7, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            1-3 hits {formatProvenanceRate(strictQuota.advice.oneToThreeHitRate)} vs random {formatProvenanceRate(strictQuota.advice.expectedRandomOneToThreeHitRate)}
            {" "}· zero-hit {formatProvenanceRate(strictQuota.advice.zeroHitRate)} · confidence {strictQuota.advice.confidence}.
          </div>
          {strictQuota.mode === "advised" ? (
            <div style={{ marginTop: 5, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              {strictQuota.advice.reason}
            </div>
          ) : null}
        </div>
      ) : null}
      {provenance.selectionInsights ? (
        <div style={{ borderTop: "1px solid #edf2f7", paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 850, color: "#334155", marginBottom: 5 }}>
            Selection Insights capture
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={provenanceChipStyle(provenance.selectionInsights.enabled ? "good" : "neutral")}>
              Panel {provenance.selectionInsights.enabled ? "on" : "off"}
            </span>
            <span style={provenanceChipStyle()}>
              Anchors {formatJournalNumbers(provenance.selectionInsights.selectedNumbers)}
            </span>
            <span style={provenanceChipStyle(provenance.selectionInsights.predictedCompanionNumbers.length ? "good" : "neutral")}>
              Predicted companions {formatJournalNumbers(provenance.selectionInsights.predictedCompanionNumbers)}
            </span>
          </div>
          <div style={{ marginTop: 7, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            {provenance.selectionInsights.windowLabel}: {provenance.selectionInsights.windowDrawCount} draws · All history: {provenance.selectionInsights.allDrawCount} draws.
          </div>
        </div>
      ) : null}
    </section>
  );
};

const scoreResultPillStyle = (result: PredictionScoreResult): React.CSSProperties => {
  const palette: Record<PredictionScoreResult, { background: string; color: string; border: string }> = {
    hit: { background: "#e8f5e9", color: "#1b5e20", border: "#bbdfc0" },
    partial: { background: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
    miss: { background: "#fff1f2", color: "#991b1b", border: "#fecaca" },
    recorded: { background: "#eef6ff", color: "#155a8a", border: "#cfe3f7" },
  };
  const colors = palette[result];
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: colors.background,
    color: colors.color,
    fontSize: 12,
    fontWeight: 800,
    textTransform: "capitalize",
  };
};

const scoreResultLabel = (result: PredictionScoreResult): string => (
  result.charAt(0).toUpperCase() + result.slice(1)
);

const replayPrizePillStyle = (division: LatestDrawReplayPrize["division"]): React.CSSProperties => {
  const major = division === "Div1" || division === "Div2";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    border: `1px solid ${major ? "#f9a8d4" : "#86efac"}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: major ? "#ffe4ec" : "#dcfce7",
    color: major ? "#9f1239" : "#166534",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
};

const replayPrizeButtonStyle = (division: LatestDrawReplayPrize["division"]): React.CSSProperties => ({
  ...replayPrizePillStyle(division),
  appearance: "none",
  cursor: "pointer",
  font: "inherit",
});

const formatFindingPercent = (value: number): string => `${Math.round(value * 100)}%`;

const findingSeverityLabel: Record<PredictionJournalFindingSeverity, string> = {
  info: "Info",
  caution: "Caution",
  useful: "Worth watching",
};

const findingSeverityStyle = (severity: PredictionJournalFindingSeverity): React.CSSProperties => {
  const palette: Record<PredictionJournalFindingSeverity, { background: string; border: string; color: string }> = {
    info: { background: "#eef6ff", border: "#cfe3f7", color: "#155a8a" },
    caution: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    useful: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
  };
  const colors = palette[severity];
  return {
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: colors.background,
    color: colors.color,
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
};

const findingsMetricCardStyle: React.CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 8,
  background: "#fff",
  padding: "9px 10px",
  minWidth: 0,
};

const renderFindingCard = (finding: PredictionJournalFinding): React.ReactNode => (
  <article
    key={finding.id}
    style={{
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      background: "#fff",
      padding: 10,
      display: "grid",
      gap: 6,
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
      <strong style={{ color: "#26313d", fontSize: 13 }}>{finding.title}</strong>
      <span style={findingSeverityStyle(finding.severity)}>{findingSeverityLabel[finding.severity]}</span>
    </div>
    <div style={{ color: "#475569", fontSize: 12, lineHeight: 1.45 }}>{finding.detail}</div>
    <div style={{ color: "#334155", fontSize: 12, lineHeight: 1.45, fontWeight: 750 }}>{finding.evidence}</div>
    <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>{finding.recommendation}</div>
  </article>
);

const renderPredictionJournalFindingsReport = (report: PredictionJournalFindingsReport): React.ReactNode => {
  const enoughGroups = report.groups.slice(0, 4);
  return (
    <JournalLegendBox
      title="Prediction Journal Findings Report"
      tone="soft"
      style={{ marginTop: 16 }}
      help={(
        <span>
          PJFR is observe-only. It reads scored journal entries and flags repeated habits or useful-looking signals without changing generation.
        </span>
      )}
    >
      <section data-testid="prediction-journal-findings-report" aria-label="Prediction Journal Findings Report" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#26313d", fontSize: 14, fontWeight: 900 }}>Collective scorecard read</div>
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
              {report.scopeLabel}. Version {report.version}. No generation influence.
            </div>
          </div>
          <span style={findingSeverityStyle("info")}>Observe-only V{report.version}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 8,
          }}
        >
          <div style={findingsMetricCardStyle}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 850 }}>Eligible entries</div>
            <div style={{ color: "#26313d", fontSize: 20, fontWeight: 900 }}>{report.eligibleEntries}</div>
            <div style={{ color: "#64748b", fontSize: 11 }}>of {report.totalEntries} saved</div>
          </div>
          <div style={findingsMetricCardStyle}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 850 }}>Scored checks</div>
            <div style={{ color: "#26313d", fontSize: 20, fontWeight: 900 }}>{report.scoreCounts.checks}</div>
            <div style={{ color: "#64748b", fontSize: 11 }}>
              {report.scoreCounts.hits} hit · {report.scoreCounts.partials} partial · {report.scoreCounts.misses} miss
            </div>
          </div>
          <div style={findingsMetricCardStyle}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 850 }}>Weighted support</div>
            <div style={{ color: "#26313d", fontSize: 20, fontWeight: 900 }}>{formatFindingPercent(report.weightedSupportRate)}</div>
            <div style={{ color: "#64748b", fontSize: 11 }}>hit=1, partial=0.5</div>
          </div>
          <div style={findingsMetricCardStyle}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 850 }}>Excluded from read</div>
            <div style={{ color: "#26313d", fontSize: 20, fontWeight: 900 }}>
              {report.excludedUnreviewedEntries + report.excludedUnscoredEntries + report.excludedArchivedEntries}
            </div>
            <div style={{ color: "#64748b", fontSize: 11 }}>
              {report.excludedUnreviewedEntries} unreviewed · {report.excludedUnscoredEntries} unscored · {report.excludedArchivedEntries} archived
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {report.findings.map(renderFindingCard)}
        </div>

        {enoughGroups.length ? (
          <details style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
            <summary style={{ cursor: "pointer", color: "#334155", fontSize: 12, fontWeight: 900 }}>
              Repeated signals currently being watched
            </summary>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {enoughGroups.map((group) => (
                <div
                  key={group.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                    border: "1px solid #edf2f7",
                    borderRadius: 8,
                    padding: "7px 8px",
                    background: "#fff",
                    fontSize: 12,
                  }}
                >
                  <span style={{ minWidth: 0, color: "#475569", overflowWrap: "anywhere" }}>
                    <strong style={{ color: "#26313d" }}>{group.category}</strong> · {group.label}
                  </span>
                  <span style={{ color: "#64748b", fontWeight: 850, whiteSpace: "nowrap" }}>
                    {group.entryCount} entries · {formatFindingPercent(group.weightedSupportRate)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        <details>
          <summary style={{ cursor: "pointer", color: "#334155", fontSize: 12, fontWeight: 900 }}>
            How to read PJFR
          </summary>
          <ul style={{ margin: "8px 0 0 18px", padding: 0, color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
            {report.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
          </ul>
        </details>
      </section>
    </JournalLegendBox>
  );
};

const renderLatestDrawReplay = (
  rows: LatestDrawReplayRow[],
  latestDraw: Draw | null,
  omittedNoNumberCount: number,
  onOpenEntry: (entryId: string) => void,
): React.ReactNode => {
  const latestDrawMainNumbers = latestDraw?.main.filter((number) => Number.isFinite(number)) ?? [];
  const latestDrawSuppNumbers = latestDraw?.supp.filter((number) => Number.isFinite(number)) ?? [];
  const latestDrawNumbers = [...latestDrawMainNumbers, ...latestDrawSuppNumbers];
  const latestMainSet = new Set(latestDrawMainNumbers);
  const latestSuppSet = new Set(latestDrawSuppNumbers);
  return (
    <JournalLegendBox
      title="Compare active entries to latest draw"
      tone="soft"
      style={{ marginTop: 16 }}
      help={(
        <span>
          Observe-only replay. It compares unarchived journal entries with saved Numbers against the newest real draw without changing their formal scorecards.
        </span>
      )}
    >
      <section data-testid="prediction-latest-draw-replay" aria-label="Compare active entries to latest draw" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#26313d", fontSize: 14, fontWeight: 900 }}>Latest real draw replay</div>
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
              {latestDraw ? (
                <>
                  {latestDraw.date} · mains + supps:{" "}
                  {renderReplayNumberPills(latestDrawNumbers, latestMainSet, latestSuppSet, "latest-draw-replay-number")}
                </>
              ) : "No real latest draw is loaded yet."}
            </div>
          </div>
          <span style={findingSeverityStyle("info")}>Observe-only</span>
        </div>

        {latestDraw && rows.length > 0 ? (
          <div style={{ display: "grid", gap: 8, maxHeight: "min(300px, 42vh)", overflowY: "auto", paddingRight: 2 }}>
            {rows.map((row) => (
              <article
                key={row.entryId}
                data-testid="prediction-latest-draw-replay-row"
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  background: "#fff",
                  padding: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#26313d", fontSize: 13, fontWeight: 900 }}>
                    {row.targetLabel}{row.targetDrawDate ? ` · ${row.targetDrawDate}` : ""}
                  </div>
                  <div style={{ marginTop: 2, color: "#64748b", fontSize: 12, lineHeight: 1.35 }}>
                    Anchored after {row.anchorLatestDrawDate} · {statusLabels[row.status]} · {reviewStatusLabels[row.reviewStatus]}
                  </div>
                </div>
                <div style={{ minWidth: 0, color: "#475569", fontSize: 12, lineHeight: 1.45 }}>
                  <div><strong style={{ color: "#334155" }}>Saved:</strong> {row.predicted}</div>
                  <div>
                    <strong style={{ color: "#334155" }}>Hits:</strong>{" "}
                    {renderReplayNumberPills(row.hits, latestMainSet, latestSuppSet, `latest-draw-replay-hit-${row.entryId}`)}
                  </div>
                  {row.prize ? (
                    <div style={{ marginTop: 5 }}>
                      <button
                        type="button"
                        data-testid={`latest-draw-replay-open-entry-${row.entryId}`}
                        onClick={() => onOpenEntry(row.entryId)}
                        aria-label={`Open journal entry for replay prize ${row.prize.division}`}
                        title="Open this journal entry to inspect how these numbers were chosen."
                        style={replayPrizeButtonStyle(row.prize.division)}
                      >
                        Replay prize {row.prize.division}
                      </button>
                      <span style={{ marginLeft: 6, color: "#64748b", fontWeight: 750 }}>
                        {row.prize.mainHits} main · {row.prize.suppHits} supp
                      </span>
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "grid", justifyItems: "end", gap: 4, color: "#334155", fontSize: 12, fontWeight: 850 }}>
                  <span style={{ whiteSpace: "nowrap" }}>{row.hitCount} of {row.predictedCount}</span>
                  <span style={scoreResultPillStyle(row.result)}>{scoreResultLabel(row.result)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: 10, color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
            {latestDraw
              ? "No active journal entries with saved Numbers are available for latest-draw replay."
              : "Load real draw history before using latest-draw replay."}
          </div>
        )}

        {omittedNoNumberCount > 0 ? (
          <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
            {omittedNoNumberCount} active entr{omittedNoNumberCount === 1 ? "y has" : "ies have"} no saved Numbers field and {omittedNoNumberCount === 1 ? "was" : "were"} omitted from this replay.
          </div>
        ) : null}
      </section>
    </JournalLegendBox>
  );
};

const terminalDigitHistoryLabels: Record<JournalTerminalDigitHistoryBand, string> = {
  common: "Common in history",
  typical: "Seen in history",
  rare: "Rare in history",
  "never-seen": "Never seen",
};

const terminalDigitHistoryPalette: Record<JournalTerminalDigitHistoryBand, { background: string; border: string; color: string }> = {
  common: { background: "#ecfdf5", border: "#bbf7d0", color: "#166534" },
  typical: { background: "#eef6ff", border: "#cfe3f7", color: "#155a8a" },
  rare: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
  "never-seen": { background: "#f8fafc", border: "#cbd5e1", color: "#475569" },
};

const terminalDigitHistoryPillStyle = (band: JournalTerminalDigitHistoryBand): React.CSSProperties => {
  const palette = terminalDigitHistoryPalette[band];
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: palette.background,
    color: palette.color,
    fontSize: 12,
    fontWeight: 850,
    whiteSpace: "nowrap",
  };
};

type ImmediateNextDrawScore = {
  actual: string;
  date: string;
  detail: string;
  hitCount: number;
  hits: number[];
  predicted: string;
  predictedCount: number;
  result: Exclude<PredictionScoreResult, "recorded">;
};

type LatestDrawReplayRow = ImmediateNextDrawScore & {
  anchorLatestDrawDate: string;
  entryId: string;
  prize: LatestDrawReplayPrize | null;
  reviewStatus: PredictionJournalReviewStatus;
  status: PredictionJournalStatus;
  targetLabel: string;
  targetDrawDate: string | null;
};

type LatestDrawReplayPrize = {
  checkedMain: number[];
  checkedSupp: number[];
  division: Exclude<WeekdayWindfallPrizeDivision, "—">;
  mainHits: number;
  suppHits: number;
};

type JournalEntryTargetPrizeRow = LatestDrawReplayPrize & {
  date: string;
  drawIndex: number;
};

const formatJournalPercent = (value: number | null | undefined): string => (
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "-"
);

const formatTerminalDigitExample = (example: JournalTerminalDigitHistory["latestContainedExample"]): string => (
  example
    ? `Draw: ${example.date}\nMains: ${example.main.join(",")}\nSupps: ${example.supp.join(",")}`
    : ""
);

const historicalPrizeCollisionPalette = {
  clear: { background: "#f8fafc", border: "#cbd5e1", color: "#475569" },
  rare: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
};

const historicalPrizeCollisionPillStyle = (hasCollision: boolean): React.CSSProperties => {
  const palette = hasCollision ? historicalPrizeCollisionPalette.rare : historicalPrizeCollisionPalette.clear;
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    background: palette.background,
    color: palette.color,
    fontSize: 12,
    fontWeight: 850,
    whiteSpace: "nowrap",
  };
};

const formatHistoricalPrizeCollisionHit = (hit: HistoricalPrizeCollisionHit): string => (
  `${hit.division} on ${hit.date} · ${hit.mainHits} main / ${hit.suppHits} supp`
);

const renderHistoricalPrizeCollisionHitList = (
  title: string,
  hits: HistoricalPrizeCollisionHit[],
  emptyText: string,
) => (
  <div>
    <div style={{ color: "#64748b", fontWeight: 850, marginBottom: 4 }}>{title}</div>
    {hits.length ? (
      <div style={{ display: "grid", gap: 5 }}>
        {hits.slice(0, 3).map((hit) => (
          <details key={`${hit.kind}-${hit.date}-${hit.division}`} style={{ color: "#26313d" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>
              {formatHistoricalPrizeCollisionHit(hit)}
            </summary>
            <div style={{ marginTop: 4, color: "#64748b", lineHeight: 1.45 }}>
              Draw: {hit.date}<br />
              Mains: {hit.drawnMain.join(", ")}<br />
              Supps: {hit.drawnSupp.join(", ")}
              {hit.playerMain ? <><br />Stored mains: {hit.playerMain.join(", ")}</> : null}
              {hit.playerSupp?.length ? <><br />Stored supps: {hit.playerSupp.join(", ")}</> : null}
            </div>
          </details>
        ))}
        {hits.length > 3 ? (
          <div style={{ color: "#64748b" }}>+{hits.length - 3} more historical collision{hits.length - 3 === 1 ? "" : "s"}.</div>
        ) : null}
      </div>
    ) : (
      <div style={{ color: "#64748b" }}>{emptyText}</div>
    )}
  </div>
);

const renderHistoricalPrizeCollision = (
  result: HistoricalPrizeCollisionResult,
  variant: "draft" | "entry" = "entry",
) => {
  if (result.selectedNumbers.length === 0) return null;
  const checkedLabel = `${result.checkedDraws} real historical draw${result.checkedDraws === 1 ? "" : "s"}`;
  return (
    <section
      data-testid={variant === "draft" ? "prediction-draft-prize-collision" : "prediction-historical-prize-collision"}
      aria-label="Historical prize collision check"
      style={{
        marginTop: 10,
        border: `1px solid ${result.hasRarePrizeCollision ? "#fed7aa" : "#dbe3ec"}`,
        borderRadius: 8,
        padding: 10,
        background: result.hasRarePrizeCollision ? "#fffaf5" : "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>Historical prize collision check</div>
          <div style={{ marginTop: 2, fontSize: 17, color: "#26313d", fontWeight: 850 }}>
            {result.hasRarePrizeCollision ? "Rare historical D1/D2 collision found" : "No historical D1/D2 collision found"}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
            Checked against {checkedLabel}. Simulated and incomplete rows are excluded.
          </div>
        </div>
        <span style={historicalPrizeCollisionPillStyle(result.hasRarePrizeCollision)}>
          {result.bestDivision ?? "Clear"}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 10,
          marginTop: 10,
          fontSize: 12,
        }}
      >
        {renderHistoricalPrizeCollisionHitList(
          "Stored line check",
          result.storedLineHits,
          result.storedLineMain.length < 6
            ? "Enter at least six numbers to check the stored line."
            : "No stored-line Division 1 or Division 2 collision found.",
        )}
        {renderHistoricalPrizeCollisionHitList(
          "Selected-set subset check",
          result.selectedSetHits,
          result.selectedNumbers.length < 6
            ? "Enter at least six numbers to check unordered selected-set subsets."
            : "No unordered selected-set Division 1 or Division 2 collision found.",
        )}
      </div>
      <div style={{ marginTop: 8, color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
        Stored line uses the first six saved numbers as mains and the next two as supps when available. Selected-set subset ignores order and asks whether any subset of the selected numbers could have matched historical Division 1 or Division 2. This is an archive rarity check, not a future probability signal.
        {result.skippedDraws > 0 ? ` ${result.skippedDraws} history row${result.skippedDraws === 1 ? "" : "s"} were skipped as simulated or incomplete.` : ""}
      </div>
    </section>
  );
};

const renderTerminalDigitHistory = (history: JournalTerminalDigitHistory) => {
  const visibleExample = history.latestContainedExample ?? history.latestExactExample;
  const exampleTitle = history.latestContainedExample ? "Latest contained draw" : "Latest exact draw";
  return (
    <section
      data-testid="prediction-terminal-digit-history"
      aria-label="Terminal digit history"
      style={{
        marginTop: 10,
        border: "1px solid #dbe3ec",
        borderRadius: 8,
        padding: 10,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>Terminal digit history</div>
          <div style={{ marginTop: 2, fontSize: 17, color: "#26313d", fontWeight: 850 }}>
            {numberText(history.digits)}
          </div>
        </div>
        <span style={terminalDigitHistoryPillStyle(history.band)}>{terminalDigitHistoryLabels[history.band]}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 8,
          marginTop: 10,
          fontSize: 12,
        }}
      >
        <div>
          <div style={{ color: "#64748b", fontWeight: 850, marginBottom: 2 }}>Contained hits</div>
          <div style={{ color: "#26313d", fontWeight: 800 }}>
            {history.containedCount} / {history.validDraws} ({formatJournalPercent(history.containedPercent)})
          </div>
          <div style={{ color: "#64748b", marginTop: 2 }}>
            All saved digits appeared in the same recorded draw.
          </div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontWeight: 850, marginBottom: 2 }}>Exact set hits</div>
          <div style={{ color: "#26313d", fontWeight: 800 }}>
            {history.exactCount} / {history.validDraws} ({formatJournalPercent(history.exactPercent)})
          </div>
          <div style={{ color: "#64748b", marginTop: 2 }}>
            The draw's unique terminal digits matched this set exactly.
          </div>
        </div>
        <div>
          <div style={{ color: "#64748b", fontWeight: 850, marginBottom: 2 }}>Same-length rank</div>
          <div style={{ color: "#26313d", fontWeight: 800 }}>
            {history.peerRank && history.peerTotal ? `${history.peerRank} of ${history.peerTotal}` : "-"}
          </div>
          <div style={{ color: "#64748b", marginTop: 2 }}>
            {history.peerPercentile == null
              ? "No same-length comparison available."
              : `At least as frequent as ${formatJournalPercent(history.peerPercentile)} of same-length sets.`}
          </div>
        </div>
      </div>
      {visibleExample ? (
        <details style={{ marginTop: 9 }}>
          <summary
            title={formatTerminalDigitExample(visibleExample)}
            style={{ cursor: "pointer", color: "#155a8a", fontSize: 12, fontWeight: 850 }}
          >
            {exampleTitle}: {visibleExample.date}
          </summary>
          <div style={{ marginTop: 5, color: "#475569", fontSize: 12, lineHeight: 1.45 }}>
            Mains: {visibleExample.main.join(", ")}
            {visibleExample.supp.length ? <><br />Supps: {visibleExample.supp.join(", ")}</> : null}
          </div>
        </details>
      ) : (
        <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
          No recorded real draw contains all of these terminal digits together.
        </div>
      )}
      {history.skippedDraws > 0 ? (
        <div style={{ marginTop: 6, color: "#8a4b00", fontSize: 12 }}>
          {history.skippedDraws} history row{history.skippedDraws === 1 ? "" : "s"} were skipped because they were incomplete or invalid for mains + supps.
        </div>
      ) : null}
    </section>
  );
};

const domSafeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const summarizePredictionInputs = (entry: PredictionJournalEntry): string[] => {
  const inputs = entry.inputs;
  const parts: string[] = [];
  if (inputs.oddEvenRatio) parts.push(`O/E ${inputs.oddEvenRatio}`);
  if (inputs.numbers?.length) parts.push(`${inputs.numbers.length} picked`);
  if (inputs.terminalDigits?.length) parts.push(`${inputs.terminalDigits.length} terminal digits`);
  if (inputs.monthlyBuckets && Object.keys(inputs.monthlyBuckets).length > 0) parts.push("bucket mix");
  if (inputs.selectionReason) parts.push(`Reason: ${selectionReasonSummary(inputs.selectionReason)}`);
  if (inputs.singleDouble) parts.push("single/double");
  if (inputs.sumRange) parts.push("sum range");
  if (inputs.trendRatio) parts.push(`U/D/F ${inputs.trendRatio}`);
  if (inputs.previousRepeatCount !== undefined) parts.push(`repeats ${inputs.previousRepeatCount}`);
  if (inputs.previousNeighbourHitCount !== undefined) parts.push(`± hits ${inputs.previousNeighbourHitCount}`);
  if (inputs.droughtBreakCount !== undefined) parts.push(`drought ${inputs.droughtBreakCount}`);
  if (inputs.carryOverCount !== undefined) parts.push(`carry-over ${inputs.carryOverCount}`);
  if (inputs.confidence !== undefined) parts.push(`confidence ${inputs.confidence}`);
  if (entry.setupSummary) parts.push("Saved setup");
  if (inputs.notes) parts.push("notes");
  return parts;
};

const summarizeScoreResults = (entry: { scores: Array<{ result: string }> }): string => {
  if (entry.scores.length === 0) return "Awaiting score";
  const counts = entry.scores.reduce<Record<string, number>>((next, score) => {
    next[score.result] = (next[score.result] ?? 0) + 1;
    return next;
  }, {});
  const resultParts = [
    counts.hit ? `${counts.hit} hit` : "",
    counts.partial ? `${counts.partial} partial` : "",
    counts.miss ? `${counts.miss} miss` : "",
    counts.recorded ? `${counts.recorded} recorded` : "",
  ].filter(Boolean);
  return `${entry.scores.length} checks${resultParts.length ? `: ${resultParts.join(" / ")}` : ""}`;
};

const summarizeTargetDrawDate = (entry: { targetDraws?: Draw[] }): string | null => {
  const targetDraws = entry.targetDraws ?? [];
  if (targetDraws.length === 0) return null;
  const firstDate = targetDraws[0]?.date;
  const lastDate = targetDraws[targetDraws.length - 1]?.date;
  if (!firstDate) return null;
  if (!lastDate || firstDate === lastDate) return firstDate;
  return `${firstDate} to ${lastDate}`;
};

const scoreImmediateNextDraw = (entry: { inputs: PredictionJournalInputs; targetDraws?: Draw[] }): ImmediateNextDrawScore | null => {
  const predicted = entry.inputs.numbers ?? [];
  const nextDraw = entry.targetDraws?.[0];
  if (!nextDraw || predicted.length === 0) return null;

  const actualNumbers = [...nextDraw.main, ...nextDraw.supp].filter((number) => Number.isFinite(number));
  const actualSet = new Set(actualNumbers);
  const hits = predicted.filter((number) => actualSet.has(number));
  const result: ImmediateNextDrawScore["result"] = hits.length === predicted.length
    ? "hit"
    : hits.length > 0
      ? "partial"
      : "miss";

  return {
    actual: actualNumbers.join(", "),
    date: nextDraw.date,
    detail: hits.length ? `Hits: ${hits.join(", ")}` : "No saved numbers appeared in the immediate next draw.",
    hitCount: hits.length,
    hits,
    predicted: predicted.join(", "),
    predictedCount: predicted.length,
    result,
  };
};

const scorePredictionAgainstDraw = (
  predicted: number[],
  draw: Draw,
): ImmediateNextDrawScore | null => {
  if (predicted.length === 0) return null;

  const actualNumbers = [...draw.main, ...draw.supp].filter((number) => Number.isFinite(number));
  const actualSet = new Set(actualNumbers);
  const hits = predicted.filter((number) => actualSet.has(number));
  const result: ImmediateNextDrawScore["result"] = hits.length === predicted.length
    ? "hit"
    : hits.length > 0
      ? "partial"
      : "miss";

  return {
    actual: actualNumbers.join(", "),
    date: draw.date,
    detail: hits.length ? `Hits: ${hits.join(", ")}` : "No saved numbers appeared in the latest draw.",
    hitCount: hits.length,
    hits,
    predicted: predicted.join(", "),
    predictedCount: predicted.length,
    result,
  };
};

const scoreLatestDrawReplayPrize = (
  predicted: number[],
  draw: Draw,
): LatestDrawReplayPrize | null => {
  if (predicted.length < 6) return null;

  const checkedMain = predicted.slice(0, 6);
  const checkedSupp = predicted.slice(6, 8);
  const drawnMainSet = new Set(draw.main.filter((number) => Number.isFinite(number)));
  const drawnSuppSet = new Set(draw.supp.filter((number) => Number.isFinite(number)));
  const division = computeWeekdayWindfallPrizeDivision(checkedMain, checkedSupp, drawnMainSet, drawnSuppSet);
  if (division === "—") return null;

  const { mainHits, suppHits } = computeWeekdayWindfallPrizeHits(checkedMain, drawnMainSet, drawnSuppSet, checkedSupp);
  return {
    checkedMain,
    checkedSupp,
    division,
    mainHits,
    suppHits,
  };
};

const scoreEntryTargetPrizeRows = (entry: ScoredPredictionJournalEntry): JournalEntryTargetPrizeRow[] => {
  const predicted = entry.inputs.numbers ?? [];
  if (predicted.length < 6 || entry.targetDraws.length === 0) return [];

  return entry.targetDraws
    .map((draw, index) => {
      const prize = scoreLatestDrawReplayPrize(predicted, draw);
      return prize ? { ...prize, date: draw.date, drawIndex: index + 1 } : null;
    })
    .filter((row): row is JournalEntryTargetPrizeRow => row !== null)
    .sort((a, b) => (
      rankWeekdayWindfallPrizeDivision(a.division) - rankWeekdayWindfallPrizeDivision(b.division)
      || a.drawIndex - b.drawIndex
    ));
};

const scoreEntryAgainstLatestDraw = (
  entry: ScoredPredictionJournalEntry,
  latestDraw: Draw,
): LatestDrawReplayRow | null => {
  const predicted = entry.inputs.numbers ?? [];
  const replayScore = scorePredictionAgainstDraw(predicted, latestDraw);
  if (!replayScore) return null;

  return {
    ...replayScore,
    anchorLatestDrawDate: entry.anchorLatestDrawDate,
    entryId: entry.id,
    prize: scoreLatestDrawReplayPrize(predicted, latestDraw),
    reviewStatus: normalizeReviewStatus(entry.reviewStatus),
    status: entry.status,
    targetLabel: targetLabels[entry.targetKind],
    targetDrawDate: summarizeTargetDrawDate(entry),
  };
};

const renderJournalEntryTargetPrizeReplay = (rows: JournalEntryTargetPrizeRow[]): React.ReactNode => {
  if (rows.length === 0) return null;
  const best = rows[0];
  return (
    <section
      data-testid="prediction-entry-target-prize-replay"
      aria-label="Target-draw prize replay"
      style={{
        marginTop: 10,
        border: `1px solid ${best.division === "Div1" || best.division === "Div2" ? "#f9a8d4" : "#bbf7d0"}`,
        borderRadius: 8,
        padding: 10,
        background: best.division === "Div1" || best.division === "Div2" ? "#fff5f8" : "#f6fff9",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>Target-draw prize replay</div>
          <div style={{ marginTop: 2, fontSize: 17, color: "#26313d", fontWeight: 900 }}>
            Saved line qualified in this entry's target window
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            Post-draw replay only. First six saved numbers are checked as mains; the next two are checked as supps.
          </div>
        </div>
        <span style={replayPrizePillStyle(best.division)}>Prize {best.division}</span>
      </div>
      <div style={{ display: "grid", gap: 7, marginTop: 10, fontSize: 12 }}>
        {rows.map((row) => (
          <div
            key={`${row.drawIndex}-${row.date}-${row.division}`}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 8,
              background: "#fff",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ color: "#64748b", fontWeight: 850 }}>Target draw</div>
              <div style={{ color: "#26313d", fontWeight: 850 }}>D{row.drawIndex} · {row.date}</div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontWeight: 850 }}>Prize result</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={replayPrizePillStyle(row.division)}>Prize {row.division}</span>
                <span style={{ color: "#475569", fontWeight: 800 }}>{row.mainHits} main · {row.suppHits} supp</span>
              </div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontWeight: 850 }}>Checked roles</div>
              <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>
                M {row.checkedMain.join(", ")}
                {row.checkedSupp.length ? ` · S ${row.checkedSupp.join(", ")}` : " · S none"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const splitNumbers = (value: string): number[] => (
  (value.match(/\d+/g) ?? []).map((part) => Number(part)).filter((number) => Number.isFinite(number))
);

const splitSignedNumbers = (value: string): number[] => (
  (value.match(/-?\d+(?:\.\d+)?/g) ?? []).map((part) => Number(part)).filter((number) => Number.isFinite(number))
);

const numberText = (numbers: number[] | undefined): string => numbers?.join(", ") ?? "";

const latestRealDraw = (history: Draw[]): Draw | null => {
  const ordered = history
    .map((draw, index) => ({ draw, index, time: parsePredictionJournalDate(draw.date) }))
    .filter((row): row is { draw: Draw; index: number; time: number } => !row.draw.isSimulated && row.time !== null)
    .sort((a, b) => (b.time - a.time) || (b.index - a.index));
  return ordered[0]?.draw ?? null;
};

const integerOrUndefined = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
};

const targetKindFromValue = (value: string): PredictionTargetKind => {
  if (value === "next2Draws" || value === "next3Draws" || value === "restOfMonth") return value;
  return "nextDraw";
};

const targetNumberLimit = (targetKind: PredictionTargetKind): number | null => {
  if (targetKind === "nextDraw") return 8;
  if (targetKind === "next2Draws") return 16;
  if (targetKind === "next3Draws") return 24;
  return null;
};

const targetDrawCount = (targetKind: PredictionTargetKind): number | null => {
  if (targetKind === "nextDraw") return 1;
  if (targetKind === "next2Draws") return 2;
  if (targetKind === "next3Draws") return 3;
  return null;
};

const hasDecimalText = (value: string): boolean => /-?\d+\.\d+/.test(value);

const validateNonNegativeIntegerText = (label: string, value: string): string | null => {
  if (!value.trim()) return null;
  if (hasDecimalText(value) || !/^\s*\d+\s*$/.test(value)) return `${label} must be a whole number.`;
  return null;
};

const normalizeTerminalDigit = (number: number): number => (number <= 9 ? number : number % 10);
const countOddEven = (numbers: number[]): { odd: number; even: number } => numbers.reduce((acc, number) => {
  if (number % 2 === 0) acc.even += 1;
  else acc.odd += 1;
  return acc;
}, { odd: 0, even: 0 });
const bucketKeyForCount = (count: number): PredictionBucketKey => {
  if (count <= 0) return "undrawn";
  if (count >= 8) return "times8";
  return `times${count}` as PredictionBucketKey;
};
const maxUniqueDrawSum = (drawCount: number): number => 332 * drawCount;
const minUniqueDrawSum = (drawCount: number): number => 36 * drawCount;
const STRICT_DROUGHT_BREAK_DRAWS = 6;
const PREDICTION_JOURNAL_AUTHOR_EMAIL = "";
const MAILTO_BODY_JSON_LIMIT = 6500;
const UNREVIEWED_SAVE_ALERT = "Mark reviewed only after you have checked the draft. Future scoring can use this flag to include or ignore entries.";

const uniqueValidLotteryNumbers = (value: string): number[] => {
  const seen = new Set<number>();
  for (const number of splitSignedNumbers(value)) {
    if (!Number.isInteger(number) || number < 1 || number > 45) continue;
    seen.add(number);
  }
  return [...seen].sort((left, right) => left - right);
};

const uniqueValidLotteryNumbersInInputOrder = (value: string): number[] => {
  const seen = new Set<number>();
  const output: number[] = [];
  for (const number of splitSignedNumbers(value)) {
    if (!Number.isInteger(number) || number < 1 || number > 45 || seen.has(number)) continue;
    seen.add(number);
    output.push(number);
  }
  return output;
};

const orderedRealDraws = (history: Draw[]): Draw[] => history
  .map((draw, index) => ({ draw, index, time: parsePredictionJournalDate(draw.date) }))
  .filter((row): row is { draw: Draw; index: number; time: number } => !row.draw.isSimulated && row.time !== null)
  .sort((left, right) => (left.time - right.time) || (left.index - right.index))
  .map((row) => row.draw);

const drawNumberSet = (draw: Draw | null | undefined): Set<number> => new Set(
  [
    ...(draw?.main ?? []),
    ...(draw?.supp ?? []),
  ].filter((number) => Number.isInteger(number) && number >= 1 && number <= 45),
);

const monthKeyForDraw = (draw: Draw): string | null => {
  const time = parsePredictionJournalDate(draw.date);
  if (time === null) return null;
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const currentMonthlyBucketKeyByNumber = (history: Draw[], targetDate: string): Map<number, PredictionBucketKey> => {
  const ordered = orderedRealDraws(history);
  const latest = ordered[ordered.length - 1];
  const targetTime = parsePredictionJournalDate(targetDate);
  const targetMonth = targetTime === null
    ? latest ? monthKeyForDraw(latest) : null
    : (() => {
        const date = new Date(targetTime);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      })();
  const counts = new Map<number, number>();

  if (targetMonth) {
    for (const draw of ordered) {
      const drawTime = parsePredictionJournalDate(draw.date);
      if (targetTime !== null && drawTime !== null && drawTime >= targetTime) continue;
      if (monthKeyForDraw(draw) !== targetMonth) continue;
      for (const number of drawNumberSet(draw)) {
        counts.set(number, (counts.get(number) ?? 0) + 1);
      }
    }
  }

  const out = new Map<number, PredictionBucketKey>();
  for (let number = 1; number <= 45; number += 1) {
    out.set(number, bucketKeyForCount(counts.get(number) ?? 0));
  }
  return out;
};

const currentDroughtLength = (history: Draw[], number: number): number => {
  const ordered = orderedRealDraws(history);
  let drought = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (drawNumberSet(ordered[index]).has(number)) return drought;
    drought += 1;
  }
  return ordered.length;
};

const dateFromJournalDate = (value: string): Date | undefined => {
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed);
  const time = parsePredictionJournalDate(value);
  return time === null ? undefined : new Date(time);
};

const buildPredictionJournalAutoFillContext = (
  history: Draw[],
  nextDrawDate: string,
): PredictionJournalAutoFillContext => {
  const ordered = orderedRealDraws(history);
  const latest = ordered[ordered.length - 1] ?? null;
  const trendMap = computeTrendMap(buildTrendValueSeries(ordered), { lookback: 4, threshold: 0.02 });
  const previousNeighbourTargetSet = new Set(
    buildPreviousNeighbourConstraintRows(latest, "mains-plus-supps")
      .flatMap((row) => row.targets),
  );
  const strictDroughtSet = new Set<number>();
  for (let number = 1; number <= 45; number += 1) {
    if (currentDroughtLength(history, number) >= STRICT_DROUGHT_BREAK_DRAWS) {
      strictDroughtSet.add(number);
    }
  }
  const carryOverReferenceDate = dateFromJournalDate(nextDrawDate);
  const carryOver = buildMonthEndCarryOverWeighting(history, {
    includeSupp: true,
    referenceDate: carryOverReferenceDate,
  });

  return {
    bucketKeys: currentMonthlyBucketKeyByNumber(history, nextDrawDate),
    trendMap,
    latestDrawNumberSet: drawNumberSet(latest),
    previousNeighbourTargetSet,
    strictDroughtSet,
    carryOverSet: new Set(carryOver.activeNumbers),
  };
};

const derivePredictionJournalAutoFill = (
  numbersText: string,
  targetKind: PredictionTargetKind,
  context: PredictionJournalAutoFillContext,
): PredictionJournalAutoFillSnapshot => {
  const numbers = uniqueValidLotteryNumbers(numbersText);
  const snapshot = emptyAutoFillSnapshot();
  if (numbers.length === 0) return snapshot;

  const numberLimit = targetNumberLimit(targetKind);
  const shouldFillWholeTargetFields = numberLimit === null || numbers.length === numberLimit;
  const shouldFillOddEvenRatio = numbers.length === 8 || shouldFillWholeTargetFields;
  const oddEven = countOddEven(numbers);
  const sum = numbers.reduce((total, number) => total + number, 0);

  snapshot.terminalDigitsText = [...new Set(numbers.map(normalizeTerminalDigit))]
    .sort((left, right) => left - right)
    .join(", ");
  snapshot.oddEvenRatio = shouldFillOddEvenRatio ? `${oddEven.odd}:${oddEven.even}` : "";
  snapshot.singleText = String(numbers.filter((number) => number >= 1 && number <= 9).length);
  snapshot.doubleText = String(numbers.filter((number) => number >= 10 && number <= 45).length);
  snapshot.sumMinText = shouldFillWholeTargetFields ? String(sum) : "";
  snapshot.sumMaxText = shouldFillWholeTargetFields ? String(sum) : "";

  const bucketCounts = emptyBuckets();
  for (const number of numbers) {
    const key = context.bucketKeys.get(number) ?? "undrawn";
    bucketCounts[key] = String((integerOrUndefined(bucketCounts[key]) ?? 0) + 1);
  }
  snapshot.bucketText = bucketCounts;

  let up = 0;
  let down = 0;
  let flat = 0;
  for (const number of numbers) {
    const trend = context.trendMap.get(number) ?? "FLAT";
    if (trend === "UP") up += 1;
    else if (trend === "DOWN") down += 1;
    else flat += 1;
  }
  snapshot.trendRatio = `${up}/${down}/${flat}`;

  snapshot.previousRepeatCount = String(numbers.filter((number) => context.latestDrawNumberSet.has(number)).length);
  snapshot.previousNeighbourHitCount = String(numbers.filter((number) => context.previousNeighbourTargetSet.has(number)).length);
  snapshot.droughtBreakCount = String(numbers.filter((number) => context.strictDroughtSet.has(number)).length);
  snapshot.carryOverCount = String(numbers.filter((number) => context.carryOverSet.has(number)).length);

  return snapshot;
};

export const PredictionJournalPanel: React.FC<PredictionJournalPanelProps> = ({
  history,
  initialEntries,
  now = () => new Date().toISOString(),
  getSetupSnapshot,
  newPredictionDraft,
  viewEntriesRequestId,
}) => {
  const [entries, setEntries] = useState<PredictionJournalEntry[]>(() => (
    initialEntries ?? (typeof window === "undefined" ? [] : loadPredictionJournalEntries())
  ));
  const [journalViewMode, setJournalViewMode] = useState<PredictionJournalViewMode>(() => (
    newPredictionDraft ? "draft" : "entries"
  ));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<PredictionTargetKind>("nextDraw");
  const [oddEvenRatio, setOddEvenRatio] = useState("");
  const [numbersText, setNumbersText] = useState("");
  const [terminalDigitsText, setTerminalDigitsText] = useState("");
  const [bucketText, setBucketText] = useState<BucketTextState>(() => emptyBuckets());
  const [singleText, setSingleText] = useState("");
  const [doubleText, setDoubleText] = useState("");
  const [sumMinText, setSumMinText] = useState("");
  const [sumMaxText, setSumMaxText] = useState("");
  const [trendRatio, setTrendRatio] = useState("");
  const [previousRepeatCount, setPreviousRepeatCount] = useState("");
  const [previousNeighbourHitCount, setPreviousNeighbourHitCount] = useState("");
  const [droughtBreakCount, setDroughtBreakCount] = useState("");
  const [carryOverCount, setCarryOverCount] = useState("");
  const [confidence, setConfidence] = useState("");
  const [reviewStatus, setReviewStatus] = useState<PredictionJournalReviewStatus>("notReviewed");
  const [selectionReasonKey, setSelectionReasonKey] = useState<PredictionJournalSelectionReasonFormValue>("");
  const [selectionReasonIncludesOther, setSelectionReasonIncludesOther] = useState(false);
  const [selectionReasonOtherText, setSelectionReasonOtherText] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [showUnreviewedSaveAlert, setShowUnreviewedSaveAlert] = useState(false);
  const [showHistoricalPrizeCollisionSaveAlert, setShowHistoricalPrizeCollisionSaveAlert] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [showArchivedEntries, setShowArchivedEntries] = useState(false);
  const draftRegionRef = useRef<HTMLDivElement | null>(null);
  const revealDraftRegionRef = useRef(false);
  const lastNumbersAutoFillRef = useRef<PredictionJournalAutoFillSnapshot>(emptyAutoFillSnapshot());

  const hasControlledInitialEntries = initialEntries !== undefined;
  const latestDraw = useMemo(() => latestRealDraw(history), [history]);
  const nextDrawContext = useMemo(
    () => computeResearchDiaryNextDrawContext(history, { now: now() }),
    [history, now],
  );
  const autoFillContext = useMemo(
    () => buildPredictionJournalAutoFillContext(history, nextDrawContext.nextDrawDate),
    [history, nextDrawContext.nextDrawDate],
  );
  const scoredEntries = useMemo(
    () => entries.map((entry) => scorePredictionJournalEntry(entry, history)),
    [entries, history],
  );
  const archivedEntryCount = useMemo(
    () => scoredEntries.filter((entry) => entry.archivedAt).length,
    [scoredEntries],
  );
  const visibleScoredEntries = useMemo(
    () => showArchivedEntries ? scoredEntries : scoredEntries.filter((entry) => !entry.archivedAt),
    [scoredEntries, showArchivedEntries],
  );
  const activeEntriesForLatestReplay = useMemo(
    () => scoredEntries.filter((entry) => !entry.archivedAt),
    [scoredEntries],
  );
  const latestDrawReplayRows = useMemo(
    () => latestDraw
      ? activeEntriesForLatestReplay
        .map((entry) => scoreEntryAgainstLatestDraw(entry, latestDraw))
        .filter((row): row is LatestDrawReplayRow => row !== null)
      : [],
    [activeEntriesForLatestReplay, latestDraw],
  );
  const latestDrawReplayOmittedNoNumberCount = useMemo(
    () => activeEntriesForLatestReplay.filter((entry) => !(entry.inputs.numbers?.length)).length,
    [activeEntriesForLatestReplay],
  );
  const findingsReport = useMemo(
    () => buildPredictionJournalFindingsReport(scoredEntries, {
      reviewedOnly: true,
      includeArchived: showArchivedEntries,
    }),
    [scoredEntries, showArchivedEntries],
  );
  const terminalDigitHistoryByEntryId = useMemo(() => {
    const map = new Map<string, JournalTerminalDigitHistory>();
    for (const entry of scoredEntries) {
      if (!entry.inputs.terminalDigits?.length) continue;
      const historyResult = analyzeJournalTerminalDigitHistory(history, entry.inputs.terminalDigits, {
        scope: "mains-plus-supps",
      });
      if (historyResult) map.set(entry.id, historyResult);
    }
    return map;
  }, [history, scoredEntries]);
  const historicalPrizeCollisionByEntryId = useMemo(() => {
    const map = new Map<string, HistoricalPrizeCollisionResult>();
    for (const entry of scoredEntries) {
      if (!entry.inputs.numbers?.length) continue;
      map.set(entry.id, analyzeHistoricalPrizeCollision(history, entry.inputs.numbers));
    }
    return map;
  }, [history, scoredEntries]);
  const draftHistoricalPrizeCollision = useMemo(
    () => analyzeHistoricalPrizeCollision(history, uniqueValidLotteryNumbersInInputOrder(numbersText)),
    [history, numbersText],
  );
  const editingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) ?? null,
    [editingId, entries],
  );

  const canApplyAutoFillValue = (current: string, previousAutoFill: string): boolean => (
    current.trim() === "" || current === previousAutoFill
  );

  const applyNumbersAutoFill = (nextNumbersText: string, nextTargetKind = targetKind) => {
    const previousAutoFill = lastNumbersAutoFillRef.current;
    const nextAutoFill = derivePredictionJournalAutoFill(nextNumbersText, nextTargetKind, autoFillContext);

    setOddEvenRatio((current) => canApplyAutoFillValue(current, previousAutoFill.oddEvenRatio) ? nextAutoFill.oddEvenRatio : current);
    setTerminalDigitsText((current) => canApplyAutoFillValue(current, previousAutoFill.terminalDigitsText) ? nextAutoFill.terminalDigitsText : current);
    setBucketText((current) => {
      const next = { ...current };
      for (const field of BUCKET_FIELDS) {
        if (canApplyAutoFillValue(current[field.key], previousAutoFill.bucketText[field.key])) {
          next[field.key] = nextAutoFill.bucketText[field.key];
        }
      }
      return next;
    });
    setSingleText((current) => canApplyAutoFillValue(current, previousAutoFill.singleText) ? nextAutoFill.singleText : current);
    setDoubleText((current) => canApplyAutoFillValue(current, previousAutoFill.doubleText) ? nextAutoFill.doubleText : current);
    setSumMinText((current) => canApplyAutoFillValue(current, previousAutoFill.sumMinText) ? nextAutoFill.sumMinText : current);
    setSumMaxText((current) => canApplyAutoFillValue(current, previousAutoFill.sumMaxText) ? nextAutoFill.sumMaxText : current);
    setTrendRatio((current) => canApplyAutoFillValue(current, previousAutoFill.trendRatio) ? nextAutoFill.trendRatio : current);
    setPreviousRepeatCount((current) => canApplyAutoFillValue(current, previousAutoFill.previousRepeatCount) ? nextAutoFill.previousRepeatCount : current);
    setPreviousNeighbourHitCount((current) => canApplyAutoFillValue(current, previousAutoFill.previousNeighbourHitCount) ? nextAutoFill.previousNeighbourHitCount : current);
    setDroughtBreakCount((current) => canApplyAutoFillValue(current, previousAutoFill.droughtBreakCount) ? nextAutoFill.droughtBreakCount : current);
    setCarryOverCount((current) => canApplyAutoFillValue(current, previousAutoFill.carryOverCount) ? nextAutoFill.carryOverCount : current);

    lastNumbersAutoFillRef.current = nextAutoFill;
  };

  const handleNumbersTextChange = (value: string) => {
    setShowUnreviewedSaveAlert(false);
    setShowHistoricalPrizeCollisionSaveAlert(false);
    setNumbersText(value);
    applyNumbersAutoFill(value);
  };

  const handleOpenLatestReplayEntry = (entryId: string) => {
    setExpandedEntryId(entryId);
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const detailId = `prediction-journal-entry-${domSafeId(entryId)}`;
    window.requestAnimationFrame(() => {
      document.getElementById(detailId)?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleTargetKindChange = (value: string) => {
    setShowUnreviewedSaveAlert(false);
    const nextTargetKind = targetKindFromValue(value);
    setTargetKind(nextTargetKind);
    if (numbersText.trim()) applyNumbersAutoFill(numbersText, nextTargetKind);
  };

  const handleReviewStatusChange = (value: PredictionJournalReviewStatus) => {
    setReviewStatus(value);
    setShowUnreviewedSaveAlert(false);
  };

  const handleSelectionReasonChange = (value: PredictionJournalSelectionReasonFormValue) => {
    setSelectionReasonKey(value);
    setNotes((current) => mergeSelectionReasonIntoNotes(current, value, selectionReasonIncludesOther, selectionReasonOtherText));
  };

  const handleSelectionReasonOtherToggle = (checked: boolean) => {
    setSelectionReasonIncludesOther(checked);
    setNotes((current) => mergeSelectionReasonIntoNotes(current, selectionReasonKey, checked, selectionReasonOtherText));
  };

  const handleSelectionReasonOtherTextChange = (value: string) => {
    setSelectionReasonOtherText(value);
    if (selectionReasonIncludesOther) {
      setNotes((current) => mergeSelectionReasonIntoNotes(current, selectionReasonKey, true, value));
    }
  };

  useEffect(() => {
    if (hasControlledInitialEntries) return;
    setEntries(loadPredictionJournalEntries());
  }, [hasControlledInitialEntries]);

  useEffect(() => {
    if (hasControlledInitialEntries || typeof window === "undefined") return;
    savePredictionJournalEntries(entries);
  }, [entries, hasControlledInitialEntries]);

  const formInputs = useMemo<PredictionJournalInputs>(() => {
    const monthlyBuckets: PredictionJournalInputs["monthlyBuckets"] = {};
    for (const field of BUCKET_FIELDS) {
      const value = integerOrUndefined(bucketText[field.key]);
      if (value !== undefined) monthlyBuckets[field.key] = value;
    }
    const cleanedSelectionReasonOtherText = selectionReasonIncludesOther ? selectionReasonOtherText.trim() : "";
    const selectionReason = selectionReasonKey
      ? {
          version: 1 as const,
          key: selectionReasonKey,
          label: PREDICTION_JOURNAL_SELECTION_REASON_LABELS[selectionReasonKey],
          ...(cleanedSelectionReasonOtherText ? { detail: cleanedSelectionReasonOtherText } : {}),
        }
      : selectionReasonIncludesOther
        ? {
            version: 1 as const,
            key: "other" as const,
            label: PREDICTION_JOURNAL_SELECTION_REASON_LABELS.other,
            ...(cleanedSelectionReasonOtherText ? { detail: cleanedSelectionReasonOtherText } : {}),
          }
        : undefined;

    return normalizePredictionJournalInputs({
      oddEvenRatio,
      numbers: splitNumbers(numbersText),
      terminalDigits: splitNumbers(terminalDigitsText),
      monthlyBuckets,
      singleDouble: {
        single: integerOrUndefined(singleText),
        double: integerOrUndefined(doubleText),
      },
      sumRange: {
        min: integerOrUndefined(sumMinText),
        max: integerOrUndefined(sumMaxText),
      },
      trendRatio,
      previousRepeatCount: integerOrUndefined(previousRepeatCount),
      previousNeighbourHitCount: integerOrUndefined(previousNeighbourHitCount),
      droughtBreakCount: integerOrUndefined(droughtBreakCount),
      carryOverCount: integerOrUndefined(carryOverCount),
      confidence: integerOrUndefined(confidence),
      selectionReason,
      notes,
    });
  }, [
    bucketText,
    carryOverCount,
    confidence,
    doubleText,
    droughtBreakCount,
    notes,
    numbersText,
    oddEvenRatio,
    previousNeighbourHitCount,
    previousRepeatCount,
    selectionReasonIncludesOther,
    selectionReasonKey,
    selectionReasonOtherText,
    singleText,
    sumMaxText,
    sumMinText,
    terminalDigitsText,
    trendRatio,
  ]);

  const hasPredictionContent = Object.keys(formInputs).length > 0;

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const numberLimit = targetNumberLimit(targetKind);
    const drawCount = targetDrawCount(targetKind);

    if (oddEvenRatio.trim()) {
      const match = oddEvenRatio.trim().match(/^(\d+)\s*:\s*(\d+)$/);
      if (!match) {
        errors.push("Odd/even ratio must use the format odd:even, for example 2:6.");
      } else {
        const odd = Number(match[1]);
        const even = Number(match[2]);
        const total = odd + even;
        if (numberLimit !== null && total !== 8) {
          errors.push("Odd/even ratio must total 8.");
        } else if (numberLimit === null && total <= 0) {
          errors.push("Odd/even ratio must include at least one draw number.");
        }
      }
    }

    const rawNumbers = splitSignedNumbers(numbersText);
    const uniqueNumbers = new Set(rawNumbers);
    if (rawNumbers.some((number) => !Number.isInteger(number) || number < 1 || number > 45)) {
      errors.push("Numbers must be whole values from 1 to 45.");
    }
    const numberFieldLimit = numberLimit ?? 45;
    if (uniqueNumbers.size > numberFieldLimit) {
      errors.push(`Numbers can include at most ${numberFieldLimit} unique numbers for this target window.`);
    }

    const rawTerminalDigits = splitSignedNumbers(terminalDigitsText);
    if (rawTerminalDigits.some((number) => !Number.isInteger(number) || number < 0 || number > 45)) {
      errors.push("Terminal digit entries must be whole values from 0 to 45.");
    }
    const uniqueTerminalDigits = new Set(rawTerminalDigits.filter((number) => Number.isInteger(number) && number >= 0 && number <= 45).map(normalizeTerminalDigit));
    const terminalDigitLimit = numberLimit === null ? 10 : Math.min(10, numberLimit);
    if (uniqueTerminalDigits.size > terminalDigitLimit) {
      errors.push(`Terminal digits can include at most ${terminalDigitLimit} unique digits for this target window.`);
    }

    let bucketTotal = 0;
    for (const field of BUCKET_FIELDS) {
      const error = validateNonNegativeIntegerText(field.label, bucketText[field.key]);
      if (error) errors.push(error);
      bucketTotal += integerOrUndefined(bucketText[field.key]) ?? 0;
    }
    if (numberLimit !== null && bucketTotal > numberLimit) {
      errors.push(`Target draw bucket-origin mix cannot total more than ${numberLimit} for this target window.`);
    }

    const singleError = validateNonNegativeIntegerText("Single-digit count", singleText);
    const doubleError = validateNonNegativeIntegerText("Double-digit count", doubleText);
    if (singleError) errors.push(singleError);
    if (doubleError) errors.push(doubleError);
    const singleDoubleTotal = (integerOrUndefined(singleText) ?? 0) + (integerOrUndefined(doubleText) ?? 0);
    if (numberLimit !== null && singleDoubleTotal > numberLimit) {
      errors.push(`Single/double digit counts cannot total more than ${numberLimit}.`);
    }

    const sumMinError = validateNonNegativeIntegerText("Sum min", sumMinText);
    const sumMaxError = validateNonNegativeIntegerText("Sum max", sumMaxText);
    if (sumMinError) errors.push(sumMinError);
    if (sumMaxError) errors.push(sumMaxError);
    const sumMin = integerOrUndefined(sumMinText);
    const sumMax = integerOrUndefined(sumMaxText);
    if (sumMin !== undefined && sumMax !== undefined && sumMin > sumMax) {
      errors.push("Sum min cannot be greater than sum max.");
    }
    if (drawCount !== null) {
      const minPossible = minUniqueDrawSum(drawCount);
      const maxPossible = maxUniqueDrawSum(drawCount);
      if (sumMin !== undefined && sumMin > maxPossible) errors.push(`Sum min cannot exceed ${maxPossible} for this target window.`);
      if (sumMax !== undefined && sumMax < minPossible) errors.push(`Sum max cannot be below ${minPossible} for this target window.`);
    }

    const boundedCountFields: Array<[string, string]> = [
      ["Repeat count", previousRepeatCount],
      ["+/- count", previousNeighbourHitCount],
      ["Drought count", droughtBreakCount],
      ["Carry-over count", carryOverCount],
    ];
    for (const [label, value] of boundedCountFields) {
      const error = validateNonNegativeIntegerText(label, value);
      if (error) errors.push(error);
      const count = integerOrUndefined(value);
      if (numberLimit !== null && count !== undefined && count > numberLimit) {
        errors.push(`${label} cannot exceed ${numberLimit} for this target window.`);
      }
    }

    const confidenceError = validateNonNegativeIntegerText("Confidence", confidence);
    if (confidenceError) errors.push(confidenceError);
    const confidenceValue = integerOrUndefined(confidence);
    if (confidenceValue !== undefined && confidenceValue > 100) {
      errors.push("Confidence cannot exceed 100.");
    }

    return Array.from(new Set(errors));
  }, [
    bucketText,
    carryOverCount,
    confidence,
    doubleText,
    droughtBreakCount,
    numbersText,
    oddEvenRatio,
    previousNeighbourHitCount,
    previousRepeatCount,
    singleText,
    sumMaxText,
    sumMinText,
    targetKind,
    terminalDigitsText,
  ]);

  const fillFormFromInputs = (inputs: PredictionJournalInputs) => {
    lastNumbersAutoFillRef.current = emptyAutoFillSnapshot();
    setOddEvenRatio(inputs.oddEvenRatio ?? "");
    setNumbersText(numberText(inputs.numbers));
    setTerminalDigitsText(numberText(inputs.terminalDigits));
    const nextBuckets = emptyBuckets();
    for (const field of BUCKET_FIELDS) {
      nextBuckets[field.key] = inputs.monthlyBuckets?.[field.key] === undefined
        ? ""
        : String(inputs.monthlyBuckets[field.key]);
    }
    setBucketText(nextBuckets);
    setSingleText(inputs.singleDouble?.single === undefined ? "" : String(inputs.singleDouble.single));
    setDoubleText(inputs.singleDouble?.double === undefined ? "" : String(inputs.singleDouble.double));
    setSumMinText(inputs.sumRange?.min === undefined ? "" : String(inputs.sumRange.min));
    setSumMaxText(inputs.sumRange?.max === undefined ? "" : String(inputs.sumRange.max));
    setTrendRatio(inputs.trendRatio ?? "");
    setPreviousRepeatCount(inputs.previousRepeatCount === undefined ? "" : String(inputs.previousRepeatCount));
    setPreviousNeighbourHitCount(inputs.previousNeighbourHitCount === undefined ? "" : String(inputs.previousNeighbourHitCount));
    setDroughtBreakCount(inputs.droughtBreakCount === undefined ? "" : String(inputs.droughtBreakCount));
    setCarryOverCount(inputs.carryOverCount === undefined ? "" : String(inputs.carryOverCount));
    setConfidence(inputs.confidence === undefined ? "" : String(inputs.confidence));
    setSelectionReasonKey(inputs.selectionReason?.key === "other" ? "" : inputs.selectionReason?.key ?? "");
    setSelectionReasonIncludesOther(inputs.selectionReason?.key === "other" || Boolean(inputs.selectionReason?.detail));
    setSelectionReasonOtherText(inputs.selectionReason?.detail ?? "");
    setNotes(inputs.notes ?? "");
  };

  const resetForm = () => {
    setEditingId(null);
    setTargetKind("nextDraw");
    fillFormFromInputs({});
    setReviewStatus("notReviewed");
    setShowUnreviewedSaveAlert(false);
    setShowHistoricalPrizeCollisionSaveAlert(false);
    setShowValidationErrors(false);
  };

  const fillFormFromEntry = (entry: PredictionJournalEntry) => {
    const inputs = entry.inputs;
    revealDraftRegionRef.current = true;
    setEditingId(entry.id);
    setJournalViewMode("draft");
    setExpandedEntryId(null);
    setTargetKind(entry.targetKind);
    setReviewStatus(normalizeReviewStatus(entry.reviewStatus));
    setShowUnreviewedSaveAlert(false);
    setShowHistoricalPrizeCollisionSaveAlert(false);
    fillFormFromInputs(inputs);
    setMessage(`Editing prediction anchored to ${entry.anchorLatestDrawDate}.`);
  };

  useEffect(() => {
    if (journalViewMode !== "draft" || !revealDraftRegionRef.current) return;
    revealDraftRegionRef.current = false;
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      draftRegionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      draftRegionRef.current?.focus({ preventScroll: true });
    });
  }, [editingId, journalViewMode]);

  useEffect(() => {
    if (!newPredictionDraft) return;
    const draft = buildPredictionJournalDraftFromSetup(newPredictionDraft.setupSnapshot ?? getSetupSnapshot?.());
    setJournalViewMode("draft");
    setEditingId(null);
    setTargetKind(draft.targetKind);
    setReviewStatus("notReviewed");
    setShowUnreviewedSaveAlert(false);
    setShowHistoricalPrizeCollisionSaveAlert(false);
    fillFormFromInputs(draft.inputs);
    if (draft.inputs.numbers?.length) {
      applyNumbersAutoFill(numberText(draft.inputs.numbers), draft.targetKind);
    }
    setShowValidationErrors(false);
    setExpandedEntryId(null);
    setMessage(`New prediction draft created from current setup (${draft.sourceSummary.length} context lines). Review before saving.`);
  }, [newPredictionDraft?.id]);

  useEffect(() => {
    if (viewEntriesRequestId === undefined || viewEntriesRequestId <= 0) return;
    setJournalViewMode("entries");
    setExpandedEntryId(null);
  }, [viewEntriesRequestId]);

  const handleSave = (options: { allowHistoricalPrizeCollision?: boolean } = {}) => {
    if (!latestDraw && !editingEntry) {
      setMessage("A real latest draw is needed before a prediction can be anchored.");
      return;
    }
    if (validationErrors.length > 0) {
      setShowValidationErrors(true);
      setMessage("Fix the highlighted journal values before saving.");
      return;
    }
    if (!hasPredictionContent) {
      setMessage("Add a note or one optional prediction value before saving.");
      return;
    }
    if (editingEntry && !canEditPredictionJournalEntry(editingEntry, history)) {
      setMessage("This entry is locked because its target draw has arrived.");
      return;
    }
    if (draftHistoricalPrizeCollision.hasRarePrizeCollision && !options.allowHistoricalPrizeCollision) {
      setShowHistoricalPrizeCollisionSaveAlert(true);
      setMessage("Historical Division 1/2 collision found. Review it before saving, or save anyway if this is intentional.");
      return;
    }

    const nextEntry = buildPredictionJournalEntry({
      previousEntry: editingEntry ?? undefined,
      latestDraw: latestDraw ?? history[history.length - 1],
      targetKind,
      inputs: formInputs,
      setupSnapshot: getSetupSnapshot?.() ?? editingEntry?.setupSnapshot,
      reviewStatus,
      now: now(),
    });

    setEntries((prev) => {
      const withoutExisting = prev.filter((entry) => entry.id !== nextEntry.id);
      return [nextEntry, ...withoutExisting];
    });
    const savedAsUnreviewed = reviewStatus === "notReviewed";
    resetForm();
    setJournalViewMode("entries");
    setExpandedEntryId(null);
    setShowHistoricalPrizeCollisionSaveAlert(false);
    setShowUnreviewedSaveAlert(savedAsUnreviewed);
    setMessage(editingEntry ? "Prediction updated." : "Prediction saved.");
  };

  const handleDelete = (entry: PredictionJournalEntry) => {
    if (!canEditPredictionJournalEntry(entry, history)) {
      setMessage("Locked entries stay in the journal once their target draw has arrived.");
      return;
    }
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    if (editingId === entry.id) resetForm();
    if (expandedEntryId === entry.id) setExpandedEntryId(null);
    setMessage("Pending prediction removed.");
  };

  const handleArchiveToggle = (entry: PredictionJournalEntry, archive: boolean) => {
    const timestamp = now();
    setEntries((prev) => prev.map((item) => (
      item.id === entry.id
        ? {
            ...item,
            archivedAt: archive ? timestamp : undefined,
            updatedAt: timestamp,
          }
        : item
    )));
    if (archive && !showArchivedEntries && expandedEntryId === entry.id) {
      setExpandedEntryId(null);
    }
    setMessage(archive ? "Prediction archived. It is hidden from the active list but still kept for audit/export." : "Prediction restored to the active journal.");
  };

  const downloadJournalJson = () => {
    if (typeof document === "undefined" || typeof URL === "undefined") return;
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "windfall-prediction-journal.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleEmailToAuthor = async () => {
    if (typeof window === "undefined") return;
    const json = JSON.stringify(entries, null, 2);
    const subject = "Windfall Prediction Journal export";
    const header = [
      "Windfall Prediction Journal export",
      `Entries: ${entries.length}`,
      `Generated: ${now()}`,
      "",
    ].join("\n");
    let body = `${header}${json}`;
    let fallbackMessage = "";

    if (body.length > MAILTO_BODY_JSON_LIMIT) {
      body = [
        header,
        "The journal JSON was too large for a reliable mailto body.",
        "Windfall tried to copy the JSON to the clipboard; if that failed, it downloaded windfall-prediction-journal.json.",
      ].join("\n");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(json);
        fallbackMessage = " JSON copied to clipboard because it was too large for the email body.";
      } catch {
        downloadJournalJson();
        fallbackMessage = " JSON downloaded because it was too large for the email body and clipboard was unavailable.";
      }
    }

    const mailto = `mailto:${PREDICTION_JOURNAL_AUTHOR_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setMessage(`Email draft prepared for the prediction journal.${fallbackMessage || " Review and send it from your mail app."}`);
  };

  return (
    <section className="windfall-ledger-panel" aria-label="Prediction Journal & Scorecard">
      {journalViewMode === "draft" ? (
        <div
          ref={draftRegionRef}
          data-testid="prediction-journal-draft-region"
          tabIndex={-1}
          style={{ outline: "none" }}
        >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#51606f", maxWidth: 780 }}>
            Record your own draw hypotheses, then let Windfall score them only after real target draws arrive.
            Use New Prediction in the panel heading to draft from the current setup. No prediction fields are required; notes-only entries are allowed.
          </p>
        </div>
        <InfoHelp label="Prediction Journal help">
          The journal is observe-only. New Prediction drafts from current app state, entries are anchored to the latest real draw when saved, can be edited before the first target draw arrives, and lock once scoring has begun.
        </InfoHelp>
      </div>

      <JournalLegendBox title="New user guide" tone="soft" style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, fontSize: 12, lineHeight: 1.45 }}>
          <div>
            <strong>Fill only what you are testing.</strong> For example, enter <code>2:6</code> in Odd/even ratio, <code>7, 14, 22, 31</code> in Numbers, or <code>1, 4, 9</code> in Terminal digits.
          </div>
          <div>
            <strong>Use bucket-origin counts for target draws.</strong> For Next draw, predict how many of the 8 drawn balls will come from each current-month bucket, such as Undrawn <code>3</code>, 1x <code>4</code>, 2x <code>1</code>. Do not enter the whole month bucket state here.
          </div>
          <div>
            <strong>Save before the draw.</strong> At least one prediction entry per draw is useful; more entries are better when they test different ideas. Over time, this gives the app creators clean evidence for adjusting and improving the app's possible winning-entry logic.
          </div>
          <div>
            <strong>Review before saving.</strong> Leave drafts as Not reviewed until you have checked the copied setup values. Mark Reviewed by user when you are willing for later analysis to treat the entry as intentional evidence.
          </div>
        </div>
      </JournalLegendBox>

      <div
        className="windfall-prediction-journal-top-grid"
        style={{
          marginTop: 14,
        }}
      >
        <JournalLegendBox title="Anchor latest draw" tone="emphasis" className="windfall-prediction-journal-balanced-box">
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1f2937" }}>{latestDraw?.date ?? "No real draw loaded"}</div>
          <div className="windfall-prediction-journal-anchor-numbers">
            {latestDraw ? [...latestDraw.main, ...latestDraw.supp].join(", ") : "Load real draw history before saving."}
          </div>
        </JournalLegendBox>
        <JournalLegendBox title="Review status" tone="emphasis" className="windfall-prediction-journal-balanced-box" style={{ paddingBottom: 9 }}>
          <div style={{ display: "grid", gap: 7 }}>
            {(["notReviewed", "reviewedByUser"] as const).map((value) => (
              <label
                key={value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 32,
                  color: "#26313d",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="prediction-review-status"
                  value={value}
                  checked={reviewStatus === value}
                  onChange={() => handleReviewStatusChange(value)}
                />
                {reviewStatusLabels[value]}
              </label>
            ))}
          </div>
        </JournalLegendBox>
        <HigField label="Target window">
          <select value={targetKind} onChange={(event) => handleTargetKindChange(event.target.value)}>
            <option value="nextDraw">Next draw</option>
            <option value="next2Draws">Next 2 draws</option>
            <option value="next3Draws">Next 3 draws</option>
            <option value="restOfMonth">Rest of current month</option>
          </select>
          <div style={{ marginTop: 5, fontSize: 12, color: "#657385", fontWeight: 750 }}>
            Next draw: {nextDrawContext.weekday} {nextDrawContext.nextDrawDate}
          </div>
        </HigField>
        <HigField label="Odd/even ratio" help="Optional. Use mains + supps format, for example 2:6.">
          <input value={oddEvenRatio} onChange={(event) => setOddEvenRatio(event.target.value)} placeholder="2:6" />
        </HigField>
        <HigField label="Confidence" help="Optional 0-100 self-rating, stored for future calibration.">
          <input value={confidence} onChange={(event) => setConfidence(event.target.value)} inputMode="numeric" placeholder="65" />
        </HigField>
      </div>

      <div
        className="windfall-prediction-journal-text-grid"
        style={{
          marginTop: 12,
        }}
      >
        <div className="windfall-prediction-journal-text-stack">
          <JournalLegendBox
            title="Numbers"
            className="windfall-prediction-journal-text-box"
            help="Optional. Paste exact numbers or a shortlist; punctuation is fine. Editing this field auto-fills derived diagnostics while preserving fields you have manually changed."
          >
            <textarea
              aria-label="Numbers"
              value={numbersText}
              onChange={(event) => handleNumbersTextChange(event.target.value)}
              rows={3}
              placeholder="12, 14, 22, 27"
            />
          </JournalLegendBox>
          <JournalLegendBox
            title="Terminal digits"
            className="windfall-prediction-journal-text-box"
            help="Optional. 12 is accepted as terminal digit 2."
          >
            <textarea
              aria-label="Terminal digits"
              value={terminalDigitsText}
              onChange={(event) => setTerminalDigitsText(event.target.value)}
              rows={3}
              placeholder="1, 4, 9"
            />
          </JournalLegendBox>
        </div>
        <JournalLegendBox
          title="Selection reason"
          className="windfall-prediction-journal-text-box windfall-prediction-journal-reason-field"
          help="Optional. This stores a structured reason and keeps a matching Selection reason line in Notes for later review."
        >
          <div
            role="radiogroup"
            aria-label="Primary selection reason"
            className="windfall-prediction-journal-reason-options"
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                minHeight: 30,
                color: "#475569",
                fontSize: 12,
                fontWeight: 800,
                lineHeight: 1.3,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="prediction-selection-reason"
                value=""
                checked={selectionReasonKey === ""}
                onChange={() => handleSelectionReasonChange("")}
              />
              No shortcut
            </label>
            {selectionReasonOptions.map((option) => (
              <label
                key={option.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  minHeight: 30,
                  color: "#26313d",
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1.3,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="prediction-selection-reason"
                  value={option.key}
                  checked={selectionReasonKey === option.key}
                  onChange={() => handleSelectionReasonChange(option.key)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 30,
              marginTop: 4,
              color: "#26313d",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1.3,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={selectionReasonIncludesOther}
              onChange={(event) => handleSelectionReasonOtherToggle(event.target.checked)}
            />
            Other
          </label>
          {selectionReasonIncludesOther ? (
            <HigField label="Other reason">
              <input
                value={selectionReasonOtherText}
                onChange={(event) => handleSelectionReasonOtherTextChange(event.target.value)}
                placeholder="Describe the reason briefly"
              />
            </HigField>
          ) : null}
          <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.35 }}>
            The selected shortcut and optional Other note are saved as structured data and mirrored into Notes.
          </div>
        </JournalLegendBox>
        <JournalLegendBox
          title="Notes"
          className="windfall-prediction-journal-text-box windfall-prediction-journal-notes-field"
          help="Optional. Record your reasoning while it is fresh."
        >
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={8}
            placeholder="Why this looked plausible before the draw..."
          />
        </JournalLegendBox>
      </div>

      {renderHistoricalPrizeCollision(draftHistoricalPrizeCollision, "draft")}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <JournalLegendBox title="Target draw bucket-origin mix">
          <div style={{ fontSize: 12, color: "#657385", marginBottom: 8 }}>
            Counts of drawn balls expected to originate from each current-month bucket, not the full bucket state at entry time.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(58px, 1fr))", gap: 8 }}>
            {BUCKET_FIELDS.map((field) => (
              <label key={field.key} style={{ display: "grid", gap: 3, fontSize: 12, fontWeight: 700, color: "#51606f" }}>
                {field.label}
                <input
                  value={bucketText[field.key]}
                  onChange={(event) => setBucketText((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  inputMode="numeric"
                  style={{ minWidth: 0 }}
                />
              </label>
            ))}
          </div>
        </JournalLegendBox>
        <JournalLegendBox title="Shape checks">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(90px, 1fr))", gap: 8 }}>
            <HigField label="Single-digit">
              <input value={singleText} onChange={(event) => setSingleText(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Double-digit">
              <input value={doubleText} onChange={(event) => setDoubleText(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Sum min">
              <input value={sumMinText} onChange={(event) => setSumMinText(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Sum max">
              <input value={sumMaxText} onChange={(event) => setSumMaxText(event.target.value)} inputMode="numeric" />
            </HigField>
          </div>
        </JournalLegendBox>
        <JournalLegendBox title="Recorded diagnostics">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(100px, 1fr))", gap: 8 }}>
            <HigField label="U/D/F ratio">
              <input value={trendRatio} onChange={(event) => setTrendRatio(event.target.value)} placeholder="3/2/3" />
            </HigField>
            <HigField label="Repeat count">
              <input value={previousRepeatCount} onChange={(event) => setPreviousRepeatCount(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="±1/±2 count">
              <input value={previousNeighbourHitCount} onChange={(event) => setPreviousNeighbourHitCount(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Drought count">
              <input value={droughtBreakCount} onChange={(event) => setDroughtBreakCount(event.target.value)} inputMode="numeric" />
            </HigField>
            <HigField label="Carry-over count">
              <input value={carryOverCount} onChange={(event) => setCarryOverCount(event.target.value)} inputMode="numeric" />
            </HigField>
          </div>
        </JournalLegendBox>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <HigButton variant="primary" onClick={() => handleSave()} disabled={!latestDraw && !editingEntry}>
          {editingId ? "Update prediction" : "Save prediction"}
        </HigButton>
        <HigButton variant="quiet" onClick={resetForm}>Clear form</HigButton>
        <HigButton variant="secondary" onClick={() => void handleEmailToAuthor()} disabled={entries.length === 0}>Email to author</HigButton>
        {message ? <span role="status" style={{ fontSize: 12, color: "#51606f" }}>{message}</span> : null}
      </div>

      {showHistoricalPrizeCollisionSaveAlert ? (
        <div
          role="alert"
          data-testid="prediction-historical-prize-collision-save-alert"
          style={{
            marginTop: 10,
            border: "1px solid #fed7aa",
            borderRadius: 8,
            background: "#fff7ed",
            color: "#9a3412",
            padding: 10,
            fontSize: 12,
            fontWeight: 750,
            display: "grid",
            gap: 8,
          }}
        >
          <div>
            Historical Division 1/2 collision found. This is rare in the loaded real history and does not change future draw probability, but it is worth reviewing before saving.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <HigButton size="compact" variant="secondary" onClick={() => setShowHistoricalPrizeCollisionSaveAlert(false)}>
              Review
            </HigButton>
            <HigButton size="compact" variant="primary" onClick={() => handleSave({ allowHistoricalPrizeCollision: true })}>
              Save anyway
            </HigButton>
          </div>
        </div>
      ) : null}

      {showUnreviewedSaveAlert ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            border: "1px solid #fed7aa",
            borderRadius: 8,
            background: "#fff7ed",
            color: "#9a3412",
            padding: 10,
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          {UNREVIEWED_SAVE_ALERT}
        </div>
      ) : null}

      {showValidationErrors && validationErrors.length > 0 ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            border: "1px solid #fecaca",
            borderRadius: 8,
            background: "#fff1f2",
            color: "#991b1b",
            padding: 10,
            fontSize: 12,
          }}
        >
          <strong>Journal entry check</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {validationErrors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      ) : null}
        </div>
      ) : null}

      {journalViewMode === "entries" && message ? (
        <div role="status" style={{ marginBottom: 10, fontSize: 12, color: "#51606f", fontWeight: 750 }}>
          {message}
        </div>
      ) : null}

      {journalViewMode === "entries" && showUnreviewedSaveAlert ? (
        <div
          role="alert"
          style={{
            marginBottom: 10,
            border: "1px solid #fed7aa",
            borderRadius: 8,
            background: "#fff7ed",
            color: "#9a3412",
            padding: 10,
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          {UNREVIEWED_SAVE_ALERT}
        </div>
      ) : null}

      {journalViewMode === "entries" ? renderPredictionJournalFindingsReport(findingsReport) : null}
      {journalViewMode === "entries"
        ? renderLatestDrawReplay(latestDrawReplayRows, latestDraw, latestDrawReplayOmittedNoNumberCount, handleOpenLatestReplayEntry)
        : null}

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <h4 style={{ margin: 0, fontSize: 15 }}>Journal entries</h4>
          {archivedEntryCount > 0 ? (
            <HigButton size="compact" variant="quiet" onClick={() => setShowArchivedEntries((current) => !current)}>
              {showArchivedEntries ? "Hide archived" : `Show archived (${archivedEntryCount})`}
            </HigButton>
          ) : null}
        </div>
        {visibleScoredEntries.length === 0 ? (
          <div style={{ padding: 14, border: "1px dashed #cbd5e1", borderRadius: 8, color: "#657385" }}>
            {entries.length === 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ margin: 0 }}>
                  Record your own draw hypotheses, then let Windfall score them only after real target draws arrive.
                  Use New Prediction in the panel heading to draft from the current setup. No prediction fields are required; notes-only entries are allowed.
                </p>
                <p style={{ margin: 0, fontWeight: 750 }}>
                  The user manual is a good source of help for using the prediction feature.
                </p>
              </div>
            ) : (
              "No active journal entries. Show archived entries to review older cleared predictions."
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: "min(560px, 62vh)", overflowY: "auto", paddingRight: 2 }}>
            {visibleScoredEntries.map((entry) => {
                const isExpanded = expandedEntryId === entry.id;
                const detailId = `prediction-journal-entry-${domSafeId(entry.id)}`;
                const inputSummary = summarizePredictionInputs(entry);
                const scoreSummary = summarizeScoreResults(entry);
                const targetDrawDate = summarizeTargetDrawDate(entry);
                const immediateNextDrawScore = scoreImmediateNextDraw(entry);
                const normalizedReviewStatus = normalizeReviewStatus(entry.reviewStatus);
                const terminalDigitHistory = terminalDigitHistoryByEntryId.get(entry.id);
                const historicalPrizeCollision = historicalPrizeCollisionByEntryId.get(entry.id);
                const targetPrizeRows = scoreEntryTargetPrizeRows(entry);
                const bestTargetPrize = targetPrizeRows[0] ?? null;
                return (
                  <article key={entry.id} style={{ border: "1px solid #dbe3ec", borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      onClick={() => setExpandedEntryId((current) => current === entry.id ? null : entry.id)}
                      style={{
                        width: "100%",
                        minHeight: 44,
                        border: 0,
                        background: isExpanded ? "#f8fafc" : "#fff",
                        padding: "9px 12px",
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr) auto",
                        gap: 10,
                        alignItems: "center",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "#26313d",
                        font: "inherit",
                      }}
                    >
                      <span aria-hidden="true" style={{ color: "#526477", fontSize: 14, width: 14 }}>{isExpanded ? "▾" : "▸"}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ fontWeight: 800 }}>{targetLabels[entry.targetKind]}</span>
                          {targetDrawDate ? <span style={{ color: "#475569", fontSize: 12, fontWeight: 800 }}>{targetDrawDate}</span> : null}
                          <span style={statusPillStyle(entry.status)}>{statusLabels[entry.status]}</span>
                          <span style={reviewPillStyle(normalizedReviewStatus)}>{reviewStatusLabels[normalizedReviewStatus]}</span>
                          {bestTargetPrize ? (
                            <span data-testid="prediction-entry-target-prize-pill" style={replayPrizePillStyle(bestTargetPrize.division)}>
                              Prize {bestTargetPrize.division}
                            </span>
                          ) : null}
                          {entry.archivedAt ? <span style={archivedPillStyle}>Archived</span> : null}
                          <span style={{ color: "#657385", fontSize: 12 }}>
                            Anchored after {entry.anchorLatestDrawDate} · revision {entry.revision}
                          </span>
                        </span>
                        <span style={{ display: "block", marginTop: 2, color: "#51606f", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {scoreSummary}
                          {inputSummary.length ? ` · ${inputSummary.join(" · ")}` : ""}
                          {entry.canEdit ? " · Editable until first target draw appears" : " · Locked after target draw arrived"}
                        </span>
                        {renderCollapsedPickedNumbers(entry.inputs.numbers)}
                      </span>
                      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{isExpanded ? "Hide" : "Open"}</span>
                    </button>
                    {isExpanded ? (
                      <div id={detailId} style={{ borderTop: "1px solid #e2e8f0", padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, color: "#657385" }}>
                            Anchored after {entry.anchorLatestDrawDate} · revision {entry.revision} · {reviewStatusLabels[normalizedReviewStatus]}
                            {entry.reviewedAt ? ` ${new Date(entry.reviewedAt).toLocaleString()}` : ""}
                            {" · "}
                            {entry.canEdit ? "Editable until first target draw appears" : "Locked after target draw arrived"}
                            {entry.archivedAt ? ` · Archived ${new Date(entry.archivedAt).toLocaleString()}` : ""}
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {entry.archivedAt ? (
                              <HigButton size="compact" variant="secondary" onClick={() => handleArchiveToggle(entry, false)}>
                                Restore
                              </HigButton>
                            ) : entry.canEdit ? (
                              <>
                                <HigButton size="compact" variant="secondary" onClick={() => fillFormFromEntry(entry)}>Edit prediction</HigButton>
                                <HigButton size="compact" variant="danger" onClick={() => handleDelete(entry)}>Delete</HigButton>
                              </>
                            ) : (
                              <HigButton size="compact" variant="secondary" onClick={() => handleArchiveToggle(entry, true)}>
                                Archive
                              </HigButton>
                            )}
                          </div>
                        </div>
                        {entry.inputs.notes ? (
                          <p style={{ margin: "8px 0 0", color: "#334155", fontSize: 13 }}>{entry.inputs.notes}</p>
                        ) : null}
                        {entry.setupSummary ? (
                          <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 6 }}>Saved setup</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {[
                                entry.setupSummary.window,
                                `Odd/even ratios: ${entry.setupSummary.oddEvenRatios}`,
                                ...entry.setupSummary.generation,
                                ...entry.setupSummary.filters,
                                ...entry.setupSummary.selections,
                              ].map((line) => (
                                <span
                                  key={line}
                                  style={{
                                    border: "1px solid #dbe3ec",
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                    background: "#fff",
                                    color: "#475569",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {line}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {entry.provenance ? renderStructuredProvenance(entry.provenance) : null}
                        {terminalDigitHistory ? renderTerminalDigitHistory(terminalDigitHistory) : null}
                        {historicalPrizeCollision ? renderHistoricalPrizeCollision(historicalPrizeCollision, "entry") : null}
                        {entry.reason ? <div style={{ marginTop: 8, color: "#8a4b00", fontSize: 12 }}>{entry.reason}</div> : null}
                        {renderJournalEntryTargetPrizeReplay(targetPrizeRows)}
                        {immediateNextDrawScore ? (
                          <section
                            data-testid="prediction-immediate-next-draw"
                            aria-label="Immediate next draw score"
                            style={{
                              marginTop: 10,
                              border: "1px solid #dbe3ec",
                              borderRadius: 8,
                              padding: 10,
                              background: "#fff",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Immediate next draw</div>
                                <div style={{ fontSize: 17, fontWeight: 850, color: "#26313d", marginTop: 2 }}>
                                  {immediateNextDrawScore.hitCount} of {immediateNextDrawScore.predictedCount} matched
                                </div>
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                  {immediateNextDrawScore.date} · matched against next draw mains + supps
                                </div>
                              </div>
                              <span style={scoreResultPillStyle(immediateNextDrawScore.result)}>
                                {scoreResultLabel(immediateNextDrawScore.result)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: 8,
                                marginTop: 10,
                                fontSize: 12,
                              }}
                            >
                              <div>
                                <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Saved numbers</div>
                                <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{immediateNextDrawScore.predicted}</div>
                              </div>
                              <div>
                                <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Actual next draw</div>
                                <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{immediateNextDrawScore.actual}</div>
                              </div>
                              <div>
                                <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Outcome</div>
                                <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{immediateNextDrawScore.detail}</div>
                              </div>
                            </div>
                          </section>
                        ) : null}
                        {entry.scores.length ? (
                          <div
                            data-testid="prediction-scorecard-grid"
                            role="list"
                            aria-label="Prediction scorecard checks"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                              gap: 8,
                              marginTop: 10,
                            }}
                          >
                            {entry.scores.map((score) => (
                              <section
                                key={score.key}
                                data-testid="prediction-scorecard-tile"
                                role="listitem"
                                aria-label={`${score.label} scorecard`}
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 8,
                                  padding: 10,
                                  background: "#f8fafc",
                                  minWidth: 0,
                                }}
                              >
                                <div style={{ fontWeight: 850, color: "#26313d", marginBottom: 8, fontSize: 13 }}>
                                  {score.label}
                                </div>
                                <div style={{ display: "grid", gap: 7, fontSize: 12 }}>
                                  <div>
                                    <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Predicted</div>
                                    <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{score.predicted}</div>
                                  </div>
                                  <div>
                                    <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 2 }}>Actual</div>
                                    <div style={{ color: "#26313d", overflowWrap: "anywhere" }}>{score.actual}</div>
                                    {score.detail ? <div style={{ color: "#64748b", marginTop: 3, overflowWrap: "anywhere" }}>{score.detail}</div> : null}
                                  </div>
                                  <div>
                                    <div style={{ color: "#64748b", fontWeight: 800, marginBottom: 3 }}>Result</div>
                                    <span style={scoreResultPillStyle(score.result)}>{scoreResultLabel(score.result)}</span>
                                  </div>
                                </div>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>Awaiting target draw before score rows are available.</div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
};
