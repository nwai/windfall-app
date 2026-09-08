import type { DrawRow } from "./drawHistory";
import { isParseableDrawDate } from "./strictDrawValidation";

const DRAW_HISTORY_CACHE_KEY = "draw-history:reviewed:v1";

interface CachedDrawHistoryPayload {
  rows: DrawRow[];
  updatedAt: string;
}

function isValidRow(value: unknown): value is DrawRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (!(
    typeof candidate.date === "string" &&
    Array.isArray(candidate.mains) &&
    Array.isArray(candidate.supps) &&
    candidate.mains.every((entry) => typeof entry === "number" && Number.isInteger(entry)) &&
    candidate.supps.every((entry) => typeof entry === "number" && Number.isInteger(entry))
  )) return false;

  const mains = candidate.mains as number[];
  const supps = candidate.supps as number[];
  const allNumbers = [...mains, ...supps];
  return (
    isParseableDrawDate(candidate.date)
    && mains.length === 6
    && supps.length === 2
    && allNumbers.every((number) => number >= 1 && number <= 45)
    && new Set(allNumbers).size === 8
  );
}

export function saveCachedDrawHistory(rows: DrawRow[]): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const realRows = rows.filter((row) => !row.isSimulated && isValidRow(row));
  if (realRows.length === 0) {
    window.localStorage.removeItem(DRAW_HISTORY_CACHE_KEY);
    return;
  }
  const payload: CachedDrawHistoryPayload = {
    rows: realRows.map((row) => ({
      date: row.date,
      mains: row.mains.slice(),
      supps: row.supps.slice(),
    })),
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(DRAW_HISTORY_CACHE_KEY, JSON.stringify(payload));
}

export function loadCachedDrawHistory(): DrawRow[] | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  const raw = window.localStorage.getItem(DRAW_HISTORY_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CachedDrawHistoryPayload>;
    if (!Array.isArray(parsed.rows)) {
      return null;
    }
    if (parsed.rows.length === 0 || !parsed.rows.every(isValidRow)) {
      return null;
    }
    const realRows = parsed.rows.filter((row) => !row.isSimulated);
    return realRows.length > 0
      ? realRows.map((row) => ({ date: row.date, mains: [...row.mains], supps: [...row.supps] }))
      : null;
  } catch {
    return null;
  }
}

export function clearCachedDrawHistory(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.removeItem(DRAW_HISTORY_CACHE_KEY);
}
