import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortfolioCompressionPanel } from "../src/components/candidates/PortfolioCompressionPanel";
import type { MonthlyBucketSets } from "../src/lib/monthlyDrawSummary";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

const bucketSets = (entries: Partial<Record<keyof MonthlyBucketSets, number[]>>): MonthlyBucketSets => ({
  undrawn: new Set(entries.undrawn ?? []),
  times1: new Set(entries.times1 ?? []),
  times2: new Set(entries.times2 ?? []),
  times3: new Set(entries.times3 ?? []),
  times4: new Set(entries.times4 ?? []),
  times5: new Set(entries.times5 ?? []),
  times6: new Set(entries.times6 ?? []),
  times7: new Set(entries.times7 ?? []),
  times8: new Set(entries.times8 ?? []),
});

describe("PortfolioCompressionPanel", () => {
  it("renders the V1 portfolio compression controls without seeded fake input", () => {
    const html = renderToStaticMarkup(React.createElement(PortfolioCompressionPanel));
    const document = new DOMParser().parseFromString(html, "text/html");
    const panel = document.querySelector("section[aria-label='Portfolio Compression / 12-Game Distiller']");

    expect(html).toContain("Portfolio Compression / 12-Game Distiller");
    expect(html).toContain("Paste portfolio games");
    expect(html).toContain("Top-six core");
    expect(html).toContain("Alternates");
    expect(panel?.classList.contains("windfall-ledger-panel")).toBe(true);
    expect(html).not.toContain("1,2,3,4,5,6");
  });

  it("renders a frequency-ranked six-number core from pasted portfolio rows", () => {
    const html = renderToStaticMarkup(React.createElement(PortfolioCompressionPanel, {
      initialPasteText: [
        "1,2,3,4,5,6,7,8",
        "1,2,3,4,5,9,10,11",
        "1,2,3,4,12,13,14,15",
        "1,2,3,16,17,18,19,20",
        "1,2,21,22,23,24,25,26",
        "1,27,28,29,30,31,32,33",
      ].join("\n"),
    }));

    expect(html).toContain("1, 2, 3, 4, 5, 6");
    expect(html).toContain("1. 1");
    expect(html).toContain("6 games");
    expect(html).toContain("100.0%");
    expect(html).toContain("Alternate");
  });

  it("loads each generated candidate source once while preserving duplicate rows", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        candidateSources: [
          {
            id: "main-generated",
            label: "Generated Candidates",
            candidates: [
              [1, 2, 3, 4, 5, 6],
              [1, 2, 3, 4, 5, 7],
            ],
          },
          {
            id: "paste-weighted",
            label: "Paste-Weighted",
            candidates: [
              [1, 2, 3, 4, 5, 6],
            ],
          },
        ],
      }));
    });

    const loadButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Load current generated candidates");
    expect(loadButton).toBeDefined();

    await act(async () => {
      loadButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Games parsed3");
    expect(container.textContent).toContain("3 rows loaded");
    expect(container.textContent).toContain("Duplicate games1");
    expect(container.textContent).toContain("Loaded source rows");
    expect(container.textContent).toContain("Generated Candidates");
    expect(container.textContent).toContain("Paste-Weighted");
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value.split("\n")).toHaveLength(3);

    const loadedRowsScroller = container.querySelector(
      "[data-testid='portfolio-loaded-source-rows-scroll']",
    ) as HTMLDivElement | null;
    expect(loadedRowsScroller).toBeTruthy();
    expect(loadedRowsScroller?.style.overflowX).toBe("auto");
    expect(loadedRowsScroller?.style.overflowY).toBe("auto");
    expect(loadedRowsScroller?.style.maxHeight).toBe("150px");

    await act(async () => {
      loadButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect((container.querySelector("textarea") as HTMLTextAreaElement).value.split("\n")).toHaveLength(3);
    expect(container.textContent).toContain("No new candidate rows to load");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("copies the top-six core and core plus alternates as plain text", async () => {
    const copiedText: string[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6,7,8",
          "1,2,3,4,5,9,10,11",
          "1,2,3,4,12,13,14,15",
          "1,2,3,16,17,18,19,20",
          "1,2,21,22,23,24,25,26",
          "1,27,28,29,30,31,32,33",
        ].join("\n"),
        copyText: (text: string) => {
          copiedText.push(text);
        },
      }));
    });

    const copyCoreButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Copy top-six core");
    expect(copyCoreButton).toBeDefined();
    await act(async () => {
      copyCoreButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(copiedText[0]).toBe("1, 2, 3, 4, 5, 6");
    expect(container.textContent).toContain("Copied top-six core");

    const copyCoreAlternatesButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Copy core + alternates");
    expect(copyCoreAlternatesButton).toBeDefined();
    await act(async () => {
      copyCoreAlternatesButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(copiedText[1]).toContain("Core: 1, 2, 3, 4, 5, 6");
    expect(copiedText[1]).toContain("Alternates:");
    expect(container.textContent).toContain("Copied core and alternates");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("simulates the top-six core as six main numbers without changing the core", async () => {
    const simulatedCores: number[][] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6,7,8",
          "1,2,3,4,5,9,10,11",
          "1,2,3,4,12,13,14,15",
          "1,2,3,16,17,18,19,20",
          "1,2,21,22,23,24,25,26",
          "1,27,28,29,30,31,32,33",
        ].join("\n"),
        onSimulateCore: (numbers: number[]) => {
          simulatedCores.push(numbers);
        },
      }));
    });

    const simulateCoreButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Simulate top-six core") as HTMLButtonElement | undefined;
    expect(simulateCoreButton).toBeDefined();
    expect(simulateCoreButton?.disabled).toBe(false);

    await act(async () => {
      simulateCoreButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(simulatedCores).toEqual([[1, 2, 3, 4, 5, 6]]);
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6,7,8",
          "1,2,3,4,5,9,10,11",
          "1,2,3,4,12,13,14,15",
          "1,2,3,16,17,18,19,20",
          "1,2,21,22,23,24,25,26",
          "1,27,28,29,30,31,32,33",
        ].join("\n"),
        onSimulateCore: (numbers: number[]) => {
          simulatedCores.push(numbers);
        },
        activeSimulatedKey: "1,2,3,4,5,6",
      }));
    });

    expect(container.textContent).toContain("Core simulated");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("runs the portfolio compression backtest without changing the count-compressed core", async () => {
    const lowRun = [1, 2, 3, 4, 5, 6];
    const highRun = [40, 41, 42, 43, 44, 45];
    const backtestHistory = Array.from({ length: 18 }, (_, index) => (
      draw(`2026-01-${String(index + 1).padStart(2, "0")}`, index % 2 === 0 ? lowRun : highRun)
    ));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6,7,8",
          "1,2,3,4,5,9,10,11",
          "1,2,3,4,12,13,14,15",
          "1,2,3,16,17,18,19,20",
          "1,2,21,22,23,24,25,26",
          "1,27,28,29,30,31,32,33",
        ].join("\n"),
        backtestHistory,
        initialBacktestMinTrainingDraws: 5,
        initialBacktestMonteCarloIterations: 64,
      }));
    });

    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");
    expect(container.textContent).toContain("Backtest Portfolio Compression V1");

    const runButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Run portfolio backtest");
    expect(runButton).toBeDefined();

    await act(async () => {
      runButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Walk-forward results");
    expect(container.textContent).toContain("Compressed structural pattern");
    expect(container.textContent).toContain("Simple historical frequency");
    expect(container.textContent).toContain("Monte Carlo random-history p-value");
    expect(container.textContent).toContain("Walk-forward only");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders evidence readiness labels with optional signals off by default", () => {
    const html = renderToStaticMarkup(React.createElement(PortfolioCompressionPanel));

    expect(html).toContain("Evidence readiness");
    expect(html).toContain("Observe-only");
    expect(html).toContain("Count compression");
    expect(html).toContain("Observed");
    expect(html).toContain("Always on");
    expect(html).toContain("Generated frequency");
    expect(html).toContain("Paste-weighted frequency");
    expect(html).toContain("Adjacent combos");
    expect(html).toContain("Hot/cold");
    expect(html).toContain("Window shape");
    expect(html).toContain("Monthly buckets");
    expect(html).toContain("Carry-over bias");
    expect(html).toContain("Selected boosts");
    expect(html).toContain("Backtest calibration");
    expect(html).toContain("0 optional signals active");
  });

  it("toggles evidence signals without changing the count-compressed core", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6,7,8",
          "1,2,3,4,5,9,10,11",
          "1,2,3,4,12,13,14,15",
          "1,2,3,16,17,18,19,20",
          "1,2,21,22,23,24,25,26",
          "1,27,28,29,30,31,32,33",
        ].join("\n"),
      }));
    });

    const textareaBefore = container.textContent ?? "";
    expect(textareaBefore).toContain("1, 2, 3, 4, 5, 6");
    expect(textareaBefore).toContain("0 optional signals active");

    const generatedFrequencyToggle = container.querySelector(
      "input[aria-label='Toggle Generated frequency evidence']",
    ) as HTMLInputElement | null;
    expect(generatedFrequencyToggle).not.toBeNull();
    expect(generatedFrequencyToggle?.checked).toBe(false);

    await act(async () => {
      generatedFrequencyToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(generatedFrequencyToggle.checked).toBe(true);
    expect(container.textContent).toContain("1 optional signal active");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");
    expect(container.textContent).toContain("Observe-only: enabled signals are labelled but do not change the top-six core.");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows generated and paste-weighted per-number evidence columns when enabled", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,8,9",
          "1,2,3,10,11,12",
          "1,2,13,14,15,16",
          "1,17,18,19,20,21",
        ].join("\n"),
        candidateSources: [
          {
            id: "generated-candidates",
            label: "Generated Candidates",
            candidates: [
              [1, 2, 3, 4, 5, 6],
              [1, 2, 3, 4, 5, 7],
            ],
          },
          {
            id: "paste-weighted-candidates",
            label: "Paste-Weighted Candidates",
            candidates: [
              [1, 2, 3, 4, 5, 6],
              [8, 9, 10, 11, 12, 13],
            ],
          },
        ],
      }));
    });

    const generatedFrequencyToggle = container.querySelector(
      "input[aria-label='Toggle Generated frequency evidence']",
    ) as HTMLInputElement | null;
    const pasteWeightedFrequencyToggle = container.querySelector(
      "input[aria-label='Toggle Paste-weighted frequency evidence']",
    ) as HTMLInputElement | null;
    expect(generatedFrequencyToggle).not.toBeNull();
    expect(pasteWeightedFrequencyToggle).not.toBeNull();

    await act(async () => {
      generatedFrequencyToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      pasteWeightedFrequencyToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Generated freq");
    expect(container.textContent).toContain("Paste-weighted freq");
    expect(container.textContent).toContain("2 optional signals active");
    expect(container.textContent).toContain("Observe-only evidence columns do not change ranking.");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const firstRankRow = Array.from(container.querySelectorAll("tbody tr"))
      .find((row) => row.textContent?.includes("1. 1"));
    expect(firstRankRow?.textContent).toContain("2/2");
    expect(firstRankRow?.textContent).toContain("1/2");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows unavailable evidence honestly for enabled signals without connected data", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,8,9",
          "1,2,3,10,11,12",
          "1,2,13,14,15,16",
          "1,17,18,19,20,21",
        ].join("\n"),
      }));
    });

    const monthlyBucketsToggle = container.querySelector(
      "input[aria-label='Toggle Monthly buckets evidence']",
    ) as HTMLInputElement | null;
    expect(monthlyBucketsToggle).not.toBeNull();

    await act(async () => {
      monthlyBucketsToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Monthly buckets");
    expect(container.textContent).toContain("No monthly bucket data is connected.");
    expect(container.textContent).toContain("1 optional signal active");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows monthly bucket composition and per-number labels without changing the core", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,8,9",
          "1,2,3,10,11,12",
          "1,2,13,14,15,16",
          "1,17,18,19,20,21",
        ].join("\n"),
        monthlyBuckets: bucketSets({
          undrawn: [1, 7],
          times1: [2, 3],
          times2: [4, 5, 8],
          times3: [6],
        }),
      }));
    });

    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const monthlyBucketsToggle = container.querySelector(
      "input[aria-label='Toggle Monthly buckets evidence']",
    ) as HTMLInputElement | null;
    expect(monthlyBucketsToggle).not.toBeNull();

    await act(async () => {
      monthlyBucketsToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Monthly bucket composition");
    expect(container.textContent).toContain("Core mix");
    expect(container.textContent).toContain("Undrawn 1");
    expect(container.textContent).toContain("1x 2");
    expect(container.textContent).toContain("2x 2");
    expect(container.textContent).toContain("3x 1");
    expect(container.textContent).toContain("Monthly bucket");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const undrawnBadge = container.querySelector("[data-monthly-bucket-times='0']");
    const timesTwoBadge = container.querySelector("[data-monthly-bucket-times='2']");
    expect(undrawnBadge?.textContent).toContain("Undrawn");
    expect(undrawnBadge?.textContent).toContain("2 nums");
    expect(timesTwoBadge?.textContent).toContain("2x");
    expect(timesTwoBadge?.textContent).toContain("3 nums");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows selected boosts as observe-only per-number evidence without changing the core", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,8,9",
          "1,2,3,10,11,12",
          "1,2,13,14,15,16",
          "1,17,18,19,20,21",
        ].join("\n"),
        userSelectedNumbers: [1, 6],
      }));
    });

    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const selectedBoostsToggle = container.querySelector(
      "input[aria-label='Toggle Selected boosts evidence']",
    ) as HTMLInputElement | null;
    expect(selectedBoostsToggle).not.toBeNull();

    await act(async () => {
      selectedBoostsToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Selected boost");
    expect(container.textContent).toContain("1 optional signal active");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const selectedRankRow = Array.from(container.querySelectorAll("tbody tr"))
      .find((row) => row.textContent?.includes("1. 1"));
    const unselectedRankRow = Array.from(container.querySelectorAll("tbody tr"))
      .find((row) => row.textContent?.includes("7. 7"));
    expect(selectedRankRow?.textContent).toContain("Selected");
    expect(unselectedRankRow?.textContent).toContain("Not selected");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows carry-over bias direction and multiplier as observe-only evidence without changing the core", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,8,9",
          "1,2,3,10,11,12",
          "1,2,13,14,15,16",
          "1,17,18,19,20,21",
        ].join("\n"),
        monthEndCarryOverBiasEnabled: true,
        monthEndCarryOverWeights: {
          1: 1.35,
          2: 1,
          7: 0.82,
        },
      }));
    });

    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const carryOverToggle = container.querySelector(
      "input[aria-label='Toggle Carry-over bias evidence']",
    ) as HTMLInputElement | null;
    expect(carryOverToggle).not.toBeNull();

    await act(async () => {
      carryOverToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Carry-over");
    expect(container.textContent).toContain("1 optional signal active");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const boostedRankRow = Array.from(container.querySelectorAll("tbody tr"))
      .find((row) => row.textContent?.includes("1. 1"));
    const neutralRankRow = Array.from(container.querySelectorAll("tbody tr"))
      .find((row) => row.textContent?.includes("2. 2"));
    const penalizedRankRow = Array.from(container.querySelectorAll("tbody tr"))
      .find((row) => row.textContent?.includes("7. 7"));

    expect(boostedRankRow?.textContent).toContain("Boost ×1.35");
    expect(neutralRankRow?.textContent).toContain("Neutral ×1.00");
    expect(penalizedRankRow?.textContent).toContain("Penalty ×0.82");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows hot/cold temperature as color-coded observe-only evidence without changing the core", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,8,9",
          "1,2,3,10,11,12",
          "1,2,13,14,15,16",
          "1,17,18,19,20,21",
        ].join("\n"),
        hotColdRows: [
          {
            number: 1,
            status: "hot",
            hotScore: 1.72,
            hotRank: 1,
            recentRank: 2,
            recentCount: 4,
            weightedRank: 3,
          },
          {
            number: 2,
            status: "neutral",
            hotScore: 0.04,
            hotRank: 22,
            recentRank: 18,
            recentCount: 1,
            weightedRank: 20,
          },
          {
            number: 7,
            status: "cold",
            hotScore: -1.44,
            hotRank: 45,
            recentRank: 44,
            recentCount: 0,
            weightedRank: 43,
          },
        ],
      }));
    });

    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const hotColdToggle = container.querySelector(
      "input[aria-label='Toggle Hot/cold evidence']",
    ) as HTMLInputElement | null;
    expect(hotColdToggle).not.toBeNull();

    await act(async () => {
      hotColdToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Hot/cold");
    expect(container.textContent).toContain("1 optional signal active");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const hotBadge = container.querySelector("[data-temperature-status='hot']");
    const neutralBadge = container.querySelector("[data-temperature-status='neutral']");
    const coldBadge = container.querySelector("[data-temperature-status='cold']");
    expect(hotBadge?.textContent).toContain("Hot #1");
    expect(hotBadge?.textContent).toContain("R2");
    expect(hotBadge?.textContent).toContain("W3");
    expect(neutralBadge?.textContent).toContain("Neutral #22");
    expect(coldBadge?.textContent).toContain("Cold #45");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows window shape fit as color-coded observe-only evidence without changing the core", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,8,9",
          "1,2,3,10,11,12",
          "1,2,13,14,15,16",
          "1,17,18,19,20,21",
        ].join("\n"),
        windowShapeRows: [
          {
            number: 1,
            status: "fit",
            fitScore: 72,
            bandLabel: "Low +12pp",
            parityLabel: "Odd +8pp",
            meanLabel: "Mean -3.2",
          },
          {
            number: 2,
            status: "mixed",
            fitScore: 51,
            bandLabel: "Low +12pp",
            parityLabel: "Even -8pp",
            meanLabel: "Mean -2.2",
          },
          {
            number: 7,
            status: "against",
            fitScore: 28,
            bandLabel: "Low -10pp",
            parityLabel: "Odd -8pp",
            meanLabel: "Mean +3.8",
          },
        ],
      }));
    });

    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const windowShapeToggle = container.querySelector(
      "input[aria-label='Toggle Window shape evidence']",
    ) as HTMLInputElement | null;
    expect(windowShapeToggle).not.toBeNull();

    await act(async () => {
      windowShapeToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Window shape");
    expect(container.textContent).toContain("1 optional signal active");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const fitBadge = container.querySelector("[data-window-shape-status='fit']");
    const mixedBadge = container.querySelector("[data-window-shape-status='mixed']");
    const againstBadge = container.querySelector("[data-window-shape-status='against']");
    expect(fitBadge?.textContent).toContain("Fit 72");
    expect(fitBadge?.textContent).toContain("Low +12pp");
    expect(fitBadge?.textContent).toContain("Odd +8pp");
    expect(fitBadge?.textContent).toContain("Mean -3.2");
    expect(mixedBadge?.textContent).toContain("Mixed 51");
    expect(againstBadge?.textContent).toContain("Against 28");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows adjacent combo cohesion and alternate swap diagnostics without changing the core", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PortfolioCompressionPanel, {
        initialPasteText: [
          "1,2,3,4,5,6",
          "1,2,3,4,5,7",
          "1,2,3,4,6,7",
          "1,2,3,5,6,7",
        ].join("\n"),
        adjacentComboHistory: [
          draw("2026-01-01", [1, 2, 3, 4, 5, 6]),
          draw("2026-01-03", [1, 2, 3, 4, 5, 7]),
          draw("2026-01-05", [1, 2, 3, 4, 5, 7]),
          draw("2026-01-07", [1, 2, 3, 4, 5, 7]),
        ],
      }));
    });

    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    const adjacentCombosToggle = container.querySelector(
      "input[aria-label='Toggle Adjacent combos evidence']",
    ) as HTMLInputElement | null;
    expect(adjacentCombosToggle).not.toBeNull();

    await act(async () => {
      adjacentCombosToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Adjacent combos");
    expect(container.textContent).toContain("1 optional signal active");
    expect(container.textContent).toContain("Observe-only: combo cohesion does not change the top-six core.");
    expect(container.textContent).toContain("Core combo cohesion");
    expect(container.textContent).toContain("Pairs 15/15");
    expect(container.textContent).toContain("Triples 20/20");
    expect(container.textContent).toContain("Weak pairs 0");
    expect(container.textContent).toContain("Alternate swap diagnostics");
    expect(container.textContent).toContain("7 for 6");
    expect(container.textContent).toContain("Improve");
    expect(container.textContent).toContain("1, 2, 3, 4, 5, 6");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
