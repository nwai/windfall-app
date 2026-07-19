export type WeekdayWindfallPrizeDivision = "Div1" | "Div2" | "Div3" | "Div4" | "Div5" | "Div6" | "—";

const DIVISION_RANK: Record<WeekdayWindfallPrizeDivision, number> = {
  Div1: 1,
  Div2: 2,
  Div3: 3,
  Div4: 4,
  Div5: 5,
  Div6: 6,
  "—": 99,
};

const DIVISION_SORT_WEIGHT: Record<WeekdayWindfallPrizeDivision, number> = {
  Div1: 7,
  Div2: 6,
  Div3: 5,
  Div4: 4,
  Div5: 3,
  Div6: 2,
  "—": 0,
};

export function computeWeekdayWindfallPrizeHits(
  playerMain: number[],
  drawnMain: Set<number>,
  drawnSupp: Set<number>,
  playerSupp: number[] = []
): { mainHits: number; suppHits: number } {
  const selectedNumbers = Array.from(new Set([...playerMain, ...playerSupp]));
  const mainHits = selectedNumbers.filter((n) => drawnMain.has(n)).length;
  const suppHits = selectedNumbers.filter((n) => drawnSupp.has(n)).length;
  return { mainHits, suppHits };
}

export function computeWeekdayWindfallPrizeDivision(
  playerMain: number[],
  playerSupp: number[],
  drawnMain: Set<number>,
  drawnSupp: Set<number>
): WeekdayWindfallPrizeDivision {
  if (drawnMain.size < 6 || drawnSupp.size < 2) return "—";
  const { mainHits, suppHits } = computeWeekdayWindfallPrizeHits(playerMain, drawnMain, drawnSupp, playerSupp);
  if (mainHits === 6) return "Div1";
  if (mainHits === 5 && suppHits >= 1) return "Div2";
  if (mainHits === 5) return "Div3";
  if (mainHits === 4) return "Div4";
  if (mainHits === 3 && suppHits >= 1) return "Div5";
  if ((mainHits === 1 || mainHits === 2) && suppHits === 2) return "Div6";
  return "—";
}

export function rankWeekdayWindfallPrizeDivision(division: WeekdayWindfallPrizeDivision): number {
  return DIVISION_RANK[division];
}

export function computeWeekdayWindfallPrizeScore(
  playerMain: number[],
  playerSupp: number[],
  drawnMain: Set<number>,
  drawnSupp: Set<number>
): number {
  const division = computeWeekdayWindfallPrizeDivision(playerMain, playerSupp, drawnMain, drawnSupp);
  const { mainHits, suppHits } = computeWeekdayWindfallPrizeHits(playerMain, drawnMain, drawnSupp, playerSupp);
  return DIVISION_SORT_WEIGHT[division] * 100 + mainHits * 10 + suppHits;
}
