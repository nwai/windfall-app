import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UserSelectedNumbersPanel } from "../src/components/UserSelectedNumbersPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("UserSelectedNumbersPanel", () => {
  const monthlyBucketSets = () => ({
    undrawn: new Set([4]),
    times1: new Set<number>(),
    times2: new Set([7]),
    times3: new Set<number>(),
    times4: new Set<number>(),
    times5: new Set<number>(),
    times6: new Set<number>(),
    times7: new Set<number>(),
    times8: new Set([12]),
  });

  it("shows externally forced drought-break numbers as locked without counting them as user selections", () => {
    const html = renderToStaticMarkup(
      React.createElement(UserSelectedNumbersPanel, {
        userSelectedNumbers: [4],
        setUserSelectedNumbers: vi.fn(),
        externalSelectedNumbers: [7],
        externalSelectedLabel: "Drought-break shortlist",
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const userSelectedButton = document.querySelector("button[aria-label='Remove user selected number 4']");
    const droughtLockedButton = document.querySelector("button[aria-label='Number 7 is forced by Drought-break shortlist']");

    expect(document.body.textContent).toContain("Selected set: 4");
    expect(document.body.textContent).toContain("Locked by Drought-break shortlist: 7");
    expect(document.body.textContent).toContain("Selected1");
    expect(userSelectedButton?.getAttribute("aria-pressed")).toBe("true");
    expect(userSelectedButton?.getAttribute("disabled")).toBeNull();
    expect(droughtLockedButton?.getAttribute("aria-pressed")).toBe("true");
    expect(droughtLockedButton?.getAttribute("disabled")).not.toBeNull();
  });

  it("disables user-excluded numbers and explains why they cannot be selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(UserSelectedNumbersPanel, {
        userSelectedNumbers: [4],
        setUserSelectedNumbers: vi.fn(),
        excludedNumbers: [7, 12],
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const excludedButton = document.querySelector("button[aria-label='Number 7 is unavailable because it is excluded']");

    expect(document.body.textContent).toContain("Active exclusions: 7, 12");
    expect(document.body.textContent).toContain("Selected set: 4");
    expect(excludedButton?.getAttribute("aria-pressed")).toBe("false");
    expect(excludedButton?.getAttribute("disabled")).not.toBeNull();
    expect(excludedButton?.getAttribute("title")).toContain("Clear the active exclusion");
  });

  it("colors user selected number buttons by monthly bucket context", () => {
    const html = renderToStaticMarkup(
      React.createElement(UserSelectedNumbersPanel, {
        userSelectedNumbers: [4],
        setUserSelectedNumbers: vi.fn(),
        monthlyBuckets: monthlyBucketSets(),
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const selectedUndrawn = document.querySelector("button[aria-label='Remove user selected number 4']");
    const unselectedTimes2 = document.querySelector("button[aria-label='Add user selected number 7']");

    expect(selectedUndrawn?.getAttribute("style")).toContain("background:#64748b");
    expect(selectedUndrawn?.getAttribute("title")).toContain("Monthly bucket: Undrawn");
    expect(unselectedTimes2?.getAttribute("style")).toContain("background:#f0fdf4");
    expect(unselectedTimes2?.getAttribute("title")).toContain("Monthly bucket: 2x");
  });

  it("can select every currently available number without selecting active exclusions", async () => {
    window.localStorage.clear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const setUserSelectedNumbers = vi.fn();

    await act(async () => {
      root.render(React.createElement(UserSelectedNumbersPanel, {
        userSelectedNumbers: [1, 2],
        setUserSelectedNumbers,
        excludedNumbers: [7, 12],
      }));
    });

    const selectAllButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Select All") as HTMLButtonElement;

    await act(async () => {
      selectAllButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const selected = setUserSelectedNumbers.mock.calls.at(-1)?.[0];
    expect(selected).toHaveLength(43);
    expect(selected).not.toContain(7);
    expect(selected).not.toContain(12);
    expect(selected.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
