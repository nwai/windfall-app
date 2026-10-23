import type { DrawRow } from "./drawHistory";
import { buildHistoryExactKey, normalizeHistoryDate } from "./drawHistoryReview";
import { validateDrawEntry } from "./drawHistoryValidation";

// Public data endpoint and product identifiers used by The Lott results page.
export const OFFICIAL_RESULTS_URL = "https://data.api.thelott.com/sales/vmax/web/data/lotto/latestresults";
export const OFFICIAL_RESULTS_PAGE = "https://www.thelott.com/weekday-windfall/results";
export const OFFICIAL_RESULTS_LIMIT = 50;
export type OfficialDrawCheck = {
  status: "matched" | "mismatch" | "unavailable";
  message: string;
  checkedAt: string;
  official?: DrawRow;
  drawNumber?: number;
};
const validation = { mainCount: 6, suppCount: 2, minNumber: 1, maxNumber: 45, outputDateFormat: "iso" as const };

export function compareOfficialDrawResult(input: DrawRow, payload: unknown, checkedAt = new Date().toISOString()): OfficialDrawCheck {
  const unavailable = (message: string): OfficialDrawCheck => ({ status: "unavailable", message, checkedAt });
  const object = payload as { Success?: unknown; DrawResults?: unknown } | null;
  if (!object || object.Success !== true || !Array.isArray(object.DrawResults)) {
    return unavailable("The official service did not return a successful draw-results response. No fallback data was used.");
  }
  const date = normalizeHistoryDate(input.date);
  const matches = object.DrawResults.filter((row: unknown) => {
    const item = row as Record<string, unknown> | null;
    return item?.ProductId === "MondayWednesdayFridayLotto" && typeof item.DrawDate === "string"
      && /^\d{4}-\d{2}-\d{2}T/.test(item.DrawDate) && item.DrawDate.slice(0, 10) === date;
  }) as Record<string, unknown>[];
  if (matches.length !== 1) return unavailable(matches.length
    ? "The official response contains duplicate results for this date; verification was refused."
    : `No official Weekday Windfall result for ${date} was returned in the latest ${OFFICIAL_RESULTS_LIMIT} draws. It may not yet be published or may be outside this feed's range.`);
  const result = matches[0];
  const mains = result.PrimaryNumbers, supps = result.SecondaryNumbers;
  if (!Array.isArray(mains) || !Array.isArray(supps) || [...mains, ...supps].some(n => typeof n !== "number")) {
    return unavailable("The official result has an unexpected number format; verification was refused.");
  }
  const official = validateDrawEntry({ date: date ?? "", mains: mains.map(String), supps: supps.map(String) }, validation);
  const entered = validateDrawEntry({ date: input.date, mains: input.mains.map(String), supps: input.supps.map(String) }, validation);
  if (!official.ok || !entered.ok || input.isSimulated) return unavailable("Both entries must contain a valid real draw date, six mains and two supps before comparison.");
  const matched = buildHistoryExactKey(official.row) === buildHistoryExactKey(entered.row);
  return { status: matched ? "matched" : "mismatch", official: official.row,
    drawNumber: Number.isInteger(result.DrawNumber) ? result.DrawNumber as number : undefined, checkedAt,
    message: matched ? "Matches The Lott's published result. Mains and supplementary numbers were checked separately."
      : "Does not match The Lott's published result. Check the date, mains and supplementary numbers before saving." };
}

export async function checkOfficialDrawResult(input: DrawRow, signal?: AbortSignal): Promise<OfficialDrawCheck> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(OFFICIAL_RESULTS_URL, { method: "POST", credentials: "omit", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: controller.signal,
      body: JSON.stringify({ CompanyId: "Tattersalls", MaxDrawCountPerProduct: OFFICIAL_RESULTS_LIMIT,
        OptionalProductFilter: ["MondayWednesdayFridayLotto"] }) });
    if (!response.ok) throw new Error(`Official service returned HTTP ${response.status}`);
    return compareOfficialDrawResult(input, await response.json());
  } catch (error) {
    return { status: "unavailable", checkedAt: new Date().toISOString(),
      message: `${controller.signal.aborted ? "Official check timed out or was cancelled" : error instanceof Error ? error.message : "Official service unavailable"}. No CSV, simulated or cached fallback was treated as verification.` };
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
