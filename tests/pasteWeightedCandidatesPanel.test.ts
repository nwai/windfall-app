import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasteWeightedCandidatesPanel } from "../src/components/candidates/PasteWeightedCandidatesPanel";
import type { Draw } from "../src/types";
import type { StageIdealDrawState } from "../src/lib/monthlyDrawSummary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (main: number[]): Draw => ({ date: "", main, supp: [] });

const stageState = (): StageIdealDrawState => ({
  bucketSets: {
    undrawn: new Set([1, 2, 3, 4, 5, 6, 7, 8]),
    times1: new Set([9, 10, 11, 12, 13, 14, 15, 16]),
    times2: new Set([17, 18, 19, 20, 21, 22, 23, 24]),
    times3: new Set([25, 26, 27, 28, 29, 30, 31, 32]),
    times4: new Set([33, 34, 35, 36, 37, 38]),
    times5: new Set([39, 40, 41]),
    times6: new Set([42]),
    times7: new Set([43]),
    times8: new Set([44, 45]),
  },
  currentDistribution: [8, 8, 8, 8, 6, 3, 1, 1, 2],
  targetDistribution: [7, 9, 8, 8, 6, 3, 1, 1, 2],
  idealDrawBucketCounts: [0, 2, 3, 2, 1, 0, 0, 0, 0],
  workingMonthLabel: "2026-06",
  expectedDrawCount: 13,
  targetStageDrawCount: 6,
  completedDrawCount: 5,
  comparableMonthCount: 4,
  expectedDrawCountSource: "auto",
  warnings: [],
});

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

  it("renders Stage IDM bucket-mix controls with six-main defaults", () => {
    const html = renderToStaticMarkup(React.createElement(PasteWeightedCandidatesPanel, {
      stageIdealDrawState: stageState(),
    }));

    expect(html).toContain("Stage IDM bucket mix");
    expect(html).toContain("Descriptive next-stage monthly bucket composition");
    expect(html).toContain("2026-06 · draw 6 of 13");
    expect(html).toContain("Mains-only default: 0x 0 · 1x 2 · 2x 2 · 3x 1 · 4x 1");
    expect(html).toContain("Reset to Stage IDM");
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

  it("reports generated rows for portfolio compression", async () => {
    const generatedCounts: number[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PasteWeightedCandidatesPanel, {
        initialPasteText: "1,2,3,4,5,6\n1,2,3,4,5,7\n8,9,10,11,12,13",
        initialCandidateCount: 4,
        onGeneratedCandidatesChange: (candidates) => generatedCounts.push(candidates.length),
      }));
    });

    const generateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Generate paste-weighted candidates");
    expect(generateButton).toBeDefined();
    await act(async () => {
      generateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(generatedCounts.at(-1)).toBeGreaterThan(0);

    const clearButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Clear");
    expect(clearButton).toBeDefined();
    await act(async () => {
      clearButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(generatedCounts.at(-1)).toBe(0);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("filters generated paste candidates through enabled Stage IDM controls", async () => {
    const generatedRows: number[][] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PasteWeightedCandidatesPanel, {
        initialPasteText: Array.from({ length: 45 }, (_, index) => index + 1).join(","),
        initialCandidateCount: 4,
        stageIdealDrawState: stageState(),
        onGeneratedCandidatesChange: (candidates) => {
          generatedRows.splice(0, generatedRows.length, ...candidates.map((candidate) => candidate.main));
        },
      }));
    });

    const stageCheckbox = Array.from(container.querySelectorAll("input[type='checkbox']"))
      .find((input) => input.parentElement?.textContent?.includes("Stage IDM bucket mix")) as HTMLInputElement | undefined;
    expect(stageCheckbox).toBeDefined();
    await act(async () => {
      stageCheckbox!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const generateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Generate paste-weighted candidates");
    expect(generateButton).toBeDefined();
    await act(async () => {
      generateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Stage IDM accepted:");
    expect(generatedRows).toHaveLength(4);
    for (const row of generatedRows) {
      expect(row.filter((number) => number >= 9 && number <= 16)).toHaveLength(2);
      expect(row.filter((number) => number >= 17 && number <= 24)).toHaveLength(2);
      expect(row.filter((number) => number >= 25 && number <= 32)).toHaveLength(1);
      expect(row.filter((number) => number >= 33 && number <= 38)).toHaveLength(1);
    }

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
