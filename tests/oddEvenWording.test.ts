import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const visibleParityFiles = [
  "src/App.tsx",
  "src/components/WindowStatsPanel.tsx",
  "src/components/EndingDigitSequencePanel.tsx",
  "src/lib/endingDigitSequences.ts",
  "public/user-manual.html",
];

describe("odd/even wording convention", () => {
  it("uses odd before even in visible parity labels and explanatory copy", () => {
    for (const path of visibleParityFiles) {
      const source = readProjectFile(path);

      expect(source, path).not.toMatch(/\bEven\s*\/\s*Odd\b/);
      expect(source, path).not.toMatch(/\beven\s*\/\s*odd\b/);
      expect(source, path).not.toMatch(/\bEven\s*,\s*Odd\b/);
      expect(source, path).not.toMatch(/\beven\s*,\s*odd\b/);
    }
  });

  it("shows odd before even in compact parity stat rows", () => {
    const endingDigitSource = readProjectFile("src/components/EndingDigitSequencePanel.tsx");

    expect(endingDigitSource.indexOf("<span>Odd")).toBeGreaterThanOrEqual(0);
    expect(endingDigitSource.indexOf("<span>Odd")).toBeLessThan(
      endingDigitSource.indexOf("<span>Even"),
    );
  });
});
