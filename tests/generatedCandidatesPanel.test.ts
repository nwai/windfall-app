import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  GeneratedCandidatesPanel,
  type GeneratedCandidatesPanelProps,
} from "../src/components/candidates/GeneratedCandidatesPanel";
import type { CandidateSet } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildProps(overrides: Partial<GeneratedCandidatesPanelProps> = {}): GeneratedCandidatesPanelProps {
  return {
    onGenerate: vi.fn(),
    candidates: [],
    numCandidates: 25,
    setNumCandidates: vi.fn(),
    userSelectedNumbers: [3, 12],
    setUserSelectedNumbers: vi.fn(),
    onSelectCandidate: vi.fn(),
    selectedCandidateIdx: -1,
    mostRecentDraw: null,
    manualSimSelected: [],
    setManualSimSelected: vi.fn(),
    batchSize: 100,
    setBatchSize: vi.fn(),
    onRunBatch: vi.fn(),
    batchFreq: [],
    batchSessionRuns: 10,
    setBatchSessionRuns: vi.fn(),
    onRunBatchSession: vi.fn(),
    ...overrides,
  };
}

function buildCandidate(index: number): CandidateSet {
  const numbers = Array.from({ length: 8 }, (_, offset) => ((index * 8 + offset) % 45) + 1);
  return {
    main: numbers.slice(0, 6),
    supp: numbers.slice(6, 8),
    finalCompositeAdj: index / 1000,
  };
}

