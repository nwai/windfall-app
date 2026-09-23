import { describe, expect, it } from "vitest";

import { chooseInitialDrawHistory } from "./initialDrawHistory";
import type { Draw } from "../types";

const draw = (date: string, isSimulated = false): Draw => ({
  date,
  main: [1, 2, 3, 4, 5, 6],
  supp: [7, 8],
  isSimulated,
});

describe("chooseInitialDrawHistory", () => {
  it("restores missing historical rows from the bundled CSV even when the latest date is unchanged", () => {
    const cached = [draw("2025-12-22"), draw("2025-12-26"), draw("2026-04-28"), draw("2026-09-11")];
    const bundled = [draw("2025-12-22"), draw("2025-12-24"), draw("2025-12-26"), draw("2026-04-27"), draw("2026-09-11")];

    const choice = chooseInitialDrawHistory(cached, bundled);

    expect(choice.source).toBe("bundled-csv");
    expect(choice.history).toEqual(bundled);
    expect(choice.reason).toContain("more draw rows at the same latest date");
  });

  it("uses corrected bundled dates instead of equally recent stale cached dates", () => {
    const cached = [draw("2026-02-01"), draw("2026-02-04")];
    const bundled = [draw("2026-02-02"), draw("2026-02-04")];
    const choice = chooseInitialDrawHistory(cached, bundled);
    expect(choice.source).toBe("bundled-csv");
    expect(choice.history).toEqual(bundled);
    expect(choice.reason).toContain("corrects");
  });

  it("never loses newer cached draws just to replace an older bad date", () => {
    const cached = [draw("2026-02-01"), draw("2026-02-04"), draw("2026-02-06")];
    expect(chooseInitialDrawHistory(cached, [draw("2026-02-02"), draw("2026-02-04")]).history).toEqual(cached);
  });

  it("preserves other valid date edits instead of replacing the entire cache", () => {
    const cached = [draw("2026-02-01"), draw("2026-02-06"), draw("2026-02-09")];
    const bundled = [draw("2026-02-02"), draw("2026-02-04"), draw("2026-02-09")];
    expect(chooseInitialDrawHistory(cached, bundled).history).toEqual(cached);
  });
  it("uses the bundled CSV when the reviewed browser cache is missing the latest draw", () => {
    const cached = [draw("2026-05-25"), draw("2026-05-27")];
    const bundled = [draw("2026-05-25"), draw("2026-05-27"), draw("2026-05-29")];

    const choice = chooseInitialDrawHistory(cached, bundled);

    expect(choice.source).toBe("bundled-csv");
    expect(choice.history).toEqual(bundled);
    expect(choice.reason).toContain("newer");
  });

  it("keeps the reviewed browser cache when it is at least as current as the bundled CSV", () => {
    const cached = [draw("2026-05-25"), draw("2026-05-29"), draw("2026-06-01")];
    const bundled = [draw("2026-05-25"), draw("2026-05-29")];

    const choice = chooseInitialDrawHistory(cached, bundled);

    expect(choice.source).toBe("cache");
    expect(choice.history).toEqual(cached);
  });

  it("does not restore a simulated-only cache as normal startup history when bundled real history exists", () => {
    const cached = [draw("2026-06-01", true), draw("2026-06-03", true)];
    const bundled = [draw("2026-05-25"), draw("2026-05-29")];

    const choice = chooseInitialDrawHistory(cached, bundled);

    expect(choice.source).toBe("bundled-csv");
    expect(choice.history).toEqual(bundled);
    expect(choice.reason).toContain("simulated-only");
  });

  it("does not restore a simulated-only cache when there is no real bundled history", () => {
    const cached = [draw("2026-06-01", true), draw("2026-06-03", true)];

    const choice = chooseInitialDrawHistory(cached, []);

    expect(choice.source).toBe("none");
    expect(choice.history).toEqual([]);
    expect(choice.reason).toContain("simulated-only");
  });

  it("does not restore cached real history when the default bundled CSV is unavailable", () => {
    const cached = [draw("2026-05-25"), draw("2026-05-29")];

    const choice = chooseInitialDrawHistory(cached, []);

    expect(choice.source).toBe("none");
    expect(choice.history).toEqual([]);
    expect(choice.reason).toContain("Default bundled CSV");
  });
});
