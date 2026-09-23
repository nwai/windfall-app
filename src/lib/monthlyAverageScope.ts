import { parseDrawDateToEpoch } from "./recentDraws";

export const HISTORY_BASELINE_POLICY_VERSION = "opening-month-schedule-v2";
type FirstDate = string | number | Date | null | undefined;

/** Opening coverage only; internal gaps and completed-month eligibility are separate checks. */
export function isMonthExcludedFromHistoryBaselines(monthLabel: string | null | undefined, firstDate: FirstDate): boolean {
  if (!monthLabel || !/^\d{4}-\d{2}$/.test(monthLabel) || firstDate == null) return false;
  const [year, month] = monthLabel.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  const epoch = typeof firstDate === "string" ? parseDrawDateToEpoch(firstDate) : Number(firstDate);
  if (!Number.isFinite(epoch) || epoch <= 0) return false;
  const first = new Date(epoch);
  if (first.getFullYear() !== year || first.getMonth() !== month - 1) return false;
  const scheduled = new Date(year, month - 1, 1);
  while (![1, 3, 5].includes(scheduled.getDay())) scheduled.setDate(scheduled.getDate() + 1);
  return first.getDate() > scheduled.getDate();
}

export function getExcludedMonthLabelsForHistoryBaselines<T>(
  rows: readonly T[],
  getMonthLabel: (row: T) => string | null | undefined,
  getFirstDate: (row: T) => FirstDate,
): string[] {
  const earliest = rows.map(getMonthLabel).filter((label): label is string => Boolean(label)).sort()[0];
  if (!earliest) return [];
  const dates = rows.filter(row => getMonthLabel(row) === earliest).map(getFirstDate)
    .map(value => typeof value === "string" ? parseDrawDateToEpoch(value) : value == null ? NaN : Number(value))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!dates.length) return [];
  return isMonthExcludedFromHistoryBaselines(earliest, Math.min(...dates)) ? [earliest] : [];
}

export const filterRowsForHistoryBaselines = <T>(
  rows: readonly T[],
  getMonthLabel: (row: T) => string | null | undefined,
  getFirstDate: (row: T) => FirstDate,
): T[] => {
  const excludedMonthLabels = new Set(getExcludedMonthLabelsForHistoryBaselines(rows, getMonthLabel, getFirstDate));
  if (!excludedMonthLabels.size) return [...rows];
  return rows.filter((row) => !excludedMonthLabels.has(getMonthLabel(row) ?? ""));
};
