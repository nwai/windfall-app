import { Draw } from '../types';
import { parseCSVorJSON } from "../parseCSVorJSON";
import fallbackCSV from "../windfall_history_lottolyzer.csv?raw";

export type FetchDrawsParams = {
  apiUrl: string;
  minValidDraws: number;
  numMains: number;
  mainMin: number;
  mainMax: number;
  setHistory: (history: Draw[]) => void;
  setTrace: React.Dispatch<React.SetStateAction<string[]>>;
  setHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  rng: (
    n: number,
    min: number,
    max: number,
    exclude?: number[],
    pool?: number[]
  ) => number[];
  strictValidateDraws: (draws: Draw[]) => Draw[];
};

// Local date parser tolerant to ISO and M/D/YY formats
function parseCsvDateToEpoch(s: string): number {
  if (!s) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
    }
  const parts = s.split("/").map((x) => x.trim());
  if (parts.length >= 3) {
    const m = Number(parts[0]);
    const d = Number(parts[1]);
    let y = Number(parts[2]);
    if (y < 100) y = 2000 + y;
    return new Date(y, m - 1, d).getTime();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function tryLoadCsvFallback(strictValidateDraws: (draws: Draw[]) => Draw[], setTrace: FetchDrawsParams["setTrace"], setHighlights: FetchDrawsParams["setHighlights"], setHistory: FetchDrawsParams["setHistory"], minValidDraws: number): boolean {
  try {
    if (!fallbackCSV || typeof fallbackCSV !== "string") return false;
    const rows = parseCSVorJSON(fallbackCSV) as { date: string; main: number[]; supp: number[] }[];
    const mapped: Draw[] = rows
      .filter((r) => Array.isArray(r.main) && Array.isArray(r.supp) && r.date !== "")
      .map((r) => ({ date: r.date, main: r.main.map(Number), supp: r.supp.map(Number) }));
    const valid = strictValidateDraws(mapped);
    if (valid.length === 0) return false;
    const ordered = valid.slice().sort((a, b) => parseCsvDateToEpoch(a.date) - parseCsvDateToEpoch(b.date));
    setHistory(ordered);
    setHighlights([]);
    setTrace((t) => [...t, `[TRACE] Loaded ${ordered.length} draws from bundled CSV fallback.`]);
    if (ordered.length < minValidDraws) {
      setTrace((t) => [...t, `[TRACE] CSV fallback draws < minValidDraws (${minValidDraws}). Proceeding anyway.`]);
    }
    return true;
  } catch (e) {
    setTrace((t) => [...t, `[TRACE] Failed to load CSV fallback: ${String(e)}`]);
    return false;
  }
}

/**
 * Fetch draw history from remote endpoint; falls back to local CSV, then stub history.
 */
export async function fetchDraws({
  apiUrl,
  minValidDraws,
  numMains,
  mainMin,
  mainMax,
  setHistory,
  setTrace,
  setHighlights,
  rng,
  strictValidateDraws,
}: FetchDrawsParams) {
  setTrace(t => [...t, "[TRACE] Fetching draws from primary public endpoint..."]);
  try {
    const res = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    if (!res.ok) throw new Error(`Non-200 response (${res.status})`);
    const data = await res.json();

    const draws: Draw[] = (data?.DrawResults || [])
      .filter((d: any) => d.ProductId === "WeekdayWindfall")
      .map((d: any) => ({ main: d.PrimaryNumbers, supp: d.SecondaryNumbers, date: d.DrawDate }));

    const validDraws = strictValidateDraws(draws);

    if (draws.length !== validDraws.length) {
      setTrace(t => [...t, `[TRACE] Warning: ${draws.length - validDraws.length} invalid draws discarded.`]);
    }

    if (validDraws.length >= minValidDraws) {
      const newestFirst = new Date(validDraws[0].date) > new Date(validDraws[validDraws.length - 1].date);
      const ordered = newestFirst ? validDraws.slice().reverse() : validDraws.slice();
      setHistory(ordered);
      setHighlights([]);
      setTrace(t => [...t, `[TRACE] Got ${validDraws.length} valid draws. Using ALL draws.`]);
      return;
    }

    setTrace(t => [...t, `[TRACE] Fewer than ${minValidDraws} valid draws from API; attempting CSV fallback...`]);
    const ok = tryLoadCsvFallback(strictValidateDraws, setTrace, setHighlights, setHistory, minValidDraws);
    if (ok) return;
  } catch (e) {
    setTrace(t => [...t, `[TRACE] Error fetching draws: ${String(e)}. Attempting CSV fallback...`]);
    const ok = tryLoadCsvFallback(strictValidateDraws, setTrace, setHighlights, setHistory, minValidDraws);
    if (ok) return;
  }

  // Stub fallback
  const stub: Draw[] = [];
  const now = Date.now();
  for (let i = 0; i < minValidDraws; i++) {
    stub.push({
      main: rng(numMains, mainMin, mainMax),
      supp: rng(2, mainMin, mainMax),
      date: new Date(now - (minValidDraws - 1 - i) * 86400 * 1000).toISOString().slice(0, 10),
    });
  }
  setHistory(stub);
  setHighlights([]);
  setTrace(t => [...t, `[TRACE] Stub history of ${stub.length} draws generated.`]);
}
