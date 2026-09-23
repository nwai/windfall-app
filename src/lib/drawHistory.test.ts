import { describe, expect, it } from "vitest";
import { isFilePickerCancelError, toCsv } from "./drawHistory";

describe("drawHistory file picker helpers", () => {
  it("blocks bad weekdays and duplicate dates before creating a CSV", () => {
    const row = { date: "4/28/26", mains: [8, 26, 43, 33, 10, 24], supps: [11, 5] };
    expect(() => toCsv([row])).toThrow("Tuesday");
    const corrected = { ...row, date: "4/27/26" };
    expect(toCsv([corrected])).toContain("4/27/26,8,26,43,33,10,24,11,5");
    expect(() => toCsv([corrected, { ...corrected, date: "2026-04-27" }])).toThrow("More than one result");
  });
  it("recognizes user cancellation errors from file picker APIs", () => {
    expect(isFilePickerCancelError({ name: "AbortError", message: "The user aborted a request." })).toBe(true);
    expect(isFilePickerCancelError({ name: "Error", message: "User cancelled file selection." })).toBe(true);
  });

  it("does not treat write failures as user cancellation", () => {
    expect(isFilePickerCancelError(new Error("Write permission denied."))).toBe(false);
    expect(isFilePickerCancelError(null)).toBe(false);
  });
});
