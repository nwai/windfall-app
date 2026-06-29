import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { MonthlyDigitOccurrencePanel } from "../src/components/MonthlyDigitOccurrencePanel";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const unevenHistory: Draw[] = [
  { date: "2024-01-03", main: [1, 2, 10, 11, 12, 13], supp: [] },
  { date: "2024-01-10", main: [3, 4, 14, 15, 16, 17], supp: [] },
  { date: "2024-01-17", main: [5, 6, 7, 8, 9, 10], supp: [] },
  { date: "2024-02-02", main: [1, 10, 11, 12, 13, 14], supp: [] },
  { date: "2024-02-09", main: [2, 3, 4, 5, 6, 7], supp: [] },
];

const getMonthDrawCell = (monthLabel: string): string => {
  const row = Array.from(container?.querySelectorAll("tbody tr") ?? [])
    .find((candidate) => candidate.textContent?.includes(monthLabel));
  const drawCell = row?.querySelectorAll("td")[1];
  return drawCell?.textContent?.trim() ?? "";
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

describe("MonthlyDigitOccurrencePanel", () => {
  it("can toggle the breakdown table to equal monthly draw counts", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDigitOccurrencePanel, { history: unevenHistory }));
    });

    expect(getMonthDrawCell("2024-01")).toBe("3");
    expect(container.textContent).not.toContain("Showing first 2 draws per month.");

    const equalDrawToggle = container.querySelector("input[aria-label='Compare equal monthly draw counts']") as HTMLInputElement | null;
    expect(equalDrawToggle).not.toBeNull();

    await act(async () => {
      equalDrawToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(getMonthDrawCell("2024-01")).toBe("2 / 3");
    expect(getMonthDrawCell("2024-02")).toBe("2");
    expect(container.textContent).toContain("Showing first 2 draws per month.");
  });
});
