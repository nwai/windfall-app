import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import DrawHistoryManager from "../src/components/DrawHistoryManager";
import { pickCsvFile, writeCsvToHandle } from "../src/lib/drawHistory";
vi.mock("../src/lib/drawHistory", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/drawHistory")>(),
  pickCsvFile: vi.fn(), writeCsvToHandle: vi.fn(), broadcastDrawHistoryUpdated: vi.fn(), downloadCsvFallback: vi.fn(),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe("discoverable, transactional history corrections",()=>{
  it("shows a restored shared target and opens a fresh picker when changing it", async () => {
    vi.stubGlobal("showOpenFilePicker",vi.fn());
    const existing = {name:"previous.csv",getFile:async()=>({name:"previous.csv",text:async()=>""})};
    const changed = {name:"chosen.csv",getFile:async()=>({name:"chosen.csv",text:async()=>"date,main1,main2,main3,main4,main5,main6,supp1,supp2"})};
    vi.mocked(pickCsvFile).mockResolvedValueOnce(changed as never);
    const selected=vi.fn().mockResolvedValue(undefined), container=document.createElement("div"),root=createRoot(container);
    try {
      await act(async()=>root.render(React.createElement(DrawHistoryManager,{csvTarget:{handle:existing as never,fileName:"previous.csv",csvText:""},onCsvTargetSelected:selected})));
      expect(container.textContent).toContain("CSV target: previous.csv");
      await act(async()=>Array.from(container.querySelectorAll("button")).find(button=>button.textContent==="Change CSV target")!.click());
      expect(pickCsvFile).toHaveBeenCalledWith();
      expect(selected).toHaveBeenCalledWith(expect.objectContaining({handle:changed,fileName:"chosen.csv"}));
    } finally {await act(async()=>root.unmount());}
  });

  it("prefills a valid but wrong row, checks roles, replaces only after persistence, and cancels without committing",async()=>{
    const previous={date:"10/12/26",mains:[12,10,1,14,39,37],supps:[36,45]}, older={date:"10/9/26",mains:[28,33,36,15,40,18],supps:[44,4]};
    vi.stubGlobal("showOpenFilePicker",vi.fn());
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({Success:true,DrawResults:[{ProductId:"MondayWednesdayFridayLotto",
      DrawDate:"2026-10-12T00:00:00",PrimaryNumbers:previous.mains,SecondaryNumbers:[35,45]}]})}));
    const onDrawsUpdated=vi.fn(),container=document.createElement("div"),root=createRoot(container);
    const button=(text:string)=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent===text)!;
    try {
      await act(async()=>root.render(React.createElement(DrawHistoryManager,{currentRows:[previous,older],onDrawsUpdated})));
      await act(async()=>button("Edit latest draw").click());
      expect(container.querySelector<HTMLInputElement>('input[aria-label="Supplementary number 1"]')!.value).toBe("36");
      expect(button("Save correction").disabled).toBe(true);
      await act(async()=>button("Check against The Lott").click());
      expect(container.textContent).toContain("Does not match"); expect(button("Save correction").disabled).toBe(true);
      await act(async()=>button("Use official numbers").click());
      expect(container.querySelector<HTMLInputElement>('input[aria-label="Supplementary number 1"]')!.value).toBe("35");
      expect(button("Save correction").disabled).toBe(true);
      await act(async()=>button("Check against The Lott").click());
      vi.mocked(pickCsvFile).mockRejectedValueOnce(new DOMException("Cancelled","AbortError"));
      await act(async()=>button("Save correction").click());
      expect(onDrawsUpdated).not.toHaveBeenCalled(); expect(writeCsvToHandle).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Save cancelled. Draw history was not changed");
      vi.mocked(pickCsvFile).mockResolvedValue({getFile:async()=>({name:"test.csv",text:async()=>""})} as never);
      vi.mocked(writeCsvToHandle).mockResolvedValue();
      await act(async()=>button("Save correction").click());
      expect(onDrawsUpdated).toHaveBeenCalledOnce();
      expect(onDrawsUpdated.mock.calls[0][0]).toEqual([{...previous,supps:[35,45]},older]);
      expect(previous.supps).toEqual([36,45]);
    } finally {await act(async()=>root.unmount());}
  });
});
