import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NumberTrendsTable, type NumberTrend } from "../src/components/NumberTrendsTable";
import { DroughtHazardPanel } from "../src/components/DroughtHazardPanel";
import { buildEmpiricalDroughtQuotaShortlist, buildStrictDroughtQuotaShortlist } from "../src/lib/strictDroughtQuotaAdvice";
import type { Draw } from "../src/types";

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const buildTrends = (): NumberTrend[] =>
  Array.from({ length: 45 }, (_, index) => {
    const number = index + 1;
    return {
      number,
      d3: number % 3,
      d9: number % 9,
      d15: number % 15,
      fortnight: number % 6,
      month: number % 13,
      quarter: number % 36,
      year: number % 20,
      all: number + 10,
    };
  });

const buildHistory = (drawCount: number): Draw[] =>
  Array.from({ length: drawCount }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    main: [1, 2, 3, 4, 5, 6],
    supp: [7, 8],
  }));

describe("NumberTrendsTable", () => {
  it("renders number trends as nine five-number HIG blocks instead of wide tables", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        trends: buildTrends(),
        selected: [7],
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const blocks = Array.from(document.querySelectorAll("[data-testid='number-trend-block']"));
    const rows = Array.from(document.querySelectorAll("[data-testid='number-trend-row']"));

    expect(blocks).toHaveLength(9);
    expect(blocks.map((block) => block.getAttribute("aria-label"))).toEqual([
      "Number trends 1-5",
      "Number trends 6-10",
      "Number trends 11-15",
      "Number trends 16-20",
      "Number trends 21-25",
      "Number trends 26-30",
      "Number trends 31-35",
      "Number trends 36-40",
      "Number trends 41-45",
    ]);
    expect(blocks.map((block) => block.querySelectorAll("[data-testid='number-trend-row']").length))
      .toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(rows).toHaveLength(45);
    expect(document.querySelectorAll("table")).toHaveLength(0);
    expect(document.body.textContent).toContain("13D");
    expect(document.body.textContent).not.toContain("12D");

    const selectedRow = document.querySelector("[aria-label='Toggle forced inclusion for number 7']");
    expect(selectedRow?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedRow?.textContent).toContain("Forced");
    expect(selectedRow?.textContent).toContain("7");

    const numberOneRow = document.querySelector("[aria-label='Toggle forced inclusion for number 1']");
    expect(numberOneRow?.getAttribute("style") ?? "").toContain("--number-trend-color:hsl(23, 70%, 45%)");
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__number")).not.toBeNull();
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__delta")).not.toBeNull();
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__delta")?.getAttribute("aria-label")).toContain("versus 13D");
  });

  it("computes the month comparison window from 13 draws", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        history: buildHistory(13),
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const numberOneRow = document.querySelector("[aria-label='Toggle forced inclusion for number 1']");

    expect(numberOneRow?.textContent).toContain("13D13");
    expect(numberOneRow?.querySelector(".windfall-number-trend-row__delta")?.getAttribute("aria-label")).toContain("13D 100.0 percent");
  });

  it("shows externally forced drought-break numbers as locked selected rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        trends: buildTrends(),
        selected: [],
        externalSelectedNumbers: [11],
        externalSelectedLabel: "Drought-break shortlist",
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const droughtRow = document.querySelector("[aria-label='Number 11 is forced by Drought-break shortlist']");

    expect(droughtRow?.getAttribute("aria-pressed")).toBe("true");
    expect(droughtRow?.getAttribute("data-external-selected")).toBe("true");
    expect(droughtRow?.getAttribute("disabled")).not.toBeNull();
    expect(droughtRow?.textContent).toContain("Drought-break shortlist");
  });

  it("flags user-excluded numbers as unavailable for forced inclusion", () => {
    const html = renderToStaticMarkup(
      React.createElement(NumberTrendsTable, {
        trends: buildTrends(),
        selected: [7],
        excludedNumbers: [11],
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const excludedRow = document.querySelector("[aria-label='Number 11 is unavailable because it is excluded']");

    expect(document.body.textContent).toContain("Active exclusions: 11");
    expect(excludedRow?.getAttribute("aria-pressed")).toBe("false");
    expect(excludedRow?.getAttribute("data-user-excluded")).toBe("true");
    expect(excludedRow?.getAttribute("disabled")).not.toBeNull();
    expect(excludedRow?.textContent).toContain("Excluded");
  });

  it("gives hard exclusions priority over overlapping own and external selections", () => {
    const html = renderToStaticMarkup(React.createElement(NumberTrendsTable, {
      trends: buildTrends(), selected: [11], externalSelectedNumbers: [11],
      externalSelectedLabel: "Drought-break shortlist", excludedNumbers: [11],
    }));
    const document = new DOMParser().parseFromString(html, "text/html");
    const row = document.querySelector("[aria-label='Number 11 is unavailable because it is excluded']");
    expect(row?.getAttribute("aria-pressed")).toBe("false");
    expect(row?.getAttribute("disabled")).not.toBeNull();
    expect(row?.textContent).toContain("Excluded");
  });

  it("documents the trend arrow delta in the user manual", () => {
    const manual = readProjectFile("public/user-manual.html");

    expect(manual).toContain('id="number-trends-table"');
    expect(manual).toContain("Δ 3→13");
    expect(manual).toContain("(3D count / 3 × 100) - (13D count / 13 × 100)");
    expect(manual).toContain("percentage-point difference");
    expect(manual).toContain("not a calibrated probability");
  });

  it("renders two explicit membership flags for every number, including overlap and neither", () => {
    const html = renderToStaticMarkup(React.createElement(NumberTrendsTable, {
      trends: buildTrends(), strictDroughtNumbers: [1, 2], empiricalDroughtNumbers: [2, 3],
    }));
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("[data-drought-family]")).toHaveLength(90);
    const statuses = (n: number) => Array.from(document.querySelector(`[aria-label='Toggle forced inclusion for number ${n}']`)!
      .querySelectorAll("[data-drought-family]")).map(flag => flag.getAttribute("data-drought-status"));
    expect(statuses(1)).toEqual(["yes", "no"]);
    expect(statuses(2)).toEqual(["yes", "yes"]);
    expect(statuses(3)).toEqual(["no", "yes"]);
    expect(statuses(4)).toEqual(["no", "no"]);
    const row = document.querySelector("[aria-label='Toggle forced inclusion for number 2']")!;
    expect(document.getElementById(row.getAttribute("aria-describedby")!)?.getAttribute("aria-label"))
      .toBe("Current Strict drought shortlist: Yes; current Empirical hazard shortlist: Yes");
    expect(row.getAttribute("aria-pressed")).toBe("false");
  });

  it("distinguishes unavailable shortlist data from a known empty shortlist", () => {
    const html = renderToStaticMarkup(React.createElement(NumberTrendsTable, {
      trends: buildTrends(), empiricalDroughtNumbers: [],
    }));
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll('[data-drought-family="strict"][data-drought-status="unavailable"]')).toHaveLength(45);
    expect(document.querySelector('[data-drought-family="strict"]')?.textContent).toBe("Strict n/a");
    expect(document.querySelectorAll('[data-drought-family="empirical"][data-drought-status="no"]')).toHaveLength(45);
  });

  it("mirrors the actual live shortlist tables before generation exclusions", () => {
    const fullHistory: Draw[] = Array.from({ length: 12 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      main: index === 0 ? [1, 2, 3, 4, 5, 6] : [9, 10, 11, 12, 13, 14],
      supp: index === 0 ? [7, 8] : [15, 16],
    }));
    const history = fullHistory.slice(-4);
    const strictDroughtNumbers = buildStrictDroughtQuotaShortlist(history, fullHistory, { topK: 8 }).numbers;
    const empiricalDroughtNumbers = buildEmpiricalDroughtQuotaShortlist(history, { topK: 8 }).numbers;
    const html = renderToStaticMarkup(React.createElement(NumberTrendsTable, {
      history, allHistory: fullHistory, strictDroughtNumbers, empiricalDroughtNumbers, excludedNumbers: [1, 9],
    }));
    const document = new DOMParser().parseFromString(html, "text/html");
    for (const mode of ["strict", "empirical"] as const) {
      const panelHtml = renderToStaticMarkup(React.createElement(DroughtHazardPanel, {
        history, fullHistory, defaultMode: mode, top: 8, onToggleNumber: () => {}, excludedNumbers: [1, 9],
      }));
      const panel = new DOMParser().parseFromString(panelHtml, "text/html");
      const liveNumbers = Array.from(panel.querySelectorAll(`[data-drought-number-button="true"][data-drought-source="${mode}"]`))
        .map(button => Number(button.textContent)).sort((a, b) => a - b);
      const flaggedNumbers = Array.from(document.querySelectorAll(`[data-drought-family="${mode}"][data-drought-status="yes"]`))
        .map(flag => Number(flag.closest('[data-testid="number-trend-row"]')?.querySelector(".windfall-number-trend-row__number")?.textContent))
        .sort((a, b) => a - b);
      expect(liveNumbers).toHaveLength(8);
      expect(flaggedNumbers).toEqual(liveNumbers);
    }
    const excluded = document.querySelector('[aria-label="Number 1 is unavailable because it is excluded"]')!;
    expect(excluded.hasAttribute("disabled")).toBe(true);
    expect(excluded.getAttribute("aria-pressed")).toBe("false");
    expect(excluded.querySelector('[data-drought-family="strict"]')?.textContent).toBe("Strict Yes");
  });
});

