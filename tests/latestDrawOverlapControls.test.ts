import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const readAppSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("latest-draw overlap controls", () => {
  it("allows zero maximum matches so users can force no latest-draw repeats", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("setMaxLastDrawMatchesEnabled");
    expect(appSource).toContain("maxLastDrawMatchesEnabled ? maxLastDrawMatchesValue : undefined");
    expect(appSource).toContain("[0,1,2,3,4,5,6,7,8].map");
  });
});
