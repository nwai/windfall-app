import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import {
  buildPreviousNeighbourConstraintRows,
  normalizePreviousNeighbourConstraintNumbers,
  togglePreviousNeighbourConstraintNumber,
} from "./previousNeighbourTargets";

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({ date, main, supp });

describe("previousNeighbourTargets", () => {
  it("builds valid -2/-1/+1/+2 target choices from the latest draw", () => {
    const latest = draw("2026-06-10", [1, 33, 35, 45, 20, 14], [11, 37]);

    const rows = buildPreviousNeighbourConstraintRows(latest, "mains-plus-supps");

    expect(rows.find((row) => row.source === 1)).toMatchObject({ minusTwo: null, minusOne: null, plusOne: 2, plusTwo: 3 });
    expect(rows.find((row) => row.source === 33)).toMatchObject({ minusTwo: 31, minusOne: 32, plusOne: 34, plusTwo: 35 });
    expect(rows.find((row) => row.source === 33)?.targets).toEqual([31, 32, 34, 35]);
    expect(rows.find((row) => row.source === 45)).toMatchObject({ minusTwo: 43, minusOne: 44, plusOne: null, plusTwo: null });
    expect(rows.find((row) => row.source === 35)?.duplicateTargets).toEqual([34, 36]);
  });

  it("normalizes and toggles selected target values as unique lottery numbers", () => {
    expect(normalizePreviousNeighbourConstraintNumbers([34, 12, 34, 0, 46, 14.2, 14])).toEqual([12, 14, 34]);

    expect(togglePreviousNeighbourConstraintNumber([12, 34], 14)).toEqual([12, 14, 34]);
    expect(togglePreviousNeighbourConstraintNumber([12, 14, 34], 14)).toEqual([12, 34]);
    expect(togglePreviousNeighbourConstraintNumber([12], 46)).toEqual([12]);
  });
});
