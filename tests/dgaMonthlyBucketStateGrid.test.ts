import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import DGAMonthlyBucketStateGrid from "../src/components/DGAMonthlyBucketStateGrid";
import type { MonthlyBucketTimelineEntry } from "../src/lib/monthlyBucketTimeline";
import { createEmptyMonthlyBucketSets, type MonthlyBucketSets } from "../src/lib/monthlyDrawSummary";

type BucketTimes = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const buildBucketSets = (numbersByTimes: Partial<Record<BucketTimes, number[]>>): MonthlyBucketSets => {
  const bucketSets = createEmptyMonthlyBucketSets();
  const bucketMap: Record<BucketTimes, Set<number>> = {
    0: bucketSets.undrawn,
    1: bucketSets.times1,
    2: bucketSets.times2,
    3: bucketSets.times3,
    4: bucketSets.times4,
    5: bucketSets.times5,
    6: bucketSets.times6,
    7: bucketSets.times7,
    8: bucketSets.times8,
  };
  const assigned = new Set<number>();

  Object.entries(numbersByTimes).forEach(([times, numbers]) => {
    (numbers ?? []).forEach((value) => {
      bucketMap[Number(times) as BucketTimes].add(value);
      assigned.add(value);
    });
  });

  for (let number = 1; number <= 45; number += 1) {
    if (!assigned.has(number)) {
      bucketSets.undrawn.add(number);
    }
  }

  return bucketSets;
};

const timeline: MonthlyBucketTimelineEntry[] = [
  {
    monthLabel: "2026-03",
    drawCount: 4,
    bucketSets: buildBucketSets({ 1: [1, 2, 3], 2: [4] }),
  },
  {
    monthLabel: "2026-04",
    drawCount: 3,
    bucketSets: buildBucketSets({ 1: [10, 11], 3: [12], 8: [13] }),
  },
  {
    monthLabel: "2026-05",
    drawCount: 2,
    bucketSets: buildBucketSets({ 1: [7], 2: [8, 9], 4: [17] }),
  },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const mountGrid = async (
  props: Partial<React.ComponentProps<typeof DGAMonthlyBucketStateGrid>> = {},
): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      React.createElement(DGAMonthlyBucketStateGrid, {
        timeline,
        currentMonthLabel: "2026-05",
        cellSize: 20,
        ...props,
      }),
    );
  });

  return container;
};

const expandGrid = async (): Promise<void> => {
  const toggleButton = container?.querySelector("button");
  expect(toggleButton).toBeTruthy();

  await act(async () => {
    toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

describe("DGAMonthlyBucketStateGrid", () => {
  it("pins the current month column before older months", async () => {
    const rendered = await mountGrid();
    await expandGrid();

    const headers = Array.from(rendered.querySelectorAll("thead th"));
    expect(headers).toHaveLength(4);
    expect(headers[1]?.textContent).toContain("2026-05");
    expect(headers[1]?.textContent).toContain("strip");
    expect(headers[2]?.textContent).toContain("2026-04");
    expect(headers[3]?.textContent).toContain("2026-03");
    expect((headers[1] as HTMLTableCellElement).style.position).toBe("sticky");
    expect((headers[1] as HTMLTableCellElement).style.left).toBe("46px");
  });

  it("shows whole-column bucket totals on hover and exposes linked hover copy", async () => {
    const hoverSpy = vi.fn();
    const rendered = await mountGrid({ hoveredNumber: 17, onHoverNumber: hoverSpy });
    await expandGrid();

    expect(rendered.textContent).toContain("Pinned current month totals");
    expect(rendered.textContent).toContain(
      "Linked hover: 17 is highlighted in the DGA strip and the pinned current-month cell.",
    );

    const aprilCell = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.includes("10 · 2026-04"),
    );
    expect(aprilCell).toBeTruthy();

    await act(async () => {
      aprilCell?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(rendered.textContent).toContain("Hovered month totals");
    expect(rendered.textContent).toContain("2026-04");
    expect(rendered.textContent).toContain("8x+: 1");

    const currentRowLabel = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.startsWith("17 · current strip bucket"),
    );
    expect(currentRowLabel).toBeTruthy();

    await act(async () => {
      currentRowLabel?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(hoverSpy).toHaveBeenCalledWith(17);
  });
});
