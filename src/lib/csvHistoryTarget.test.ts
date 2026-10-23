import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { clearCsvHistoryTarget, loadCsvHistoryTarget, newerCachedHistoryThanCsv, parseCsvHistoryTarget, readCsvHistoryTarget, saveCsvHistoryTarget } from "./csvHistoryTarget";
import type { CsvFileHandle } from "./drawHistory";

const csv = "date,main1,main2,main3,main4,main5,main6,supp1,supp2\n10/19/26,30,23,28,42,3,10,22,39";
const handle = (permission = "granted") => ({ kind: "file", name: "history.csv", queryPermission: vi.fn().mockResolvedValue(permission),
  requestPermission: vi.fn().mockResolvedValue("granted"), getFile: vi.fn().mockResolvedValue({ name: "history.csv", text: async () => csv }), createWritable: vi.fn() });
afterEach(() => vi.unstubAllGlobals());

describe("remembered CSV target reads", () => {
  it("reads a granted target without asking for permission or writing", async () => {
    const file = handle();
    expect(await readCsvHistoryTarget(file as unknown as CsvFileHandle)).toMatchObject({ fileName: "history.csv", csvText: csv });
    expect(file.queryPermission).toHaveBeenCalledWith({ mode: "read" });
    expect(file.requestPermission).not.toHaveBeenCalled();
    expect(file.createWritable).not.toHaveBeenCalled();
  });
  it.each(["prompt", "denied"])("does not prompt or read automatically with %s permission", async permission => {
    const file = handle(permission);
    expect(await readCsvHistoryTarget(file as unknown as CsvFileHandle)).toBeNull();
    expect(file.requestPermission).not.toHaveBeenCalled();
    expect(file.getFile).not.toHaveBeenCalled();
  });
  it("requests read-only access only after an explicit reconnect and respects denial", async () => {
    const file = handle("prompt");
    file.requestPermission.mockResolvedValueOnce("denied");
    expect(await readCsvHistoryTarget(file as unknown as CsvFileHandle, true)).toBeNull();
    expect(file.requestPermission).toHaveBeenCalledWith({ mode: "read" });
    expect(file.getFile).not.toHaveBeenCalled();
    expect(await readCsvHistoryTarget(file as unknown as CsvFileHandle, true)).toMatchObject({ csvText: csv });
  });
  it("surfaces a moved/deleted file rather than inventing history", async () => {
    const file = handle(); file.getFile.mockRejectedValue(new DOMException("File moved", "NotFoundError"));
    await expect(readCsvHistoryTarget(file as unknown as CsvFileHandle)).rejects.toThrow("File moved");
  });
});

describe("CSV target validation", () => {
  it("loads the actual repository CSV chronologically without fabricating rows", () => {
    const content = readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8");
    const result = parseCsvHistoryTarget(content);
    expect(result.history.length).toBe(content.trim().split(/\r?\n/).length - 1);
    expect(result.history.every(draw => !draw.isSimulated && draw.main.length === 6 && draw.supp.length === 2)).toBe(true);
    expect(result.removedDuplicates).toBe(0);
  });
  it("rejects malformed, conflicting, off-schedule and empty files rather than loading a partial selection", () => {
    expect(() => parseCsvHistoryTarget("nothing useful")).toThrow("no valid");
    expect(() => parseCsvHistoryTarget(csv + "\n10/21/26,1,2,3,4,5,6,7,46")).toThrow("invalid draw rows");
    expect(() => parseCsvHistoryTarget(csv + "\n10/19/26,1,2,3,4,5,6,7,8")).toThrow("conflicting");
    expect(() => parseCsvHistoryTarget(csv.replace("10/19/26", "10/20/26"))).toThrow("off-schedule");
  });
  it("removes exact duplicate rows in memory and reports the count", () => {
    expect(parseCsvHistoryTarget(csv + "\n" + csv.split("\n")[1])).toMatchObject({ removedDuplicates: 1 });
  });
  it("keeps newer cache results but lets an equally recent CSV correction take precedence", () => {
    const file = parseCsvHistoryTarget(csv).history;
    expect(newerCachedHistoryThanCsv(file, [{date:"10/21/26",main:[1,2,3,4,5,6],supp:[7,8]}])).toBe(true);
    expect(newerCachedHistoryThanCsv(file, [{...file[0],main:[1,2,3,4,5,6],supp:[7,8]}])).toBe(false);
    expect(newerCachedHistoryThanCsv(file, [{date:"10/20/26",main:[1,2,3,4,5,6],supp:[7,8]}])).toBe(false);
  });
});

describe("CSV target persistence", () => {
  it("stores, restores and forgets the handle only after each IndexedDB transaction completes", async () => {
    let stored: unknown;
    const close = vi.fn();
    const database = { objectStoreNames: { contains: () => true }, close, transaction: vi.fn(() => {
      const transaction: Record<string, unknown> = {};
      const request = (result: unknown, commit?: () => void) => {
        const value = { result };
        queueMicrotask(() => { commit?.(); (transaction.oncomplete as (() => void) | undefined)?.(); });
        return value;
      };
      transaction.objectStore = () => ({ get: () => request(stored), put: (value: unknown) => request("csv-target", () => { stored = value; }), delete: () => request(undefined, () => { stored = undefined; }) });
      return transaction;
    }) };
    vi.stubGlobal("indexedDB", { open: () => {
      const request: Record<string, unknown> = { result: database };
      queueMicrotask(() => (request.onsuccess as (() => void))()); return request;
    } });
    const file = handle() as unknown as CsvFileHandle;
    await saveCsvHistoryTarget(file);
    expect((await loadCsvHistoryTarget())?.handle).toBe(file);
    await clearCsvHistoryTarget();
    expect(await loadCsvHistoryTarget()).toBeNull();
    expect(close).toHaveBeenCalledTimes(4);
  });
  it("rejects a transaction abort even if its request already succeeded", async () => {
    const close = vi.fn();
    vi.stubGlobal("indexedDB", { open: () => {
      const request: Record<string, unknown> = { result: { close, transaction: () => {
        const transaction: Record<string, unknown> = { error: new Error("Quota exceeded") };
        transaction.objectStore = () => ({ put: () => {
          const put: Record<string, unknown> = { result: "csv-target" };
          queueMicrotask(() => { (put.onsuccess as (() => void) | undefined)?.(); (transaction.onabort as (() => void))(); });
          return put;
        } }); return transaction;
      } } };
      queueMicrotask(() => (request.onsuccess as (() => void))()); return request;
    } });
    await expect(saveCsvHistoryTarget(handle() as unknown as CsvFileHandle)).rejects.toThrow("Quota exceeded");
    expect(close).toHaveBeenCalled();
  });
});
