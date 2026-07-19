import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DGAVisualizer } from "../src/components/DGAVisualizer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const mountVisualizer = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      React.createElement(DGAVisualizer, {
        grid: [
          [1, 0, 0],
          [0, 2, 0],
        ],
        diamonds: [],
        predictions: [],
        drawLabels: ["1", "2"],
        numberLabels: ["1", "2"],
        numberCounts: [1, 1],
        minCount: 0,
        maxCount: 2,
        highlights: [],
        setHighlights: vi.fn(),
        controlsPosition: "below",
        cellSize: 23,
      }),
    );
  });

  return container;
};

const mountVisualizerWithStickyWindow = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      React.createElement(DGAVisualizer, {
        grid: [
          [0, 0, 1, 0, 0],
          [0, 0, 0, 2, 0],
        ],
        diamonds: [],
        predictions: [],
        drawLabels: ["1", "2", "3", "4"],
        numberLabels: ["1", "2"],
        numberCounts: [1, 1],
        minCount: 0,
        maxCount: 2,
        highlights: [],
        setHighlights: vi.fn(),
        controlsPosition: "below",
        cellSize: 23,
        wfmqyhStart: 2,
      }),
    );
  });

  return container;
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

describe("DGAVisualizer row sizing", () => {
  it("uses inset grid lines instead of physical borders so rows keep the requested pitch", async () => {
    const rendered = await mountVisualizer();
    const table = rendered.querySelector("table");
    const gridShell = table?.parentElement as HTMLDivElement | null;
    const firstBodyRow = rendered.querySelector("tbody tr");
    const rowHeader = firstBodyRow?.querySelector("td");
    const firstGridCell = firstBodyRow?.querySelectorAll("td")[1] as HTMLTableCellElement | undefined;

    expect(gridShell).toBeTruthy();
    expect(gridShell?.style.border).toBe("0px");
    expect(gridShell?.style.boxShadow).toContain("inset 0 0 0 1px");
    expect(rowHeader).toBeTruthy();
    expect(firstGridCell).toBeTruthy();
    expect((rowHeader as HTMLTableCellElement).style.height).toBe("23px");
    expect((rowHeader as HTMLTableCellElement).style.border).toBe("0px");
    expect((rowHeader as HTMLTableCellElement).style.boxShadow).toContain("inset 0 0 0 1px");
    expect(firstGridCell?.style.height).toBe("23px");
    expect(firstGridCell?.style.border).toBe("0px");
    expect(firstGridCell?.style.boxShadow).toContain("inset 0 0 0 1px");
  });

  it("keeps the active WFMQYH draw columns as a sticky translucent lens", async () => {
    const rendered = await mountVisualizerWithStickyWindow();
    const firstBodyRowCells = rendered.querySelectorAll("tbody tr:first-child td");
    const oldContextCell = firstBodyRowCells[1] as HTMLTableCellElement | undefined;
    const firstActiveCell = firstBodyRowCells[3] as HTMLTableCellElement | undefined;
    const secondActiveCell = firstBodyRowCells[4] as HTMLTableCellElement | undefined;
    const nextCell = firstBodyRowCells[5] as HTMLTableCellElement | undefined;

    expect(oldContextCell).toBeTruthy();
    expect(firstActiveCell).toBeTruthy();
    expect(secondActiveCell).toBeTruthy();
    expect(nextCell).toBeTruthy();
    expect(oldContextCell?.style.position).toBe("relative");
    expect(firstActiveCell?.style.position).toBe("sticky");
    expect(firstActiveCell?.style.right).toBe("59px");
    expect(secondActiveCell?.style.position).toBe("sticky");
    expect(secondActiveCell?.style.right).toBe("36px");
    expect(nextCell?.style.position).toBe("sticky");
    expect(nextCell?.style.right).toBe("0px");
  });
});
