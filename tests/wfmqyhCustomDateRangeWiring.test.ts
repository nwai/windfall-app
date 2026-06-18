import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WFMQYH custom date range wiring", () => {
  it("renders a custom date range line from the active filtered history", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('import { formatWfmqyhDateRange } from "./lib/wfmqyhWindowDateRange";');
    expect(appSource).toContain("const customWindowDateRangeLabel = useMemo(");
    expect(appSource).toContain("formatWfmqyhDateRange(filteredHistory)");
    expect(appSource).toContain("customWindowDateRangeLabel");
  });
});
