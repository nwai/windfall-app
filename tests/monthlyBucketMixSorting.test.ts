import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import MonthlyDrawsSummaryPanel from "../src/components/MonthlyDrawsSummaryPanel";

it("defaults to the requested priority, keeps column sorts in sync and preserves the applied mix", async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onTargetChange = vi.fn();

  try {
    await act(async () => {
      root.render(React.createElement(MonthlyDrawsSummaryPanel, {
        history: [{ date: "2026-07-01", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }],
        today: new Date("2026-07-02T12:00:00"),
        onAppliedBucketMixTargetChange: onTargetChange,
      }));
    });
    const table = container.querySelector('[data-testid="bucket-mix-combinatorics-table"]') as HTMLTableElement;
    const stage = table.querySelector('button[aria-label="Sort Stage path descending"]') as HTMLButtonElement;
    const combinations = table.querySelector('button[aria-label="Sort Actual combinations descending"]') as HTMLButtonElement;
    const undrawn = table.querySelector('button[aria-label="Sort Undrawn ascending"]') as HTMLButtonElement;
    const sortSelect = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.value === "undrawn:desc"))!;
    const bucketCount = (row: HTMLTableRowElement, index: number) => (
      Number(row.cells[index].querySelector("span > span:last-child")?.textContent)
    );
    const undrawnCounts = () => Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
      .map((item) => bucketCount(item, 1));
    const values = () => Array.from(table.querySelectorAll("tbody tr"))
      .map((item) => BigInt(item.children[3].textContent!.replace(/,/g, "")));
    expect(sortSelect.value).toBe("undrawn:desc");
    expect(undrawnCounts()).toEqual([...undrawnCounts()].sort((a, b) => b - a));
    expect(undrawn.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    expect(combinations.closest("th")?.getAttribute("aria-sort")).toBe("none");
    expect(table.querySelector("thead th")?.textContent).toBe("Row");

    await act(async () => undrawn.click());
    expect(sortSelect.value).toBe("undrawn:asc");
    expect(undrawnCounts()).toEqual([...undrawnCounts()].sort((a, b) => a - b));

    await act(async () => stage.click());
    expect(stage.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    expect(stage.getAttribute("aria-label")).toBe("Sort Stage path ascending");
    expect(sortSelect.value).toBe("stagePath:desc");
    expect(combinations.closest("th")?.getAttribute("aria-sort")).toBe("none");
    const chosen = table.querySelector("tbody tr") as HTMLTableRowElement;
    const counts = [bucketCount(chosen, 1), bucketCount(chosen, 2)];
    await act(async () => (chosen.querySelector("button") as HTMLButtonElement).click());
    expect(onTargetChange.mock.lastCall?.[0].counts).toMatchObject({ undrawn: counts[0], times1: counts[1] });
    const callsAfterApply = onTargetChange.mock.calls.length;

    await act(async () => stage.click());
    expect(stage.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    await act(async () => combinations.click());
    expect(combinations.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    await act(async () => combinations.click());
    expect(combinations.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    expect(sortSelect.value).toBe("actualCombinations:asc");
    expect(values()).toEqual([...values()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0));

    await act(async () => {
      sortSelect.value = "undrawn:desc";
      sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(undrawnCounts()).toEqual([...undrawnCounts()].sort((a, b) => b - a));
    expect(undrawn.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    expect(stage.closest("th")?.getAttribute("aria-sort")).toBe("none");
    expect(combinations.closest("th")?.getAttribute("aria-sort")).toBe("none");
    const appliedButton = table.querySelector('button[aria-pressed="true"]') as HTMLButtonElement;
    expect(appliedButton.textContent).toBe("Applied");
    const appliedRow = appliedButton.closest("tr")!;
    expect([bucketCount(appliedRow, 1), bucketCount(appliedRow, 2)]).toEqual(counts);
    expect(onTargetChange.mock.calls.length).toBe(callsAfterApply);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

it("keeps the combined sort available when the Undrawn bucket column is absent", async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const history = ["01", "03", "06", "08", "10", "13"].map((day, drawIndex) => {
    const numbers = Array.from({ length: 8 }, (_, index) => (drawIndex * 8 + index) % 45 + 1);
    return { date: `2026-07-${day}`, main: numbers.slice(0, 6), supp: numbers.slice(6) };
  });

  try {
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history,
      today: new Date("2026-07-14T12:00:00"),
    })));
    const table = container.querySelector('[data-testid="bucket-mix-combinatorics-table"]') as HTMLTableElement;
    const sortSelect = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.value === "undrawn:desc"))!;
    expect(table.querySelector('button[aria-label^="Sort Undrawn"]')).toBeNull();
    expect(sortSelect.value).toBe("undrawn:desc");
    await act(async () => (table.querySelector('button[aria-label="Sort Actual combinations descending"]') as HTMLButtonElement).click());
    expect(sortSelect.value).toBe("actualCombinations:desc");
    await act(async () => {
      sortSelect.value = "undrawn:desc";
      sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(sortSelect.value).toBe("undrawn:desc");
    expect(table.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
