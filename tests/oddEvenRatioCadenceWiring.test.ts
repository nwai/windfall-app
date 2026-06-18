import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Odd/Even Ratio Cadence app wiring", () => {
  it("places the cadence panel after the Odd/Even Ratio Filters panel", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(appSource).toContain('import { OddEvenRatioCadencePanel } from "./components/OddEvenRatioCadencePanel";');
    expect(appSource).toContain('panelId="odd-even-ratio-cadence"');
    expect(appSource.indexOf('panelId="odd-even-ratio-filters"')).toBeLessThan(
      appSource.indexOf('panelId="odd-even-ratio-cadence"'),
    );
    expect(appSource).toContain("<OddEvenRatioCadencePanel draws={realFilteredHistory} />");
  });
});
