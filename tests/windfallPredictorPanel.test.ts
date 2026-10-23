import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { WindfallPredictorPanel, WindfallPredictorRecord } from "../src/components/WindfallPredictorPanel";
import { PredictionJournalPanel } from "../src/components/PredictionJournalPanel";
import { parseCSVorJSON } from "../src/parseCSVorJSON";
import { portfolioIsoDate, preparePortfolioHistory } from "../src/lib/evidencePortfolio";
import { buildWindfallPredictor, type BuildWindfallPredictorOptions, type WindfallPredictorSnapshot } from "../src/lib/windfallPredictor";
import { createWindfallPredictorEntry } from "../src/lib/windfallPredictorJournal";
import { loadPredictionJournalEntries, savePredictionJournalEntries } from "../src/lib/predictionJournal";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const recorded = preparePortfolioHistory(parseCSVorJSON(readFileSync("src/windfall_history_lottolyzer.csv", "utf8")) as Draw[]).draws;
const target = "2026-10-19", history = recorded.filter(draw => portfolioIsoDate(draw.date) < target);
const snapshot = buildWindfallPredictor({history,targetDate:target,seed:1,now:"2026-10-16T01:00:00Z"});
let root: Root, container: HTMLDivElement;
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(control => control.textContent === text)!;
const click = async (element: HTMLElement) => { expect(element).toBeTruthy(); await act(async () => element.click()); };
beforeEach(() => { localStorage.clear(); container=document.createElement("div"); document.body.append(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); });

class RealModelWorker {
  onmessage: ((event: {data: {snapshot?: WindfallPredictorSnapshot;error?:string}})=>void) | null = null;
  onerror: (()=>void) | null = null;
  postMessage(options: BuildWindfallPredictorOptions) {
    try { this.onmessage?.({data:{snapshot:buildWindfallPredictor(options)}}); }
    catch (error) { this.onmessage?.({data:{error:(error as Error).message}}); }
  }
  terminate() {}
}

