import { describe, expect, it } from "vitest";

import { drawResultTemperatureStyle } from "./drawResultTemperature";

describe("drawResultTemperatureStyle", () => {
  it("renders zero observed draw-result counts as cold blue", () => {
    const style = drawResultTemperatureStyle(0, 120);

    expect(style.background).toBe("#dbeafe");
    expect(style.border).toBe("1px solid #93c5fd");
    expect(style.color).toBe("#1e3a8a");
  });

  it("renders positive observed draw-result counts from pink through red", () => {
    const low = drawResultTemperatureStyle(1, 10);
    const high = drawResultTemperatureStyle(10, 10);

    expect(low.background).toBe("#fce7f3");
    expect(low.color).toBe("#831843");
    expect(high.background).toBe("#dc2626");
    expect(high.color).toBe("#ffffff");
  });
});
