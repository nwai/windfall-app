import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCsvHistoryTarget } from "../src/hooks/useCsvHistoryTarget";
import { clearCsvHistoryTarget, loadCsvHistoryTarget, readCsvHistoryTarget, saveCsvHistoryTarget, type CsvHistoryTarget } from "../src/lib/csvHistoryTarget";
import { loadCsvFallbackDraws } from "../src/lib/fetchDraws";
import { loadCachedDrawHistory } from "../src/lib/historyPersistence";
import type { Draw } from "../src/types";

vi.mock("../src/lib/csvHistoryTarget", async original => ({ ...await original<typeof import("../src/lib/csvHistoryTarget")>(), loadCsvHistoryTarget: vi.fn(), readCsvHistoryTarget: vi.fn(), saveCsvHistoryTarget: vi.fn(), clearCsvHistoryTarget: vi.fn() }));
vi.mock("../src/lib/fetchDraws", () => ({ loadCsvFallbackDraws: vi.fn() }));
vi.mock("../src/lib/historyPersistence", () => ({ loadCachedDrawHistory: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const csv = "date,main1,main2,main3,main4,main5,main6,supp1,supp2\n10/19/26,30,23,28,42,3,10,22,39";
const target = { handle: {kind:"file",name:"chosen.csv"}, fileName:"chosen.csv", csvText:csv } as CsvHistoryTarget;
const bundled: Draw[] = [{date:"10/16/26",main:[1,7,24,45,14,30],supp:[4,40]}];
let controller: ReturnType<typeof useCsvHistoryTarget>;
let root: Root, container: HTMLDivElement;
let onLoad: ReturnType<typeof vi.fn>, onMissing: ReturnType<typeof vi.fn>, setTrace: ReturnType<typeof vi.fn>;
let historyRevision: { current: number };
function Harness() { controller = useCsvHistoryTarget({onLoad,onMissing,setTrace,historyRevision}); return React.createElement("p", null, controller.message); }
const render = () => act(async () => root.render(React.createElement(Harness)));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadCsvHistoryTarget).mockResolvedValue(null); vi.mocked(loadCsvFallbackDraws).mockReturnValue(bundled); vi.mocked(loadCachedDrawHistory).mockReturnValue(null);
  historyRevision = {current:0}; onLoad=vi.fn(() => {historyRevision.current++;}); onMissing=vi.fn(); setTrace=vi.fn();
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("CSV target startup and shared ownership", () => {
  it("preloads the remembered file before fallback, without writes or permission prompts", async () => {
    vi.mocked(loadCsvHistoryTarget).mockResolvedValue(target); vi.mocked(readCsvHistoryTarget).mockResolvedValue(target);
    await render();
    expect(readCsvHistoryTarget).toHaveBeenCalledWith(target.handle);
    expect(loadCsvFallbackDraws).not.toHaveBeenCalled();
    expect(onLoad.mock.calls[0][0][0]).toMatchObject({date:"10/19/26"});
    expect(container.textContent).toContain("Preloaded CSV target chosen.csv: 1 real draws");
    expect(saveCsvHistoryTarget).not.toHaveBeenCalled();
  });
  it("shows reconnect and explicitly loads fallback when permission expired, then reconnects only on demand", async () => {
    vi.mocked(loadCsvHistoryTarget).mockResolvedValue(target); vi.mocked(readCsvHistoryTarget).mockResolvedValueOnce(null).mockResolvedValue(target);
    await render();
    expect(controller.needsReconnect).toBe(true); expect(onLoad).toHaveBeenCalledWith(bundled);
    expect(container.textContent).toContain("needs file-access permission");
    expect(container.textContent).toContain("Loaded bundled CSV");
    await act(async () => controller.reload());
    expect(readCsvHistoryTarget).toHaveBeenLastCalledWith(target.handle, true);
    expect(controller.needsReconnect).toBe(false);
    expect(onLoad).toHaveBeenCalledTimes(2);
  });
  it("does not discard strictly newer cached results when the remembered file is older", async () => {
    vi.mocked(loadCsvHistoryTarget).mockResolvedValue(target); vi.mocked(readCsvHistoryTarget).mockResolvedValue(target);
    vi.mocked(loadCachedDrawHistory).mockReturnValue([{date:"10/21/26",mains:[1,2,3,4,5,6],supps:[7,8]}]);
    await render();
    expect(onLoad.mock.calls[0][0][0].date).toBe("10/21/26");
    expect(container.textContent).toContain("Using newer saved browser history");
    expect(controller.target?.handle).toBe(target.handle);
  });
  it("falls back clearly when the target is deleted or malformed", async () => {
    vi.mocked(loadCsvHistoryTarget).mockResolvedValue(target); vi.mocked(readCsvHistoryTarget).mockRejectedValue(new Error("File missing"));
    await render();
    expect(onLoad).toHaveBeenCalledWith(bundled); expect(container.textContent).toContain("File missing");
    vi.mocked(readCsvHistoryTarget).mockResolvedValue({...target,csvText:"not draw history"});
    onLoad.mockClear();
    await act(async () => controller.reload());
    expect(onLoad).not.toHaveBeenCalled(); expect(container.textContent).toContain("Loaded history was not changed");
  });
  it("does not invent demo draws when both target and default CSV are unavailable", async () => {
    vi.mocked(loadCsvFallbackDraws).mockReturnValue([]);
    await render();
    expect(onMissing).toHaveBeenCalledWith(expect.objectContaining({source:"none",history:[]}));
    expect(onLoad).not.toHaveBeenCalled();
  });
  it("ignores a delayed startup read if the user changes history while it is pending", async () => {
    let finish: (target: CsvHistoryTarget) => void = () => {};
    vi.mocked(loadCsvHistoryTarget).mockResolvedValue(target);
    vi.mocked(readCsvHistoryTarget).mockReturnValue(new Promise(resolve => {finish=resolve;}));
    await render(); historyRevision.current++;
    await act(async () => finish(target));
    expect(onLoad).not.toHaveBeenCalled(); expect(loadCsvFallbackDraws).not.toHaveBeenCalled();
    expect(container.textContent).toContain("preload skipped");
  });
  it("reports a remember failure without claiming that the target will persist", async () => {
    await render(); vi.mocked(saveCsvHistoryTarget).mockRejectedValue(new Error("Storage blocked"));
    await act(async () => controller.remember(target));
    expect(controller.target).toEqual(target); expect(container.textContent).toContain("this visit only");
    expect(onLoad).toHaveBeenCalledTimes(1);
    await act(async () => controller.forget());
    expect(clearCsvHistoryTarget).toHaveBeenCalled(); expect(controller.target).toBeNull();
    expect(container.textContent).toContain("file and currently loaded draw history were not changed");
  });
});
