import { describe, expect, it } from "vitest";
import { getPredictionSelectionReasons, normalizePredictionSelectionReasons } from "./predictionSelectionReasons";
import { appendPredictionCaptureRun, buildPredictionCaptureBatch, createPredictionCaptureSession, parsePredictionCaptureRows, predictionCaptureGameReasons, scorePredictionCaptureBatch } from "./predictionCapture";
import { buildPredictionJournalEntry, parsePredictionJournalBackup, scorePredictionJournalEntry, serializePredictionJournalBackup } from "./predictionJournal";

describe("prediction game reasons and six-number entry integrity", () => {
  it("reads legacy primary plus Other without changing the original record", () => {
    const legacy = { selectionReason: { version: 1 as const, key: "dgaPattern" as const, label: "old", detail: "My observation" } };
    expect(getPredictionSelectionReasons(legacy).map(reason => reason.key)).toEqual(["dgaPattern", "other"]);
    expect(legacy.selectionReason.label).toBe("old");
    expect(getPredictionSelectionReasons({ ...legacy, selectionReasons: [] })).toEqual([]);
  });

  it("normalises, deduplicates and rejects unknown reason identifiers", () => {
    expect(normalizePredictionSelectionReasons([{ key: "dgaPattern", label: "fake" }, { key: "dgaPattern" }, { key: "invented" }]))
      .toEqual([{ version: 1, key: "dgaPattern", label: "Observed pattern in DGA grid" }]);
  });

  it("accepts complete six-number rows and rejects incomplete, eight-value, labelled and malformed games", () => {
    const rows = parsePredictionCaptureRows("1,2,3,4,5,6\n7 8 9 10 11 12\n1,2,3,4,5\n1,2,3,4,5,6,7,8\n1,1,2,3,4,5\n1.5,2,3,4,5\nGame 1: 2,3,4,5,6\n1,2,3,4,5,46", { playedOnly: true });
    expect(rows.slice(0, 2).every(row => row.game?.length === 6 && !row.error)).toBe(true);
    expect(rows.slice(2).every(row => Boolean(row.error))).toBe(true);
    expect(parsePredictionCaptureRows("1,2,3,4,5,6,7,8")[0].forecast).not.toBeNull();
  });

  it("uses exact stored run matches rather than declared reasons to establish game provenance", () => {
    const now = "2026-06-24T10:00:00Z";
    const capture = appendPredictionCaptureRun(createPredictionCaptureSession(now), {
      action: "generated", candidates: [{ main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }],
      setupSnapshot: {}, windowLabel: "Recorded scope", windowDrawCount: 60, now,
    }).session;
    const batch = buildPredictionCaptureBatch({ session: capture, externalRows: parsePredictionCaptureRows("6 5 4 3 2 1\n1 2 3 4 5 9", { playedOnly: true }), includeAnalyticalForecasts: false, now });
    batch.selectionReasons = normalizePredictionSelectionReasons([{ key: "dgaPattern" }]);
    expect(batch.sourceSummary.capturedGames).toBe(1);
    expect(batch.sourceSummary.externalGames).toBe(1);
    expect(batch.runSnapshots).toHaveLength(1);
    expect(batch.games.find(game => game.numbers.includes(9))?.provenance.runIds).toEqual([]);
    expect(batch.analyticalForecasts).toEqual([]);
  });

  it("preserves inherited and explicitly empty custom reasons, sources and prize scoring through backup", () => {
    const batch = buildPredictionCaptureBatch({ externalRows: parsePredictionCaptureRows("1,2,3,4,5,6\n1,2,3,4,5,6\n1,7,8,30,31,32"), now: "2026-06-24T00:00:00Z" });
    batch.selectionReasons = normalizePredictionSelectionReasons([{ key: "dgaPattern" }, { key: "selectionInsights" }]);
    batch.games.find(game => game.numbers.includes(30))!.selectionReasonOverride = [];
    const source = { date: "2026-06-24", main: [10, 11, 12, 13, 14, 15], supp: [16, 17] };
    const entry = buildPredictionJournalEntry({ latestDraw: source, targetKind: "nextDraw", inputMode: "playedGames", captureBatch: batch,
      inputs: { selectionReasons: batch.selectionReasons }, now: "2026-06-24T10:00:00Z" });
    const restored = parsePredictionJournalBackup(serializePredictionJournalBackup([entry])).entries[0];
    const saved = restored.captureBatch!;
    expect(restored.inputMode).toBe("playedGames");
    expect(saved.sourceSummary.purchasedLines).toBe(3);
    expect(saved.games.every(game => game.provenance.status === "external")).toBe(true);
    expect(predictionCaptureGameReasons(saved, saved.games.find(game => game.numbers.includes(6))!)).toHaveLength(2);
    expect(predictionCaptureGameReasons(saved, saved.games.find(game => game.numbers.includes(30))!)).toEqual([]);
    const target = { date: "2026-06-26", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] };
    const score = scorePredictionCaptureBatch(saved, target)!;
    expect(score.gameScores.find(game => game.numbers.includes(6))?.division).toBe("Div1");
    expect(score.gameScores.find(game => game.numbers.includes(30))?.division).toBe("Div6");
    expect(scorePredictionJournalEntry(restored, [source, target]).scores).toEqual([]);
  });
});
