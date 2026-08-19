import { describe, expect, it } from "vitest";

import {
  PREDICTION_JOURNAL_FINDINGS_VERSION,
  buildPredictionJournalFindingsReport,
} from "./predictionJournalFindings";
import type { ScoredPredictionJournalEntry } from "./predictionJournal";

const scoredEntry = (
  id: string,
  options: Partial<ScoredPredictionJournalEntry> = {},
): ScoredPredictionJournalEntry => ({
  id,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  revision: 1,
  anchorLatestDrawDate: "6/1/26",
  anchorDrawFingerprint: `6/1/26|${id}`,
  targetKind: "nextDraw",
  reviewStatus: "reviewedByUser",
  inputs: {},
  status: "scored",
  canEdit: false,
  targetDraws: [],
  scores: [
    { key: "oddEvenRatio", label: "Odd/even ratio", predicted: "4:4", actual: "4:4", result: "hit" },
  ],
  ...options,
});

describe("buildPredictionJournalFindingsReport", () => {
  it("is versioned and excludes unreviewed, archived, and unscored entries by default", () => {
    const report = buildPredictionJournalFindingsReport([
      scoredEntry("reviewed-scored"),
      scoredEntry("unreviewed", { reviewStatus: "notReviewed" }),
      scoredEntry("archived", { archivedAt: "2026-06-08T00:00:00.000Z" }),
      scoredEntry("pending", { status: "pending", scores: [] }),
    ]);

    expect(report.version).toBe(PREDICTION_JOURNAL_FINDINGS_VERSION);
    expect(report.scopeLabel).toBe("Reviewed scored entries only");
    expect(report.totalEntries).toBe(4);
    expect(report.eligibleEntries).toBe(1);
    expect(report.excludedUnreviewedEntries).toBe(1);
    expect(report.excludedArchivedEntries).toBe(1);
    expect(report.excludedUnscoredEntries).toBe(1);
    expect(report.findings.some((finding) => finding.title === "Not enough reviewed scored entries yet")).toBe(true);
    expect(report.caveats.join(" ")).toContain("does not influence candidate generation");
  });

  it("flags repeated weak setup groups without treating them as probabilities", () => {
    const entries = [1, 2, 3].map((index) => scoredEntry(`weak-${index}`, {
      inputs: { oddEvenRatio: "2:6" },
      setupSummary: {
        window: "WFMQYH Custom 13",
        oddEvenRatios: "2:6",
        generation: ["Scoring influence: off"],
        filters: ["SDE1 off", "HC3 off"],
        selections: [],
      },
      scores: [
        { key: "oddEvenRatio", label: "Odd/even ratio", predicted: "2:6", actual: "4:4", result: "miss" },
        { key: "numbers", label: "Numbers", predicted: "1, 2, 3", actual: "4, 5, 6", result: "miss" },
      ],
    }));

    const report = buildPredictionJournalFindingsReport(entries);
    const weakFinding = report.findings.find((finding) => finding.severity === "caution");

    expect(weakFinding?.title).toContain("Repeated weak setup");
    expect(weakFinding?.evidence).toContain("3 reviewed scored entries");
    expect(weakFinding?.recommendation).toContain("Change one variable at a time");
    expect(report.groups.some((group) => group.label === "History window: WFMQYH Custom 13")).toBe(true);
    expect(report.caveats.join(" ")).toContain("not a lottery probability");
  });

  it("flags repeated useful groups only as worth watching", () => {
    const entries = [1, 2, 3].map((index) => scoredEntry(`useful-${index}`, {
      inputs: { oddEvenRatio: "4:4" },
      setupSummary: {
        window: "WFMQYH Custom 50",
        oddEvenRatios: "4:4",
        generation: ["Latest +/-1 support: on"],
        filters: ["SDE1 on (3)", "HC3 off"],
        selections: ["User-selected strip: 4"],
      },
      scores: [
        { key: "oddEvenRatio", label: "Odd/even ratio", predicted: "4:4", actual: "4:4", result: "hit" },
        { key: "terminalDigits", label: "Terminal digits", predicted: "1, 2", actual: "1, 3", result: "partial" },
      ],
    }));

    const report = buildPredictionJournalFindingsReport([
      ...entries,
      scoredEntry("weak-baseline", {
        inputs: { oddEvenRatio: "1:7" },
        scores: [
          { key: "oddEvenRatio", label: "Odd/even ratio", predicted: "1:7", actual: "4:4", result: "miss" },
          { key: "numbers", label: "Numbers", predicted: "1, 2, 3", actual: "4, 5, 6", result: "miss" },
        ],
      }),
    ], { minGroupEntries: 3 });

    const usefulFinding = report.findings.find((finding) => finding.severity === "useful");

    expect(usefulFinding?.title).toContain("Worth watching");
    expect(usefulFinding?.detail).toContain("scoring better than the journal");
    expect(usefulFinding?.recommendation).toContain("do not promote it into generation");
  });

  it("groups saved selection reasons as future-minable journal signals", () => {
    const entries = [1, 2, 3].map((index) => scoredEntry(`reason-${index}`, {
      inputs: {
        selectionReason: {
          version: 1,
          key: "dgaPattern",
          label: "Observed pattern in DGA grid",
        },
      },
      scores: [
        { key: "numbers", label: "Numbers", predicted: "1, 2, 3", actual: "1, 4, 5", result: "partial" },
      ],
    }));

    const report = buildPredictionJournalFindingsReport(entries);

    expect(report.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "Selection reason",
        label: "Observed pattern in DGA grid",
        entryCount: 3,
      }),
    ]));
  });

  it("groups strict drought quota provenance as a watched signal", () => {
    const entries = [1, 2, 3].map((index) => scoredEntry(`strict-drought-quota-${index}`, {
      provenance: {
        strictDroughtQuota: {
          version: 1,
          mode: "advised",
          manualMin: 1,
          effectiveMin: 2,
          active: true,
          eligibleNumbers: [7, 12, 39],
          shortlistTop: 8,
          strictThreshold: 6,
          advice: {
            shouldApplyQuota: true,
            recommendedMinCount: 2,
            confidence: "moderate",
            source: "draw-ordinal",
            sourceLabel: "All D4 rows",
            reason: "All D4 rows replay had positive support.",
            traceLabel: "Strict drought quota advice: moderate",
            trials: 25,
            averageHits: 1.72,
            expectedRandomAverageHits: 1.42,
            oneToThreeHitRate: 0.88,
            expectedRandomOneToThreeHitRate: 0.797,
            oneToThreeLift: 0.083,
            zeroHitRate: 0.04,
            expectedRandomZeroHitRate: 0.18,
          },
        },
      } as any,
      scores: [
        { key: "numbers", label: "Numbers", predicted: "7, 12, 39", actual: "7, 14, 39", result: "partial" },
      ],
    }));

    const report = buildPredictionJournalFindingsReport(entries);

    expect(report.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "Watched signal",
        label: "Strict drought quota SDSR-advised",
        entryCount: 3,
      }),
      expect.objectContaining({
        category: "Watched signal",
        label: "Strict drought quota min 2",
        entryCount: 3,
      }),
    ]));
  });
});
