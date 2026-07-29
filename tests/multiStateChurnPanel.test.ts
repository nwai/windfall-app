import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MultiStateChurnPanel } from "../src/components/MultiStateChurnPanel";
import type { Draw } from "../src/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

const setSelectValue = (select: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("MultiStateChurnPanel month comparison", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("adds a compare-month table using the same active real-history slice", async () => {
    const latestFirstHistory = [
      draw("2026-02-05", [3, 9, 15, 21, 27, 33], [39, 45]),
      draw("2026-02-01", [2, 8, 14, 20, 26, 32], [38, 44]),
      draw("2026-01-08", [1, 7, 13, 19, 25, 31], [37, 43]),
      draw("2026-01-04", [4, 10, 16, 22, 28, 34], [40, 42]),
      draw("2026-01-01", [5, 11, 17, 23, 29, 35], [41, 45]),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MultiStateChurnPanel, {
        history: latestFirstHistory,
        churnThreshold: 2,
      }));
    });

    expect(container.textContent).toContain("Active slice shared by both tables: 5 real draws · 2026-01-01 to 2026-02-05");
    expect(container.textContent).toContain("Current Slice End");
    expect(container.textContent).toContain("Compare: 2026-01");
    expect(container.textContent).toContain("using slice start through that month-end");

    const monthSelect = container.querySelector('select[aria-label="Select month to compare"]') as HTMLSelectElement | null;
    expect(monthSelect).toBeTruthy();
    expect(Array.from(monthSelect?.options ?? []).map((option) => option.value)).toEqual(["2026-02", "2026-01"]);

    await act(async () => {
      setSelectValue(monthSelect!, "2026-02");
    });

    expect(container.textContent).toContain("Compare: 2026-02");
    expect(container.textContent).toContain("As of 2026-02-05; 2 draws in 2026-02");
  });
});