describe("Windfall Predictor interface", () => {
  it("discloses entertainment, scope, actual constraints and neutral gates without fabricated rows", () => {
    const html = renderToStaticMarkup(React.createElement(WindfallPredictorPanel,{history:[],targetDate:target,forced:[],excluded:[],onSave:vi.fn(),onViewJournal:vi.fn()}));
    expect(html).toContain("for entertainment only"); expect(html).toContain("not a reliable forecast");
    expect(html).toContain("not applied"); expect(html).toContain("No Predictor entries saved yet");
    expect(html).not.toContain("Balanced evidence</th>"); expect(html).not.toContain("Div1");
    expect(html).toContain("Learning:");
  });
  it("builds the real model in a worker, saves the source-labelled batch once, and invalidates stale previews", async () => {
    vi.stubGlobal("Worker",RealModelWorker);
    const onSave = vi.fn((value:WindfallPredictorSnapshot,reviewed:boolean) => savePredictionJournalEntries([createWindfallPredictorEntry(value,reviewed)]));
    const props = {history,targetDate:target,forced:[],excluded:[],onSave,onViewJournal:vi.fn()};
    await act(async () => root.render(React.createElement(WindfallPredictorPanel,props)));
    await click(button("Create four games"));
    expect(container.querySelector('[aria-label^="Windfall Predictor receipt"]')).not.toBeNull();
    expect(container.textContent).toContain("four unplayed controls frozen");
    await click(button("Save to journal"));
    expect(loadPredictionJournalEntries()[0].windfallPredictor?.games).toHaveLength(4);
    expect(button("Saved to journal").disabled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    await click(button("Create four games"));
    await act(async () => root.render(React.createElement(WindfallPredictorPanel,{...props,forced:[45]})));
    expect(button("Save to journal").disabled).toBe(true);
    expect(container.textContent).toContain("forced/excluded numbers changed");
  });
  it("shows missing-result context and does not build across a gap", async () => {
    await act(async () => root.render(React.createElement(WindfallPredictorPanel,{history,targetDate:"2026-10-21",forced:[],excluded:[],onSave:vi.fn(),onViewJournal:vi.fn()})));
    expect(button("Create four games").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("2026-10-19");
  });
  it("does not describe an already-recorded target as missing history", async () => {
    await act(async () => root.render(React.createElement(WindfallPredictorPanel,{history:recorded,targetDate:target,forced:[],excluded:[],onSave:vi.fn(),onViewJournal:vi.fn()})));
    expect(button("Create four games").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("already loaded");
    expect(container.textContent).not.toContain("History needs updating");
  });
  it("keeps the preview on save failure and never reports success", async () => {
    vi.stubGlobal("Worker",RealModelWorker);
    await act(async () => root.render(React.createElement(WindfallPredictorPanel,{history,targetDate:target,forced:[],excluded:[],onSave:()=>{throw new Error("Storage full");},onViewJournal:vi.fn()})));
    await click(button("Create four games")); await click(button("Save to journal"));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Storage full");
    expect(button("Save to journal").disabled).toBe(false);
    expect(container.querySelector('[aria-label^="Windfall Predictor receipt"]')).not.toBeNull();
  });
  it("mounts stored receipt tables only when that receipt is opened", async () => {
    savePredictionJournalEntries([createWindfallPredictorEntry(snapshot,false,"2026-10-16T02:00:00Z")]);
    await act(async () => root.render(React.createElement(WindfallPredictorPanel,{history,targetDate:target,forced:[],excluded:[],onSave:vi.fn(),onViewJournal:vi.fn()})));
    expect(container.querySelector('[aria-label^="Windfall Predictor receipt"]')).toBeNull();
    const saved = [...container.querySelectorAll("details")].find(detail => detail.firstElementChild?.textContent?.startsWith("Saved Predictor games"))!;
    await act(async () => { saved.open = true; saved.dispatchEvent(new Event("toggle")); });
    const receipt = saved.querySelector("details")!;
    expect(receipt).not.toBeNull();
    expect(container.querySelector('[aria-label^="Windfall Predictor receipt"]')).toBeNull();
    await act(async () => { receipt.open = true; receipt.dispatchEvent(new Event("toggle")); });
    expect(container.querySelector('[aria-label^="Windfall Predictor receipt"]')).not.toBeNull();
    await act(async () => { receipt.open = false; receipt.dispatchEvent(new Event("toggle")); });
    expect(container.querySelector('[aria-label^="Windfall Predictor receipt"]')).toBeNull();
  });
  it("shows separate prize and overlap flags and simulates an isolated copy of the frozen row", async () => {
    const source = JSON.stringify(snapshot);
    const fixture: Draw = {date:target,main:snapshot.games[0].main,supp:snapshot.games[0].supp};
    const simulate = vi.fn(game => { game.main.reverse(); game.supp.push(99); });
    await act(async () => root.render(React.createElement(WindfallPredictorRecord,{snapshot,history:[...history,fixture],onSimulate:simulate})));
    expect(container.textContent).toContain("Hit · 8/8"); expect(container.textContent).toContain("Div1");
    expect(container.textContent).toContain("not part of a six-number ticket");
    await click(container.querySelector<HTMLButtonElement>('[aria-label="Simulate predictor game 1 in DGA"]')!);
    expect(simulate).toHaveBeenCalledTimes(1); expect(JSON.stringify(snapshot)).toBe(source);
  });
  it("displays the journal source badge and prize, and offers review-only changes for frozen games", async () => {
    const entry = createWindfallPredictorEntry(snapshot,false,"2026-10-16T02:00:00Z");
    await act(async () => root.render(React.createElement(PredictionJournalPanel,{history,initialEntries:[entry],now:()=>"2026-10-17T00:00:00Z"})));
    expect(container.querySelector('[data-testid="prediction-predictor-badge"]')?.textContent).toContain("Created by Predictor");
    await click(container.querySelector<HTMLButtonElement>('article > button[aria-expanded]')!);
    expect(container.querySelector('[data-testid="prediction-structured-provenance"]')).toBeNull();
    expect(container.querySelector('[aria-label^="Windfall Predictor receipt"]')).not.toBeNull();
    expect(button("Mark reviewed")).toBeTruthy(); expect(button("Edit prediction")).toBeUndefined();
    await click(button("Mark reviewed"));
    expect(loadPredictionJournalEntries()[0].windfallPredictor).toEqual(snapshot);
    expect(loadPredictionJournalEntries()[0].reviewStatus).toBe("reviewedByUser");
    const fixture: Draw = {date:target,main:snapshot.games[0].main,supp:snapshot.games[0].supp};
    await act(async () => root.render(React.createElement(PredictionJournalPanel,{history:[...history,fixture],initialEntries:[entry]})));
    expect(container.querySelector('[data-testid="prediction-entry-target-prize-pill"]')?.textContent).toContain("Div1");
  });
});
