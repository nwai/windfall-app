import { describe, expect, it } from "vitest";

import { chooseInitialDrawHistory } from "./initialDrawHistory";
import type { Draw } from "../types";

const draw = (date: string): Draw => ({ date, main: [1, 2, 3, 4, 5, 6], supp: [7, 8] });

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
});