describe("Number Trends local history source", () => {
  const allHistory: Draw[] = Array.from({ length: 20 }, (_, index) => {
    const date = new Date(2025, 0, 1 + index * 7);
    return { date: `${date.getMonth() + 1}/${date.getDate()}/25`,
      main: index < 17 ? [1, 2, 3, 4, 5, 6] : [9, 10, 11, 12, 13, 14],
      supp: index < 17 ? [7, 8] : [15, 16] };
  });
  const history = allHistory.slice(-3);
  let container: HTMLDivElement, root: Root, previousActEnvironment: unknown;
  const render = async (props: React.ComponentProps<typeof NumberTrendsTable> = { history, allHistory }) => {
    await act(async () => root.render(React.createElement(NumberTrendsTable, props)));
  };
  const changeSource = async (source: "window" | "all") => {
    const radios = container.querySelectorAll<HTMLInputElement>('fieldset input[type="radio"]');
    await act(async () => radios[source === "window" ? 0 : 1].click());
  };
  const row = (number: number) => Array.from(container.querySelectorAll<HTMLElement>('[data-testid="number-trend-row"]'))
    .find(element => element.querySelector(".windfall-number-trend-row__number")?.textContent === String(number))!;
  const metric = (number: number, label: string) => Array.from(row(number).querySelectorAll(".windfall-number-trend-metric"))
    .find(element => element.querySelector(".windfall-number-trend-metric__label")?.textContent === label)
    ?.querySelector(".windfall-number-trend-metric__value")?.textContent;

  beforeEach(() => {
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
    previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  it("defaults to WFMQYH and recalculates all counts and chart lines from the chosen source", async () => {
    await render({ history, allHistory, selected: [1] });
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')?.checked).toBe(true);
    expect(container.querySelector(".windfall-number-trends__scope")?.textContent).toContain("WFMQYH · 3 real draws");
    expect(metric(1, "All")).toBe("0");
    expect(metric(9, "3D")).toBe("3");
    const windowPath = container.querySelector("svg path")?.getAttribute("d");
    expect(row(1).getAttribute("data-direction")).toBe("flat");
    await changeSource("all");
    expect(container.querySelector(".windfall-number-trends__scope")?.textContent).toContain("All history · 20 real draws");
    expect(container.querySelector(".windfall-number-trends__scope")?.textContent).toContain("1/1/25 to 5/14/25");
    expect(metric(1, "13D")).toBe("10");
    expect(metric(1, "36D")).toBe("17");
    expect(metric(1, "All")).toBe("17");
    expect(metric(9, "3D")).toBe("3");
    expect(row(1).getAttribute("data-direction")).toBe("down");
    expect(container.querySelector("svg path")?.getAttribute("d")).not.toBe(windowPath);
    expect(container.querySelector("svg polygon title")?.textContent).toContain("Δ -76.9 pp");
    await changeSource("window");
    expect(metric(1, "All")).toBe("0");
    expect(container.querySelector("svg path")?.getAttribute("d")).toBe(windowPath);
  });

  it("keeps shared selections, external locks and exclusions unchanged and does not invoke selection callbacks", async () => {
    const onToggle = vi.fn(), onTrendSelectToggle = vi.fn(), onExcludeToggle = vi.fn(), onTrace = vi.fn();
    const props = { history, allHistory, selected: [1], externalSelectedNumbers: [45],
      externalSelectedLabel: "Drought-break shortlist", excludedNumbers: [8], onToggle, onTrendSelectToggle, onExcludeToggle, onTrace };
    const original = JSON.stringify(props);
    await render(props);
    for (const source of ["all", "window"] as const) {
      await changeSource(source);
      expect(row(1).getAttribute("aria-pressed")).toBe("true");
      expect(row(45).getAttribute("aria-pressed")).toBe("true");
      expect((row(45) as HTMLButtonElement).disabled).toBe(true);
      expect(row(8).getAttribute("data-user-excluded")).toBe("true");
      expect((row(8) as HTMLButtonElement).disabled).toBe(true);
    }
    for (const callback of [onToggle, onTrendSelectToggle, onExcludeToggle, onTrace]) expect(callback).not.toHaveBeenCalled();
    expect(JSON.stringify(props)).toBe(original);
    await act(async () => row(1).click());
    expect(onTrendSelectToggle).toHaveBeenCalledExactlyOnceWith(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("uses actual available denominators for one-, two- and six-draw windows", async () => {
    for (const count of [1, 2, 6]) {
      const short = allHistory.slice(0, count);
      await render({ history: short, allHistory, selected: [1] });
      const delta = row(1).querySelector(".windfall-number-trend-row__delta");
      expect(delta?.getAttribute("aria-label")).toContain(`available draws ${Math.min(count, 3)} and ${count}`);
      expect(delta?.getAttribute("aria-label")).toContain("3D 100.0 percent versus 13D 100.0 percent");
      expect(row(1).getAttribute("data-direction")).toBe("flat");
      expect(container.querySelector("svg circle title")?.textContent).toContain("Δ 0.0 pp (flat)");
    }
  });

  it("reorders source histories by date, counts supps, and excludes simulated or malformed rows", async () => {
    const source = [allHistory[19], allHistory[0], allHistory[18], allHistory[17],
      { ...allHistory[1], isSimulated: true }, { ...allHistory[2], supp: [1, 2] }];
    const original = JSON.stringify(source);
    await render({ history: source, allHistory: source });
    expect(container.querySelector(".windfall-number-trends__scope")?.textContent).toContain("4 real draws");
    expect(container.querySelector(".windfall-number-trends__scope")?.textContent).toContain("Ignored: 1 simulated, 1 malformed");
    expect(metric(9, "3D")).toBe("3");
    expect(metric(1, "3D")).toBe("0");
    expect(metric(1, "All")).toBe("1");
    expect(metric(15, "3D")).toBe("3");
    expect(JSON.stringify(source)).toBe(original);
  });

  it("does not substitute another source or legacy trend values for empty history", async () => {
    await render({ history, allHistory: [], trends: buildTrends(), selected: [1] });
    await changeSource("all");
    expect(container.textContent).toContain("All history · 0 real draws");
    expect(container.textContent).toContain("Historical counts and trend rates are unavailable");
    expect(container.querySelector('[data-testid="number-trend-row"]')).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    await changeSource("window");
    expect(container.querySelectorAll('[data-testid="number-trend-row"]').length).toBe(45);
    await render({ history: [], allHistory, trends: buildTrends() });
    expect(container.textContent).toContain("WFMQYH · 0 real draws");
    expect(container.querySelector('[data-testid="number-trend-row"]')).toBeNull();
  });

  it("refreshes new history in the active source and retains the local view choice", async () => {
    await render();
    await changeSource("all");
    const added: Draw = { date: "5/16/25", main: [1, 9, 10, 11, 12, 13], supp: [14, 15] };
    await render({ history: [added], allHistory: [...allHistory, added] });
    expect(container.querySelector(".windfall-number-trends__scope")?.textContent).toContain("All history · 21 real draws");
    expect(metric(1, "All")).toBe("18");
    await changeSource("window");
    expect(container.querySelector(".windfall-number-trends__scope")?.textContent).toContain("WFMQYH · 1 real draw");
    expect(metric(1, "All")).toBe("1");
  });

  it("provides click-accessible help and wires both real sources without changing generator trend state", async () => {
    await render();
    const help = container.querySelector<HTMLButtonElement>('button[aria-label="About Number Trends history sources"]')!;
    await act(async () => help.click());
    expect(help.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("including the opening partial month");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("Short counts may stay the same");
    await act(async () => help.click());
    const app = readProjectFile("src/App.tsx");
    const panel = app.slice(app.indexOf("<NumberTrendsTable"), app.indexOf("/>", app.indexOf("<NumberTrendsTable")));
    expect(panel).toContain("history={realFilteredHistory}");
    expect(panel).toContain("allHistory={realHistory}");
    expect(app).toContain("const numberTrends = useMemo(() => computeNumberTrends(realFilteredHistory), [realFilteredHistory]);");
    expect(readProjectFile("public/user-manual.html")).toContain("local to Number Trends");
  });

  it("keeps live membership fixed across local source changes and refreshes when shortlist props change", async () => {
    const onToggle = vi.fn(), onTrace = vi.fn();
    const props = { history, allHistory, strictDroughtNumbers: [1], empiricalDroughtNumbers: [9],
      selected: [2], excludedNumbers: [1], onToggle, onTrace };
    const flag = (n: number, family: string) => row(n).querySelector(`[data-drought-family="${family}"]`)?.textContent;
    await render(props);
    for (const source of ["all", "window"] as const) {
      await changeSource(source);
      expect(flag(1, "strict")).toBe("Strict Yes");
      expect(flag(9, "empirical")).toBe("Empirical Yes");
      expect(row(1).hasAttribute("disabled")).toBe(true);
      expect(row(2).getAttribute("aria-pressed")).toBe("true");
    }
    await render({ ...props, strictDroughtNumbers: [9], empiricalDroughtNumbers: [1] });
    expect(flag(1, "strict")).toBe("Strict No");
    expect(flag(9, "strict")).toBe("Strict Yes");
    expect(flag(1, "empirical")).toBe("Empirical Yes");
    expect(flag(9, "empirical")).toBe("Empirical No");
    expect(metric(9, "All")).toBe("3");
    expect(onToggle).not.toHaveBeenCalled();
    expect(onTrace).not.toHaveBeenCalled();
  });

  it("explains shortlist flags accessibly and uses raw live memberships in App", async () => {
    await render();
    const help = container.querySelector<HTMLButtonElement>('button[aria-label="About Number Trends drought flags"]')!;
    await act(async () => help.click());
    const explanation = document.querySelector('[role="tooltip"]')?.textContent;
    expect(explanation).toContain("current top-eight lists");
    expect(explanation).toContain("Switching this panel's History source does not recalculate");
    expect(explanation).toContain("excluded number can still be listed");
    await act(async () => help.click());
    const app = readProjectFile("src/App.tsx");
    const panel = app.slice(app.indexOf("<NumberTrendsTable"), app.indexOf("/>", app.indexOf("<NumberTrendsTable")));
    expect(panel).toContain("strictDroughtNumbers={realHistory.length ? strictDroughtQuotaShortlist.numbers : undefined}");
    expect(panel).toContain("empiricalDroughtNumbers={realFilteredHistory.length ? empiricalDroughtQuotaShortlist.numbers : undefined}");
    expect(panel).not.toContain("EligibleNumbers");
    expect(readProjectFile("public/user-manual.html")).toContain("Live drought shortlist flags");
  });
});