describe("GeneratedCandidatesPanel", () => {
  const monthlyBucketSets = (buckets: Partial<Record<
    "undrawn" | "times1" | "times2" | "times3" | "times4" | "times5" | "times6" | "times7" | "times8",
    number[]
  >>) => ({
    undrawn: new Set(buckets.undrawn ?? []),
    times1: new Set(buckets.times1 ?? []),
    times2: new Set(buckets.times2 ?? []),
    times3: new Set(buckets.times3 ?? []),
    times4: new Set(buckets.times4 ?? []),
    times5: new Set(buckets.times5 ?? []),
    times6: new Set(buckets.times6 ?? []),
    times7: new Set(buckets.times7 ?? []),
    times8: new Set(buckets.times8 ?? []),
  });

  it("renders the compact user selected numbers strip above the generator output", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps()),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const strip = document.querySelector('[data-testid="generated-user-selected-strip"]');

    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain("User selected numbers");
    expect(strip?.textContent).toContain("2 selected");
    expect(strip?.querySelectorAll('[aria-label^="Toggle user selected number"]').length).toBe(45);
    expect(strip?.querySelector('[aria-label="Toggle user selected number 3"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(strip?.querySelector('[aria-label="Toggle user selected number 4"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders RwR45 as an explicit mode that disables the normal Count input when active", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        rwr45Enabled: true,
        setRwr45Enabled: vi.fn(),
      })),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const toggle = document.querySelector('input[aria-label="Toggle RwR45 random coverage mode"]');
    const countInput = document.querySelector('input[aria-label="Generated candidate count"]');

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("checked")).toBe("");
    expect(countInput?.getAttribute("disabled")).toBe("");
    expect(document.body.textContent).toContain("Count ignored");
    expect(document.body.textContent).toContain("exactly 7");
  });

  it("shows a stop-and-partial button only while generation is running", () => {
    const idleHtml = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        isGenerating: false,
        onStopGenerate: vi.fn(),
      })),
    );
    const runningHtml = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        isGenerating: true,
        onStopGenerate: vi.fn(),
      })),
    );

    expect(idleHtml).not.toContain("Stop and show partial");
    expect(runningHtml).toContain("Stop and show partial");
    expect(runningHtml).toContain("Stop generating and show accepted candidates so far");
  });

  it("copies generated candidate mains as paste-weighted comma-separated rows", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          candidates: [buildCandidate(0), buildCandidate(1)],
        })));
      });

      const copyButton = container.querySelector(
        'button[aria-label="Copy generated candidate mains as comma-separated rows for the Paste-Weighted Candidate Generator"]',
      ) as HTMLButtonElement | null;
      expect(copyButton).not.toBeNull();

      await act(async () => {
        copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith("1,2,3,4,5,6\n9,10,11,12,13,14");
      expect(container.textContent).toContain("Copied 2 candidate main rows");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        delete (navigator as Navigator & { clipboard?: unknown }).clipboard;
      }
    }
  });

  it("leaves Manual Prize Check independent from User Selected numbers while sync is off", async () => {
    const setManualSimSelected = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          userSelectedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
          manualSimSelected: [20, 21, 22],
          setManualSimSelected,
        })));
      });

      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          userSelectedNumbers: [9, 10, 11, 12, 13, 14, 15, 16],
          manualSimSelected: [20, 21, 22],
          setManualSimSelected,
        })));
      });

      expect(setManualSimSelected).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("can sync Manual Prize Check from normalized User Selected numbers when enabled", async () => {
    const setManualSimSelected = vi.fn();
    const onManualSimulationChanged = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          userSelectedNumbers: [12, 1, 5, 2, 9, 10, 11, 8, 13],
          manualSimSelected: [30],
          setManualSimSelected,
          onManualSimulationChanged,
        })));
      });

      const syncToggle = container.querySelector(
        'input[aria-label="Sync Manual Prize Check with User Selected numbers"]',
      ) as HTMLInputElement | null;
      expect(syncToggle).not.toBeNull();

      await act(async () => {
        syncToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(setManualSimSelected).toHaveBeenLastCalledWith([1, 2, 5, 8, 9, 10, 11, 12]);
      expect(onManualSimulationChanged).toHaveBeenLastCalledWith([1, 2, 5, 8, 9, 10, 11, 12]);
      expect(container.textContent).toContain("Using normalized User Selected order");

      setManualSimSelected.mockClear();
      onManualSimulationChanged.mockClear();

      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          userSelectedNumbers: [6, 7, 8, 9, 10, 11, 12, 13],
          manualSimSelected: [1, 2, 5, 8, 9, 10, 11, 12],
          setManualSimSelected,
          onManualSimulationChanged,
        })));
      });

      expect(setManualSimSelected).toHaveBeenLastCalledWith([6, 7, 8, 9, 10, 11, 12, 13]);
      expect(onManualSimulationChanged).toHaveBeenLastCalledWith([6, 7, 8, 9, 10, 11, 12, 13]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("renders the compact generated-candidate table with only decision-useful visible diagnostics", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          {
            main: [1, 2, 3, 4, 5, 6],
            supp: [7, 8],
            ogaScore: 0.42,
            ogaPercentile: 55,
          },
        ],
        monthlyAvgBuckets: {
          undrawn: 1,
          times1: 1,
          times2: 1,
          times3: 1,
          times4: 1,
          times5: 1,
          times6: 1,
          times7: 0,
          times8: 0,
        },
      })),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const table = document.querySelector('[data-testid="generated-candidates-scroll"] table');
    const headers = Array.from(table?.querySelectorAll("thead th") ?? []).map((th) => {
      const explicitButtonLabel = th.querySelector(".windfall-sortable-header__button")?.textContent;
      return (explicitButtonLabel ?? th.childNodes[0]?.textContent ?? th.textContent ?? "").replace(/[▲▼]/g, "").trim();
    });

    expect(document.querySelector('[aria-label="Conv metric explanation"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Stage IDM metric explanation"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="IDM metric explanation"]')).toBeNull();
    expect(document.querySelector('[aria-label="Rdy metric explanation"]')).toBeNull();
    expect(document.querySelector('[aria-label="Win metric explanation"]')).toBeNull();
    expect(document.querySelector('[aria-label="Nrr metric explanation"]')).toBeNull();
    expect(document.querySelector('[aria-label="NS metric explanation"]')).toBeNull();
    expect(headers).toHaveLength(23);
    expect(headers).toEqual(expect.arrayContaining([
      "#", "Main (6)", "Supp (2)", "Manual (M/S)", "Prize", "Odd/Even",
      "SelHits", "RecentHits", "Prev±1", "Dup±1", "Sing±1",
      "0x", "1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x+",
      "Conv", "Stage IDM", "Actions",
    ]));
    for (const hiddenHeader of ["Comp%", "OGA Raw", "OGA%", "IDM", "Rdy", "Win", "Nrr", "NS"]) {
      expect(headers).not.toContain(hiddenHeader);
    }
    const firstRowCells = table?.querySelectorAll("tbody tr td") ?? [];
    expect(firstRowCells[1]?.getAttribute("style")).toContain("white-space:nowrap");
    expect(firstRowCells[2]?.getAttribute("style")).toContain("white-space:nowrap");
    expect(html).toContain("next draw-stage target");
    expect(html).not.toContain("not a calibrated next-draw probability");
    expect(html).not.toContain('title="Convergence:');
    expect(html).not.toContain('title="Ideal Draw Match:');
    expect(html).not.toContain('title="Readiness score:');
  });

  it("defaults to generated order and only applies prize ordering when Prize sort is selected", async () => {
    const candidates: CandidateSet[] = [
      { main: [31, 32, 33, 34, 35, 36], supp: [37, 38] },
      { main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const firstMainCellCompact = () => (
      container.querySelector("tbody tr td:nth-child(2)")?.textContent ?? ""
    ).replace(/\s+/g, "");
    const prizeHeader = () => Array.from(container.querySelectorAll("th"))
      .find((th) => th.textContent?.includes("Prize"));

    try {
      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          candidates,
          manualSimSelected: [1, 2, 3, 4, 5, 6, 7, 8],
        })));
      });

      expect(container.textContent).toContain("generated order");
      expect(firstMainCellCompact()).toBe("313233343536");

      await act(async () => {
        prizeHeader()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(firstMainCellCompact()).toBe("123456");

      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          candidates,
          manualSimSelected: [31, 32, 33, 34, 35, 36, 37, 38],
        })));
      });

      expect(firstMainCellCompact()).toBe("313233343536");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("uses the full 8-number candidate row for both Prize labels and Manual M/S dots", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          { main: [10, 11, 12, 13, 14, 20], supp: [1, 2] },
          { main: [10, 11, 12, 13, 30, 31], supp: [14, 40] },
          { main: [10, 11, 20, 21, 31, 32], supp: [1, 2] },
        ],
        manualSimSelected: [10, 11, 12, 13, 14, 15, 20, 21],
      })),
    );
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.body.textContent).toContain("Div2");
    expect(document.body.textContent).toContain("Div3");
    expect(document.body.textContent).toContain("Div6");
    expect(html).toContain("Manual main hits from candidate row");
    expect(html).toContain("Manual supp hits from candidate row");
  });

  it("keeps generated-candidate column headers sticky inside the scrolling table", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: Array.from({ length: 120 }, (_, index) => buildCandidate(index)),
      })),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const scroller = document.querySelector('[data-testid="generated-candidates-scroll"]');
    const firstHeader = scroller?.querySelector("thead th");

    expect(scroller?.getAttribute("style")).toContain("overflow-y:auto");
    expect(firstHeader?.getAttribute("style")).toContain("position:sticky");
    expect(firstHeader?.getAttribute("style")).toContain("top:0");
    expect(firstHeader?.getAttribute("style")).toContain("z-index:2");
  });

  it("renders the shared Monthly Draws Summary ideal state as the hidden IDM target", () => {
    const buckets = monthlyBucketSets({
      undrawn: [1, 2],
      times1: [3, 4, 5, 6, 7],
      times2: [8],
    });
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          {
            main: [1, 2, 3, 4, 5, 6],
            supp: [7, 8],
            ogaScore: 0.42,
            ogaPercentile: 55,
          },
        ],
        monthlyBuckets: buckets,
        monthlyIdealDrawState: {
          bucketSets: buckets,
          targetDistribution: [4, 8, 12, 10, 6, 3, 1, 1, 0],
          idealDrawBucketCounts: [2, 5, 1, 0, 0, 0, 0, 0, 0],
          effectiveMonthLabel: "2026-06",
          effectiveMonthIsSynthetic: false,
        },
      } as any)),
    );

    expect(html).toContain("Ideal draw composition (IDM target):");
    expect(html).toContain("0x=2");
    expect(html).toContain("1x=5");
    expect(html).toContain("2x=1");
  });

  it("renders Stage IDM target and score when stage ideal state is available", () => {
    const buckets = monthlyBucketSets({
      undrawn: [1, 2],
      times1: [3, 4, 5, 6, 7],
      times2: [8],
    });
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          {
            main: [1, 2, 3, 4, 5, 6],
            supp: [7, 8],
            ogaScore: 0.42,
            ogaPercentile: 55,
          },
        ],
        monthlyBuckets: buckets,
        stageIdealDrawState: {
          bucketSets: buckets,
          currentDistribution: [2, 5, 1, 0, 0, 0, 0, 0, 0],
          targetDistribution: [4, 8, 12, 10, 6, 3, 1, 1, 0],
          idealDrawBucketCounts: [2, 5, 1, 0, 0, 0, 0, 0, 0],
          workingMonthLabel: "2026-06",
          expectedDrawCount: 13,
          targetStageDrawCount: 6,
          completedDrawCount: 5,
          comparableMonthCount: 4,
          expectedDrawCountSource: "auto",
          warnings: [],
        },
      } as any)),
    );

    expect(html).toContain("Stage IDM target:");
    expect(html).toContain("draw 6 of a 13-draw month");
    expect(html).toContain("Stage IDM");
    expect(html).toContain("Top 100.0%");
  });

  it("renders previous-draw ±1 neighbour diagnostics as observe-only columns", () => {
    const html = renderToStaticMarkup(
      React.createElement(GeneratedCandidatesPanel, buildProps({
        candidates: [
          {
            main: [20, 5, 34, 22, 13, 14],
            supp: [12, 29],
            previousNeighbourHits: 3,
            previousNeighbourDuplicateHits: 1,
            previousNeighbourSingletonHits: 2,
          },
        ],
      })),
    );

    expect(html).toContain("Prev±1");
    expect(html).toContain("Dup±1");
    expect(html).toContain("Sing±1");
    expect(html).toContain("title=\"Total candidate numbers that are ±1 from the latest draw");
    expect(html).toContain(">3</td>");
    expect(html).toContain(">1</td>");
    expect(html).toContain(">2</td>");
  });

  it("updates the virtualized row window only after crossing row-window boundaries", async () => {
    const previousAnimationFrame = window.requestAnimationFrame;
    const previousCancelAnimationFrame = window.cancelAnimationFrame;
    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      rafCallbacks[id - 1] = () => undefined;
    }) as typeof window.cancelAnimationFrame;
    const flushAnimationFrame = () => {
      const callback = rafCallbacks.shift();
      callback?.(0);
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(GeneratedCandidatesPanel, buildProps({
          candidates: Array.from({ length: 120 }, (_, index) => buildCandidate(index)),
        })));
      });

      expect(container.textContent).toContain("Showing rows 1–29 of 120");
      const scroller = container.querySelector('[data-testid="generated-candidates-scroll"]') as HTMLDivElement | null;
      expect(scroller).not.toBeNull();

      await act(async () => {
        Object.defineProperty(scroller, "scrollTop", { value: 31, configurable: true });
        scroller?.dispatchEvent(new Event("scroll", { bubbles: true }));
        flushAnimationFrame();
      });

      expect(container.textContent).toContain("Showing rows 1–29 of 120");

      await act(async () => {
        Object.defineProperty(scroller, "scrollTop", { value: 200, configurable: true });
        scroller?.dispatchEvent(new Event("scroll", { bubbles: true }));
        flushAnimationFrame();
      });

      expect(container.textContent).toContain("Showing rows 2–30 of 120");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      window.requestAnimationFrame = previousAnimationFrame;
      window.cancelAnimationFrame = previousCancelAnimationFrame;
    }
  });
});
