import type { Draw } from "../types";
import { parseDrawDateToEpoch } from "./recentDraws";
import { auditHistorySchedule, drawScheduleDateError } from "./historyScheduleAudit";

export type InitialDrawHistorySource = "cache" | "bundled-csv" | "none";

export interface InitialDrawHistoryChoice {
  history: Draw[];
  source: InitialDrawHistorySource;
  reason: string;
}

const latestEpoch = (history: Draw[]): number => history.reduce((latest, draw) => {
  const epoch = parseDrawDateToEpoch(draw.date);
  return epoch > latest ? epoch : latest;
}, 0);

export function chooseInitialDrawHistory(
  cachedHistory: Draw[] | null | undefined,
  bundledCsvHistory: Draw[] | null | undefined,
): InitialDrawHistoryChoice {
  const cached = cachedHistory ?? [];
  const bundled = bundledCsvHistory ?? [];
  const cachedIsSimulatedOnly = cached.length > 0 && cached.every((draw) => draw.isSimulated);

  if (cached.length === 0 && bundled.length === 0) {
    return { history: [], source: "none", reason: "No cached or bundled draw history is available." };
  }
  if (bundled.length === 0) {
    return {
      history: [],
      source: "none",
      reason: cachedIsSimulatedOnly
        ? "Default bundled CSV is unavailable and simulated-only browser cache was ignored; choose another CSV or explicitly load simulated demo rows."
        : "Default bundled CSV is unavailable; choose another CSV or explicitly load simulated demo rows.",
    };
  }
  if (cachedIsSimulatedOnly) {
    return {
      history: bundled,
      source: "bundled-csv",
      reason: "Ignored simulated-only browser cache and loaded bundled real draw history instead.",
    };
  }
  if (cached.length === 0) {
    return { history: bundled, source: "bundled-csv", reason: "No reviewed browser cache exists." };
  }

  const cachedLatest = latestEpoch(cached);
  const bundledLatest = latestEpoch(bundled);

  if (cachedLatest === bundledLatest && cached.length === bundled.length) {
    const errors = (rows: Draw[]) => {
      const audit = auditHistorySchedule(rows);
      return audit.invalidDateRows.length + audit.offScheduleRows.length;
    };
    const numberKey = (draw: Draw) => (
      `${[...draw.main].sort((a, b) => a - b).join(",")}|${[...draw.supp].sort((a, b) => a - b).join(",")}`
    );
    const numberKeys = (rows: Draw[]) => rows.map(numberKey).sort();
    const exactKey = (draw: Draw) => `${parseDrawDateToEpoch(draw.date)}|${numberKey(draw)}`;
    const bundledKeys = new Set(bundled.map(exactKey));
    const validCachedRowsUnchanged = cached.filter((draw) => !drawScheduleDateError(draw.date)).every((draw) => (
      bundledKeys.has(exactKey(draw))
    ));
    if (errors(cached) > errors(bundled)
      && validCachedRowsUnchanged
      && JSON.stringify(numberKeys(cached)) === JSON.stringify(numberKeys(bundled))) {
      return {
        history: bundled,
        source: "bundled-csv",
        reason: "Bundled CSV corrects invalid or off-schedule dates in the browser cache, with the same draw count, latest date and main/supp number sets.",
      };
    }
  }

  if (bundledLatest > cachedLatest) {
    return {
      history: bundled,
      source: "bundled-csv",
      reason: "Bundled CSV is newer than the reviewed browser cache.",
    };
  }

  if (bundledLatest === cachedLatest && bundled.length > cached.length) {
    return {
      history: bundled,
      source: "bundled-csv",
      reason: "Bundled CSV has more draw rows at the same latest date than the reviewed browser cache.",
    };
  }

  return { history: cached, source: "cache", reason: "Reviewed browser cache is at least as current as the bundled CSV." };
}
