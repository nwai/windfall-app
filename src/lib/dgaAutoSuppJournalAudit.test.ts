import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { analyzeDgaAutoSuppJournal } from "./dgaAutoSuppJournalAudit";
import { buildPredictionJournalEntry } from "./predictionJournal";

const draw = (date: string, main: number[], supp: number[]): Draw => ({ date, main, supp });

describe("analyzeDgaAutoSuppJournal", () => {
  it("keeps the user-selected journal sample separate and scores available real targets", () => {
    const history = [
      draw("6/24/26", [10, 11, 12, 13, 14, 15], [16, 17]),
      draw("6/26/26", [1, 7, 12, 14, 22, 34], [3, 45]),
    ];
    const setupSnapshot = {
      windowEnabled: true,
      windowMode: "H",
      customDrawCount: 13,
      selectedRatios: [],
      knobs: {},
      userSelectedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
      dgaSuggestedMainNumbers: [1, 2, 4, 6, 7, 8],
      dgaSuggestedSuppNumbers: [3, 5],
      dgaSuggestedSuppPair: [3, 5],
    } as any;
    const entry = buildPredictionJournalEntry({
      id: "auto-supp-journal-audit",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: history[0],
      targetKind: "nextDraw",
      inputs: { numbers: [1, 2, 4, 6, 7, 8, 3, 5] },
      setupSnapshot,
      reviewStatus: "reviewedByUser",
    });

    const result = analyzeDgaAutoSuppJournal([entry], history);

    expect(result).toMatchObject({
      capturedEntries: 1,
      scoredEntries: 1,
      pendingEntries: 0,
      zeroHits: 0,
      oneHit: 1,
      twoHits: 0,
      meanHits: 1,
    });
    expect(result.rows[0]).toMatchObject({
      predictedSupp: [3, 5],
      actualSupp: [3, 45],
      hits: 1,
    });
  });
});
