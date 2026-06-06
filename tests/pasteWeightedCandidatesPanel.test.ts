import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasteWeightedCandidatesPanel } from "../src/components/candidates/PasteWeightedCandidatesPanel";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (main: number[]): Draw => ({ date: "", main, supp: [] });

describe("PasteWeightedCandidatesPanel", () => {
  it("renders the paste-weighted candidate controls without seeded fake input", () => {
    const html = renderToStaticMarkup(React.createElement(PasteWeightedCandidatesPanel));
    const document = new DOMParser().parseFromString(html, "text/html");
    const panel = document.querySelector("section[aria-label='Paste-Weighted Candidate Generator']");

    expect(html).toContain("Paste-Weighted Candidate Generator");
    expect(html).toContain("Paste candidate rows");
    expect(html).toContain("Candidate rows");
    expect(html).toContain("Paste constraints");
    expect(html).toContain("Ending 5");
    expect(html).toContain("5, 15, 25, 35, 45");
    expect(html).toContain("Ending 0");
    expect(html).toContain("10, 20, 30, 40");
    expect(html).toContain("Odd/even mains");
    expect(html).toContain("Mains only");
    expect(html).toContain("<option value=\"4\">4</option>");
    expect(html).toContain("<option value=\"30\">30</option>");
    expect(panel?.classList.contains("windfall-ledger-panel")).toBe(true);
    expect(document.querySelector(".windfall-action-band")).not.toBeNull();
    expect(document.querySelector(".windfall-status-strip")).not.toBeNull();
    expect(html).not.toContain("3,12,14,28,29,30");
  });

  it("renders paste-derived mains-only odd/even ratio choices", () => {
    const html = renderToStaticMarkup(React.createElement(PasteWeightedCandidatesPanel, {
      initialPasteText: [
        "1,3,5,2,4,6",
        "1,3,5,7,2,4",
        "2,4,6,8,10,12",
      ].join("\n"),
    }));

    expect(html).toContain("3:3");
    expect(html).toContain("4:2");
    expect(html).toContain("0:6");
  });

  it("renders adaptive WFMQYH evidence with latest-50 shrink target", () => {
    const fullHistory = [
      ...Array.from({ length: 30 }, () => draw([1, 10, 12, 14, 16, 18])),
      ...Array.from({ length: 20 }, () => draw([10, 12, 14, 16, 18, 20])),
    ];
    const activeHistory = [
      ...Array.from({ length: 10 }, () => draw([1, 3, 10, 12, 14, 16])),
      ...Array.from({ length: 10 }, () => draw([1, 10, 12, 14, 16, 18])),
    ];

    const html = renderToStaticMarkup(React.createElement(PasteWeightedCandidatesPanel, {
      fullHistory,
      activeHistory,
      activeWindowLabel: "Weekly",
    }));

    expect(html).toContain("Adaptive shape");
    expect(html).toContain("Weekly");
    expect(html).toContain("20 active draws");
    expect(html).toContain("shrunk toward latest 50");
    expect(html).toContain("S1:0 D0:5");
    expect(html).toContain("56%");
  });

  it("sends a generated paste-weighted row to simulation", async () => {
    const simulatedRows: number[][] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PasteWeightedCandidatesPanel, {
        initialPasteText: "1,2,3,4,5,6\n1,2,3,4,5,7\n8,9,10,11,12,13",
        initialCandidateCount: 4,
        onSimulateCandidate: (numbers: number[]) => simulatedRows.push(numbers),
      }));
    });

    const generateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Generate paste-weighted candidates");
    expect(generateButton).toBeDefined();
    await act(async () => {
      generateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const simulateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Simulate");
    expect(simulateButton).toBeDefined();
    await act(async () => {
      simulateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(simulatedRows).toHaveLength(1);
    expect(simulatedRows[0]).toHaveLength(6);
    expect(simulatedRows[0]).toEqual([...simulatedRows[0]].sort((left, right) => left - right));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
