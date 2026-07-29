import { beforeEach, describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  buildPredictionJournalDraftFromSetup,
  buildPredictionJournalEntry,
  canEditPredictionJournalEntry,
  clearPredictionJournalEntries,
  computePredictionJournalStatus,
  loadPredictionJournalEntries,
  scorePredictionJournalEntry,
  savePredictionJournalEntries,
} from "./predictionJournal";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("predictionJournal", () => {
  beforeEach(() => {
    clearPredictionJournalEntries();
  });

  it("creates partial date-anchored predictions without requiring every field", () => {
    const entry = buildPredictionJournalEntry({
      id: "prediction-1",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      targetKind: "nextDraw",
      inputs: {
        oddEvenRatio: " 2 : 6 ",
        numbers: [3, 3, 46, 4, 1, Number.NaN],
        terminalDigits: [1, 1, 12, -1, 9],
        notes: "   Watching odd/even only.   ",
      },
    });

    expect(entry).toMatchObject({
      id: "prediction-1",
      createdAt: "2026-06-24T10:30:00.000Z",
      updatedAt: "2026-06-24T10:30:00.000Z",
      revision: 1,
      anchorLatestDrawDate: "6/24/26",
      targetKind: "nextDraw",
      inputs: {
        oddEvenRatio: "2:6",
        numbers: [1, 3, 4],
        terminalDigits: [1, 2, 9],
        notes: "Watching odd/even only.",
      },
    });
    expect(entry.anchorDrawFingerprint).toContain("6/24/26");
  });

  it("records user review status separately from scoring status", () => {
    const initial = buildPredictionJournalEntry({
      id: "prediction-reviewed",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      targetKind: "nextDraw",
      reviewStatus: "reviewedByUser",
      inputs: { notes: "Manually reviewed." },
    });

    expect(initial.reviewStatus).toBe("reviewedByUser");
    expect(initial.reviewedAt).toBe("2026-06-24T10:30:00.000Z");
    expect(initial.archivedAt).toBeUndefined();

    const edited = buildPredictionJournalEntry({
      previousEntry: initial,
      now: "2026-06-24T11:00:00.000Z",
      latestDraw: draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      targetKind: "nextDraw",
      reviewStatus: "notReviewed",
      inputs: { notes: "Needs another look." },
    });

    expect(edited.reviewStatus).toBe("notReviewed");
    expect(edited.reviewedAt).toBeUndefined();
    expect(edited.revision).toBe(2);
  });

  it("keeps aggregate odd/even ratios for multi-draw target windows", () => {
    const entry = buildPredictionJournalEntry({
      id: "prediction-aggregate-ratio",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      targetKind: "next3Draws",
      inputs: { oddEvenRatio: "12:12" },
    });

    expect(entry.inputs.oddEvenRatio).toBe("12:12");
  });

  it("stays editable until the first target draw arrives, then locks", () => {
    const historyAtEntry = [
      draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
      draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
    ];
    const entry = buildPredictionJournalEntry({
      id: "prediction-2",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: historyAtEntry[1],
      targetKind: "nextDraw",
      inputs: { oddEvenRatio: "3:5" },
    });

    expect(canEditPredictionJournalEntry(entry, historyAtEntry)).toBe(true);
    expect(computePredictionJournalStatus(entry, historyAtEntry).status).toBe("pending");

    const historyWithNextDraw = [
      ...historyAtEntry,
      draw("6/26/26", [1, 7, 12, 14, 22, 34], [44, 45]),
    ];

    expect(canEditPredictionJournalEntry(entry, historyWithNextDraw)).toBe(false);
    expect(computePredictionJournalStatus(entry, historyWithNextDraw).status).toBe("scored");
  });

  it("scores only against draws after the anchor and uses prior monthly state for bucket mix", () => {
    const history = [
      draw("6/1/26", [1, 2, 3, 10, 20, 30], [40, 41]),
      draw("6/3/26", [4, 5, 6, 11, 21, 31], [42, 43]),
      draw("6/5/26", [1, 7, 12, 14, 22, 34], [44, 45]),
    ];
    const entry = buildPredictionJournalEntry({
      id: "prediction-3",
      now: "2026-06-03T10:30:00.000Z",
      latestDraw: history[1],
      targetKind: "nextDraw",
      inputs: {
        oddEvenRatio: "3:5",
        numbers: [1, 12, 20, 45],
        monthlyBuckets: { undrawn: 7, times1: 1 },
        singleDouble: { single: 2, double: 6 },
        sumRange: { min: 170, max: 190 },
        terminalDigits: [1, 4, 9],
      },
    });

    const scored = scorePredictionJournalEntry(entry, history);
    const byKey = new Map(scored.scores.map((score) => [score.key, score]));

    expect(scored.status).toBe("scored");
    expect(scored.targetDraws.map((target) => target.date)).toEqual(["6/5/26"]);
    expect(byKey.get("oddEvenRatio")).toMatchObject({ result: "hit", predicted: "3:5", actual: "3:5" });
    expect(byKey.get("numbers")).toMatchObject({ result: "partial", hitCount: 3, predictedCount: 4 });
    expect(byKey.get("numbers")?.detail).toContain("1, 12, 45");
    expect(byKey.get("monthlyBuckets")).toMatchObject({
      result: "hit",
      predicted: "Undrawn 7, 1x 1",
      actual: "Undrawn 7, 1x 1",
    });
    expect(byKey.get("singleDouble")).toMatchObject({ result: "hit", predicted: "2 single / 6 double", actual: "2 single / 6 double" });
    expect(byKey.get("sumRange")).toMatchObject({ result: "hit", predicted: "170-190", actual: "179" });
    expect(byKey.get("terminalDigits")).toMatchObject({ result: "partial", hitCount: 2, predictedCount: 3 });
  });

  it("captures the app setup snapshot and readable provenance summary at save time", () => {
    const setupSnapshot = {
      windowEnabled: true,
      windowMode: "Custom",
      customDrawCount: 13,
      selectedRatios: ["5:3", "4:4"],
      knobs: { enableSDE1: true, enableHC3: false },
      sumFilter: { enabled: true, min: 120, max: 220, includeSupp: true },
      scoringGenerationInfluence: "normal",
      monthEndCarryOverBiasEnabled: true,
      monthEndCarryOverStrength: "strong",
      monthlyConstructiveEnabled: true,
      acceptanceNeedsEnabled: true,
      acceptanceNeedsCounts: {
        undrawn: 2,
        times1: 3,
        times2: 0,
        times3: 1,
        times4: 0,
        times5: 0,
        times6: 0,
        times7: 0,
        times8: 0,
      },
      acceptanceNeedsHardExclude: true,
      previousNeighbourConstraintNumbers: [12, 14],
      userSelectedNumbers: [1, 2, 3],
      excludedNumbers: [44],
      hotColdForcedNumbers: [10],
      hotColdExcludedNumbers: [20],
      droughtBreakSelectedNumbers: [31],
      generationForcedNumbers: [10, 31],
      allExcludedNumbers: [20, 44],
      sde1Exclusions: [44],
      droughtBreakStrictShortlistNumbers: [31, 33],
      droughtBreakEmpiricalHazardNumbers: [20, 31, 34],
      droughtBreakShortlistTop: 8,
      droughtBreakStrictThreshold: 6,
      favoritePanelIds: ["prediction-journal"],
    } as any;

    const entry = buildPredictionJournalEntry({
      id: "prediction-setup-1",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      targetKind: "nextDraw",
      inputs: { numbers: [20, 31, 44], notes: "Context matters." },
      setupSnapshot,
    });

    expect(entry.setupSnapshot).toEqual(setupSnapshot);
    expect(entry.provenance).toMatchObject({
      version: 1,
      selectedNumbers: [20, 31, 44],
      inclusionSources: {
        effectiveGenerationForced: [10, 31],
      },
      exclusionSources: {
        effectiveGeneration: [20, 44],
        sde1: [44],
      },
      droughtBreakShortlist: {
        scope: "mains+supps",
        strictThreshold: 6,
        shortlistTop: 8,
        strictDroughtShortlistNumbers: [31, 33],
        empiricalHazardShortlistNumbers: [20, 31, 34],
        selectedAnyShortlistNumbers: [20, 31],
        selectedOutsideShortlistNumbers: [44],
        selectedStrictDroughtNumbers: [31],
        selectedEmpiricalHazardNumbers: [20, 31],
        selectedBothNumbers: [31],
        anySelectedFromShortlist: true,
        allSelectedFromShortlist: false,
      },
    });
    expect(entry.provenance?.droughtBreakShortlist.classifications).toEqual([
      expect.objectContaining({ number: 20, category: "empirical-hazard", label: "Empirical hazard" }),
      expect.objectContaining({ number: 31, category: "strict-and-empirical", label: "Strict drought 6+ and empirical hazard" }),
      expect.objectContaining({ number: 44, category: "outside-shortlist", label: "Outside current drought-break shortlist" }),
    ]);
    expect(entry.setupSummary).toMatchObject({
      window: "WFMQYH Custom 13",
      oddEvenRatios: "5:3, 4:4",
      generation: expect.arrayContaining([
        "Scoring influence: normal",
        "Month-end carry-over: strong",
        "Use counts when constructing candidates: on",
        "Acceptance needs counts: 0x≥2 · 1x≥3 · 3x≥1",
        "Extra MiAN post-filter: hard exclude",
      ]),
      filters: expect.arrayContaining([
        "SDE1 on (1)",
        "HC3 off",
        "Sum filter: 120-220",
        "Previous +/- targets: 2",
      ]),
      selections: expect.arrayContaining([
        "User-selected strip: 3",
        "User exclusions: 1",
        "Hot/cold forced: 1",
        "Hot/cold excluded: 1",
        "Drought-break forced: 1",
      ]),
    });
  });

  it("builds a new prediction draft from the current app setup", () => {
    const draft = buildPredictionJournalDraftFromSetup({
      windowEnabled: true,
      windowMode: "Custom",
      customDrawCount: 13,
      selectedRatios: ["5:3"],
      useTrickyRule: false,
      knobs: { enableSDE1: true, enableHC3: false },
      userSelectedNumbers: [1, 2, 3],
      trendSelectedNumbers: [10],
      previousNeighbourConstraintNumbers: [12, 14],
      hotColdForcedNumbers: [20],
      droughtBreakSelectedNumbers: [31],
      selectedCarryOverBoostNumbers: [33, 34],
      excludedNumbers: [44],
      hotColdExcludedNumbers: [45],
      generationForcedNumbers: [10, 12, 14, 20, 31],
      generationExcludedNumbers: [44, 45],
      allExcludedNumbers: [44, 45],
      sde1Exclusions: [4, 6],
      droughtBreakStrictShortlistNumbers: [31, 33],
      droughtBreakEmpiricalHazardNumbers: [20, 31, 34],
      droughtBreakShortlistTop: 8,
      droughtBreakStrictThreshold: 6,
      monthlyConstructiveEnabled: true,
      acceptanceNeedsEnabled: true,
      acceptanceNeedsCounts: {
        undrawn: 2,
        times1: 3,
        times2: 0,
        times3: 1,
        times4: 0,
        times5: 0,
        times6: 0,
        times7: 0,
        times8: 0,
      },
      scoringGenerationInfluence: "normal",
      selectedBoostEnabled: true,
      selectedBoostFactor: 4,
    } as any);

    expect(draft.targetKind).toBe("nextDraw");
    expect(draft.inputs.oddEvenRatio).toBe("5:3");
    expect(draft.inputs.numbers).toEqual([1, 2, 3, 10, 12, 14, 20, 31]);
    expect(draft.inputs.monthlyBuckets).toEqual({ undrawn: 2, times1: 3, times3: 1 });
    expect(draft.inputs.notes).toContain("New prediction draft created from the current app setup.");
    expect(draft.inputs.notes).toContain("Additional selected/forced numbers kept in this note only: 33, 34.");
    expect(draft.inputs.notes).toContain("SDE1: ON; exclusions 4, 6.");
    expect(draft.inputs.notes).toContain("HC3: OFF.");
    expect(draft.inputs.notes).toContain("Exclusion sources: user 44; hot/cold 45;");
    expect(draft.inputs.notes).toContain("Drought-break shortlist check: matched 20, 31; all selected from shortlist: no; Strict drought 6+: 31; Empirical hazard: 20, 31; outside shortlist: 1, 2, 3, 10, 12, 14.");
  });

  it("distinguishes Monthly Draws Summary construction from the extra MiAN post-filter", () => {
    const setupSnapshot = {
      windowEnabled: true,
      windowMode: "Custom",
      customDrawCount: 13,
      selectedRatios: [],
      knobs: {},
      scoringGenerationInfluence: "off",
      monthEndCarryOverBiasEnabled: false,
      monthlyConstructiveEnabled: true,
      acceptanceNeedsEnabled: false,
      acceptanceNeedsCounts: {
        undrawn: 2,
        times1: 1,
        times2: 0,
        times3: 0,
        times4: 0,
        times5: 0,
        times6: 0,
        times7: 0,
        times8: 0,
      },
    } as any;

    const entry = buildPredictionJournalEntry({
      id: "prediction-setup-constructive-only",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      targetKind: "nextDraw",
      inputs: { notes: "Use counts only." },
      setupSnapshot,
    });

    expect(entry.setupSummary?.generation).toEqual(expect.arrayContaining([
      "Use counts when constructing candidates: on",
      "Acceptance needs counts: 0x≥2 · 1x≥1",
      "Extra MiAN post-filter: off",
    ]));
    expect(entry.setupSummary?.generation).not.toContain("MiAN filter: off");
  });

  it("persists journal entries locally without treating malformed storage as real entries", () => {
    const entry = buildPredictionJournalEntry({
      id: "prediction-4",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      targetKind: "nextDraw",
      inputs: { notes: "Ratio only this time." },
    });

    savePredictionJournalEntries([entry]);
    expect(loadPredictionJournalEntries()).toEqual([entry]);

    window.localStorage.setItem("windfall:prediction-journal:v1", "not-json");
    expect(loadPredictionJournalEntries()).toEqual([]);
  });

  it("normalizes older saved entries as not reviewed when loading", () => {
    const legacyEntry = {
      id: "prediction-legacy",
      createdAt: "2026-06-24T10:30:00.000Z",
      updatedAt: "2026-06-24T10:30:00.000Z",
      revision: 1,
      anchorLatestDrawDate: "6/24/26",
      anchorDrawFingerprint: "6/24/26|main:1,3,5,7,9,11|supp:13,15",
      targetKind: "nextDraw",
      inputs: { notes: "Older saved shape." },
    };

    window.localStorage.setItem("windfall:prediction-journal:v1", JSON.stringify([legacyEntry]));

    expect(loadPredictionJournalEntries()).toMatchObject([
      {
        id: "prediction-legacy",
        reviewStatus: "notReviewed",
        reviewedAt: undefined,
        archivedAt: undefined,
      },
    ]);
  });
});
