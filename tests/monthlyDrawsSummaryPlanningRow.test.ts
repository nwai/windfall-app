import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MonthlyDrawsSummaryPanel from "../src/components/MonthlyDrawsSummaryPanel";
import type { MonthlyBucketSets } from "../src/lib/monthlyDrawSummary";
import type { PreviousNeighbourAtlasEvidenceSnapshot } from "../src/lib/previousNeighbourAtlasEvidence";
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
  Array.from(container.querySelectorAll('[data-testid="monthly-buckets-table"] tbody tr'))
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

  it("does not republish equivalent derived state on unrelated parent rerenders", async () => {
    const history = [
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-03", 13, 4),
      ...repeatDraws("2026-06", 13, 7),
    ];
    const calls = {
      labels: 0,
      buckets: 0,
      averages: 0,
      ideal: 0,
      stage: 0,
    };

    const Harness = () => {
      const [renderCount, setRenderCount] = React.useState(0);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "button",
          { type: "button", onClick: () => setRenderCount((value) => value + 1) },
          `Rerender ${renderCount}`,
        ),
        React.createElement(MonthlyDrawsSummaryPanel, {
          history,
          onBucketInfoChange: () => { calls.labels += 1; },
          onBucketSetsChange: () => { calls.buckets += 1; },
          onAvgBucketsChange: () => { calls.averages += 1; },
          onIdealDrawStateChange: () => { calls.ideal += 1; },
          onStageIdealDrawStateChange: () => { calls.stage += 1; },
        }),
      );
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(Harness));
    });
    const callsAfterMount = { ...calls };

    const rerenderButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.startsWith("Rerender")) as HTMLButtonElement;
    await act(async () => {
      rerenderButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(calls).toEqual(callsAfterMount);
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
      const button = container.querySelector(`button[aria-label="Select ${number}, 1x bucket"]`) as HTMLButtonElement | null;
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
    expect(filteredRows.join(" ")).not.toContain("2026-02");
  });

  it("renders the undrawn-in-month count as a centered outlined badge", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00"));
    const history = [
      draw("2026-07-01", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, { history }));
    });

    const badge = container.querySelector('span[aria-label="37 numbers undrawn in month"]') as HTMLSpanElement | null;
    expect(badge).toBeTruthy();
    expect(badge?.style.display).toBe("inline-flex");
    expect(badge?.style.borderWidth).toBe("2px");
    expect(badge?.style.borderStyle).toBe("solid");
    expect(badge?.style.borderRadius).toBe("999px");
    expect((badge?.closest("td") as HTMLTableCellElement | null)?.style.textAlign).toBe("center");
  });

  it("places Acceptance Needs between Monthly Buckets and Robust Baseline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00"));
    const history = [
      draw("2026-07-01", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, { history }));
    });

    const text = container.textContent ?? "";
    const monthlyBucketsIndex = text.indexOf("Monthly Buckets");
    const acceptanceNeedsIndex = text.indexOf("Acceptance Needs");
    const robustBaselineIndex = text.indexOf("Robust Baseline And Ideal Draw");

    expect(monthlyBucketsIndex).toBeGreaterThanOrEqual(0);
    expect(acceptanceNeedsIndex).toBeGreaterThan(monthlyBucketsIndex);
    expect(robustBaselineIndex).toBeGreaterThan(acceptanceNeedsIndex);
  });

  it("shows matching draw-stage Atlas evidence as observe-only context", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00"));
    const history = [
      ...repeatDraws("2026-01", 13, 1),
      ...repeatDraws("2026-03", 13, 4),
      draw("2026-07-01", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];
    const neighbourAtlasEvidence: PreviousNeighbourAtlasEvidenceSnapshot = {
      version: 1,
      observeOnly: true,
      historySource: "baseline",
      historySourceLabel: "Baseline history",
      scope: "mains-plus-supps",
      lookbackDraws: 2,
      transitionCount: 24,
      validDraws: 26,
      excludedTargetDraws: 1,
      excludedTargetMonthLabels: ["2024-05"],
      targetDrawOrdinal: 2,
      targetMonthExpectedDrawCount: 13,
      overall: { averageUniqueHits: 2.1, averageExpectedUniqueHits: 1.9, averageDirectionalHits: 2.4, lift: 1.11 },
      composition: { oddLift: null, evenLift: null, oneDigitLift: null, twoDigitLift: null },
      ordinalEvidence: {
        drawOrdinal: 2,
        label: "D2",
        trials: 18,
        sampleQuality: "Limited",
        averageUniqueHits: 2.2,
        averageExpectedUniqueHits: 1.8,
        lift: 1.22,
        atLeastOneRate: 0.9,
        atLeastThreeRate: 0.4,
        atLeastFourRate: 0.2,
        topPattern: "-2:1 -1:1 +1:2 +2:0",
        topPatternCount: 3,
      },
      currentCloud: null,
      warnings: [],
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, { history, neighbourAtlasEvidence }));
    });

    const card = container.querySelector('[data-testid="monthly-neighbour-atlas-context"]');
    expect(card?.textContent).toContain("Matched contextD2 of");
    expect(card?.textContent).toContain("2.2 vs 1.8 · x1.22");
    expect(card?.textContent).toContain("18 D2 trials · Limited");
    expect(card?.textContent).toContain("does not alter Monthly Buckets, Acceptance Needs, Stage IDM, or generation");
  });

  it("colours Acceptance Needs number pills by monthly bucket", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00"));
    const history = [
      draw("2026-07-01", [1, 2, 3, 4, 5, 6], [7, 8]),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, { history }));
    });

    const timesOneButton = container.querySelector('button[aria-label="Select 1, 1x bucket"]') as HTMLButtonElement | null;
    const undrawnButton = container.querySelector('button[aria-label="Select 9, Undrawn bucket"]') as HTMLButtonElement | null;
    expect(timesOneButton).toBeTruthy();
    expect(undrawnButton).toBeTruthy();

    expect(timesOneButton?.getAttribute("data-monthly-bucket-times")).toBe("1");
    expect(undrawnButton?.getAttribute("data-monthly-bucket-times")).toBe("0");
    expect(timesOneButton?.style.background).not.toBe("");
    expect(timesOneButton?.style.background).not.toBe("#fff");
    expect(timesOneButton?.style.borderStyle).toBe("solid");

    await act(async () => {
      timesOneButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(timesOneButton?.getAttribute("aria-pressed")).toBe("true");
    expect(timesOneButton?.style.borderWidth).toBe("2px");
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
    expect(filteredRows.join(" ")).not.toContain("2026-02");
  });

  it("labels an incomplete October from the full scheduled month instead of observed weekdays", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00"));
    const history = [
      ...repeatDraws("2026-09", 13, 1),
      draw("2026-10-02", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-10-05", [9, 10, 11, 12, 13, 14], [15, 16]),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(React.createElement(MonthlyDrawsSummaryPanel, { history }));
    });

    const replayScope = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.textContent?.includes("Same scheduled month length")));
    expect(replayScope).toBeTruthy();
    expect(Array.from(replayScope?.options ?? []).map((option) => option.textContent)).toContain("Same scheduled month length (13D)");
    expect(container.textContent).toContain("2026-10: 13 scheduled Monday/Wednesday/Friday draws.");
    expect(container.textContent).not.toContain("Same scheduled month length (9D)");
  });
});
