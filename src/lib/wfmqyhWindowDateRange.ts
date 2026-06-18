import type { Draw } from "../types";

type DatedDraw = Pick<Draw, "date">;

export function formatWfmqyhDateRange(draws: readonly DatedDraw[]): string {
  const dates = draws
    .map((draw) => String(draw.date ?? "").trim())
    .filter((date) => date.length > 0);

  if (dates.length === 0) {
    return "Custom date range: no active draws";
  }

  const firstDate = dates[0];
  const latestDate = dates[dates.length - 1];

  if (firstDate === latestDate) {
    return `Custom date range: ${firstDate} only`;
  }

  return `Custom date range: ${firstDate} to ${latestDate}`;
}
