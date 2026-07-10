import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  buildResearchDiaryEntry,
  computeResearchDiaryNextDrawContext,
  findResearchDiaryReminders,
  loadResearchDiaryEntries,
  saveResearchDiaryEntries,
  summarizeResearchDiarySetup,
} from "./researchDiary";

const draw = (date: string, main: number[] = [1, 2, 3, 4, 5, 6], supp: number[] = [7, 8]): Draw => ({
  date,
  main,
  supp,
});

describe("researchDiary", () => {
  it("computes the next scheduled draw context from current date and history", () => {
    const context = computeResearchDiaryNextDrawContext(
      [
        draw("2026-07-01"),
        draw("2026-07-03"),
      ],
      { now: "2026-07-06T09:00:00+10:00" },
    );

    expect(context.nextDrawDate).toBe("2026-07-06");
    expect(context.weekday).toBe("Monday");
    expect(context.drawOrdinal).toBe(3);
    expect(context.monthKey).toBe("2026-07");
    expect(context.monthPhase).toBe("early");
    expect(context.recordedDrawsInTargetMonth).toBe(2);
    expect(context.monthDrawCount).toBe(14);
  });

  it("matches only active targeted diary entries for the next draw context", () => {
    const context = computeResearchDiaryNextDrawContext([draw("2026-07-03")], {
      now: "2026-07-06T09:00:00+10:00",
    });
    const d3Monday = buildResearchDiaryEntry({
      id: "d3-sde1-hc3",
      now: "2026-07-05T12:00:00+10:00",
      title: "D3 SDE1 and HC3",
      observation: "Try SDE1 and HC3 together on the third draw.",
      appliesTo: {
        drawOrdinals: [3],
        weekdays: ["Monday"],
      },
      ruleTags: ["SDE1", "HC3"],
      evidenceStatus: "needsTesting",
      priority: "high",
      reviewAfterMatches: 3,
      matchedCount: 2,
    });
    const wednesdayOnly = buildResearchDiaryEntry({
      id: "wed-only",
      now: "2026-07-05T12:00:00+10:00",
      title: "Wednesday note",
      observation: "Wednesday-only note.",
      appliesTo: { weekdays: ["Wednesday"] },
    });
    const retired = buildResearchDiaryEntry({
      id: "retired",
      now: "2026-07-05T12:00:00+10:00",
      title: "Retired D3",
      observation: "Do not show retired entries.",
      appliesTo: { drawOrdinals: [3] },
      evidenceStatus: "retired",
    });

    const reminders = findResearchDiaryReminders([d3Monday, wednesdayOnly, retired], context);

    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.entry.id).toBe("d3-sde1-hc3");
    expect(reminders[0]?.reasonLabels).toEqual(["D3", "Monday"]);
    expect(reminders[0]?.tagLabels).toEqual(["SDE1", "HC3"]);
    expect(reminders[0]?.reviewDue).toBe(true);
  });

  it("persists diary entries locally without treating malformed storage as real entries", () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem("windfall:research-diary:v1", "not-json");
    expect(loadResearchDiaryEntries(storage)).toEqual([]);

    const entry = buildResearchDiaryEntry({
      id: "stored",
      now: "2026-07-05T12:00:00+10:00",
      title: "Stored note",
      observation: "Persisted observe-only note.",
      appliesTo: { drawOrdinals: [3] },
    });

    saveResearchDiaryEntries([entry], storage);
    expect(loadResearchDiaryEntries(storage)).toEqual([entry]);
  });

  it("distinguishes constructive acceptance counts from the extra MiAN post-filter", () => {
    const setupSummary = summarizeResearchDiarySetup({
      monthlyConstructiveEnabled: true,
      acceptanceNeedsEnabled: false,
      acceptanceNeedsCounts: {
        undrawn: 2,
        times1: 1,
        times2: 0,
      },
    } as any);

    expect(setupSummary?.generation).toContain("Use counts when constructing candidates: on");
    expect(setupSummary?.generation).toContain("Acceptance needs counts: 0x≥2 · 1x≥1");
    expect(setupSummary?.generation).toContain("Extra MiAN post-filter: off");
    expect(setupSummary?.generation).not.toContain("Acceptance needs: off");
  });
});
