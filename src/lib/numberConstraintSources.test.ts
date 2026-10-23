import { describe, expect, it, vi } from "vitest";
import { clearNumberConstraintSources, summarizeNumberConstraintSources, type NumberConstraintSource } from "./numberConstraintSources";

const source = (id: string, numbers: number[], extra: Partial<NumberConstraintSource> = {}): NumberConstraintSource => ({
  id, label: id, numbers, clearImpact: `Clear ${id}`, onClear: vi.fn(), ...extra,
});

describe("forced number source summaries and resets", () => {
  it("counts unique valid numbers and preserves overlapping owners", () => {
    const sources = [source("trends", [1, 1, 3, 46]), source("drought", [3, 5]), source("invalid", [0, NaN])];
    const before = sources.map(row => [...row.numbers]);
    const summary = summarizeNumberConstraintSources(sources);
    expect(summary.numbers).toEqual([1, 3, 5]);
    expect(summary.active.map(row => row.id)).toEqual(["trends", "drought"]);
    expect(summary.active[0].numbers).toEqual([1, 3]);
    expect(sources.map(row => row.numbers)).toEqual(before);
    clearNumberConstraintSources(sources.filter(row => row.id === "trends"));
    expect(sources[0].onClear).toHaveBeenCalledOnce();
    expect(sources[1].onClear).not.toHaveBeenCalled();
  });

  it("can clear an enabled automatic policy even when its current number list is empty", () => {
    const mirror = source("mirror", [], { enabled: true });
    const inactive = source("off", [], { enabled: false });
    const report = clearNumberConstraintSources([mirror, inactive]);
    expect(report).toEqual([{ id: "mirror", label: "mirror", numbers: [], clearImpact: "Clear mirror" }]);
    expect(mirror.onClear).toHaveBeenCalledOnce();
    expect(inactive.onClear).not.toHaveBeenCalled();
  });

  it("discloses generation-only exclusions without double-counting shared numbers", () => {
    const summary = summarizeNumberConstraintSources([
      source("manual", [2, 4]), source("HC3", [4, 6]), source("MiAN", [4, 8], { scope: "generation-only" }),
    ]);
    expect(summary.numbers).toEqual([2, 4, 6, 8]);
    expect(summary.sharedNumbers).toEqual([2, 4, 6]);
    expect(summary.generationOnlyExtra).toEqual([8]);
  });

  it("clears only supplied active sources and records the pre-clear state", () => {
    const selected = [1, 3];
    const rows = [source("trends", selected, { onClear: () => { selected.length = 0; } }), source("SDE1", [4], { enabled: true }), source("off", [])];
    const report = clearNumberConstraintSources(rows);
    expect(report[0].numbers).toEqual([1, 3]);
    expect(selected).toEqual([]);
    expect(report.map(row => row.id)).toEqual(["trends", "SDE1"]);
    expect(rows[1].onClear).toHaveBeenCalledOnce();
    expect(rows[2].onClear).not.toHaveBeenCalled();
  });
});
