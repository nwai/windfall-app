export interface HeatmapContextWindow {
  start: number;
  end: number;
}

/**
 * Normalizes an optional highlighted window for column-based heatmaps.
 * Returns null when the full range is active so callers can skip dimming.
 */
export const normalizeHeatmapContextWindow = (
  columnCount: number,
  start?: number,
  end?: number,
): HeatmapContextWindow | null => {
  if (!Number.isFinite(columnCount) || columnCount <= 0) return null;

  const maxIndex = Math.max(0, Math.floor(columnCount) - 1);
  const safeStart = typeof start === "number" && Number.isFinite(start)
    ? Math.max(0, Math.min(maxIndex, Math.floor(start)))
    : 0;
  const safeEndCandidate = typeof end === "number" && Number.isFinite(end)
    ? Math.floor(end)
    : maxIndex;
  const safeEnd = Math.max(safeStart, Math.min(maxIndex, safeEndCandidate));

  if (safeStart === 0 && safeEnd === maxIndex) {
    return null;
  }

  return { start: safeStart, end: safeEnd };
};

/**
 * Returns the opacity to use for a heatmap column, dimming contextual history
 * that falls outside the active window.
 */
export const getHeatmapColumnOpacity = (
  columnIndex: number,
  window: HeatmapContextWindow | null,
  dimmedOpacity: number = 0.35,
  alwaysOpaqueColumns: number[] = [],
): number => {
  const safeDimmedOpacity = Math.max(0, Math.min(1, dimmedOpacity));

  const safeColumnIndex = Number.isFinite(columnIndex) ? Math.floor(columnIndex) : -1;
  if (alwaysOpaqueColumns.some((value) => Math.floor(value) === safeColumnIndex)) return 1;
  if (!window) return 1;

  return safeColumnIndex >= window.start && safeColumnIndex <= window.end ? 1 : safeDimmedOpacity;
};

export default normalizeHeatmapContextWindow;
