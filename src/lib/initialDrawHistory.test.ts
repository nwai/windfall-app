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
});
