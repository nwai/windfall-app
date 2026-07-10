import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResearchDiaryPanel } from "../src/components/ResearchDiaryPanel";
import { buildResearchDiaryEntry, saveResearchDiaryEntries } from "../src/lib/researchDiary";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (date: string, main: number[] = [1, 2, 3, 4, 5, 6], supp: number[] = [7, 8]): Draw => ({
  date,
  main,
  supp,
});

const setFieldValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("ResearchDiaryPanel", () => {
  it("renders observe-only diary reminders for the next matching draw context", () => {
    const entry = buildResearchDiaryEntry({
      id: "d3-hc3-sde1",
      now: "2026-07-05T12:00:00+10:00",
      title: "D3 SDE1 + HC3",
      observation: "For D3, consider whether SDE1 and HC3 together improve candidate quality.",
      appliesTo: {
        drawOrdinals: [3],
        weekdays: ["Monday"],
      },
      ruleTags: ["SDE1", "HC3"],
      evidenceStatus: "needsTesting",
      priority: "high",
    });

    const html = renderToStaticMarkup(
      React.createElement(ResearchDiaryPanel, {
        history: [draw("2026-07-01"), draw("2026-07-03")],
        initialEntries: [entry],
        now: () => "2026-07-06T09:00:00+10:00",
      }),
    );

    expect(html).toContain("Research Diary &amp; Draw Reminders");
    expect(html).toContain("Observe-only");
    expect(html).toContain("Next draw: Monday 2026-07-06 · D3");
    expect(html).toContain("Diary reminders for next draw");
    expect(html).toContain("D3 SDE1 + HC3");
    expect(html).toContain("SDE1");
    expect(html).toContain("HC3");
    expect(html).toContain("does not change generation");
    expect(html).not.toContain("<h3");
  });

  it("visually groups the draw, weekday, and month-context targeting controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResearchDiaryPanel, {
        history: [draw("2026-07-01"), draw("2026-07-03")],
        now: () => "2026-07-06T09:00:00+10:00",
      }),
    );

    expect(html.match(/class="research-diary-target-group"/g)).toHaveLength(3);
    expect(html).toContain("Applies to draw");
    expect(html).toContain("Applies to weekday");
    expect(html).toContain("Month context");
  });

  it("saves a new note with a setup snapshot and keeps it in the local diary list", async () => {
    window.localStorage.clear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ResearchDiaryPanel, {
        history: [draw("2026-07-01"), draw("2026-07-03")],
        now: () => "2026-07-06T09:00:00+10:00",
        getSetupSnapshot: () => ({
          windowMode: "Custom",
          customDrawCount: 13,
          knobs: { enableSDE1: true, enableHC3: true },
          selectedRatios: ["4:4"],
        } as any),
      }));
    });

    const titleInput = container.querySelector("input[aria-label='Diary title']") as HTMLInputElement | null;
    const observationInput = container.querySelector("textarea[aria-label='Diary observation']") as HTMLTextAreaElement | null;
    const d3Checkbox = container.querySelector("input[aria-label='Applies to D3']") as HTMLInputElement | null;
    const sde1Checkbox = container.querySelector("input[aria-label='Tag SDE1']") as HTMLInputElement | null;
    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Save diary note");

    expect(titleInput).toBeTruthy();
    expect(observationInput).toBeTruthy();
    expect(d3Checkbox).toBeTruthy();
    expect(sde1Checkbox).toBeTruthy();
    expect(saveButton).toBeTruthy();

    await act(async () => {
      setFieldValue(titleInput!, "Third draw setup");
      setFieldValue(observationInput!, "Check SDE1 on the third draw of each month.");
      d3Checkbox!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      sde1Checkbox!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Third draw setup");
    expect(container.textContent).toContain("Saved setup");
    expect(container.textContent).toContain("Diary note saved.");
    expect(window.localStorage.getItem("windfall:research-diary:v1")).toContain("Third draw setup");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("edits an existing journal entry in place instead of creating a duplicate", async () => {
    window.localStorage.clear();
    const storedEntry = buildResearchDiaryEntry({
      id: "edit-me",
      now: "2026-07-05T12:00:00+10:00",
      title: "Original diary note",
      observation: "Original observation text.",
      appliesTo: {
        drawOrdinals: [3],
        weekdays: ["Monday"],
      },
      ruleTags: ["SDE1"],
      evidenceStatus: "needsTesting",
      priority: "high",
      reviewAfterMatches: 4,
      matchedCount: 2,
    });
    saveResearchDiaryEntries([storedEntry], window.localStorage);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ResearchDiaryPanel, {
        history: [draw("2026-07-01"), draw("2026-07-03")],
        now: () => "2026-07-06T09:00:00+10:00",
      }));
    });

    const editButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Edit");
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const titleInput = container.querySelector("input[aria-label='Diary title']") as HTMLInputElement | null;
    const observationInput = container.querySelector("textarea[aria-label='Diary observation']") as HTMLTextAreaElement | null;
    const wednesdayCheckbox = container.querySelector("input[aria-label='Applies to Wednesday']") as HTMLInputElement | null;
    const updateButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Update diary note");

    expect(titleInput?.value).toBe("Original diary note");
    expect(observationInput?.value).toBe("Original observation text.");
    expect(wednesdayCheckbox).toBeTruthy();
    expect(updateButton).toBeTruthy();

    await act(async () => {
      setFieldValue(titleInput!, "Updated diary note");
      setFieldValue(observationInput!, "Updated observation text.");
      wednesdayCheckbox!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      updateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const saved = JSON.parse(window.localStorage.getItem("windfall:research-diary:v1") ?? "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("edit-me");
    expect(saved[0].createdAt).toBe(storedEntry.createdAt);
    expect(saved[0].matchedCount).toBe(2);
    expect(saved[0].title).toBe("Updated diary note");
    expect(saved[0].observation).toBe("Updated observation text.");
    expect(saved[0].appliesTo.weekdays).toEqual(["Monday", "Wednesday"]);
    expect(container.textContent).toContain("Diary note updated.");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
