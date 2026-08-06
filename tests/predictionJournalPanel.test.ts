import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { PredictionJournalPanel } from "../src/components/PredictionJournalPanel";
import { PREDICTION_JOURNAL_STORAGE_KEY, buildPredictionJournalEntry } from "../src/lib/predictionJournal";
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

const controlByLabel = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
  container: HTMLElement,
  labelText: string,
): T => {
  const label = Array.from(container.querySelectorAll("label"))
    .find((candidate) => candidate.textContent?.trim() === labelText);
  const ariaControl = container.querySelector(
    `input[aria-label="${labelText}"], select[aria-label="${labelText}"], textarea[aria-label="${labelText}"]`,
  );
  expect(label || ariaControl).toBeTruthy();
  const control = label?.htmlFor ? label.ownerDocument.getElementById(label.htmlFor) : label?.querySelector("input, select, textarea");
  const resolvedControl = control ?? ariaControl;
  expect(resolvedControl).toBeTruthy();
  return resolvedControl as T;
};

describe("PredictionJournalPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders an entries-only empty state by default without seeded fake prediction rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
      }),
    );

    expect(html).toContain("Prediction Journal &amp; Scorecard");
    expect(html).toContain("Prediction Journal Findings Report");
    expect(html).toContain("Observe-only V1");
    expect(html).toContain("Journal entries");
    expect(html).toContain("Record your own draw hypotheses");
    expect(html).toContain("The user manual is a good source of help for using the prediction feature.");
    expect(html).not.toContain("Anchor latest draw");
    expect(html).not.toContain("Save prediction");
    expect(html).not.toContain("<h3");
    expect(html).not.toContain("1,2,3,4,5,6");
  });

  it("renders a date-aware journal draft after a new prediction request", () => {
    const html = renderToStaticMarkup(
      React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        newPredictionDraft: { id: 1 },
      }),
    );

    expect(html).toContain("Prediction Journal &amp; Scorecard");
    expect(html).toContain("Anchor latest draw");
    expect(html).toContain("windfall-prediction-journal-anchor-numbers");
    expect(html).toContain("windfall-prediction-journal-top-grid");
    expect(html).toContain("windfall-prediction-journal-text-grid");
    expect(html).toContain("windfall-prediction-journal-text-stack");
    expect(html).toContain("windfall-prediction-journal-text-box");
    expect(html).toContain("windfall-prediction-journal-notes-field");
    expect(html).toContain("6/24/26");
    expect(html).toContain("Review status");
    expect(html).toContain("Not reviewed");
    expect(html).toContain("Reviewed by user");
    expect(html).toContain("No prediction fields are required");
    expect(html).toContain("Save prediction");
    expect(html).toContain("The user manual is a good source of help for using the prediction feature.");
    expect(html).not.toContain("<h3");
    expect(html).not.toContain("1,2,3,4,5,6");
    expect(html).not.toContain("Mark reviewed only after you have checked the draft. Future scoring can use this flag to include or ignore entries.");
  });

  it("shows the next scheduled draw date beside the target window control", () => {
    const html = renderToStaticMarkup(
      React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        now: () => "2026-06-25T09:00:00.000Z",
        newPredictionDraft: { id: 1 },
      }),
    );

    const targetFieldStart = html.indexOf("Target window");
    const nextDrawDateIndex = html.indexOf("Next draw: Friday 2026-06-26", targetFieldStart);
    const oddEvenIndex = html.indexOf("Odd/even ratio", targetFieldStart);

    expect(targetFieldStart).toBeGreaterThanOrEqual(0);
    expect(nextDrawDateIndex).toBeGreaterThan(targetFieldStart);
    expect(nextDrawDateIndex).toBeLessThan(oddEvenIndex);
  });

  it("stores selection reason shortcuts as structured data and mirrors them into notes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        now: () => "2026-06-24T10:30:00.000Z",
        newPredictionDraft: { id: 1 },
      }));
    });

    const numbersTextArea = container.querySelector("textarea[placeholder='12, 14, 22, 27']") as HTMLTextAreaElement;
    const notesTextArea = container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(numbersTextArea, "1, 10, 12");
    });

    const dgaReason = container.querySelector("input[value='dgaPattern']") as HTMLInputElement;
    await act(async () => {
      dgaReason.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      dgaReason.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(notesTextArea.value).toContain("Selection reason: Observed pattern in DGA grid.");

    const otherReason = container.querySelector("input[value='other']") as HTMLInputElement;
    await act(async () => {
      otherReason.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      otherReason.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const otherReasonInput = controlByLabel<HTMLInputElement>(container, "Other reason");
    await act(async () => {
      setInputValue(otherReasonInput, "Testing a split diagonal.");
    });

    expect(notesTextArea.value).not.toContain("Selection reason: Observed pattern in DGA grid.");
    expect(notesTextArea.value).toContain("Selection reason: Other - Testing a split diagonal.");

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const saved = JSON.parse(window.localStorage.getItem(PREDICTION_JOURNAL_STORAGE_KEY) ?? "[]");
    expect(saved[0].inputs.selectionReason).toEqual({
      version: 1,
      key: "other",
      label: "Other",
      detail: "Testing a split diagonal.",
    });
    expect(saved[0].inputs.notes).toContain("Selection reason: Other - Testing a split diagonal.");

    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton.textContent).toContain("Reason: Other - Testing a split diagonal.");

    await act(async () => {
      root.unmount();
    });
    container.remove();
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
      reviewStatus: "reviewedByUser",
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
    expect(html).toContain("Reviewed by user");
    expect(html).toContain("Prediction Journal Findings Report");
    expect(html).toContain("Not enough reviewed scored entries yet");
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
        newPredictionDraft: { id: 1 },
      }));
    });

    const textAreas = Array.from(container.querySelectorAll("textarea")) as HTMLTextAreaElement[];
    const numbersTextArea = textAreas.find((textarea) => textarea.placeholder === "12, 14, 22, 27") as HTMLTextAreaElement;
    const notesTextArea = textAreas.find((textarea) => textarea.placeholder === "Why this looked plausible before the draw...") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(numbersTextArea, "1,10,12");
      setInputValue(notesTextArea, "Note mentions 4, 5, 6 and 7, but they are not listed picks.");
    });

    const reviewedRadio = container.querySelector("input[value='reviewedByUser']") as HTMLInputElement;
    await act(async () => {
      reviewedRadio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      reviewedRadio.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton.textContent).toContain("3 picked");
    const collapsedPickedNumbers = rowButton.querySelector("[data-testid='prediction-journal-collapsed-picked-numbers']");
    expect(collapsedPickedNumbers?.textContent).toContain("User picked numbers");
    expect(collapsedPickedNumbers?.textContent).toContain("M");
    expect(collapsedPickedNumbers?.textContent).toContain("1");
    expect(collapsedPickedNumbers?.querySelectorAll("[data-picked-role='main']").length).toBe(3);
    expect(collapsedPickedNumbers?.querySelectorAll("[data-picked-role='supp']").length).toBe(0);
    expect(rowButton.textContent).toContain("Reviewed by user");
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

  it("shows the not-reviewed guidance only after saving an unreviewed entry", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        newPredictionDraft: { id: 1 },
      }));
    });

    const alertText = "Mark reviewed only after you have checked the draft. Future scoring can use this flag to include or ignore entries.";
    expect(container.textContent).not.toContain(alertText);

    const notesTextArea = Array.from(container.querySelectorAll("textarea"))
      .find((textarea) => textarea.placeholder === "Why this looked plausible before the draw...") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(notesTextArea, "Quick capture, not reviewed yet.");
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const alert = container.querySelector("[role='alert']");
    expect(alert?.textContent).toContain(alertText);
    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton.textContent).toContain("Not reviewed");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("reopens a pending not-reviewed entry for editing", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        now: () => "2026-06-24T10:30:00.000Z",
        newPredictionDraft: { id: 1 },
      }));
    });

    const notesTextArea = container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(notesTextArea, "Keep this editable while it is still pending.");
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton).toBeTruthy();
    expect(rowButton.textContent).toContain("Not reviewed");
    expect(rowButton.textContent).toContain("Editable until first target draw appears");

    await act(async () => {
      rowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const editButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Edit prediction") as HTMLButtonElement;
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    expect(container.textContent).toContain("Update prediction");
    expect(container.textContent).toContain("Editing prediction anchored to 6/24/26.");
    expect(document.activeElement).toBe(container.querySelector("[data-testid='prediction-journal-draft-region']"));
    expect(container.querySelector("button[aria-expanded='true']")).toBeNull();
    const reopenedNotes = container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']") as HTMLTextAreaElement;
    expect(reopenedNotes.value).toBe("Keep this editable while it is still pending.");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("can switch from draft view to entries-only view and returns to entries after save", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const props = {
      history: [
        draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
        draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
      ],
      now: () => "2026-06-24T10:30:00.000Z",
    };

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        ...props,
        newPredictionDraft: { id: 1 },
      }));
    });

    expect(container.textContent).toContain("Save prediction");
    expect(container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']")).toBeTruthy();

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        ...props,
        newPredictionDraft: { id: 1 },
        viewEntriesRequestId: 1,
      }));
    });

    expect(container.textContent).not.toContain("Save prediction");
    expect(container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']")).toBeNull();
    expect(container.textContent).toContain("Record your own draw hypotheses");

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        ...props,
        newPredictionDraft: { id: 2 },
        viewEntriesRequestId: 1,
      }));
    });

    const notesTextArea = container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']") as HTMLTextAreaElement;
    expect(notesTextArea).toBeTruthy();

    await act(async () => {
      setInputValue(notesTextArea, "Entries view should open after save.");
    });

    const reviewedRadio = container.querySelector("input[value='reviewedByUser']") as HTMLInputElement;
    await act(async () => {
      reviewedRadio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      reviewedRadio.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Prediction saved.");
    expect(container.textContent).not.toContain("Save prediction");
    const savedRowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(savedRowButton).toBeTruthy();
    expect(savedRowButton.textContent).toContain("notes");

    await act(async () => {
      savedRowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Entries view should open after save.");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("autofills diagnostic fields from numbers entered into the Numbers field", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/29/26", [1, 2, 3, 4, 5, 6], [7, 8]),
          draw("7/1/26", [1, 10, 20, 30, 40, 45], [2, 12]),
          draw("7/3/26", [3, 13, 23, 33, 43, 5], [15, 25]),
        ],
        now: () => "2026-07-04T09:00:00.000Z",
        newPredictionDraft: { id: 1 },
      }));
    });

    const numbersTextArea = container.querySelector("textarea[placeholder='12, 14, 22, 27']") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(numbersTextArea, "1, 4, 10, 11, 22, 35, 40, 45");
    });

    expect((controlByLabel<HTMLInputElement>(container, "Odd/even ratio")).value).toBe("4:4");
    expect((controlByLabel<HTMLTextAreaElement>(container, "Terminal digits")).value).toBe("0, 1, 2, 4, 5");
    expect((controlByLabel<HTMLInputElement>(container, "Undrawn")).value).toBe("4");
    expect((controlByLabel<HTMLInputElement>(container, "1x")).value).toBe("4");
    expect((controlByLabel<HTMLInputElement>(container, "Single-digit")).value).toBe("2");
    expect((controlByLabel<HTMLInputElement>(container, "Double-digit")).value).toBe("6");
    expect((controlByLabel<HTMLInputElement>(container, "Sum min")).value).toBe("168");
    expect((controlByLabel<HTMLInputElement>(container, "Sum max")).value).toBe("168");
    expect((controlByLabel<HTMLInputElement>(container, "U/D/F ratio")).value).toBe("0/0/8");
    expect((controlByLabel<HTMLInputElement>(container, "Repeat count")).value).toBe("0");
    expect((controlByLabel<HTMLInputElement>(container, "±1/±2 count")).value).toBe("6");
    expect((controlByLabel<HTMLInputElement>(container, "Drought count")).value).toBe("0");
    expect((controlByLabel<HTMLInputElement>(container, "Carry-over count")).value).toBe("4");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("warns before saving a draft whose numbers collide with historical Division 1 or Division 2", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/1/26", [1, 2, 3, 4, 5, 6], [7, 8]),
          draw("6/3/26", [10, 11, 12, 13, 14, 15], [16, 17]),
          draw("6/5/26", [20, 21, 22, 23, 24, 25], [26, 27]),
        ],
        now: () => "2026-06-05T10:30:00.000Z",
        newPredictionDraft: { id: 1 },
      }));
    });

    const numbersTextArea = container.querySelector("textarea[placeholder='12, 14, 22, 27']") as HTMLTextAreaElement;

    await act(async () => {
      setInputValue(numbersTextArea, "1,2,3,4,5,6,7,8");
    });

    const draftCollision = container.querySelector("[data-testid='prediction-draft-prize-collision']");
    expect(draftCollision).toBeTruthy();
    expect(draftCollision?.textContent).toContain("Rare historical D1/D2 collision found");
    expect(draftCollision?.textContent).toContain("Stored line check");
    expect(draftCollision?.textContent).toContain("Div1 on 6/1/26");
    expect(draftCollision?.textContent).toContain("Selected-set subset check");

    const reviewedRadio = container.querySelector("input[value='reviewedByUser']") as HTMLInputElement;
    await act(async () => {
      reviewedRadio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      reviewedRadio.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save prediction") as HTMLButtonElement;

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const saveAlert = container.querySelector("[data-testid='prediction-historical-prize-collision-save-alert']");
    expect(saveAlert).toBeTruthy();
    expect(saveAlert?.textContent).toContain("Historical Division 1/2 collision found");
    expect(container.querySelector("button[aria-controls^='prediction-journal-entry-']")).toBeNull();

    const saveAnywayButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save anyway") as HTMLButtonElement;

    await act(async () => {
      saveAnywayButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton).toBeTruthy();
    expect(rowButton.textContent).toContain("8 picked");
    expect(rowButton.querySelectorAll("[data-picked-role='main']").length).toBe(6);
    expect(rowButton.querySelectorAll("[data-picked-role='supp']").length).toBe(2);

    await act(async () => {
      rowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const savedCollision = container.querySelector("[data-testid='prediction-historical-prize-collision']");
    expect(savedCollision).toBeTruthy();
    expect(savedCollision?.textContent).toContain("Rare historical D1/D2 collision found");
    expect(savedCollision?.textContent).toContain("Checked against 3 real historical draws");
    expect(savedCollision?.textContent).toContain("archive rarity check, not a future probability signal");

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
        generationForcedNumbers: [1, 12],
        allExcludedNumbers: [44],
        droughtBreakStrictShortlistNumbers: [12, 31],
        droughtBreakEmpiricalHazardNumbers: [20, 31, 45],
        droughtBreakShortlistTop: 8,
        droughtBreakStrictThreshold: 6,
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
      reviewStatus: "reviewedByUser",
      inputs: {
        oddEvenRatio: "3:5",
        numbers: [1, 12, 20, 45],
        terminalDigits: [1, 4],
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
        generationForcedNumbers: [1, 12],
        allExcludedNumbers: [44],
        droughtBreakStrictShortlistNumbers: [12, 31],
        droughtBreakEmpiricalHazardNumbers: [20, 31, 45],
        droughtBreakShortlistTop: 8,
        droughtBreakStrictThreshold: 6,
      } as any,
    });

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, { history, initialEntries: [entry] }));
    });

    const rowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    expect(rowButton).toBeTruthy();
    expect(rowButton.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("Scored");
    expect(container.textContent).toContain("Reviewed by user");
    expect(container.textContent).toContain("4 checks");
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
    const provenance = container.querySelector("[data-testid='prediction-structured-provenance']");
    expect(provenance).toBeTruthy();
    expect(provenance?.textContent).toContain("Structured provenance");
    expect(provenance?.textContent).toContain("User picked numbers");
    expect(provenance?.querySelectorAll("[data-picked-role='main']").length).toBe(4);
    expect(provenance?.querySelectorAll("[data-picked-role='supp']").length).toBe(0);
    expect(provenance?.textContent).toContain("Forced 1, 12");
    expect(provenance?.textContent).toContain("Excluded 44");
    expect(provenance?.textContent).toContain("Any shortlist yes");
    expect(provenance?.textContent).toContain("All from shortlist no");
    expect(provenance?.textContent).toContain("Strict drought 6+ 12");
    expect(provenance?.textContent).toContain("Empirical hazard 20, 45");
    expect(provenance?.textContent).toContain("Outside shortlist 1");
    expect(provenance?.textContent).toContain("12: Strict drought 6+");
    expect(provenance?.textContent).toContain("20: Empirical hazard");
    const terminalHistory = container.querySelector("[data-testid='prediction-terminal-digit-history']");
    expect(terminalHistory).toBeTruthy();
    expect(terminalHistory?.textContent).toContain("Terminal digit history");
    expect(terminalHistory?.textContent).toContain("1, 4");
    expect(terminalHistory?.textContent).toContain("Contained hits");
    expect(terminalHistory?.textContent).toContain("2 / 3 (66.67%)");
    expect(terminalHistory?.textContent).toContain("Exact set hits");
    expect(terminalHistory?.textContent).toContain("0 / 3 (0.00%)");
    expect(terminalHistory?.textContent).toContain("Latest contained draw: 6/5/26");
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
    expect(scorecardGrid?.textContent).toContain("Terminal digits");
    expect(scorecardGrid?.querySelectorAll("[data-testid='prediction-scorecard-tile']").length).toBe(4);

    const archiveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Archive") as HTMLButtonElement;
    expect(archiveButton).toBeTruthy();

    await act(async () => {
      archiveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Prediction archived");
    expect(container.textContent).toContain("Show archived (1)");
    expect(container.textContent).toContain("No active journal entries");

    const showArchivedButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Show archived (1)") as HTMLButtonElement;
    expect(showArchivedButton).toBeTruthy();

    await act(async () => {
      showArchivedButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Archived");
    const archivedRowButton = container.querySelector("button[aria-controls^='prediction-journal-entry-']") as HTMLButtonElement;
    await act(async () => {
      archivedRowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Restore");

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
        newPredictionDraft: { id: 1 },
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
    expect(container.textContent).toContain("Target draw bucket-origin mix cannot total more than 8");
    expect(container.textContent).toContain("The user manual is a good source of help for using the prediction feature.");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("prefills a new prediction draft from a setup snapshot request", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        now: () => "2026-06-25T09:00:00.000Z",
        newPredictionDraft: {
          id: 1,
          setupSnapshot: {
            windowEnabled: true,
            windowMode: "Custom",
            customDrawCount: 13,
            selectedRatios: ["5:3"],
            useTrickyRule: false,
            knobs: { enableSDE1: true, enableHC3: true },
            userSelectedNumbers: [1, 2, 3],
            trendSelectedNumbers: [10],
            previousNeighbourConstraintNumbers: [12],
            hotColdForcedNumbers: [20],
            droughtBreakSelectedNumbers: [],
            selectedCarryOverBoostNumbers: [],
            excludedNumbers: [44],
            hotColdExcludedNumbers: [42],
            autoExcludedFromSelection: [21],
            mainConstraintAutoExcludedNumbers: [35],
            effectiveExcludedNumbers: [21, 42, 44],
            generationForcedNumbers: [10, 12, 20],
            generationExcludedNumbers: [21, 35, 42, 44],
            allExcludedNumbers: [4, 6, 8, 21, 22, 24, 35, 42, 44],
            sde1Exclusions: [4, 6, 8],
            hc3Exclusions: [22, 24],
            monthlyConstructiveEnabled: true,
            acceptanceNeedsEnabled: true,
            acceptanceNeedsCounts: {
              undrawn: 2,
              times1: 3,
              times2: 0,
              times3: 1,
              times4: 0,
              times5: 0,
              times6: 0,
              times7: 0,
              times8: 0,
            },
          } as any,
        },
      }));
    });

    const oddEvenInput = container.querySelector("input[placeholder='2:6']") as HTMLInputElement;
    const numbersTextArea = container.querySelector("textarea[placeholder='12, 14, 22, 27']") as HTMLTextAreaElement;
    const terminalDigitsTextArea = controlByLabel<HTMLTextAreaElement>(container, "Terminal digits");
    const notesTextArea = container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']") as HTMLTextAreaElement;

    expect(oddEvenInput.value).toBe("5:3");
    expect(numbersTextArea.value).toBe("1, 2, 3, 10, 12, 20");
    expect(terminalDigitsTextArea.value).toBe("0, 1, 2, 3");
    expect((controlByLabel<HTMLInputElement>(container, "Undrawn")).value).toBe("2");
    expect((controlByLabel<HTMLInputElement>(container, "1x")).value).toBe("3");
    expect((controlByLabel<HTMLInputElement>(container, "3x")).value).toBe("1");
    expect((controlByLabel<HTMLInputElement>(container, "Single-digit")).value).toBe("3");
    expect((controlByLabel<HTMLInputElement>(container, "Double-digit")).value).toBe("3");
    expect((controlByLabel<HTMLInputElement>(container, "U/D/F ratio")).value).not.toBe("");
    expect((controlByLabel<HTMLInputElement>(container, "Repeat count")).value).toBe("2");
    expect((controlByLabel<HTMLInputElement>(container, "±1/±2 count")).value).not.toBe("");
    expect((controlByLabel<HTMLInputElement>(container, "Drought count")).value).not.toBe("");
    expect((controlByLabel<HTMLInputElement>(container, "Carry-over count")).value).not.toBe("");
    expect(notesTextArea.value).toContain("New prediction draft created from the current app setup.");
    expect(notesTextArea.value).toContain("SDE1: ON; exclusions 4, 6, 8.");
    expect(notesTextArea.value).toContain("HC3: ON; exclusions 22, 24.");
    expect(notesTextArea.value).toContain("Effective generation forced numbers: 10, 12, 20.");
    expect(notesTextArea.value).toContain("Exclusion sources: user 44; hot/cold 42; auto-unselected 21; main-bucket auto 35; SDE1 4, 6, 8; HC3 22, 24.");
    expect(notesTextArea.value).toContain("Effective generation exclusions: 4, 6, 8, 21, 22, 24, 35, 42, 44.");
    expect(container.textContent).toContain("New prediction draft created from current setup");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("prefills New Prediction numbers with DGA suggested supps kept in the final two positions", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PredictionJournalPanel, {
        history: [
          draw("6/22/26", [2, 4, 6, 8, 10, 12], [14, 16]),
          draw("6/24/26", [1, 3, 5, 7, 9, 11], [13, 15]),
        ],
        now: () => "2026-06-25T09:00:00.000Z",
        newPredictionDraft: {
          id: 1,
          setupSnapshot: {
            windowEnabled: true,
            windowMode: "H",
            customDrawCount: 13,
            selectedRatios: [],
            useTrickyRule: false,
            knobs: {},
            userSelectedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
            trendSelectedNumbers: [],
            previousNeighbourConstraintNumbers: [],
            hotColdForcedNumbers: [],
            droughtBreakSelectedNumbers: [],
            selectedCarryOverBoostNumbers: [],
            excludedNumbers: [],
            dgaSuggestedMainNumbers: [1, 2, 4, 6, 7, 8],
            dgaSuggestedSuppNumbers: [3, 5],
            dgaSuggestedSuppPair: [3, 5],
            dgaSuggestedSuppPairActiveCount: 1,
            dgaSuggestedSuppPairFullCount: 2,
            dgaSuggestedSuppPairActiveDrawCount: 13,
            dgaSuggestedSuppPairFullDrawCount: 344,
            dgaSuggestedSuppPairActiveGap: 4,
            dgaSuggestedSuppPairFullGap: 21,
            dgaSuppPairActiveCoverage: 3,
            dgaSuppPairFullCoverage: 8,
            dgaSuppPairTotalCoverage: 28,
          } as any,
        },
      }));
    });

    const numbersTextArea = container.querySelector("textarea[placeholder='12, 14, 22, 27']") as HTMLTextAreaElement;
    const notesTextArea = container.querySelector("textarea[placeholder='Why this looked plausible before the draw...']") as HTMLTextAreaElement;

    expect(numbersTextArea.value).toBe("1, 2, 4, 6, 7, 8, 3, 5");
    expect(notesTextArea.value).toContain("DGA supplementary-role split copied: mains 1, 2, 4, 6, 7, 8; supps 3, 5.");
    expect(notesTextArea.value).toContain("DGA supplementary-pair tie-break evidence: pair 3, 5; WFMQYH exact pair 1/13");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
