import { beforeEach, describe, expect, it } from "vitest";
import { clearCachedDrawHistory, loadCachedDrawHistory, saveCachedDrawHistory } from "./historyPersistence";

const sampleRows = [
  { date: "10/27/25", mains: [1, 2, 3, 4, 5, 6], supps: [7, 8] },
  { date: "10/28/25", mains: [9, 10, 11, 12, 13, 14], supps: [15, 16] },
];

describe("historyPersistence", () => {
  beforeEach(() => {
    clearCachedDrawHistory();
  });

  it("saves and reloads cached draw history rows", () => {
    saveCachedDrawHistory(sampleRows);
    expect(loadCachedDrawHistory()).toEqual(sampleRows);
  });

  it("returns null when the cache is absent or malformed", () => {
    expect(loadCachedDrawHistory()).toBeNull();
    window.localStorage.setItem("draw-history:reviewed:v1", "not-json");
    expect(loadCachedDrawHistory()).toBeNull();
  });

  it("clears the cached draw history", () => {
    saveCachedDrawHistory(sampleRows);
    clearCachedDrawHistory();
    expect(loadCachedDrawHistory()).toBeNull();
  });
});
