import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "../src/components/shared/CollapsibleSection";
import { InlineCollapsibleCard } from "../src/components/shared/InlineCollapsibleCard";

describe("hybrid visual system shell", () => {
  it("renders collapsible sections with Windfall section classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        CollapsibleSection,
        { title: "Generated Candidates", summaryHint: "Dense table", defaultOpen: true },
        React.createElement("div", null, "Body"),
      ),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const details = document.querySelector("details");
    const summary = document.querySelector("summary");
    const title = document.querySelector(".windfall-section__title");
    const hint = document.querySelector(".windfall-section__hint");
    const disclosure = document.querySelector(".windfall-section__disclosure-button");
    const disclosureIcon = document.querySelector(".windfall-section__disclosure-icon");

    expect(details?.classList.contains("windfall-section")).toBe(true);
    expect(details?.hasAttribute("open")).toBe(true);
    expect(summary?.classList.contains("windfall-section__summary")).toBe(true);
    expect(disclosure).not.toBeNull();
    expect(disclosureIcon?.textContent).toBe("▾");
    expect(title).not.toBeNull();
    expect(hint).not.toBeNull();
    expect(html).toContain("Generated Candidates");
    expect(html).toContain("Dense table");
  });

  it("renders inline collapsible cards with Windfall card classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        InlineCollapsibleCard,
        { title: "DGA grid", subtitle: "Heatmap and simulation", defaultExpanded: true },
        React.createElement("div", null, "Grid body"),
      ),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const card = document.body.firstElementChild;
    const button = document.querySelector("button");
    const title = document.querySelector(".windfall-inline-card__title");
    const subtitle = document.querySelector(".windfall-inline-card__subtitle");
    const heading = document.querySelector(".windfall-inline-card__heading");
    const body = document.querySelector(".windfall-inline-card__body");

    expect(card?.classList.contains("windfall-inline-card")).toBe(true);
    expect(button?.classList.contains("windfall-inline-card__button")).toBe(true);
    expect(title).not.toBeNull();
    expect(subtitle).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(body).not.toBeNull();
    expect(document.querySelector("[style]")).toBeNull();
    expect(html).toContain("DGA grid");
    expect(html).toContain("Heatmap and simulation");
  });
});
