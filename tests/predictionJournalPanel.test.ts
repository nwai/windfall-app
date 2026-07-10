import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { PredictionJournalPanel } from "../src/components/PredictionJournalPanel";
import { buildPredictionJournalEntry } from "../src/lib/predictionJournal";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("PredictionJournalPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders a date-aware journal form without seeded fake prediction rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
      }),
    );

    expect(html).toContain("Prediction Journal &amp; Scorecard");
    expect(html).toContain("Anchor latest draw");
    expect(html).toContain("6/24/26");
    expect(html).toContain("No prediction fields are required");
    expect(html).toContain("Save prediction");
    expect(html).toContain("No journal entries yet");
    expect(html).not.toContain("<h3");
    expect(html).not.toContain("1,2,3,4,5,6");
  });

  it("shows the next scheduled draw date beside the target window control", () => {
    const html = renderToStaticMarkup(
      React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        now: () => "2026-06-25T09:00:00.000Z",
      }),
    );

    const targetFieldStart = html.indexOf("Target window");
    const nextDrawDateIndex = html.indexOf("Next draw: Friday 2026-06-26", targetFieldStart);
    const oddEvenIndex = html.indexOf("Odd/even ratio", targetFieldStart);

    expect(targetFieldStart).toBeGreaterThanOrEqual(0);
    expect(nextDrawDateIndex).toBeGreaterThan(targetFieldStart);
    expect(nextDrawDateIndex).toBeLessThan(oddEvenIndex);
  });

  it("shows scored entry summaries and keeps full details collapsed by default", () => {
    const history = [
      draw("6/1/26", [1, 2, 3, 10, 20, 30], [40, 41]),
      draw("6/3/26", [4, 5, 6, 11, 21, 31], [42, 43]),
      draw("6/5/26", [1, 7, 12, 14, 22, 34], [44, 45]),
    ];
    const entry = buildPredictionJournalEntry({
      id: "prediction-panel-1",
      now: "2026-06-03T10:30:00.000Z",
      latestDraw: history[1],
      targetKind: "nextDraw",
      inputs: {
        oddEvenRatio: "3:5",
        numbers: [1, 12, 20, 45],
        monthlyBuckets: { undrawn: 7, times1: 1 },
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(PredictionJournalPanel, { history, initialEntries: [entry] }),
    );

    expect(html).toContain("Scored");
    expect(html).toContain("Locked after target draw arrived");
    expect(html).toContain("Next draw");
    expect(html).toContain("3 checks");
    const entryButtonStart = html.indexOf("prediction-journal-entry-prediction-panel-1");
    const entryButtonHtml = html.slice(entryButtonStart, html.indexOf("</button>", entryButtonStart));
    const targetLabelIndex = entryButtonHtml.indexOf("Next draw");
    const targetDateIndex = entryButtonHtml.indexOf("6/5/26");
    const scoredIndex = entryButtonHtml.indexOf("Scored");
    expect(targetLabelIndex).toBeGreaterThanOrEqual(0);
    expect(targetDateIndex).toBeGreaterThan(targetLabelIndex);
    expect(scoredIndex).toBeGreaterThan(targetDateIndex);
    expect(html).not.toContain("Check</th>");
    expect(html).not.toContain("Predicted</th>");
    expect(html).not.toContain("Hits: 1, 12, 45");
    expect(html).not.toContain("Edit prediction");
  });

  it("keeps listed prediction numbers separate from notes and saved setup selections", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        getSetupSnapshot: () => ({
          userSelectedNumbers: [1, 2, 3, 4, 5, 6, 7],
        } as any),
        now: () => "2026-06-24T10:30:00.000Z",
      }));
    });

    const textAreas = Array.from(container.querySelectorAll("textarea")) as HTMLTextAreaElement[];
    const numbersTextArea = textAreas.find((textarea) => textarea.placeholder === "12, 14, 22, 27") as HTMLTextAreaElement;
    const notesTextArea = textAreas.find((textarea) => textarea.placeholder === "Why this looked plausible before the draw...") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(numbersTextArea, "1,10,12");
      setInputValue(notesTextArea, "Note mentions 4, 5, 6 and 7, but they are not listed picks.");
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton.textContent).toContain("Listed numbers: 3");
    expect(rowButton.textContent).not.toContain("7 numbers");

    await act(async () => {
      rowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("User-selected strip: 7");
    expect(container.textContent).not.toContain("User selected: 7");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("mentions saved setup provenance in the entry summary without expanding it", () => {
    const history = [
      draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
      draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
    ];
    const entry = buildPredictionJournalEntry({
      id: "prediction-panel-setup",
      now: "2026-06-24T10:30:00.000Z",
      latestDraw: history[1],
      targetKind: "nextDraw",
      inputs: { notes: "Setup-sensitive read." },
      setupSnapshot: {
        windowEnabled: true,
        windowMode: "Custom",
        customDrawCount: 13,
        selectedRatios: ["5:3", "4:4"],
        knobs: { enableSDE1: true, enableHC3: false },
        scoringGenerationInfluence: "normal",
        monthEndCarryOverBiasEnabled: true,
        monthEndCarryOverStrength: "strong",
        userSelectedNumbers: [1, 2, 3],
        excludedNumbers: [44],
      } as any,
    });

    const html = renderToStaticMarkup(
      React.createElement(PredictionJournalPanel, { history, initialEntries: [entry] }),
    );

    expect(html).toContain("Saved setup");
    expect(html).not.toContain("WFMQYH Custom 13");
    expect(html).not.toContain("Odd/even ratios: 5:3, 4:4");
    expect(html).not.toContain("Scoring influence: normal");
    expect(html).not.toContain("Month-end carry-over: strong");
    expect(html).not.toContain("User selected: 3");
  });

  it("expands one journal entry row to reveal the full saved entry", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const history = [
      draw("6/1/26", [1, 2, 3, 10, 20, 30], [40, 41]),
      draw("6/3/26", [4, 5, 6, 11, 21, 31], [42, 43]),
      draw("6/5/26", [1, 7, 12, 14, 22, 34], [44, 45]),
    ];
    const entry = buildPredictionJournalEntry({
      id: "prediction-panel-expand",
      now: "2026-06-03T10:30:00.000Z",
      latestDraw: history[1],
      targetKind: "nextDraw",
      inputs: {
        oddEvenRatio: "3:5",
        numbers: [1, 12, 20, 45],
        notes: "Testing a compact journal row.",
        monthlyBuckets: { undrawn: 7, times1: 1 },
      },
      setupSnapshot: {
        windowEnabled: true,
        windowMode: "Custom",
        customDrawCount: 13,
        selectedRatios: ["5:3", "4:4"],
        knobs: { enableSDE1: true, enableHC3: false },
        scoringGenerationInfluence: "normal",
        monthEndCarryOverBiasEnabled: true,
        monthEndCarryOverStrength: "strong",
        userSelectedNumbers: [1, 2, 3],
        excludedNumbers: [44],
      } as any,
    });

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, { history, initialEntries: [entry] }));
    });

    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton).toBeTruthy();
    expect(rowButton.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("Scored");
    expect(container.textContent).toContain("3 checks");
    expect(container.textContent).toContain("Saved setup");
    expect(container.textContent).not.toContain("Testing a compact journal row.");
    expect(container.textContent).not.toContain("Hits: 1, 12, 45");
    expect(container.textContent).not.toContain("WFMQYH Custom 13");

    await act(async () => {
      rowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(rowButton.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Testing a compact journal row.");
    expect(container.textContent).toContain("Immediate next draw");
    expect(container.textContent).toContain("6/5/26");
    expect(container.textContent).toContain("3 of 4 matched");
    expect(container.textContent).toContain("Partial");
    expect(container.textContent).toContain("Hits: 1, 12, 45");
    expect(container.textContent).toContain("WFMQYH Custom 13");
    expect(container.querySelector("table")).toBeNull();
    const immediateTile = container.querySelector("[data-testid='prediction-immediate-next-draw']");
    expect(immediateTile).toBeTruthy();
    expect(immediateTile?.textContent).toContain("matched against next draw mains + supps");
    const scorecardGrid = container.querySelector("[data-testid='prediction-scorecard-grid']");
    expect(scorecardGrid).toBeTruthy();
    expect(scorecardGrid?.textContent).toContain("Odd/even ratio");
    expect(scorecardGrid?.textContent).toContain("Predicted");
    expect(scorecardGrid?.textContent).toContain("Actual");
    expect(scorecardGrid?.textContent).toContain("Result");
    expect(scorecardGrid?.querySelectorAll("[data-testid='prediction-scorecard-tile']").length).toBe(3);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("blocks impossible draw quantities with visible errors before saving", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
      }));
    });

    const oddEvenInput = container.querySelector("input[placeholder='2:6']") as HTMLInputElement;
    const numbersTextArea = container.querySelector("textarea[placeholder='12, 14, 22, 27']") as HTMLTextAreaElement;
    const bucketInputs = Array.from(container.querySelectorAll("input[inputmode='numeric']")) as HTMLInputElement[];
    const undrawnBucketInput = bucketInputs.find((input) => input.parentElement?.textContent?.includes("Undrawn")) as HTMLInputElement;

    await act(async () => {
      setInputValue(oddEvenInput, "9:0");
      setInputValue(numbersTextArea, "1,2,3,4,5,6,7,8,9");
      setInputValue(undrawnBucketInput, "9");
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Odd/even ratio must total 8");
    expect(container.textContent).toContain("Numbers can include at most 8 unique numbers");
    expect(container.textContent).toContain("Monthly bucket mix cannot total more than 8");
    expect(container.textContent).toContain("No journal entries yet");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
