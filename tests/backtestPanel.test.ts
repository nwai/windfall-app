import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { BacktestPanel } from "../src/components/BacktestPanel";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (index: number, isSimulated = false): Draw => ({
  date: `2026-01-${String(index + 1).padStart(2, "0")}`,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
  isSimulated,
});

describe("BacktestPanel truthfulness warnings", () => {
  it("shows when simulated fallback rows are ignored by the backtest", async () => {
    const history = [
      ...Array.from({ length: 36 }, (_, index) => draw(index)),
      ...Array.from({ length: 5 }, (_, index) => draw(index + 36, true)),
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(BacktestPanel, { history }));
    });

    const runButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Run");
    expect(runButton).toBeDefined();

    await act(async () => {
      runButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Ignored 5 simulated fallback draw rows");
    expect(container.textContent).toContain("Draws evaluated:");
    expect(container.textContent).toContain("0");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
