import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HigSlider } from "../src/components/shared/HigControls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

const renderSlider = (onCommit = vi.fn()) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      React.createElement(HigSlider, {
        "aria-label": "Responsive weight",
        min: 0,
        max: 1,
        step: 0.05,
        value: 0.5,
        onCommit,
      }),
    );
  });

  const input = container.querySelector("input[type='range']") as HTMLInputElement | null;
  expect(input).toBeTruthy();
  return { input: input!, onCommit };
};

describe("HigSlider", () => {
  it("updates the thumb locally while dragging and commits once on release", async () => {
    const { input, onCommit } = renderSlider();

    await act(async () => {
      input.value = "0.75";
      input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    });

    expect(input.value).toBe("0.75");
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => {
      input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0.75);
  });

  it("commits a pending local value on blur for keyboard and assistive input", async () => {
    const { input, onCommit } = renderSlider();

    await act(async () => {
      input.value = "0.25";
      input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true, cancelable: true }));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0.25);
  });
});
