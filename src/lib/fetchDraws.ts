import { Draw } from '../types';

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

/**
 * Fetch draw history from remote endpoint; falls back to stub history if:
 * - network error
 * - non-200
 * - returned valid draws < minValidDraws
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
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Non-200 response (${res.status})`);
    const data = await res.json();

    const draws: Draw[] = (data?.DrawResults || [])
      .filter((d: any) => d.ProductId === "WeekdayWindfall")
      .map((d: any) => ({
        main: d.PrimaryNumbers,
        supp: d.SecondaryNumbers,
        date: d.DrawDate,
      }));

    const validDraws = strictValidateDraws(draws);

    if (draws.length !== validDraws.length) {
      setTrace(t => [
        ...t,
        `[TRACE] Warning: ${draws.length - validDraws.length} invalid draws discarded.`,
      ]);
    }

    if (validDraws.length >= minValidDraws) {
      const newestFirst =
        new Date(validDraws[0].date) >
        new Date(validDraws[validDraws.length - 1].date);
      const ordered = newestFirst
        ? validDraws.slice().reverse()
        : validDraws.slice();
      setHistory(ordered);
      setHighlights([]);
      setTrace(t => [
        ...t,
        `[TRACE] Got ${validDraws.length} valid draws. Using ALL draws.`,
      ]);
      return;
    }

    setTrace(t => [
      ...t,
      `[TRACE] Fewer than ${minValidDraws} valid draws; generating stub history.`,
    ]);
  } catch (e) {
    setTrace(t => [
      ...t,
      `[TRACE] Error fetching draws: ${String(e)}. Using stub data.`,
    ]);
  }

  // Stub fallback
  const stub: Draw[] = [];
  const now = Date.now();
  for (let i = 0; i < minValidDraws; i++) {
    stub.push({
      main: rng(numMains, mainMin, mainMax),
      supp: rng(2, mainMin, mainMax),
      date: new Date(now - (minValidDraws - 1 - i) * 86400 * 1000)
        .toISOString()
        .slice(0, 10),
    });
  }
  setHistory(stub);
  setHighlights([]);
  setTrace(t => [...t, `[TRACE] Stub history of ${stub.length} draws generated.`]);
}