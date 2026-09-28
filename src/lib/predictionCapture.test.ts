import { describe, expect, it } from "vitest";
import type { AppPresetSnapshot } from "./presets";
import {
  appendPredictionCaptureRun,
  buildPredictionCaptureBatch,
  createPredictionCaptureSession,
  parsePredictionCaptureRows,
  scorePredictionCaptureBatch,
  summarizePredictionCaptureGames,
} from "./predictionCapture";

const snapshot = { windowMode: "Custom", customDrawCount: 13 } as AppPresetSnapshot;

describe("prediction capture", () => {
  it("stores immutable run snapshots and keeps repeated main games linked to every run", () => {
    const first = appendPredictionCaptureRun(createPredictionCaptureSession("2026-09-20T01:00:00.000Z"), {
      action: "generated",
      candidates: [{ main: [6, 7, 14, 17, 30, 31], supp: [28, 42] }],
      setupSnapshot: snapshot,
      now: "2026-09-20T01:01:00.000Z",
      latestDrawDate: "9/18/26",
      windowLabel: "Custom (13)",
      windowDrawCount: 13,
    });
    const second = appendPredictionCaptureRun(first.session, {
      action: "copied",
      candidates: [{ main: [31, 30, 17, 14, 7, 6], supp: [27, 43] }],
      setupSnapshot: { ...snapshot, customDrawCount: 26 } as AppPresetSnapshot,
      now: "2026-09-20T01:02:00.000Z",
      latestDrawDate: "9/18/26",
      windowLabel: "Custom (26)",
      windowDrawCount: 26,
    });

    const summaries = summarizePredictionCaptureGames(second.session);
    expect(second.session.runs).toHaveLength(2);
    expect(second.session.rows).toHaveLength(2);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].capturedOccurrenceCount).toBe(2);
    expect(summaries[0].runIds).toHaveLength(2);
    expect(summaries[0].analyticalForecasts).toHaveLength(2);
    expect(first.session.runs[0].setupSnapshot.customDrawCount).toBe(13);
  });

  it("parses six-number games, preserves explicit 6+2 forecasts, and rejects imperfect rows", () => {
    const rows = parsePredictionCaptureRows([
      "6,7,14,17,30,31",
      "6,7,14,17,30,31,28,42",
      "1,2,3,4,5",
      "1,2,3,4,5,5",
    ].join("\n"));

    expect(rows[0].game).toEqual([6, 7, 14, 17, 30, 31]);
    expect(rows[0].forecast).toBeNull();
    expect(rows[1].forecast).toEqual({ main: [6, 7, 14, 17, 30, 31], supp: [28, 42] });
    expect(rows[2].error).toContain("exactly 6");
    expect(rows[3].error).toContain("Duplicate");
  });

  it("separates distinct-game analytics from purchased quantity and preserves exact provenance", () => {
    const captured = appendPredictionCaptureRun(createPredictionCaptureSession("2026-09-20T01:00:00.000Z"), {
      action: "generated",
      candidates: [{ main: [6, 7, 14, 17, 30, 31], supp: [28, 42] }],
      setupSnapshot: snapshot,
      now: "2026-09-20T01:01:00.000Z",
      windowLabel: "Custom (13)",
      windowDrawCount: 13,
    }).session;
    const key = "6-7-14-17-30-31";
    const externalRows = parsePredictionCaptureRows([
      "31,30,17,14,7,6",
      "1,2,3,4,5,6",
    ].join("\n"));
    const batch = buildPredictionCaptureBatch({
      session: captured,
      selectedCapturedGameKeys: [key],
      externalRows,
      quantityByGameKey: { [key]: 2 },
      now: "2026-09-20T02:00:00.000Z",
    });

    expect(batch.games).toHaveLength(2);
    expect(batch.sourceSummary.distinctGames).toBe(2);
    expect(batch.sourceSummary.purchasedLines).toBe(4);
    expect(batch.games.find((game) => game.mainKey === key)?.quantity).toBe(3);
    expect(batch.games.find((game) => game.mainKey === key)?.provenance.status).toBe("matched");
    expect(batch.games.find((game) => game.mainKey === "1-2-3-4-5-6")?.provenance.status).toBe("external");
    expect(batch.runSnapshots).toHaveLength(1);
  });

  it("scores every played game and the batch portfolio against a real target draw", () => {
    const externalRows = parsePredictionCaptureRows([
      "1,2,3,4,5,6",
      "7,8,9,10,11,12",
    ].join("\n"));
    const batch = buildPredictionCaptureBatch({
      externalRows,
      quantityByGameKey: { "1-2-3-4-5-6": 2 },
      now: "2026-09-20T02:00:00.000Z",
    });
    const score = scorePredictionCaptureBatch(batch, {
      date: "9/21/26",
      main: [1, 2, 3, 4, 5, 6],
      supp: [7, 8],
    });

    expect(score).not.toBeNull();
    expect(score?.gameScores[0].division).toBe("Div1");
    expect(score?.distinctGameCount).toBe(2);
    expect(score?.purchasedLineCount).toBe(2);
    expect(score?.totalCostCents).toBe(134);
    expect(score?.coveredDrawNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(score?.allEightSpreadCovered).toBe(true);
  });
});
