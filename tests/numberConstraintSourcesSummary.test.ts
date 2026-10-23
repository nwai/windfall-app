import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NumberConstraintSourcesSummary, type NumberConstraintSourcesSummaryProps } from "../src/components/shared/NumberConstraintSourcesSummary";
import type { NumberConstraintSource } from "../src/lib/numberConstraintSources";

const source = (id: string, numbers: number[], extra: Partial<NumberConstraintSource> = {}): NumberConstraintSource => ({
  id, label: id, numbers, clearImpact: `Clear ${id} at its owner`, onClear: vi.fn(), ...extra,
});

describe("forced number source controls", () => {
  let container: HTMLDivElement, root: Root, previousAct: unknown;
  let showDescriptor: PropertyDescriptor | undefined, closeDescriptor: PropertyDescriptor | undefined;
  beforeEach(() => {
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    previousAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    showDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
    closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    if (showDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showDescriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  const render = async (props: NumberConstraintSourcesSummaryProps) => {
    await act(async () => root.render(React.createElement(NumberConstraintSourcesSummary, props)));
  };
  const click = async (text: string, element: ParentNode = container) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === text)!;
    expect(button, text).toBeTruthy();
    await act(async () => button.click());
  };
  const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]")!;

  it("lists source ownership, deduplicates counts and discloses generator-only scope", async () => {
    await render({ defaultExpanded: true,
      inclusionSources: [source("Trends", [1, 3]), source("Drought", [3])],
      exclusionSources: [source("Manual", [8]), source("MiAN", [8, 10], { scope: "generation-only" })] });
    expect(container.querySelectorAll("legend")[0].textContent).toBe("Forced inclusions · 2");
    expect(container.querySelectorAll("legend")[1].textContent).toBe("Forced exclusions · 2");
    expect(container.textContent).toContain("Trends"); expect(container.textContent).toContain("Drought");
    expect(container.textContent).toContain("Shared list: 1; additional generation-only numbers: 1.");
    expect(container.textContent).toContain("Generation-only");
  });

  it("requires confirmation, supports cancellation, and clears every inclusion owner without touching exclusions", async () => {
    const included = [source("Trends", [1, 3]), source("Drought", [3]), source("DGA mirror", [], { enabled: true, clearImpact: "Turn off DGA mirror" })];
    const excluded = source("SDE1", [8]); const onCleared = vi.fn();
    await render({ inclusionSources: included, exclusionSources: [excluded], onCleared });
    await click("Clear all inclusions");
    expect(dialog().textContent).toContain("Clear all forced inclusions?");
    expect(dialog().textContent).toContain("Turn off DGA mirror");
    included.forEach(row => expect(row.onClear).not.toHaveBeenCalled());
    await click("Cancel", dialog());
    expect(dialog()).toBeNull(); expect(onCleared).not.toHaveBeenCalled();
    await click("Clear all inclusions"); await click("Clear all inclusions", dialog());
    included.forEach(row => expect(row.onClear).toHaveBeenCalledOnce());
    expect(excluded.onClear).not.toHaveBeenCalled();
    expect(onCleared.mock.calls[0][0]).toBe("inclusions");
    expect(onCleared.mock.calls[0][1]).toHaveLength(3);
  });

  it("resets enabled exclusion rules with empty lists and preserves their explicit side-effect notice", async () => {
    const row = source("HC3", [], { enabled: true, clearImpact: "Turn off HC3" });
    await render({ inclusionSources: [], exclusionSources: [row] });
    await click("Clear all exclusions");
    expect(dialog().textContent).toContain("Turn off HC3");
    expect(dialog().textContent).toContain("Previously removed selections are not restored");
    await click("Clear all exclusions", dialog());
    expect(row.onClear).toHaveBeenCalledOnce();
  });

  it("keeps per-number removal and single-source clearing available without releasing another owner", async () => {
    const remove = vi.fn(), other = source("Drought", [3]);
    const one = source("Trends", [3], { onRemoveNumber: remove });
    await render({ inclusionSources: [one, other], exclusionSources: [], defaultExpanded: true });
    await click("Remove 3"); expect(remove).toHaveBeenCalledExactlyOnceWith(3);
    const clear = container.querySelector<HTMLButtonElement>('[aria-label="Clear inclusions from Trends"]')!;
    await act(async () => clear.click());
    expect(dialog().textContent).toContain("Clear Trends?");
    await click("Clear source", dialog());
    expect(one.onClear).toHaveBeenCalledOnce(); expect(other.onClear).not.toHaveBeenCalled();
  });

  it("blocks clearing while generation is busy, including an already open confirmation", async () => {
    const included = source("Trends", [1]);
    const props = { inclusionSources: [included], exclusionSources: [] };
    await render(props); await click("Clear all inclusions"); await render({ ...props, busy: true });
    const confirm = Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Clear all inclusions")!;
    expect(confirm.disabled).toBe(true);
    await act(async () => confirm.click()); expect(included.onClear).not.toHaveBeenCalled();
    await click("Cancel", dialog());
    expect(container.textContent).toContain("unavailable while generation is running");
  });

  it("mirrors global ownership changes into two summaries while ordinary selections remain separate", async () => {
    function Harness() {
      const [forced, setForced] = React.useState([3]);
      const sources = [source("Trends", forced, { onClear: () => setForced([]) })];
      return React.createElement(React.Fragment, null,
        React.createElement("p", null, "Ordinary selection: 4"),
        ...[1, 2].map(id => React.createElement(NumberConstraintSourcesSummary, { key: id, inclusionSources: sources, exclusionSources: [source("Manual", [8])] })));
    }
    await act(async () => root.render(React.createElement(Harness)));
    await click("Clear all inclusions"); await click("Clear all inclusions", dialog());
    expect(Array.from(container.querySelectorAll("legend")).filter(legend => legend.textContent === "Forced inclusions · 0")).toHaveLength(2);
    expect(container.textContent).toContain("Ordinary selection: 4");
  });

  it("wires all source owners and source summaries without clearing ordinary user selections or recorded data", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const owners = app.slice(app.indexOf("const forcedInclusionSources = useMemo"), app.indexOf("const previousNeighbourConstraintNumberSet"));
    for (const name of ["TrendSelectedNumbers", "PreviousNeighbourConstraintNumbers", "HotColdForcedNumbers", "DroughtBreakSelectedNumbers", "PasteWeightedForcedNumbers", "SignalConfluenceForcedNumbers"]) {
      expect(owners).toContain(`clear: () => set${name}([])`);
    }
    const reset = app.slice(app.indexOf("const inclusionResetSources"), app.indexOf("function buildLatestNeighbourStageMatchCompatibilityLine"));
    for (const text of ["setMirrorDgaStripToPreviousNeighbour(false)", "setExcludedNumbers([])", "setHotColdExcludedNumbers([])", "setAutoExcludeUnselected(false)", "enableSDE1: false", "enableHC3: false", "setAcceptanceNeedsHardExclude(false)", "row.setEnabled(false)", 'scope: "generation-only"']) expect(reset).toContain(text);
    for (const text of ["setUserSelectedNumbers(", "setHistory(", "setCandidates(", "setSelectedRatios(", "setAcceptanceNeedsCounts("]) expect(reset).not.toContain(text);
    expect(app.match(/numberConstraintSummary=\{renderNumberConstraintSummary\(\)\}/g)).toHaveLength(2);
    expect(app).toContain("{renderNumberConstraintSummary(true)}");
    expect(readFileSync("public/user-manual.html", "utf8")).toContain('id="forced-number-sources"');
  });
});
