import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MonthlyDrawsSummaryPanel from "../src/components/MonthlyDrawsSummaryPanel";
import type { MonthlyBucketSets } from "../src/lib/monthlyDrawSummary";
import type { Draw } from "../src/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

const repeatDraws = (month: string, count: number, start = 1): Draw[] => (
  Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const base = ((start + index * 3 - 1) % 45) + 1;
    return draw(`${month}-${day}`, [
      base,
      ((base + 1 - 1) % 45) + 1,
      ((base + 2 - 1) % 45) + 1,
      ((base + 3 - 1) % 45) + 1,
      ((base + 4 - 1) % 45) + 1,
      ((base + 5 - 1) % 45) + 1,
    ], [
      ((base + 6 - 1) % 45) + 1,
      ((base + 7 - 1) % 45) + 1,
    ]);
  })
);

const setSelectValue = (select: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

const monthlyBucketRowTexts = (container: HTMLElement): string[] => (
  Array.from(container.querySelectorAll("tbody tr"))
    .map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "")
);

describe("MonthlyDrawsSummaryPanel planning month rollover", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    vi.useRealTimers();
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("publishes the synthetic planning buckets after a completed latest month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00"));
    const history = [
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-03", 13, 4),
      ...repeatDraws("2026-06", 13, 7),
    ];
    let publishedBuckets: MonthlyBucketSets | null = null;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, {
        history,
        onBucketSetsChange: (buckets) => {
          publishedBuckets = buckets;
        },
      }));
    });

    expect(container.textContent).toContain("Active buckets: 2026-07 (planning reset)");
    expect(publishedBuckets?.undrawn.size).toBe(45);
    expect(publishedBuckets?.times1.size).toBe(0);
  });

  it("sends Simulate 8 acceptance-needs numbers to the DGA simulation callback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00"));
    const history = [
      draw("2026-07-01", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];
    let simulatedNumbers: number[] | null = null;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, {
        history,
        onSimulateNumbers: (numbers: number[]) => {
          simulatedNumbers = numbers;
        },
      }));
    });

    for (let number = 1; number <= 8; number += 1) {
      const button = container.querySelector(`button[aria-label="Select ${number}"]`) as HTMLButtonElement | null;
      expect(button, `Select ${number} button`).toBeTruthy();
      await act(async () => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const simulateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Simulate 8") as HTMLButtonElement | undefined;
    expect(simulateButton).toBeTruthy();

    await act(async () => {
      simulateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Result");
    expect(simulatedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("hides monthly bucket rows that do not match the selected baseline month draw count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00"));
    const history = [
      ...repeatDraws("2026-01", 2, 1),
      ...repeatDraws("2026-02", 3, 10),
      ...repeatDraws("2026-03", 2, 20),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, { history }));
    });

    expect(monthlyBucketRowTexts(container)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("2026-03"),
        expect.stringContaining("2026-02"),
        expect.stringContaining("2026-01"),
      ]),
    );

    const baselineSelect = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.textContent === "2 draw months"));
    expect(baselineSelect).toBeTruthy();

    await act(async () => {
      setSelectValue(baselineSelect!, "2");
    });

    const filteredRows = monthlyBucketRowTexts(container);
    expect(filteredRows).toEqual([
      expect.stringContaining("2026-03"),
      expect.stringContaining("2026-01"),
    ]);
    expect(container.textContent).toContain("Showing 2 of 3 months");
    expect(container.textContent).not.toContain("2026-02");
  });

  it("keeps the current active month visible when filtering baseline month rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00"));
    const history = [
      ...repeatDraws("2026-01", 2, 1),
      ...repeatDraws("2026-02", 3, 10),
      ...repeatDraws("2026-03", 1, 20),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, { history }));
    });

    const baselineSelect = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.textContent === "2 draw months"));
    expect(baselineSelect).toBeTruthy();

    await act(async () => {
      setSelectValue(baselineSelect!, "2");
    });

    const filteredRows = monthlyBucketRowTexts(container);
    expect(filteredRows).toEqual([
      expect.stringContaining("2026-03"),
      expect.stringContaining("2026-01"),
    ]);
    expect(container.textContent).toContain("Showing 2 of 3 months");
    expect(container.textContent).toContain("Active buckets: 2026-03");
    expect(container.textContent).not.toContain("2026-02");
  });
});
