import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import OfficialDrawCheckCard from "../src/components/OfficialDrawCheckCard";
import { useOfficialDrawCheck } from "../src/hooks/useOfficialDrawCheck";
import type { DrawRow } from "../src/lib/drawHistory";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const row: DrawRow = { date: "2026-10-12", mains: [12,10,1,14,39,37], supps: [35,45] };
const response = () => ({ ok: true, json: async () => ({ Success: true, DrawResults: [{ ProductId: "MondayWednesdayFridayLotto",
  DrawDate: "2026-10-12T00:00:00", PrimaryNumbers: row.mains, SecondaryNumbers: row.supps }] }) });
function Harness({ input }: { input: DrawRow }) {
  const check = useOfficialDrawCheck(input);
  return React.createElement(React.Fragment, null, React.createElement(OfficialDrawCheckCard, { check }),
    React.createElement("button", { disabled: !check.allowSave }, "Save"));
}
afterEach(() => vi.unstubAllGlobals());
describe("official check save guard", () => {
  it("invalidates verification after editing, blocks mismatches and ignores late responses", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch",fetcher);
    const render = (input: DrawRow) => act(async()=>root.render(React.createElement(Harness,{input})));
    const save = () => Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Save")!;
    const check = () => Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Check against The Lott")!;
    try {
      await render(row); expect(save().disabled).toBe(true);
      await act(async()=>check().click()); expect(save().disabled).toBe(false);
      await render({...row,supps:[36,45]}); expect(save().disabled).toBe(true);
      await act(async()=>check().click()); expect(container.textContent).toContain("Does not match"); expect(save().disabled).toBe(true);
      await render(row); expect(save().disabled).toBe(true);
      let finish!: (value: ReturnType<typeof response>) => void;
      fetcher.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
      await act(async()=>check().click());
      await render({...row,supps:[36,45]});
      await act(async()=>finish(response()));
      expect(container.textContent).toContain("Not checked"); expect(save().disabled).toBe(true);
      await render(row); expect(check().disabled).toBe(false); expect(save().disabled).toBe(true);
    } finally { await act(async()=>root.unmount()); }
  });
  it("requires a separate manual check acknowledgement when the official feed is unavailable", async () => {
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("Offline")));
    const container = document.createElement("div"), root=createRoot(container);
    try {
      await act(async()=>root.render(React.createElement(Harness,{input:row})));
      await act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Check against The Lott")!.click());
      const save=Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Save")!;
      expect(save.disabled).toBe(true); expect(container.textContent).toContain("No CSV, simulated or cached fallback");
      await act(async()=>container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      expect(save.disabled).toBe(false); expect(container.textContent).toContain("Save without automated verification");
    } finally { await act(async()=>root.unmount()); }
  });
});
