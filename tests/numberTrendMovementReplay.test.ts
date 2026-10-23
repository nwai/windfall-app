import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NumberTrendsTable } from "../src/components/NumberTrendsTable";
import type { Draw } from "../src/types";

const history: Draw[] = Array.from({ length: 32 }, (_, index) => {
  const date = new Date(2026, 0, 2 + Math.floor(index / 3) * 7 + [0, 3, 5][index % 3]);
  return { date: `${date.getMonth() + 1}/${date.getDate()}/26`, main: index % 3 ? [2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6], supp: [8, 9] };
});

describe("Number Trends Movement Replay UI", () => {
  let container: HTMLDivElement, root: Root, previousAct: unknown;
  beforeEach(() => {
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    previousAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  const render = async (props: React.ComponentProps<typeof NumberTrendsTable>) => {
    await act(async () => root.render(React.createElement(NumberTrendsTable, props)));
  };
  const open = async () => {
    const button = container.querySelector<HTMLButtonElement>('#number-trends-movement-replay .windfall-inline-card__button')!;
    await act(async () => button.click());
  };
  const select = async (label: string, value: string) => {
    const field = Array.from(container.querySelectorAll(".windfall-hig-field")).find(field => field.querySelector("label")?.textContent === label)!;
    const control = field.querySelector("select")!;
    await act(async () => { control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); });
  };

  it("starts collapsed and inspects any number without touching shared forced or excluded selections", async () => {
    const onToggle = vi.fn(), onTrace = vi.fn();
    await render({ history, allHistory: history, selected: [2], excludedNumbers: [1], onToggle, onTrace });
    expect(container.querySelector(".windfall-trend-replay")).toBeNull();
    await open();
    expect(container.querySelector('[aria-label="Scrollable trend movement timeline"] svg')).not.toBeNull();
    expect(container.textContent).toContain("Current value · n1");
    expect(container.textContent).toContain("20 full-window states");
    await select("Inspect number", "45");
    expect(container.textContent).toContain("Current value · n45");
    expect(container.querySelector('[aria-label="Toggle forced inclusion for number 2"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[aria-label="Number 1 is unavailable because it is excluded"]')?.hasAttribute("disabled")).toBe(true);
    expect(onToggle).not.toHaveBeenCalled(); expect(onTrace).not.toHaveBeenCalled();
  });

  it("follows the panel's local source, handles short windows, and refreshes from real history", async () => {
    const props = { history: history.slice(-6), allHistory: history };
    await render(props); await open();
    expect(container.querySelector(".windfall-trend-replay__scope")?.textContent).toContain("WFMQYH · 6 qualifying real draws");
    expect(container.querySelector(".windfall-trend-replay__metrics")?.textContent).toContain("Needs 13 real draws");
    expect(container.querySelector('[aria-label="Next-draw results by fixed trend band"]')?.textContent).not.toContain("NaN");
    const all = container.querySelectorAll<HTMLInputElement>('fieldset input[type="radio"]')[1];
    await act(async () => all.click());
    expect(container.querySelector(".windfall-trend-replay__scope")?.textContent).toContain("All history · 32 qualifying real draws");
    expect(container.querySelector(".windfall-trend-replay__metrics")?.textContent).toContain("20 full-window states");
    await render({ ...props, allHistory: history.slice(0, 30) });
    expect(container.querySelector(".windfall-trend-replay__scope")?.textContent).toContain("All history · 30 qualifying real draws");
  });

  it("provides real temporal rows, raw comparison counts and accessible methodology", async () => {
    await render({ history, allHistory: history }); await open();
    const log = container.querySelector('[aria-label="Movement replay draw log"]')!;
    expect(log.querySelectorAll("tbody tr")).toHaveLength(32);
    expect(log.querySelector("tbody tr")?.textContent).toContain("Not available in this source");
    const dates = Array.from(log.querySelectorAll("tbody th")).map(cell => cell.textContent);
    expect(dates[0]).toBe("3/16/26");
    expect(dates.at(-1)).toBe("1/2/26");
    expect(container.querySelectorAll('[data-current-band="true"]')).toHaveLength(1);
    const help = container.querySelector<HTMLButtonElement>('button[aria-label="About next-draw trend comparisons"]')!;
    await act(async () => help.click());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("trials are not independent");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("outcome is never used");
    await act(async () => help.click());
    expect(container.textContent).toContain("not a next-draw forecast");
  });

  it("commits draw inspection independently and returns to the latest real point", async () => {
    const onToggle = vi.fn();
    await render({ history, allHistory: history, onToggle }); await open();
    const slider = container.querySelector<HTMLInputElement>('.windfall-trend-replay__scrubber input[type="range"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "0");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(container.querySelector(".windfall-trend-replay__inspection")?.textContent).toContain("1/2/26");
    expect(container.querySelector(".windfall-trend-replay__inspection")?.textContent).toContain("Warm-up");
    const latest = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Latest")!;
    await act(async () => latest.click());
    expect(container.querySelector(".windfall-trend-replay__inspection")?.textContent).toContain("3/16/26");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("keeps an empty replay honest and documents the score limits and no-lookahead method", async () => {
    await render({ history: [], allHistory: [] }); await open();
    expect(container.textContent).toContain("No qualifying real draws in this source");
    expect(container.querySelector(".windfall-trend-replay__chart-scroll")).toBeNull();
    const manual = readFileSync("public/user-manual.html", "utf8");
    expect(manual).toContain('id="number-trends-movement-replay"');
    expect(manual).toContain("-76.9 to +76.9");
    expect(manual).toContain("not a hit/miss indicator");
  });
});
