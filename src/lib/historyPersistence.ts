import type { DrawRow } from "./drawHistory";

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
  return (
    typeof candidate.date === "string" &&
    Array.isArray(candidate.mains) &&
    Array.isArray(candidate.supps) &&
    candidate.mains.every((entry) => typeof entry === "number" && Number.isInteger(entry)) &&
    candidate.supps.every((entry) => typeof entry === "number" && Number.isInteger(entry))
  );
}

export function saveCachedDrawHistory(rows: DrawRow[]): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const payload: CachedDrawHistoryPayload = {
    rows: rows.map((row) => ({
      date: row.date,
      mains: row.mains.slice(),
      supps: row.supps.slice(),
      isSimulated: row.isSimulated,
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
    const rows = parsed.rows.filter(isValidRow);
    return rows.length > 0 ? rows : null;
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
