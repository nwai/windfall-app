import type { Draw } from "../types";
import { computeWeekdayWindfallPrizeDivision, type WeekdayWindfallPrizeDivision } from "./prizeDivisions";
import { normalizePredictionCaptureGame } from "./predictionCapture";
import { strictValidateDraws } from "./strictDrawValidation";
import { datePartsToIso, isScheduledDrawDate, parseDrawDateParts } from "./planningDrawContext";

export const PREDICTION_GAME_HISTORY_VERSION = "PGH-1";
export const looksLikePastedGameRows = (text: string): boolean => {
  const counts = text.split(/\r?\n/).filter(line => line.trim()).map(line => (line.match(/\d+/g) ?? []).length);
  return counts.length > 1 && counts.every(count => count >= 2) && counts.some(count => count >= 5);
};

export function preparePredictionGameHistory(history: readonly Draw[], cutoffDate: string) {
  const cutoff = parseDrawDateParts(cutoffDate);
  const through = cutoff ? datePartsToIso(cutoff) : null;
  let skipped = 0, afterCutoff = 0;
  const byDate = new Map<string, Draw[]>();
  for (const draw of history) {
    const parts = parseDrawDateParts(draw.date);
    if (draw.isSimulated || !parts || !isScheduledDrawDate(parts) || !strictValidateDraws([draw]).length || !through) { skipped++; continue; }
    const date = datePartsToIso(parts);
    if (date > through) { afterCutoff++; continue; }
    byDate.set(date, [...(byDate.get(date) ?? []), { ...draw, date }]);
  }
  const draws = [...byDate.values()].flatMap(rows => {
    if (rows.length > 1) { skipped += rows.length; return []; }
    return rows;
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { draws, cutoffDate: through, skipped, afterCutoff };
}

export interface PredictionGameHistoricalMatch {
  date: string;
  division: Extract<WeekdayWindfallPrizeDivision, "Div1" | "Div2">;
  drawnMain: number[];
  drawnSupp: number[];
  mainHits: number[];
  suppHits: number[];
}
export interface PredictionPortfolioHistoricalCoverage {
  date: string;
  mainHits: number[];
  suppHits: number[];
  drawnMain: number[];
  drawnSupp: number[];
  contributingGames: { gameKey: string; numbers: number[] }[];
}

export function analyzePredictionGameHistory(history: readonly Draw[], games: readonly { numbers: number[]; mainKey: string }[], cutoffDate: string) {
  const source = preparePredictionGameHistory(history, cutoffDate);
  const validGames = [...new Map(games.flatMap(game => {
    const numbers = normalizePredictionCaptureGame(game.numbers);
    return numbers ? [[numbers.join("-"), { numbers, mainKey: numbers.join("-") }] as const] : [];
  })).values()];
  const matchesByGame = Object.fromEntries(validGames.map(game => [game.mainKey, [] as PredictionGameHistoricalMatch[]]));
  const union = new Set(validGames.flatMap(game => game.numbers));
  const portfolioCoverage: PredictionPortfolioHistoricalCoverage[] = [];
  for (const draw of source.draws) {
    const mains = new Set(draw.main), supps = new Set(draw.supp);
    let individualMatch = false;
    for (const game of validGames) {
      const division = computeWeekdayWindfallPrizeDivision(game.numbers, [], mains, supps);
      if (division !== "Div1" && division !== "Div2") continue;
      individualMatch = true;
      matchesByGame[game.mainKey].push({ date: draw.date, division, drawnMain: draw.main, drawnSupp: draw.supp,
        mainHits: game.numbers.filter(number => mains.has(number)), suppHits: game.numbers.filter(number => supps.has(number)) });
    }
    const mainHits = draw.main.filter(number => union.has(number));
    const suppHits = draw.supp.filter(number => union.has(number));
    if (validGames.length > 1 && !individualMatch && (mainHits.length === 6 || (mainHits.length >= 5 && suppHits.length >= 1))) {
      portfolioCoverage.push({ date: draw.date, mainHits, suppHits, drawnMain: draw.main, drawnSupp: draw.supp,
        contributingGames: validGames.filter(game => game.numbers.some(number => mains.has(number) || supps.has(number)))
          .map(game => ({ gameKey: game.mainKey, numbers: game.numbers })) });
    }
  }
  return { version: PREDICTION_GAME_HISTORY_VERSION, cutoffDate: source.cutoffDate, checkedDraws: source.draws.length,
    skippedDraws: source.skipped, afterCutoff: source.afterCutoff, matchesByGame, portfolioCoverage: portfolioCoverage.reverse() };
}
export type PredictionGameHistory = ReturnType<typeof analyzePredictionGameHistory>;
