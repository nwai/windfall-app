import type { Draw } from "../types";
import { parseDrawDateToEpoch } from "./recentDraws";

export type DrawHistoryProvenanceStatus = "empty" | "real" | "mixed" | "simulated-only";

export interface DrawHistoryProvenanceSummary {
  status: DrawHistoryProvenanceStatus;
  totalDraws: number;
  realDraws: number;
  simulatedDraws: number;
  latestLoadedDate: string | null;
  latestRealDate: string | null;
  analysisReady: boolean;
  headline: string;
  detail: string;
  warning: string | null;
}

const latestDate = (draws: readonly Draw[]): string | null => {
  if (draws.length === 0) return null;
  const latest = draws.reduce<Draw | null>((currentLatest, draw) => {
    if (!currentLatest) return draw;
    const currentEpoch = parseDrawDateToEpoch(currentLatest.date);
    const nextEpoch = parseDrawDateToEpoch(draw.date);
    return nextEpoch >= currentEpoch ? draw : currentLatest;
  }, null);
  return latest?.date ?? null;
};

export function summarizeDrawHistoryProvenance(history: readonly Draw[]): DrawHistoryProvenanceSummary {
  const totalDraws = history.length;
  const simulatedDraws = history.filter((draw) => draw.isSimulated).length;
  const realDraws = totalDraws - simulatedDraws;
  const realHistory = history.filter((draw) => !draw.isSimulated);
  const latestLoadedDate = latestDate(history);
  const latestRealDate = latestDate(realHistory);

  if (totalDraws === 0) {
    return {
      status: "empty",
      totalDraws,
      realDraws,
      simulatedDraws,
      latestLoadedDate,
      latestRealDate,
      analysisReady: false,
      headline: "No draw history loaded",
      detail: "Load verified draw history before treating any panel output as evidence.",
      warning: "No historical evidence is available.",
    };
  }

  if (realDraws === 0) {
    return {
      status: "simulated-only",
      totalDraws,
      realDraws,
      simulatedDraws,
      latestLoadedDate,
      latestRealDate,
      analysisReady: false,
      headline: "Demo fallback history only",
      detail: `${simulatedDraws} simulated draw${simulatedDraws === 1 ? "" : "s"} loaded; latest simulated date ${latestLoadedDate ?? "unknown"}.`,
      warning: "This is demo fallback data, not real draw evidence. Replace it before analysis or backtesting.",
    };
  }

  if (simulatedDraws > 0) {
    return {
      status: "mixed",
      totalDraws,
      realDraws,
      simulatedDraws,
      latestLoadedDate,
      latestRealDate,
      analysisReady: false,
      headline: "Mixed real and simulated history",
      detail: `${realDraws} real draw${realDraws === 1 ? "" : "s"} and ${simulatedDraws} simulated fallback draw${simulatedDraws === 1 ? "" : "s"} loaded; latest real date ${latestRealDate ?? "unknown"}.`,
      warning: "simulated fallback rows are present. Treat analytical results as unsafe until history is replaced or cleaned.",
    };
  }

  return {
    status: "real",
    totalDraws,
    realDraws,
    simulatedDraws,
    latestLoadedDate,
    latestRealDate,
    analysisReady: true,
    headline: "Real draw history loaded",
    detail: `${realDraws} verified-format real draw${realDraws === 1 ? "" : "s"} loaded; latest date ${latestRealDate ?? "unknown"}.`,
    warning: null,
  };
}
