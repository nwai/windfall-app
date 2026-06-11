import type { Draw } from "../types";

export interface RealDrawHistoryResult {
  history: Draw[];
  simulatedRowsIgnored: number;
  warnings: string[];
}

export function filterRealDrawHistory(history: readonly Draw[], context: string): RealDrawHistoryResult {
  const realHistory = history.filter((draw) => !draw.isSimulated);
  const simulatedRowsIgnored = history.length - realHistory.length;

  return {
    history: realHistory,
    simulatedRowsIgnored,
    warnings: simulatedRowsIgnored > 0
      ? [`Ignored ${simulatedRowsIgnored} simulated fallback draw row${simulatedRowsIgnored === 1 ? "" : "s"}; ${context} use real historical draws only.`]
      : [],
  };
}
