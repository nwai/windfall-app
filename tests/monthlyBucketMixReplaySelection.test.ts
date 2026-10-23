import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MonthlyDrawsSummaryPanel from "../src/components/MonthlyDrawsSummaryPanel";
import type { Draw } from "../src/types";

const history: Draw[] = [
  ...["01", "03", "05", "08", "10", "12", "15", "17", "19", "22", "24", "26", "29"].map((day, index) => {
    const numbers = index === 1 ? [1, 9, 10, 11, 12, 13, 14, 15] : [1, 2, 3, 4, 5, 6, 7, 8];
    return { date: `2026-06-${day}`, main: numbers.slice(0, 6), supp: numbers.slice(6) };
  }),
  { date: "2026-08-03", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
];
const today = new Date("2026-08-04T12:00:00");

describe("Bucket Mix Replay user-directed Apply bridge", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousActEnvironment: boolean | undefined;
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeEach(() => {
    previousActEnvironment = globals.IS_REACT_ACT_ENVIRONMENT;
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    globals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });
  const replayRow = (ordinal: number) => container.querySelector<HTMLTableRowElement>(
    `[data-testid="bucket-mix-replay-table"] tr[data-replay-key="13|${ordinal}"]`,
  )!;
  const explorer = () => container.querySelector<HTMLTableElement>('[data-testid="bucket-mix-combinatorics-table"]')!;
  const appliedExplorerRow = () => explorer().querySelector('button[aria-pressed="true"]')?.closest("tr");
  const bucketCounts = (row: HTMLTableRowElement) => [1, 2].map((index) => (
    Number(row.cells[index].querySelector("span > span:last-child")?.textContent)
  ));

  it("applies the exact modal mix on row click, mirrors Applied and preserves historical results and switches", async () => {
    const onTargetChange = vi.fn();
    const onConstraintsChange = vi.fn();
    const onConstructiveFillChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, onAppliedBucketMixTargetChange: onTargetChange, onConstraintsChange, onConstructiveFillChange,
    })));
    const originalEvidence = Array.from(replayRow(2).cells).slice(1).map((cell) => cell.textContent);
    const originalConstraintsCalls = onConstraintsChange.mock.calls.length;
    await act(async () => replayRow(2).cells[1].click());
    expect(replayRow(2).getAttribute("aria-selected")).toBe("true");
    expect(replayRow(2).querySelector("button")?.textContent).toBe("Applied");
    expect(bucketCounts(appliedExplorerRow()!)).toEqual([7, 1]);
    expect(onTargetChange.mock.lastCall?.[0]).toMatchObject({
      counts: { undrawn: 7, times1: 1, times2: 0 },
      workingMonthLabel: "2026-08", targetStageDrawCount: 2, source: "bucket-mix-combinatorics",
    });
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')?.textContent).toContain("Current target D2");
    expect(Array.from(replayRow(2).cells).slice(1).map((cell) => cell.textContent)).toEqual(originalEvidence);
    expect(onConstructiveFillChange).not.toHaveBeenCalled();
    expect(onConstraintsChange.mock.calls.length).toBe(originalConstraintsCalls);
    await act(async () => (explorer().querySelector('button[aria-label="Sort Actual combinations descending"]') as HTMLButtonElement).click());
    expect(bucketCounts(appliedExplorerRow()!)).toEqual([7, 1]);
    expect(replayRow(2).getAttribute("aria-selected")).toBe("true");
  });

  it("supports the keyboard button, one selected reference and a deliberate different-ordinal choice", async () => {
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, { history, today })));
    await act(async () => replayRow(2).querySelector("button")!.click());
    await act(async () => replayRow(1).querySelector("button")!.click());
    expect(replayRow(2).getAttribute("aria-selected")).toBe("false");
    expect(replayRow(1).getAttribute("aria-selected")).toBe("true");
    expect(container.querySelectorAll('[data-testid="bucket-mix-replay-table"] tr[aria-selected="true"]')).toHaveLength(1);
    expect(bucketCounts(appliedExplorerRow()!)).toEqual([8, 0]);
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')?.textContent).toContain("different ordinal; manually chosen reference");
    const otherMix = Array.from(explorer().querySelectorAll<HTMLTableRowElement>("tbody tr"))
      .find((row) => bucketCounts(row)[0] === 6)!;
    await act(async () => otherMix.querySelector("button")!.click());
    expect(replayRow(1).getAttribute("aria-selected")).toBe("false");
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')).toBeNull();
  });

  it("refuses a historical mix absent from current buckets without substituting or partially applying", async () => {
    const onTargetChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, { history, today, onAppliedBucketMixTargetChange: onTargetChange })));
    await act(async () => replayRow(2).querySelector("button")!.click());
    const calls = onTargetChange.mock.calls.length;
    expect((replayRow(3).querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    expect(replayRow(3).textContent).toContain("2x needs 1, available 0");
    await act(async () => replayRow(3).cells[1].click());
    expect(onTargetChange.mock.calls.length).toBe(calls);
    expect(bucketCounts(appliedExplorerRow()!)).toEqual([7, 1]);
    expect(replayRow(2).getAttribute("aria-selected")).toBe("true");
  });

  it("honours active exclusions and reports insufficient eligible supply", async () => {
    const onConstraintsChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, excludedNumbers: [1], constructiveFillEnabled: true, onConstraintsChange,
    })));
    await act(async () => replayRow(2).querySelector("button")!.click());
    expect(onConstraintsChange.mock.lastCall?.[0]).toMatchObject({
      constraints: { undrawn: 7, times1: 1 }, selectedNumbersByBucket: { times1: [2] },
    });
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, excludedNumbers: Array.from({ length: 31 }, (_, index) => index + 9),
    })));
    expect((replayRow(2).querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    expect(replayRow(2).textContent).toContain("Undrawn needs 7, available 6");
    expect(replayRow(2).getAttribute("aria-selected")).toBe("false");
    expect(appliedExplorerRow()).toBeUndefined();
  });

  it("hides the replay marker in another scope without replacing the target and still handles later exclusions", async () => {
    const onTargetChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, { history, today, onAppliedBucketMixTargetChange: onTargetChange })));
    await act(async () => replayRow(2).querySelector("button")!.click());
    const calls = onTargetChange.mock.calls.length;
    const scope = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.value === "all-month-lengths"))!;
    await act(async () => {
      scope.value = "all-month-lengths";
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="bucket-mix-replay-table"] tr[aria-selected="true"]')).toHaveLength(0);
    expect(bucketCounts(appliedExplorerRow()!)).toEqual([7, 1]);
    expect(onTargetChange.mock.calls.length).toBe(calls);
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, excludedNumbers: [9], onAppliedBucketMixTargetChange: onTargetChange,
    })));
    expect(appliedExplorerRow()).toBeUndefined();
    expect(onTargetChange.mock.lastCall?.[0]).toBeNull();
    expect(container.textContent).toContain("Replay-applied mix cleared because the selected placeholders changed");
  });

  it("releases the linked choice when Acceptance Needs is cleared or a new draw changes the context", async () => {
    const onTargetChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, { history, today, onAppliedBucketMixTargetChange: onTargetChange })));
    await act(async () => replayRow(2).querySelector("button")!.click());
    const clear = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Clear")!;
    await act(async () => clear.click());
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')).toBeNull();
    expect(appliedExplorerRow()).toBeUndefined();
    expect(onTargetChange.mock.lastCall?.[0]).toBeNull();
    await act(async () => replayRow(2).querySelector("button")!.click());
    const nextHistory = [...history, { date: "2026-08-05", main: [1, 2, 3, 4, 5, 6], supp: [7, 8] }];
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history: nextHistory, today: new Date("2026-08-06T12:00:00"), onAppliedBucketMixTargetChange: onTargetChange,
    })));
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')).toBeNull();
    expect(appliedExplorerRow()).toBeUndefined();
    expect(onTargetChange.mock.lastCall?.[0]).toBeNull();
  });

  it("toggles the selected replay button off and clears both markers, the IDM target and bucket counts", async () => {
    const onTargetChange = vi.fn();
    const onConstraintsChange = vi.fn();
    const onConstructiveFillChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, constructiveFillEnabled: true, onAppliedBucketMixTargetChange: onTargetChange,
      onConstraintsChange, onConstructiveFillChange,
    })));
    const button = replayRow(2).querySelector("button")!;
    await act(async () => button.click());
    expect(button.getAttribute("aria-label")).toMatch(/^Clear replay D2/);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await act(async () => button.click());
    expect(button.textContent).toBe("Use mix");
    expect(button.getAttribute("aria-label")).toMatch(/^Apply replay D2/);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(replayRow(2).getAttribute("aria-selected")).toBe("false");
    expect(appliedExplorerRow()).toBeUndefined();
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')).toBeNull();
    expect(onTargetChange.mock.lastCall?.[0]).toBeNull();
    const cleared = onConstraintsChange.mock.lastCall?.[0];
    expect(Object.values(cleared.constraints).every((count) => count === 0)).toBe(true);
    expect(Object.values(cleared.selectedNumbersByBucket).every((numbers) => (numbers as number[]).length === 0)).toBe(true);
    expect(onConstructiveFillChange).not.toHaveBeenCalled();
    await act(async () => button.click());
    expect(bucketCounts(appliedExplorerRow()!)).toEqual([7, 1]);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles the matching Explorer Applied button off and clears the linked replay selection", async () => {
    const onTargetChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, onAppliedBucketMixTargetChange: onTargetChange,
    })));
    await act(async () => replayRow(2).querySelector("button")!.click());
    const applied = appliedExplorerRow()!.querySelector("button")!;
    expect(applied.getAttribute("aria-label")).toBe("Clear applied bucket mix");
    await act(async () => applied.click());
    expect(appliedExplorerRow()).toBeUndefined();
    expect(replayRow(2).getAttribute("aria-selected")).toBe("false");
    expect(replayRow(2).querySelector("button")?.textContent).toBe("Use mix");
    expect(onTargetChange.mock.lastCall?.[0]).toBeNull();
  });

  it("reflects the applied recipe in another scope without inventing a reference, and clears from that button", async () => {
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, { history, today })));
    await act(async () => replayRow(2).querySelector("button")!.click());
    const scope = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.value === "all-month-lengths"))!;
    await act(async () => {
      scope.value = "all-month-lengths";
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const pooledReference = container.querySelector<HTMLTableRowElement>('[data-replay-key="all|2"]')!;
    expect(pooledReference.getAttribute("aria-selected")).toBe("false");
    expect(pooledReference.querySelector("button")?.textContent).toBe("Applied");
    expect(pooledReference.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => pooledReference.querySelector("button")!.click());
    expect(appliedExplorerRow()).toBeUndefined();
    expect(pooledReference.getAttribute("aria-selected")).toBe("false");
    expect(pooledReference.querySelector("button")?.textContent).toBe("Use mix");
    await act(async () => pooledReference.querySelector("button")!.click());
    expect(pooledReference.getAttribute("aria-selected")).toBe("true");
    expect(bucketCounts(appliedExplorerRow()!)).toEqual([7, 1]);
  });

  it("shares identical neutral and applied button styling and mirrors an Explorer-originated choice", async () => {
    const onTargetChange = vi.fn();
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, onAppliedBucketMixTargetChange: onTargetChange,
    })));
    const matchingExplorerRow = Array.from(explorer().querySelectorAll<HTMLTableRowElement>("tbody tr"))
      .find((row) => bucketCounts(row)[0] === 7 && bucketCounts(row)[1] === 1)!;
    const explorerButton = matchingExplorerRow.querySelector("button")!;
    const replayButton = replayRow(2).querySelector("button")!;
    const neutralStyle = explorerButton.style.cssText;
    expect(replayButton.style.cssText).toBe(neutralStyle);
    expect(explorerButton.className).toBe(replayButton.className);
    await act(async () => explorerButton.click());
    expect(replayButton.textContent).toBe("Applied");
    expect(replayButton.getAttribute("aria-pressed")).toBe("true");
    expect(replayButton.style.cssText).toBe(explorerButton.style.cssText);
    expect(replayButton.style.background).toBe("rgb(21, 128, 61)");
    expect(replayRow(2).getAttribute("aria-selected")).toBe("false");
    expect(container.querySelector('[data-testid="bucket-mix-replay-selection"]')).toBeNull();
    await act(async () => replayButton.click());
    expect(explorerButton.textContent).toBe("Apply");
    expect(replayButton.textContent).toBe("Use mix");
    expect(explorerButton.style.cssText).toBe(neutralStyle);
    expect(replayButton.style.cssText).toBe(neutralStyle);
    expect(onTargetChange.mock.lastCall?.[0]).toBeNull();
    await act(async () => replayButton.click());
    expect(replayButton.style.cssText).toBe(explorerButton.style.cssText);
    expect(replayRow(2).getAttribute("aria-selected")).toBe("true");
  });

  it("lets the reflected Applied button clear a recipe even if its eligible supply is now insufficient", async () => {
    await act(async () => root.render(React.createElement(MonthlyDrawsSummaryPanel, {
      history, today, excludedNumbers: Array.from({ length: 31 }, (_, index) => index + 9),
    })));
    const matchingExplorerRow = Array.from(explorer().querySelectorAll<HTMLTableRowElement>("tbody tr"))
      .find((row) => bucketCounts(row)[0] === 7 && bucketCounts(row)[1] === 1)!;
    await act(async () => matchingExplorerRow.querySelector("button")!.click());
    const replayButton = replayRow(2).querySelector("button") as HTMLButtonElement;
    expect(replayButton.textContent).toBe("Applied");
    expect(replayButton.disabled).toBe(false);
    expect(replayRow(2).textContent).toContain("Undrawn needs 7, available 6");
    await act(async () => replayButton.click());
    expect(appliedExplorerRow()).toBeUndefined();
    expect(replayButton.textContent).toBe("Use mix");
    expect(replayButton.disabled).toBe(true);
  });
});
