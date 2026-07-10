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
const renderPanelWithCandidates = (history: Draw[]) => React.createElement(TattslottoTicketGridReplayPanel, {
  history,
  candidateSources: [
    {
      id: "generated",
      label: "Generated Candidates",
      candidates: [
        { main: [1, 2, 3, 4, 5, 6], supp: [7, 8] },
        { main: [9, 10, 11, 12, 13, 14], supp: [15, 16] },
      ],
    },
  ],
});

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

  it("explains why candidate carousel mode is disabled when no candidate rows are loaded", () => {
    const html = renderToStaticMarkup(
      renderPanel([
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      ]),
    );

    expect(html).toContain("Candidate rows available: 0");
    expect(html).toContain("Generate rows in Generated Candidates or Paste-Weighted Candidates to enable carousel mode.");
  });

  it("colors running hot and cold badges with red and blue while keeping text labels", () => {
    const html = renderToStaticMarkup(
      renderPanel([
        draw("6/01/26", [1, 2, 3, 4, 5, 6], [7, 8]),
      ]),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const hotBadge = document.querySelector('[data-ticket-number="1"] span[aria-hidden="true"]');
    const coldBadge = document.querySelector('[data-ticket-number="9"] span[aria-hidden="true"]');

    expect(hotBadge?.textContent).toBe("H");
    expect(coldBadge?.textContent).toBe("C");
    expect(hotBadge?.getAttribute("style")).toContain("background:#dc2626");
    expect(coldBadge?.getAttribute("style")).toContain("background:#2563eb");
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

  it("switches to candidate carousel mode and holds visible candidate numbers locally", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(renderPanelWithCandidates([
        draw("6/01/26", [20, 21, 22, 23, 24, 25], [26, 27]),
      ]));
    });

    const carouselMode = host.querySelector('button[aria-label="Show candidate carousel mode"]') as HTMLButtonElement;
    await act(async () => carouselMode.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(host.textContent).toContain("Candidate 1 / 2");
    expect(host.textContent).toContain("Generated Candidates #1");
    expect(host.querySelector('[data-ticket-number="1"]')?.getAttribute("data-draw-role")).toBe("main");
    expect(host.querySelector('[data-ticket-number="7"]')?.getAttribute("data-draw-role")).toBe("supp");

    const holdVisible = host.querySelector('button[aria-label="Hold current candidate numbers"]') as HTMLButtonElement;
    await act(async () => holdVisible.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(host.textContent).toContain("Held 8 / 8");
    expect(host.querySelector('[data-ticket-number="1"]')?.getAttribute("data-held")).toBe("true");
    expect(host.querySelector('button[aria-label="Spin candidate carousel"]')?.hasAttribute("disabled")).toBe(true);

    const startOver = host.querySelector('button[aria-label="Start over candidate holds"]') as HTMLButtonElement;
    await act(async () => startOver.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("Held 0 / 8");

    await act(async () => root.unmount());
  });

  it("spins candidate rows on a looping interval without mutating the replay history", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(renderPanelWithCandidates([
        draw("6/01/26", [20, 21, 22, 23, 24, 25], [26, 27]),
      ]));
    });

    await act(async () => {
      (host.querySelector('button[aria-label="Show candidate carousel mode"]') as HTMLButtonElement)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      (host.querySelector('button[aria-label="Spin candidate carousel"]') as HTMLButtonElement)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTime(1000));

    expect(host.textContent).toContain("Candidate 2 / 2");
    expect(host.textContent).not.toContain("Frame 2 /");

    await act(async () => root.unmount());
    vi.useRealTimers();
  });
});
