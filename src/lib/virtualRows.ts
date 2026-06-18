export interface VirtualRowWindowInput {
  totalRows: number;
  scrollTop: number;
  rowHeight: number;
  viewportHeight: number;
  overscan: number;
  enabled: boolean;
}

export interface VirtualRowWindow {
  startIdx: number;
  endIdx: number;
  topPad: number;
  bottomPad: number;
}

const finiteNonNegative = (value: number, fallback = 0): number => (
  Number.isFinite(value) ? Math.max(0, value) : fallback
);

export function computeVirtualRowWindow(input: VirtualRowWindowInput): VirtualRowWindow {
  const totalRows = Math.max(0, Math.floor(finiteNonNegative(input.totalRows)));
  if (!input.enabled || totalRows === 0) {
    return {
      startIdx: 0,
      endIdx: totalRows,
      topPad: 0,
      bottomPad: 0,
    };
  }

  const rowHeight = Math.max(1, finiteNonNegative(input.rowHeight, 1));
  const viewportHeight = Math.max(1, finiteNonNegative(input.viewportHeight, rowHeight));
  const overscan = Math.max(0, Math.floor(finiteNonNegative(input.overscan)));
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / rowHeight) + (2 * overscan));
  const maxStartIdx = Math.max(0, totalRows - visibleRows);
  const rawStartIdx = Math.max(0, Math.floor(finiteNonNegative(input.scrollTop) / rowHeight) - overscan);
  const startIdx = Math.min(rawStartIdx, maxStartIdx);
  const endIdx = Math.min(totalRows, startIdx + visibleRows);

  return {
    startIdx,
    endIdx,
    topPad: startIdx * rowHeight,
    bottomPad: Math.max(0, (totalRows - endIdx) * rowHeight),
  };
}
