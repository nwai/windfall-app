import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OddEvenRatioCadencePanel } from "../src/components/OddEvenRatioCadencePanel";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("OddEvenRatioCadencePanel", () => {
  it("renders an honest empty state", () => {
    const html = renderToStaticMarkup(React.createElement(OddEvenRatioCadencePanel, { draws: [] }));

    expect(html).toContain("Odd/Even Ratio Cadence");
    expect(html).toContain("No active draw history available.");
    expect(html).toContain("Intervals describe history only");
  });

  it("renders the configurable rare threshold choices from 1 to 5 percent", () => {
    const html = renderToStaticMarkup(React.createElement(OddEvenRatioCadencePanel, {
      draws: [
        draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
        draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
      ],
    }));
    const document = new DOMParser().parseFromString(html, "text/html");
    const thresholdSelect = document.querySelector("select[name='rarePercentThreshold']") as HTMLSelectElement | null;

    expect(thresholdSelect).not.toBeNull();
    expect(thresholdSelect?.value).toBe("5");
    expect(Array.from(thresholdSelect?.querySelectorAll("option") ?? []).map((option) => option.textContent)).toEqual([
      "1%",
      "2%",
      "3%",
      "4%",
      "5%",
    ]);
    expect(html).toContain("Observed ratio timeline");
    expect(html).toContain("Diagnostics");
  });

  it("updates the selected-ratio detail when a rare row is selected", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(OddEvenRatioCadencePanel, {
        draws: [
          draw("D1", [1, 3, 5, 7, 9, 11], [2, 4]),
          draw("D2", [1, 3, 5, 7, 2, 4], [6, 8]),
          draw("D3", [1, 3, 5, 7, 2, 4], [6, 8]),
        ],
      }));
    });

    const rareButton = container.querySelector("button[aria-label='Select ratio 8:0']") as HTMLButtonElement | null;
    expect(rareButton).not.toBeNull();

    await act(async () => {
      rareButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Selected ratio 8:0");
    expect(container.textContent).toContain("Never seen in this window");
    expect(container.textContent).toContain("Current gap");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
