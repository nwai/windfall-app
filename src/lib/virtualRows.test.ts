import { describe, expect, it } from "vitest";
import { computeVirtualRowWindow } from "./virtualRows";

describe("computeVirtualRowWindow", () => {
  it("keeps the same rendered row window while scrolling within the same overscan band", () => {
    const base = {
      totalRows: 200,
      rowHeight: 32,
      viewportHeight: 600,
      overscan: 5,
      enabled: true,
    };

    const atTop = computeVirtualRowWindow({ ...base, scrollTop: 0 });
    const withinFirstRows = computeVirtualRowWindow({ ...base, scrollTop: 31 });
    const stillWithinOverscan = computeVirtualRowWindow({ ...base, scrollTop: 32 });

    expect(atTop).toMatchObject({ startIdx: 0, endIdx: 29, topPad: 0 });
    expect(withinFirstRows).toEqual(atTop);
    expect(stillWithinOverscan).toEqual(atTop);
  });

  it("moves the window only after the scroll crosses a row boundary beyond overscan", () => {
    const result = computeVirtualRowWindow({
      totalRows: 200,
      scrollTop: 200,
      rowHeight: 32,
      viewportHeight: 600,
      overscan: 5,
      enabled: true,
    });

    expect(result.startIdx).toBe(1);
    expect(result.endIdx).toBe(30);
    expect(result.topPad).toBe(32);
    expect(result.bottomPad).toBe((200 - 30) * 32);
  });

  it("clamps impossible scroll positions to a valid final window", () => {
    const result = computeVirtualRowWindow({
      totalRows: 200,
      scrollTop: 999_999,
      rowHeight: 32,
      viewportHeight: 600,
      overscan: 5,
      enabled: true,
    });

    expect(result.startIdx).toBe(171);
    expect(result.endIdx).toBe(200);
    expect(result.bottomPad).toBe(0);
  });

  it("returns the full list window when virtualization is disabled", () => {
    expect(computeVirtualRowWindow({
      totalRows: 12,
      scrollTop: 300,
      rowHeight: 32,
      viewportHeight: 600,
      overscan: 5,
      enabled: false,
    })).toEqual({
      startIdx: 0,
      endIdx: 12,
      topPad: 0,
      bottomPad: 0,
    });
  });
});
