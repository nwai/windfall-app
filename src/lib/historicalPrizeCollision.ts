import type { Draw } from "../types";
import {
  rankWeekdayWindfallPrizeDivision,
  type WeekdayWindfallPrizeDivision,
} from "./prizeDivisions";

type HistoricalPrizeCollisionDivision = Extract<WeekdayWindfallPrizeDivision, "Div1" | "Div2">;
type HistoricalPrizeCollisionKind = "stored-line" | "selected-set";

export interface HistoricalPrizeCollisionHit {
  kind: HistoricalPrizeCollisionKind;
  division: HistoricalPrizeCollisionDivision;
  date: string;
  drawnMain: number[];
  drawnSupp: number[];
  playerMain?: number[];
  playerSupp?: number[];
  selectedNumbers: number[];
  mainHits: number;
  suppHits: number;
}

export interface HistoricalPrizeCollisionResult {
  checkedDraws: number;
  skippedDraws: number;
  selectedNumbers: number[];
  storedLineMain: number[];
  storedLineSupp: number[];
  storedLineHits: HistoricalPrizeCollisionHit[];
  selectedSetHits: HistoricalPrizeCollisionHit[];
  bestDivision: HistoricalPrizeCollisionDivision | null;
  hasRarePrizeCollision: boolean;
}

const MIN_NUMBER = 1;
const MAX_NUMBER = 45;

const isValidDrawNumber = (value: unknown): value is number => (
  typeof value === "number" &&
  Number.isInteger(value) &&
  Number.isFinite(value) &&
  value >= MIN_NUMBER &&
  value <= MAX_NUMBER
);

const normalizeNumbersInOrder = (values: readonly unknown[] | null | undefined): number[] => {
  const seen = new Set<number>();
  const output: number[] = [];
  for (const value of values ?? []) {
    if (!isValidDrawNumber(value) || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
};

const normalizeDrawSide = (values: readonly unknown[] | null | undefined, expectedCount: number): number[] | null => {
  const normalized = normalizeNumbersInOrder(values);
  return normalized.length === expectedCount ? normalized : null;
};

const normalizeHistoricalDraw = (draw: Draw): { main: number[]; supp: number[] } | null => {
  if (draw.isSimulated) return null;
  const main = normalizeDrawSide(draw.main, 6);
  const supp = normalizeDrawSide(draw.supp, 2);
  return main && supp ? { main, supp } : null;
};

const isPrizeCollisionDivision = (division: WeekdayWindfallPrizeDivision): division is HistoricalPrizeCollisionDivision => (
  division === "Div1" || division === "Div2"
);

const computeStoredLineCollision = (
  storedLineMain: number[],
  storedLineSupp: number[],
  drawnMain: Set<number>,
  drawnSupp: Set<number>,
): { division: HistoricalPrizeCollisionDivision; mainHits: number; suppHits: number } | null => {
  const mainHits = storedLineMain.filter((number) => drawnMain.has(number)).length;
  const suppHits = storedLineSupp.filter((number) => drawnSupp.has(number)).length;
  if (mainHits === 6) return { division: "Div1", mainHits, suppHits };
  if (mainHits === 5 && suppHits >= 1) return { division: "Div2", mainHits, suppHits };
  return null;
};

const sortHits = (hits: HistoricalPrizeCollisionHit[]): HistoricalPrizeCollisionHit[] => (
  hits.slice().sort((left, right) => {
    const rankDelta = rankWeekdayWindfallPrizeDivision(left.division) - rankWeekdayWindfallPrizeDivision(right.division);
    if (rankDelta !== 0) return rankDelta;
    return left.date.localeCompare(right.date);
  })
);

const bestDivisionFromHits = (hits: HistoricalPrizeCollisionHit[]): HistoricalPrizeCollisionDivision | null => {
  const sorted = sortHits(hits);
  return sorted[0]?.division ?? null;
};

export function analyzeHistoricalPrizeCollision(
  history: readonly Draw[],
  selectedNumbersRaw: readonly unknown[] | null | undefined,
): HistoricalPrizeCollisionResult {
  const selectedNumbers = normalizeNumbersInOrder(selectedNumbersRaw);
  const selectedSet = new Set(selectedNumbers);
  const storedLineMain = selectedNumbers.slice(0, 6);
  const storedLineSupp = selectedNumbers.slice(6, 8);
  const storedLineHits: HistoricalPrizeCollisionHit[] = [];
  const selectedSetHits: HistoricalPrizeCollisionHit[] = [];
  let checkedDraws = 0;
  let skippedDraws = 0;

  for (const draw of history) {
    const normalizedDraw = normalizeHistoricalDraw(draw);
    if (!normalizedDraw) {
      skippedDraws += 1;
      continue;
    }
    checkedDraws += 1;

    const drawnMain = new Set(normalizedDraw.main);
    const drawnSupp = new Set(normalizedDraw.supp);

    if (storedLineMain.length === 6) {
      const collision = computeStoredLineCollision(storedLineMain, storedLineSupp, drawnMain, drawnSupp);
      if (collision && isPrizeCollisionDivision(collision.division)) {
        storedLineHits.push({
          kind: "stored-line",
          division: collision.division,
          date: draw.date,
          drawnMain: normalizedDraw.main,
          drawnSupp: normalizedDraw.supp,
          playerMain: storedLineMain,
          playerSupp: storedLineSupp,
          selectedNumbers,
          mainHits: collision.mainHits,
          suppHits: collision.suppHits,
        });
      }
    }

    if (selectedNumbers.length >= 6) {
      const mainHits = normalizedDraw.main.filter((number) => selectedSet.has(number)).length;
      const suppHits = normalizedDraw.supp.filter((number) => selectedSet.has(number)).length;
      const division: HistoricalPrizeCollisionDivision | null = mainHits >= 6
        ? "Div1"
        : mainHits >= 5 && suppHits >= 1
          ? "Div2"
          : null;

      if (division) {
        selectedSetHits.push({
          kind: "selected-set",
          division,
          date: draw.date,
          drawnMain: normalizedDraw.main,
          drawnSupp: normalizedDraw.supp,
          selectedNumbers,
          mainHits,
          suppHits,
        });
      }
    }
  }

  const allHits = [...storedLineHits, ...selectedSetHits];
  const bestDivision = bestDivisionFromHits(allHits);
  return {
    checkedDraws,
    skippedDraws,
    selectedNumbers,
    storedLineMain,
    storedLineSupp,
    storedLineHits: sortHits(storedLineHits),
    selectedSetHits: sortHits(selectedSetHits),
    bestDivision,
    hasRarePrizeCollision: bestDivision !== null,
  };
}
