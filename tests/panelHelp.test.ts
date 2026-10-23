import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CollapsibleSection from "../src/components/shared/CollapsibleSection";
import InlineCollapsibleCard from "../src/components/shared/InlineCollapsibleCard";
import { PanelHelp } from "../src/components/shared/PanelHelp";
import { PANEL_HELP, getPanelHelp } from "../src/lib/panelHelp";
import { PANEL_OWNERSHIP_MANIFEST } from "../src/lib/evidenceFamilyRegistry";
import { FAVORITE_PANEL_REGISTRY } from "../src/lib/panelFavorites";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => (element as HTMLElement).click());
};
beforeEach(() => {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.restoreAllMocks();
  for (const [key, descriptor] of [["showModal", originalShowModal], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
const render = (element: React.ReactNode) => act(async () => root.render(element));

describe("panel overviews and closed startup", () => {
  it("provides explicit help for every registered main panel, with no missing reliability disclosure", () => {
    for (const id of new Set([...PANEL_OWNERSHIP_MANIFEST.map(row => row.panelId), ...FAVORITE_PANEL_REGISTRY.map(row => row.id)])) {
      expect(PANEL_HELP[id], id).toBeDefined();
      for (const value of Object.values(PANEL_HELP[id])) expect(value.length, id).toBeGreaterThan(5);
    }
  });
  it("keeps app panel defaults closed, including controlled DGA and ranking cards", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).not.toMatch(/default(?:Open|Expanded)=\{true\}/);
    for (const state of ["engineRankingExpanded", "dgaHeatmapExpanded", "dgaSectionOpen", "dgaGridExpanded", "predictionJournalOpen"]) {
      expect(app).toMatch(new RegExp(`\\[${state}, [^\\]]+\\] = useState<boolean>\\(false\\)`));
    }
    const simulationNavigation = app.slice(app.indexOf("const scrollToDGA ="), app.indexOf("const scrollBackToOrigin ="));
    expect(simulationNavigation).toContain("setDgaSectionOpen(true)");
    expect(simulationNavigation).toContain("setDgaGridExpanded(true)");
  });
  it("links main-panel help to existing manual sections and discloses indirect generation effects", () => {
    const manual = readFileSync("public/user-manual.html", "utf8");
    for (const id of Object.keys(PANEL_HELP)) {
      expect(manual, id).toContain(`id="${getPanelHelp(id, id).manualAnchor}"`);
    }
    expect(getPanelHelp("window-stats", "Window Stats").interaction).toContain("enables that generation filter");
    expect(getPanelHelp("weighted-target-list", "Weighted Target List").interaction).toContain("Parameter Search");
  });
  it("ignores legacy saved-open flags and does not mount deferred analyses just to show help", async () => {
    localStorage.setItem("cs-test-panel", "true");
    localStorage.setItem("custom-open-state", "true");
    const analysis = vi.fn(() => React.createElement("p", null, "Expensive analysis"));
    const props = { title: "Test panel", storageKey: "custom-open-state", deferContentWhileCollapsed: true, children: React.createElement(analysis) };
    await render(React.createElement(CollapsibleSection, props));
    expect(container.querySelector("details")?.open).toBe(false);
    expect(analysis).not.toHaveBeenCalled();
    await click(container.querySelector('[aria-label="About Test panel"]'));
    expect(document.querySelector("dialog")?.open).toBe(true);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(analysis).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")?.textContent).toContain("Opening or closing a panel does not enable, disable or reset");
    await click([...document.querySelectorAll("dialog button")].find(button => button.textContent === "Close") ?? null);
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[aria-label="About Test panel"]'));
    await click(container.querySelector("summary"));
    // jsdom does not dispatch native details toggle synchronously.
    await act(async () => container.querySelector("details")!.dispatchEvent(new Event("toggle")));
    expect(container.querySelector("details")?.open).toBe(true);
    expect(analysis).toHaveBeenCalled();
    await render(null);
    await render(React.createElement(CollapsibleSection, props));
    expect(container.querySelector("details")?.open).toBe(false);
  });
  it("opens a controlled panel only through the explicit Open panel action", async () => {
    const onOpenChange = vi.fn();
    await render(React.createElement(CollapsibleSection, { title: "Monthly summary", panelId: "monthly-draws-summary", open: false, onOpenChange, children: "Contents" }));
    await click(container.querySelector('[aria-label="About Monthly summary"]'));
    expect(document.querySelector("dialog")?.textContent).toContain("Ideal Draw Match describes alignment");
    expect(onOpenChange).not.toHaveBeenCalled();
    await click([...document.querySelectorAll("dialog button")].find(button => button.textContent === "Open panel") ?? null);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(document.querySelector("dialog")).toBeNull();
  });
  it("gives inline cards a separate help button without nested buttons or accidental expansion", async () => {
    await render(React.createElement(InlineCollapsibleCard, { title: "Engine & Ranking", children: "Hidden controls" }));
    expect(container.querySelector("button button")).toBeNull();
    expect(container.querySelector(".windfall-inline-card__button")?.getAttribute("aria-expanded")).toBe("false");
    const helpButton = [...container.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === "About Engine & Ranking");
    expect([...container.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toContain("About Engine & Ranking");
    await click(helpButton ?? null);
    expect(document.querySelector("dialog")?.textContent).toContain("Generation weighting and ranking");
    expect(container.querySelector(".windfall-inline-card__button")?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => document.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(document.querySelector("dialog")).toBeNull();
  });
  it("keeps help interactions from triggering ancestor disclosure handlers", async () => {
    const parentClick = vi.fn();
    await render(React.createElement("div", { onClick: parentClick }, React.createElement(PanelHelp, {title:"DGA grid"})));
    await click(container.querySelector("button"));
    await click([...document.querySelectorAll("dialog button")].find(button => button.textContent === "Close") ?? null);
    expect(parentClick).not.toHaveBeenCalled();
  });
  it("cycles keyboard focus within the help dialog", async () => {
    await render(React.createElement(PanelHelp, { title: "DGA grid", onReveal: vi.fn() }));
    await click(container.querySelector("button"));
    const dialog = document.querySelector("dialog")!;
    const controls = dialog.querySelectorAll<HTMLElement>("button, a");
    controls[controls.length - 1].focus();
    await act(async () => controls[controls.length - 1].dispatchEvent(new KeyboardEvent("keydown", {key:"Tab",bubbles:true,cancelable:true})));
    expect(document.activeElement).toBe(controls[0]);
    await act(async () => controls[0].dispatchEvent(new KeyboardEvent("keydown", {key:"Tab",shiftKey:true,bubbles:true,cancelable:true})));
    expect(document.activeElement).toBe(controls[controls.length - 1]);
  });
  it("uses an explicit unknown-validation disclosure for future unregistered sections", () => {
    const help = getPanelHelp(undefined, "New experimental section", "Inspect experimental inputs");
    expect(help.purpose).toBe("Inspect experimental inputs");
    expect(help.reliability).toContain("No panel-specific reliability result");
    expect(help.interaction).toContain("Opening help changes no settings");
  });
});
