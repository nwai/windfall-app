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
    totalDrawCount: 13,
    bucketSets: buildBucketSets({ 1: [1, 2, 3], 2: [4] }),
    drawStates: [
      { drawOrdinal: 1, drawDate: "2026-03-02", bucketSets: buildBucketSets({ 1: [1] }) },
      { drawOrdinal: 2, drawDate: "2026-03-04", bucketSets: buildBucketSets({ 1: [1, 2] }) },
      { drawOrdinal: 3, drawDate: "2026-03-06", bucketSets: buildBucketSets({ 1: [1, 2, 3] }) },
      { drawOrdinal: 4, drawDate: "2026-03-09", bucketSets: buildBucketSets({ 1: [1, 2, 3], 2: [4] }) },
    ],
  },
  {
    monthLabel: "2026-04",
    drawCount: 3,
    totalDrawCount: 13,
    bucketSets: buildBucketSets({ 1: [10, 11], 3: [12], 8: [13] }),
    drawStates: [
      { drawOrdinal: 1, drawDate: "2026-04-01", bucketSets: buildBucketSets({ 1: [10] }) },
      { drawOrdinal: 2, drawDate: "2026-04-03", bucketSets: buildBucketSets({ 1: [10, 11], 2: [12] }) },
      { drawOrdinal: 3, drawDate: "2026-04-06", bucketSets: buildBucketSets({ 1: [10, 11], 3: [12], 8: [13] }) },
    ],
  },
  {
    monthLabel: "2026-05",
    drawCount: 2,
    totalDrawCount: 13,
    bucketSets: buildBucketSets({ 1: [7], 2: [8, 9], 4: [17] }),
    drawStates: [
      { drawOrdinal: 1, drawDate: "2026-05-01", bucketSets: buildBucketSets({ 1: [7], 2: [8] }) },
      { drawOrdinal: 2, drawDate: "2026-05-04", bucketSets: buildBucketSets({ 1: [7], 2: [8, 9], 4: [17] }) },
    ],
  },
  {
    monthLabel: "2026-06",
    drawCount: 1,
    totalDrawCount: 13,
    bucketSets: buildBucketSets({ 1: [21], 2: [22] }),
    drawStates: [
      { drawOrdinal: 1, drawDate: "2026-06-01", bucketSets: buildBucketSets({ 1: [21] }) },
      { drawOrdinal: 2, drawDate: "2026-06-03", bucketSets: buildBucketSets({ 1: [21], 2: [22] }), isSimulated: true },
    ],
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
        currentMonthLabel: "2026-06",
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
  it("groups reversed scheduled draw-slot subcolumns under each month with readable y-axis labels", async () => {
    const rendered = await mountGrid();
    await expandGrid();

    const monthHeaders = Array.from(rendered.querySelectorAll("thead tr:first-child th"));
    expect(monthHeaders[1]?.textContent).toContain("2026-06");
    expect(monthHeaders[1]?.textContent).toContain("2/13");
    expect(monthHeaders[1]?.textContent).toContain("strip");
    expect(monthHeaders[2]?.textContent).toContain("2026-05");
    expect(monthHeaders[3]?.textContent).toContain("2026-04");
    expect(monthHeaders[4]?.textContent).toContain("2026-03");

    const topAxis = rendered.querySelector("[aria-label='Current month draw-slot x-axis for 2026-06']");
    expect(topAxis).toBeTruthy();
    expect(topAxis?.textContent ?? "").toContain("X-axis");
    expect(topAxis?.textContent ?? "").not.toContain("D1");
    expect(topAxis?.textContent ?? "").not.toContain("D13");
    expect(topAxis?.textContent ?? "").toContain("1");
    expect(topAxis?.textContent ?? "").toContain("13");
    const topAxisSlotLabels = Array.from(topAxis?.querySelectorAll("span[title]") ?? []).map((label) =>
      label.textContent?.trim(),
    );
    expect(topAxisSlotLabels.slice(0, 13)).toEqual(
      Array.from({ length: 13 }, (_, index) => String(13 - index)),
    );

    const drawHeaders = Array.from(rendered.querySelectorAll("thead tr:nth-child(2) th"));
    expect(drawHeaders).toHaveLength(52);
    expect(drawHeaders.map((header) => header.textContent?.trim()).slice(0, 13)).toEqual(
      Array.from({ length: 13 }, (_, index) => String(13 - index)),
    );
    const firstDrawHeaderStyle = (drawHeaders[0] as HTMLElement | undefined)?.style;
    expect(firstDrawHeaderStyle?.textAlign).toBe("center");
    expect(firstDrawHeaderStyle?.borderLeft).toBe("1px solid rgb(209, 213, 219)");
    expect(firstDrawHeaderStyle?.borderRight).toBe("1px solid rgb(209, 213, 219)");
    expect(drawHeaders[0]?.getAttribute("title")).toContain("D13");
    expect(drawHeaders[0]?.getAttribute("title")).toContain("no recorded draw state");
    expect(drawHeaders[11]?.getAttribute("title")).toContain("simulated");
    expect(drawHeaders[12]?.getAttribute("title")).toContain("2026-06-01");

    const futureSlotCell = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.includes("21 · 2026-06 · D13"),
    );
    expect(futureSlotCell?.getAttribute("title")).toContain("no recorded draw state");
    expect((futureSlotCell as HTMLElement | undefined)?.style.borderLeft).toBe("1px solid rgb(209, 213, 219)");
    expect((futureSlotCell as HTMLElement | undefined)?.style.borderRight).toBe("1px solid rgb(209, 213, 219)");

    const yAxisLabel = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.startsWith("21 · current strip bucket"),
    ) as HTMLElement | undefined;
    expect(yAxisLabel?.style.background).toBe("rgb(255, 255, 255)");
    expect(yAxisLabel?.style.color).toBe("rgb(15, 23, 42)");
  }, 15000);

  it("honors bucket opacity and selected ticks without dimming non-selected rows", async () => {
    const rendered = await mountGrid({ cellOpacity: 0.55, selectedNumbers: [21] });
    await expandGrid();

    expect(rendered.textContent).toContain("Grid opacity: 55%");
    const opacitySlider = Array.from(rendered.querySelectorAll("input[type='range']")).find((input) =>
      input.closest("label")?.textContent?.includes("Grid opacity"),
    ) as HTMLInputElement | undefined;
    expect(opacitySlider?.min).toBe("0.25");
    expect(opacitySlider?.max).toBe("1");
    expect(opacitySlider?.value).toBe("0.55");

    const populatedCell = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.includes("21 · 2026-06 · Sim D2"),
    ) as HTMLElement | undefined;
    expect(populatedCell).toBeTruthy();
    expect(populatedCell?.style.opacity).toBe("0.55");
    expect(populatedCell?.getAttribute("title")).toContain("selected in DGA strip");

    const yAxisLabel = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.startsWith("21 · current strip bucket"),
    ) as HTMLElement | undefined;
    expect(yAxisLabel?.style.opacity).toBe("1");
    expect(yAxisLabel?.style.color).toBe("rgb(15, 23, 42)");
    expect(yAxisLabel?.textContent).toContain("✓");

    const nonSelectedPopulatedCell = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.includes("22 · 2026-06 · Sim D2"),
    ) as HTMLElement | undefined;
    expect(nonSelectedPopulatedCell).toBeTruthy();
    expect(nonSelectedPopulatedCell?.style.opacity).toBe("0.55");
    expect(nonSelectedPopulatedCell?.getAttribute("title")).not.toContain("dimmed");

    const nonSelectedRowLabel = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.startsWith("22 · current strip bucket"),
    ) as HTMLElement | undefined;
    expect(nonSelectedRowLabel?.style.opacity).toBe("1");
    expect(nonSelectedRowLabel?.textContent).not.toContain("✓");
    expect(nonSelectedRowLabel?.getAttribute("title")).not.toContain("dimmed");
  }, 15000);

  it("shows whole-column bucket totals on hover and exposes linked hover copy", async () => {
    const hoverSpy = vi.fn();
    const rendered = await mountGrid({ hoveredNumber: 17, onHoverNumber: hoverSpy });
    await expandGrid();

    expect(rendered.textContent).toContain("Pinned current draw-state totals");
    expect(rendered.textContent).toContain(
      "Linked hover: 17 is highlighted in the DGA strip and the pinned current-month cell.",
    );

    const aprilCell = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.includes("13 · 2026-04 · D3"),
    );
    expect(aprilCell).toBeTruthy();

    await act(async () => {
      aprilCell?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(rendered.textContent).toContain("Hovered draw-state totals");
    expect(rendered.textContent).toContain("2026-04 · D3");
    expect(rendered.textContent).toContain("8x+: 1");

    const currentRowLabel = Array.from(rendered.querySelectorAll("tbody td")).find((cell) =>
      cell.getAttribute("title")?.startsWith("17 · current strip bucket"),
    );
    expect(currentRowLabel).toBeTruthy();

    await act(async () => {
      currentRowLabel?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(hoverSpy).toHaveBeenCalledWith(17);
  }, 15000);
});
