export type LotteryGameId = "windfall" | "powerball";

export interface LotteryGameDefinition {
  id: LotteryGameId;
  name: string;
  shortName: string;
  description: string;
  drawSummary: string;
  statusLabel: string;
}

export const LOTTERY_GAMES: Record<LotteryGameId, LotteryGameDefinition> = {
  windfall: {
    id: "windfall",
    name: "Weekday Windfall",
    shortName: "Windfall",
    description: "Existing diagnostic workspace for Weekday Windfall draw history, evidence, and candidate generation.",
    drawSummary: "6 main numbers from 1-45 plus 2 supplementary numbers",
    statusLabel: "Established",
  },
  powerball: {
    id: "powerball",
    name: "Australian Powerball",
    shortName: "Powerball",
    description: "Focused entry generator for Australian Powerball, ready for future history and diagnostics modules.",
    drawSummary: "7 main numbers from 1-35 plus 1 Powerball from 1-20",
    statusLabel: "New",
  },
};

export const LOTTERY_GAME_ORDER: LotteryGameId[] = ["windfall", "powerball"];
