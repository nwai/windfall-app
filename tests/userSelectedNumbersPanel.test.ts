import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UserSelectedNumbersPanel } from "../src/components/UserSelectedNumbersPanel";

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
    const excludedButton = document.querySelector("button[aria-label='Number 7 is excluded by User Exclusions']");

    expect(document.body.textContent).toContain("User exclusions active: 7, 12");
    expect(document.body.textContent).toContain("Selected set: 4");
    expect(excludedButton?.getAttribute("aria-pressed")).toBe("false");
    expect(excludedButton?.getAttribute("disabled")).not.toBeNull();
    expect(excludedButton?.getAttribute("title")).toContain("Clear it in WFMQYH User Exclusions");
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
});
