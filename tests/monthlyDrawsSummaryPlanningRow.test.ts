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
});
