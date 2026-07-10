import type { Draw } from "../types";
import { parseDrawDateToEpoch } from "./recentDraws";

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
