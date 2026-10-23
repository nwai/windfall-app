import { describe, expect, it, vi, afterEach } from "vitest";
import { checkOfficialDrawResult, compareOfficialDrawResult, OFFICIAL_RESULTS_URL } from "./officialDrawResults";
const input = { date: "2026-10-12", mains: [12,10,1,14,39,37], supps: [35,45] };
// Test fixture copied from the public official response; not a generated historical observation.
const payload = { Success: true, DrawResults: [{ ProductId: "MondayWednesdayFridayLotto", DrawDate: "2026-10-12T00:00:00", DrawNumber: 4767,
  PrimaryNumbers: input.mains, SecondaryNumbers: input.supps }] };
afterEach(() => vi.unstubAllGlobals());
describe("official result checking", () => {
  it("checks the date and main/supp roles separately, ignoring order within a role", () => {
    expect(compareOfficialDrawResult({ ...input, mains: [...input.mains].reverse(), supps: [45,35] }, payload).status).toBe("matched");
    expect(compareOfficialDrawResult({ ...input, supps: [36,45] }, payload).status).toBe("mismatch");
    expect(compareOfficialDrawResult({ ...input, mains: [12,10,1,14,39,35], supps: [37,45] }, payload).status).toBe("mismatch");
    expect(compareOfficialDrawResult({ ...input, date: "2026-10-14" }, payload).status).toBe("unavailable");
  });
  it("refuses unsuccessful, malformed, simulated, wrong-product and ambiguous responses", () => {
    for (const data of [null, { ...payload, Success: false }, { ...payload, DrawResults: [...payload.DrawResults, ...payload.DrawResults] },
      { ...payload, DrawResults: [{ ...payload.DrawResults[0], ProductId: "TattsLotto" }] },
      { ...payload, DrawResults: [{ ...payload.DrawResults[0], PrimaryNumbers: [12,12,1,14,39,37] }] }]) {
      expect(compareOfficialDrawResult(input, data).status).toBe("unavailable");
    }
    expect(compareOfficialDrawResult({ ...input, isSimulated: true }, payload).status).toBe("unavailable");
  });
  it("uses the official endpoint with no credentials and never substitutes a fallback", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => payload }); vi.stubGlobal("fetch", fetcher);
    expect((await checkOfficialDrawResult(input)).status).toBe("matched");
    expect(fetcher).toHaveBeenCalledWith(OFFICIAL_RESULTS_URL, expect.objectContaining({ method: "POST", credentials: "omit",
      body: JSON.stringify({ CompanyId: "Tattersalls", MaxDrawCountPerProduct: 50, OptionalProductFilter: ["MondayWednesdayFridayLotto"] }) }));
    fetcher.mockRejectedValue(new Error("Offline"));
    const offline = await checkOfficialDrawResult(input);
    expect(offline.status).toBe("unavailable"); expect(offline.message).toContain("No CSV, simulated or cached fallback");
  });
});
