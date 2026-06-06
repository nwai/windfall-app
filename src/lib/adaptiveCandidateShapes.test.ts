import { describe, expect, it } from "vitest";

import {
  buildAdaptiveShapeEvidence,
  candidateShapeProfile,
} from "./adaptiveCandidateShapes";
import type { Draw } from "../types";

const draw = (main: number[]): Draw => ({ date: "", main, supp: [] });

describe("candidateShapeProfile", () => {
  it("separates single-digit and double-digit parity in six main numbers", () => {
    expect(candidateShapeProfile([1, 10, 11, 12, 13, 14])).toBe("S1:0 D2:3");
    expect(candidateShapeProfile([2, 4, 10, 12, 14, 16])).toBe("S0:2 D0:4");
  });
});

describe("buildAdaptiveShapeEvidence", () => {
  it("shrinks a small WFMQYH window toward the latest 50 draws", () => {
    const latest50 = [
      ...Array.from({ length: 30 }, () => draw([1, 10, 12, 14, 16, 18])),
      ...Array.from({ length: 20 }, () => draw([10, 12, 14, 16, 18, 20])),
    ];
    const wfmqyh = [
      ...Array.from({ length: 10 }, () => draw([1, 3, 10, 12, 14, 16])),
      ...Array.from({ length: 10 }, () => draw([1, 10, 12, 14, 16, 18])),
    ];

    const evidence = buildAdaptiveShapeEvidence({
      fullHistory: latest50,
      activeHistory: wfmqyh,
      shrinkTargetSize: 50,
    });

    expect(evidence.activeDraws).toBe(20);
    expect(evidence.latestTargetDraws).toBe(50);
    expect(evidence.activeWeight).toBeCloseTo(0.4, 6);
    expect(evidence.profileOptions).toEqual([
      { ratio: "S1:0 D0:5", count: 56, percent: 56 },
      { ratio: "S0:0 D0:6", count: 24, percent: 24 },
      { ratio: "S2:0 D0:4", count: 20, percent: 20 },
    ]);
  });

  it("uses WFMQYH directly when the active window has at least 50 draws", () => {
    const fullHistory = [
      ...Array.from({ length: 50 }, () => draw([10, 12, 14, 16, 18, 20])),
      ...Array.from({ length: 50 }, () => draw([1, 10, 12, 14, 16, 18])),
    ];
    const activeHistory = [
      ...Array.from({ length: 30 }, () => draw([1, 3, 10, 12, 14, 16])),
      ...Array.from({ length: 20 }, () => draw([1, 10, 12, 14, 16, 18])),
    ];

    const evidence = buildAdaptiveShapeEvidence({
      fullHistory,
      activeHistory,
      shrinkTargetSize: 50,
    });

    expect(evidence.activeWeight).toBe(1);
    expect(evidence.profileOptions).toEqual([
      { ratio: "S2:0 D0:4", count: 60, percent: 60 },
      { ratio: "S1:0 D0:5", count: 40, percent: 40 },
    ]);
  });
});
