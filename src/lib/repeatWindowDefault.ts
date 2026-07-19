import type { Draw } from "../types";

function parseDrawDateToEpoch(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const slashParts = trimmed.split("/");
  if (slashParts.length >= 3) {
    const month = Number(slashParts[0]);
    const day = Number(slashParts[1]);
    let year = Number(slashParts[2]);
    if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
    if (year < 100) year = 2000 + year;
    return new Date(year, month - 1, day).getTime();
  }
  const fallback = Date.parse(trimmed);
  return Number.isNaN(fallback) ? null : fallback;
}

function monthLabelForEpoch(epoch: number): string {
  const date = new Date(epoch);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export interface LatestObservedMonthDrawCount {
  monthLabel: string;
  drawCount: number;
}

export function getLatestObservedMonthDrawCount(draws: readonly Draw[]): LatestObservedMonthDrawCount | null {
  let latestEpoch: number | null = null;
  const monthCounts = new Map<string, number>();

  draws.forEach((draw) => {
    if (draw.isSimulated) return;
    const epoch = parseDrawDateToEpoch(draw.date);
    if (epoch === null) return;
    const monthLabel = monthLabelForEpoch(epoch);
    monthCounts.set(monthLabel, (monthCounts.get(monthLabel) ?? 0) + 1);
    if (latestEpoch === null || epoch > latestEpoch) latestEpoch = epoch;
  });

  if (latestEpoch === null) return null;
  const monthLabel = monthLabelForEpoch(latestEpoch);
  return {
    monthLabel,
    drawCount: monthCounts.get(monthLabel) ?? 0,
  };
}
