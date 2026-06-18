import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { InfoHelp } from "../src/components/shared/HigControls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

describe("InfoHelp", () => {
  it("renders help in a viewport-clamped layer so panel help cannot be clipped by neighbouring cards", async () => {
    setViewport(320, 420);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(
          "div",
          null,
          React.createElement(
            InfoHelp,
            { label: "Constraint help" },
            "Long help text that should stay inside the viewport.",
          ),
        ),
      );
    });

    const button = container.querySelector(".windfall-info-help__button") as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    button!.getBoundingClientRect = () => ({
      x: 300,
      y: 20,
      left: 300,
      right: 324,
      top: 20,
      bottom: 44,
      width: 24,
      height: 24,
      toJSON: () => ({}),
    });

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const panel = document.body.querySelector(".windfall-info-help__panel") as HTMLSpanElement | null;
    expect(panel).toBeTruthy();
    expect(panel?.parentElement).toBe(document.body);
    expect(container.querySelector(".windfall-info-help__panel")).toBeNull();
    expect(panel?.getAttribute("role")).toBe("tooltip");
    expect(button?.getAttribute("aria-describedby")).toBe(panel?.id);

    const left = Number.parseFloat(panel?.style.left ?? "NaN");
    const width = Number.parseFloat(panel?.style.width ?? "NaN");
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + width).toBeLessThanOrEqual(308);
  });
});
