import type { Draw } from "../types";
import { portfolioCalendarDate } from "./evidencePortfolio";
import { buildPredictionJournalEntry, type PredictionJournalEntry } from "./predictionJournal";
import { scoreWindfallPredictor, type WindfallPredictorSnapshot } from "./windfallPredictor";

export function createWindfallPredictorEntry(snapshot: WindfallPredictorSnapshot, reviewed: boolean, now = new Date().toISOString()) {
  return buildPredictionJournalEntry({ id: snapshot.id, now, latestDraw: snapshot.cutoffDraw, targetKind: "nextDraw",
    reviewStatus: reviewed ? "reviewedByUser" : "notReviewed", windfallPredictor: snapshot,
    inputs: { selectionReason: {version: 1, key: "windfallPredictor", label: "Created with Windfall Predictor"},
      notes: `Created by the Windfall Predictor button (${snapshot.version}). Four frozen experimental 6+2 suggestions for ${snapshot.targetDate}, D${snapshot.ordinal}/${snapshot.monthLength}. Current-month live context only; earlier completed months train the fixed recipe. Seed ${snapshot.seed}. Unplayed controls are comparison suggestions, not historical results or purchased games. Other main-generator settings are not applied. Entertainment only.` },
  });
}

export function auditSavedWindfallPredictors(entries: readonly PredictionJournalEntry[], history: readonly Draw[]) {
  const eligible = entries.filter(entry => {
    const snapshot = entry.windfallPredictor;
    if (!snapshot || entry.archivedAt || entry.reviewStatus !== "reviewedByUser" || !entry.reviewedAt || !snapshot.formalTimingEligible) return false;
    return portfolioCalendarDate(entry.createdAt) < snapshot.targetDate && portfolioCalendarDate(entry.reviewedAt) < snapshot.targetDate;
  }).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const dates = new Set<string>();
  const rows = eligible.flatMap(entry => {
    const snapshot = entry.windfallPredictor!, score = scoreWindfallPredictor(snapshot, history);
    if (!score.actual || !score.historyMatches || dates.has(snapshot.targetDate)) return [];
    dates.add(snapshot.targetDate);
    return [{ date: snapshot.targetDate, month: snapshot.month, meanMainHits: score.meanMainHits!, controlMainHits: score.controlMeanMainHits!,
      difference: score.meanMainHits! - score.controlMeanMainHits!, prizes: score.games.filter(game => game.division !== "—").length,
      controlPrizes: score.controls.filter(game => game.division !== "—").length }];
  });
  const byMonth = new Map<string, number[]>();
  rows.forEach(row => byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), row.difference]));
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const monthly = [...byMonth.values()].map(mean), average = mean(monthly);
  const enough = rows.length >= 30 && byMonth.size >= 6;
  const margin = monthly.length > 1 ? 2.58 * Math.sqrt(monthly.reduce((sum, value) => sum + (value - average) ** 2, 0) / (monthly.length - 1) / monthly.length) : null;
  const interval: [number, number] | null = margin === null ? null : [average - margin, average + margin];
  return { rows, targets: rows.length, months: byMonth.size, interval,
    meanMainHits: rows.length ? mean(rows.map(row => row.meanMainHits)) : null,
    controlMainHits: rows.length ? mean(rows.map(row => row.controlMainHits)) : null,
    verdict: !enough ? "Learning: at least 30 reviewed pre-draw targets across six months are required."
      : interval && interval[0] > 0 ? "Positive prospective comparison to watch; not a calibrated win probability. No automatic recipe change."
        : "No stable prospective advantage over the unplayed controls. No automatic recipe change.",
  };
}
