import { parseCSVorJSON } from "../parseCSVorJSON";
import type { Draw } from "../types";
import type { CsvFileHandle } from "./drawHistory";
import { analyzeDrawHistoryRows, applyAutomaticHistoryCorrections, drawsFromRows, rowsFromDraws } from "./drawHistoryReview";
import { strictValidateDraws } from "./strictDrawValidation";
import { parseDrawDateToEpoch } from "./recentDraws";

const DATABASE = "windfall-draw-history";
const STORE = "preferences";
const TARGET_KEY = "csv-target";

export interface CsvHistoryTarget {
  handle: CsvFileHandle;
  fileName: string;
  csvText: string | null;
}

const withTargetStore = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  if (typeof indexedDB === "undefined") throw new Error("This browser cannot remember a CSV file target between visits.");
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error("CSV target storage could not be opened."));
    request.onblocked = () => { blocked = true; reject(new Error("CSV target storage is blocked by another tab.")); };
  });
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      transaction = database.transaction(STORE, mode);
      request = action(transaction.objectStore(STORE));
    } catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? request.error ?? new Error("CSV target could not be remembered."));
    };
  });
};

export async function loadCsvHistoryTarget(): Promise<CsvHistoryTarget | null> {
  const stored = await withTargetStore<unknown>("readonly", store => store.get(TARGET_KEY));
  const handle = stored as Partial<CsvFileHandle> | null;
  if (!handle || handle.kind !== "file" || typeof handle.name !== "string" || typeof handle.getFile !== "function") return null;
  return { handle: handle as CsvFileHandle, fileName: handle.name, csvText: null };
}

export const saveCsvHistoryTarget = (handle: CsvFileHandle): Promise<IDBValidKey> =>
  withTargetStore("readwrite", store => store.put(handle, TARGET_KEY));

export const clearCsvHistoryTarget = (): Promise<undefined> =>
  withTargetStore("readwrite", store => store.delete(TARGET_KEY));

export async function readCsvHistoryTarget(handle: CsvFileHandle, requestAccess = false): Promise<CsvHistoryTarget | null> {
  const permissions = handle as CsvFileHandle & {
    queryPermission?: (options: { mode: "read" }) => Promise<PermissionState>;
    requestPermission?: (options: { mode: "read" }) => Promise<PermissionState>;
  };
  let permission = permissions.queryPermission ? await permissions.queryPermission({ mode: "read" }) : "prompt";
  if (permission !== "granted" && requestAccess) {
    permission = permissions.requestPermission ? await permissions.requestPermission({ mode: "read" }) : "granted";
  }
  if (permission !== "granted") return null;
  const file = await handle.getFile();
  return { handle, fileName: file.name, csvText: await file.text() };
}

export function parseCsvHistoryTarget(content: string): { history: Draw[]; removedDuplicates: number } {
  const parsed = parseCSVorJSON(content).filter(draw => draw.date.trim() || draw.main.length || draw.supp.length);
  const valid = strictValidateDraws(parsed);
  if (!valid.length) throw new Error("The selected CSV has no valid six-main/two-supplementary draw rows.");
  if (valid.length !== parsed.length) throw new Error(`The selected CSV has ${parsed.length - valid.length} invalid draw rows. Use Import Draws and Smart History Review to inspect it.`);
  const rows = rowsFromDraws(valid);
  const review = analyzeDrawHistoryRows(rows);
  if (review.sameDateConflictIssues.length || review.scheduleIssues.length) {
    throw new Error("The selected CSV has conflicting results or invalid/off-schedule dates. Use Import Draws and Smart History Review to inspect it.");
  }
  return { history: drawsFromRows(applyAutomaticHistoryCorrections(rows, review)), removedDuplicates: review.autoDropIndices.length };
}

export function newerCachedHistoryThanCsv(csv: Draw[], cached: Draw[]): boolean {
  const review = analyzeDrawHistoryRows(rowsFromDraws(cached));
  if (review.sameDateConflictIssues.length || review.scheduleIssues.length) return false;
  const latest = (draws: Draw[]) => draws.reduce((time, draw) => Math.max(time, parseDrawDateToEpoch(draw.date)), 0);
  return latest(cached) > latest(csv);
}
