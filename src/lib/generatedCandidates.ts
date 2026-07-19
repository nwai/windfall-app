import type { CandidateSet, Draw } from "../types";
import { computeWeekdayWindfallPrizeDivision } from "./prizeDivisions";

export interface GeneratedCandidateViewRow<TCandidate = CandidateSet> {
  c: TCandidate;
  origIdx: number;
  matched?: boolean;
}

export interface HistoricalPrizeBacktestRow {
  draw: Draw;
  tally: Record<string, number>;
  total: number;
  bestDiv: string;
  qualifying: { idx: number; div: string }[];
}

export function selectRowsForCandidateExport<TCandidate>(
  rows: readonly GeneratedCandidateViewRow<TCandidate>[],
  filteringActive: boolean,
): GeneratedCandidateViewRow<TCandidate>[] {
  if (!filteringActive) return [...rows];
  return rows.filter((row) => row.matched === true);
}

export function formatCandidateRowsForPasteWeightedGenerator<TCandidate extends { main: readonly number[] }>(
  rows: readonly GeneratedCandidateViewRow<TCandidate>[],
): string {
  return rows
    .map(({ c }) => c.main.join(","))
    .join("\n");
}

const dateRank = (date: string): number => {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

export function sortDrawsNewestFirst(history: readonly Draw[]): Draw[] {
  return history
    .map((draw, index) => ({ draw, index, rank: dateRank(draw.date) }))
    .sort((a, b) => b.rank - a.rank || b.index - a.index)
    .map(({ draw }) => draw);
}

export function buildHistoricalPrizeBacktest(input: {
  history: readonly Draw[] | undefined | null;
  manualSelection: readonly number[];
}): HistoricalPrizeBacktestRow[] {
  const { history, manualSelection } = input;
  if (!history?.length || manualSelection.length < 8) return [];

  const manualMain = manualSelection.slice(0, 6);
  const manualSupp = manualSelection.slice(6, 8);
  return sortDrawsNewestFirst(history).map((draw) => {
    const drawMainSet = new Set(draw.main);
    const drawSuppSet = new Set(draw.supp);
    const div = computeWeekdayWindfallPrizeDivision(manualMain, manualSupp, drawMainSet, drawSuppSet);
    if (div === "—") {
      return { draw, tally: {}, total: 0, bestDiv: "—", qualifying: [] };
    }
    return {
      draw,
      tally: { [div]: 1 },
      total: 1,
      bestDiv: div,
      qualifying: [{ idx: 0, div }],
    };
  });
}
