import type { Draw } from "../types";

export function parseDrawDateToEpoch(date: string): number {
  if (!date) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const parts = date.split("/").map((part) => part.trim());
  if (parts.length >= 3) {
    const month = Number(parts[0]);
    const day = Number(parts[1]);
    let year = Number(parts[2]);
    if (year < 100) year = 2000 + year;
    return new Date(year, month - 1, day).getTime();
  }
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortDrawsByRecency(history: Draw[]): Draw[] {
  return history
    .map((draw, index) => ({ draw, index }))
    .sort((left, right) => {
      const timeDelta = parseDrawDateToEpoch(right.draw.date) - parseDrawDateToEpoch(left.draw.date);
      if (timeDelta !== 0) return timeDelta;
      return right.index - left.index;
    })
    .map(({ draw }) => draw);
}

export function sortDrawsChronologically(history: Draw[]): Draw[] {
  return sortDrawsByRecency(history).slice().reverse();
}

export function getMostRecentDraw(history: Draw[]): Draw | null {
  if (history.length === 0) return null;
  return sortDrawsByRecency(history)[0] ?? null;
}

export function getMostRecentDrawPair(history: Draw[]): { latest: Draw; previous: Draw } | null {
  if (history.length < 2) return null;
  const [latest, previous] = sortDrawsByRecency(history);
  if (!latest || !previous) return null;
  return { latest, previous };
}

export function getHC3OverlapNumbers(history: Draw[]): number[] {
  const pair = getMostRecentDrawPair(history);
  if (!pair) return [];
  const latestAll = [...pair.latest.main, ...pair.latest.supp];
  const previousSet = new Set([...pair.previous.main, ...pair.previous.supp]);
  return Array.from(new Set(latestAll.filter((number) => previousSet.has(number))));
}
