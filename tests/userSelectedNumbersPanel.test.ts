import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UserSelectedNumbersPanel } from "../src/components/UserSelectedNumbersPanel";

describe("UserSelectedNumbersPanel", () => {
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
});
