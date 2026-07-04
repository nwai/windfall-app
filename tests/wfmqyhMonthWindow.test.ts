import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("WFMQYH month shortcut", () => {
  it("uses thirteen draws for the Month filter option", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('{ key: "M", label: "Month (13 draws)", size: 13 }');
    expect(appSource).not.toContain('label: "Month (12 draws)", size: 12');
  });
});
