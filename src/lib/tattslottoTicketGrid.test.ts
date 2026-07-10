import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  buildTicketGridCells,
  buildTicketGridReplayFrames,
  computeAdjacentTraceMarkers,
  computeCarryOverMarkers,
  computeRunningHotColdCounts,
  computeTicketGridDensity,
  getTicketGridPosition,
  buildTicketGridCandidateFrames,
  stepTicketCarouselFrame,
  stepTicketReplayFrame,
  toggleTicketHeldNumber,
} from "./tattslottoTicketGrid";

const draw = (date: string, main: number[], supp: number[] = [44, 45], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

describe("tattslotto ticket grid helpers", () => {
  it("maps numbers 1-45 to a Tattslotto 9x5 grid", () => {
    expect(getTicketGridPosition(1)).toEqual({ number: 1, row: 0, column: 0 });
    expect(getTicketGridPosition(9)).toEqual({ number: 9, row: 0, column: 8 });
    expect(getTicketGridPosition(10)).toEqual({ number: 10, row: 1, column: 0 });
    expect(getTicketGridPosition(45)).toEqual({ number: 45, row: 4, column: 8 });
    expect(getTicketGridPosition(0)).toBeNull();
    expect(getTicketGridPosition(46)).toBeNull();
  });

  it("builds exactly 45 cells in ticket order", () => {
    const cells = buildTicketGridCells();

    expect(cells).toHaveLength(45);
    expect(cells[0]).toEqual({ number: 1, row: 0, column: 0 });
    expect(cells[44]).toEqual({ number: 45, row: 4, column: 8 });
  });

  it("builds chronological real replay frames and excludes simulated draws", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/05/26", [5, 6, 7, 8, 9, 10]),
      draw("6/01/26", [1, 2, 3, 4, 5, 6]),
      draw("6/03/26", [3, 4, 5, 6, 7, 8], [9, 10], true),
    ]);

    expect(frames.map((frame) => frame.date)).toEqual(["6/01/26", "6/05/26"]);
    expect(frames[0]).toMatchObject({
      index: 0,
      frameNumber: 1,
      totalFrames: 2,
      main: [1, 2, 3, 4, 5, 6],
      supp: [44, 45],
    });
    expect(frames[1]).toMatchObject({
      index: 1,
      frameNumber: 2,
      totalFrames: 2,
      main: [5, 6, 7, 8, 9, 10],
    });
  });

  it("steps replay frame indices with clamping", () => {
    expect(stepTicketReplayFrame({ currentIndex: 0, frameCount: 4, direction: 1 })).toBe(1);
    expect(stepTicketReplayFrame({ currentIndex: 3, frameCount: 4, direction: 1 })).toBe(3);
    expect(stepTicketReplayFrame({ currentIndex: 3, frameCount: 4, direction: -1 })).toBe(2);
    expect(stepTicketReplayFrame({ currentIndex: 0, frameCount: 4, direction: -1 })).toBe(0);
    expect(stepTicketReplayFrame({ currentIndex: 0, frameCount: 0, direction: 1 })).toBe(0);
  });

  it("builds candidate carousel frames from real candidate sources without inventing numbers", () => {
    const frames = buildTicketGridCandidateFrames([
      {
        id: "generated",
        label: "Generated Candidates",
        candidates: [
          { main: [6, 1, 2, 3, 4, 5], supp: [44, 45] },
          { main: [0, 9, 10, 10, 46, 11], supp: [12, 13, 13] },
        ],
      },
      {
        id: "paste",
        label: "Paste-Weighted Candidates",
        candidates: [
          { main: [14, 15, 16, 17, 18, 19] },
        ],
      },
    ]);

    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({
      sourceId: "generated",
      sourceLabel: "Generated Candidates",
      sourceRowNumber: 1,
      main: [1, 2, 3, 4, 5, 6],
      supp: [44, 45],
      numbers: [1, 2, 3, 4, 5, 6, 44, 45],
    });
    expect(frames[1].numbers).toEqual([9, 10, 11, 12, 13]);
    expect(frames[2]).toMatchObject({
      sourceId: "paste",
      sourceLabel: "Paste-Weighted Candidates",
      sourceRowNumber: 1,
      supp: [],
      numbers: [14, 15, 16, 17, 18, 19],
    });
  });

  it("wraps carousel stepping and caps held ticket numbers at eight", () => {
    expect(stepTicketCarouselFrame({ currentIndex: 0, frameCount: 3, direction: 1 })).toBe(1);
    expect(stepTicketCarouselFrame({ currentIndex: 2, frameCount: 3, direction: 1 })).toBe(0);
    expect(stepTicketCarouselFrame({ currentIndex: 0, frameCount: 3, direction: -1 })).toBe(2);
    expect(stepTicketCarouselFrame({ currentIndex: 0, frameCount: 0, direction: 1 })).toBe(0);

    let held = [1, 2, 3, 4, 5, 6, 7];
    held = toggleTicketHeldNumber(held, 8);
    expect(held).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(toggleTicketHeldNumber(held, 9)).toEqual(held);
    expect(toggleTicketHeldNumber(held, 0)).toEqual(held);
    expect(toggleTicketHeldNumber([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("computes carry-over markers from the previous real frame", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("6/03/26", [2, 4, 8, 9, 10, 11], [12, 13]),
    ]);

    expect(computeCarryOverMarkers(frames[1], frames[0], "mainsSupps")).toEqual([2, 4, 8]);
    expect(computeCarryOverMarkers(frames[1], frames[0], "mains")).toEqual([2, 4]);
    expect(computeCarryOverMarkers(frames[0], null, "mainsSupps")).toEqual([]);
  });

  it("computes adjacent +/-1/+/-2 trace markers without wrapping at ticket boundaries", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 10, 20, 30, 40, 45], [22, 23]),
      draw("6/03/26", [2, 8, 18, 32, 43, 44], [24, 25]),
    ]);

    expect(computeAdjacentTraceMarkers(frames[1], frames[0], "mainsSupps")).toEqual([2, 8, 18, 24, 25, 32, 43, 44]);
    expect(computeAdjacentTraceMarkers(frames[1], frames[0], "mains")).toEqual([2, 8, 18, 32, 43, 44]);
    expect(computeAdjacentTraceMarkers(frames[0], null, "mainsSupps")).toEqual([]);
  });

  it("computes row and column density over the active replay window", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 2, 3, 10, 11, 12], [44, 45]),
      draw("6/03/26", [1, 9, 18, 27, 36, 45], [2, 3]),
    ]);
    const density = computeTicketGridDensity(frames, "mains");

    expect(density.rowCounts).toEqual([5, 4, 1, 1, 1]);
    expect(density.columnCounts[0]).toBe(3);
    expect(density.maxRowCount).toBe(5);
    expect(density.maxColumnCount).toBe(5);
    expect(density.normalizedRowIntensity[0]).toBe(1);
    expect(density.normalizedRowIntensity[1]).toBeCloseTo(0.8);
  });

  it("computes running hot/cold counts without looking beyond the current frame", () => {
    const frames = buildTicketGridReplayFrames([
      draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("6/03/26", [1, 2, 9, 10, 11, 12], [13, 14]),
      draw("6/05/26", [1, 15, 16, 17, 18, 19], [20, 21]),
    ]);

    const frame0 = computeRunningHotColdCounts(frames, 0, "mainsSupps");
    expect(frame0.hotCount).toBe(1);
    expect(frame0.hotNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(frame0.coldCount).toBe(0);
    expect(frame0.coldNumbers).toHaveLength(37);

    const frame1 = computeRunningHotColdCounts(frames, 1, "mainsSupps");
    expect(frame1.hotCount).toBe(2);
    expect(frame1.hotNumbers).toEqual([1, 2]);
    expect(frame1.countsByNumber[15]).toBe(0);
    expect(frame1.coldNumbers).toContain(15);

    const frame2 = computeRunningHotColdCounts(frames, 2, "mains");
    expect(frame2.hotCount).toBe(3);
    expect(frame2.hotNumbers).toEqual([1]);
  });
});
