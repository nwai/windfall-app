import type { Draw } from "../types";
import {
  buildPredictionJournalProvenance,
  scorePredictionJournalEntry,
  type PredictionJournalEntry,
} from "./predictionJournal";

export interface DgaAutoSuppJournalAuditRow {
  entryId: string;
  targetDate: string;
  predictedSupp: number[];
  actualSupp: number[];
  hits: number;
  archived: boolean;
}

export interface DgaAutoSuppJournalAudit {
  capturedEntries: number;
  scoredEntries: number;
  pendingEntries: number;
  zeroHits: number;
  oneHit: number;
  twoHits: number;
  meanHits: number;
  rows: DgaAutoSuppJournalAuditRow[];
}

export const analyzeDgaAutoSuppJournal = (
  entries: readonly PredictionJournalEntry[],
  history: Draw[],
): DgaAutoSuppJournalAudit => {
  const rows: DgaAutoSuppJournalAuditRow[] = [];
  let capturedEntries = 0;

  for (const entry of entries) {
    const provenance = entry.provenance?.dgaAutoSupps
      ?? buildPredictionJournalProvenance(entry.inputs, entry.setupSnapshot).dgaAutoSupps;
    if (!provenance) continue;
    capturedEntries += 1;

    const scored = scorePredictionJournalEntry(entry, history);
    const suppScore = scored.scores.find((score) => score.key === "dgaAutoSupps");
    const target = scored.targetDraws[0];
    if (!suppScore || !target || !Array.isArray(target.supp) || target.supp.length !== 2) continue;

    rows.push({
      entryId: entry.id,
      targetDate: target.date,
      predictedSupp: [...provenance.suppNumbers].sort((left, right) => left - right),
      actualSupp: [...target.supp].sort((left, right) => left - right),
      hits: Math.max(0, Math.min(2, suppScore.hitCount ?? 0)),
      archived: Boolean(entry.archivedAt),
    });
  }

  rows.sort((left, right) => right.targetDate.localeCompare(left.targetDate) || left.entryId.localeCompare(right.entryId));
  const hitTotal = rows.reduce((sum, row) => sum + row.hits, 0);

  return {
    capturedEntries,
    scoredEntries: rows.length,
    pendingEntries: capturedEntries - rows.length,
    zeroHits: rows.filter((row) => row.hits === 0).length,
    oneHit: rows.filter((row) => row.hits === 1).length,
    twoHits: rows.filter((row) => row.hits === 2).length,
    meanHits: rows.length ? hitTotal / rows.length : 0,
    rows,
  };
};
