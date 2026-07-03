import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TattslottoTicketGridReplayPanel } from "../src/components/TattslottoTicketGridReplayPanel";
import type { Draw } from "../src/types";

const draw = (date: string, main: number[], supp: number[] = [44, 45], isSimulated = false): Draw => ({
  date,
  main,
  supp,
  isSimulated,
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderPanel = (history: Draw[]) => React.createElement(TattslottoTicketGridReplayPanel, { history });

describe("TattslottoTicketGridReplayPanel", () => {
  it("renders a truthful empty state when no real draws are available", () => {
    const html = renderToStaticMarkup(renderPanel([]));

    expect(html).toContain("No real draws available in the active window");
    expect(html).toContain("observed historical draws");
  });

  it("renders the first chronological real draw on a 9x5 ticket grid", () => {
    const html = renderToStaticMarkup(
      renderPanel([
        draw("6/05/26", [5, 6, 7, 8, 9, 10]),
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/03/26", [11, 12, 13, 14, 15, 16], [17, 18], true),
      ]),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const grid = document.querySelector('[data-testid="tattslotto-ticket-grid"]');

    expect(document.body.textContent).toContain("6/01/26");
    expect(document.body.textContent).toContain("Frame 1 / 2");
    expect(grid?.querySelectorAll("[data-ticket-number]").length).toBe(45);
    expect(grid?.querySelector('[data-ticket-number="1"]')?.getAttribute("data-draw-role")).toBe("main");
    expect(grid?.querySelector('[data-ticket-number="7"]')?.getAttribute("data-draw-role")).toBe("supp");
    expect(grid?.querySelector('[data-ticket-number="9"]')?.getAttribute("data-draw-role")).toBe("none");
  });

  it("steps forward and backward without mutating external app state", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(renderPanel([
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/03/26", [9, 10, 11, 12, 13, 14], [15, 16]),
      ]));
    });

    expect(host.textContent).toContain("Frame 1 / 2");

    const stepForward = host.querySelector('button[aria-label="Step forward one draw"]') as HTMLButtonElement;
    await act(async () => stepForward.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("Frame 2 / 2");

    const stepBackward = host.querySelector('button[aria-label="Step backward one draw"]') as HTMLButtonElement;
    await act(async () => stepBackward.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("Frame 1 / 2");

    await act(async () => root.unmount());
  });

  it("plays forward on a cleanup-safe interval", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(renderPanel([
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/03/26", [9, 10, 11, 12, 13, 14], [15, 16]),
      ]));
    });

    const playForward = host.querySelector('button[aria-label="Play forward"]') as HTMLButtonElement;
    await act(async () => playForward.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(1000));

    expect(host.textContent).toContain("Frame 2 / 2");

    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it("toggles observe-only overlays from accessible controls", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(renderPanel([
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
        draw("6/03/26", [1, 9, 10, 11, 12, 13], [14, 15]),
      ]));
    });

    const carryToggle = Array.from(host.querySelectorAll("label"))
      .find((label) => label.textContent?.includes("Carry-over markers"))
      ?.querySelector("input") as HTMLInputElement;

    expect(carryToggle.checked).toBe(true);
    await act(async () => carryToggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(carryToggle.checked).toBe(false);

    await act(async () => root.unmount());
  });
});
