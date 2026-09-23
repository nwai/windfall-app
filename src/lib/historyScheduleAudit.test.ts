import { describe, expect, it } from "vitest";
import { auditHistorySchedule, drawScheduleDateError } from "./historyScheduleAudit";

describe("draw schedule audit", () => {
  it("identifies weekday errors without guessing corrections", () => {
    expect(drawScheduleDateError("2/1/26")).toContain("Sunday");
    expect(drawScheduleDateError("4/28/26")).toContain("Tuesday");
    expect(drawScheduleDateError("2/2/26")).toBeNull();
    expect(drawScheduleDateError("4/27/26")).toBeNull();
    expect(drawScheduleDateError("4/29/26")).toBeNull();
    expect(drawScheduleDateError("2026-02-30")).toContain("Invalid");
  });

  it("reports gaps only between recorded endpoints and ignores simulations", () => {
    expect(auditHistorySchedule([
      { date: "2025-12-22" }, { date: "2025-12-24", isSimulated: true }, { date: "2025-12-26" },
    ])).toEqual({ invalidDateRows: [], offScheduleRows: [], missingDates: ["2025-12-24"] });
    expect(auditHistorySchedule([{ date: "2025-12-26" }]).missingDates).toEqual([]);
  });

  it("keeps calendar stepping correct over daylight saving", () => {
    expect(auditHistorySchedule([{ date: "2026-10-02" }, { date: "2026-10-07" }]).missingDates).toEqual(["2026-10-05"]);
  });
});
