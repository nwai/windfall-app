import { describe, expect, it } from "vitest";

import type { Draw } from "../types";
import { isParseableDrawDate, strictValidateDraws } from "./strictDrawValidation";

const validDraw = (date: string): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
});

describe("strict draw validation", () => {
  it("accepts real CSV date formats used by the draw history", () => {
    expect(isParseableDrawDate("2026-05-29")).toBe(true);
    expect(isParseableDrawDate("5/29/26")).toBe(true);
    expect(isParseableDrawDate("05/29/2026")).toBe(true);
  });

  it("rejects missing, unparseable, and impossible draw dates", () => {
    expect(isParseableDrawDate("")).toBe(false);
    expect(isParseableDrawDate("unknown")).toBe(false);
    expect(isParseableDrawDate("2026-02-31")).toBe(false);
    expect(isParseableDrawDate("13/29/26")).toBe(false);
  });

  it("filters invalid draw dates instead of replacing them with a synthetic unknown date", () => {
    const draws: Draw[] = [
      validDraw("2026-05-29"),
      validDraw(""),
      validDraw("unknown"),
      validDraw("2026-02-31"),
    ];

    expect(strictValidateDraws(draws)).toEqual([validDraw("2026-05-29")]);
  });
});
