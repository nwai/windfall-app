import { describe, expect, it } from "vitest";
import type { Draw } from "../types";
import {
  buildTicketGridCells,
  buildTicketGridReplayFrames,
  getTicketGridPosition,
  stepTicketReplayFrame,
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
});
