import { drawScheduleDateError } from "./historyScheduleAudit";
import { datePartsToIso, parseDrawDateParts } from "./planningDrawContext";

/* Utilities to read, parse, prepend, and write draw history CSV using the File System Access API.
   CSV schema (matches your file):
   - Header: date,main1,main2,main3,main4,main5,main6,supp1,supp2
   - Date format: M/D/YY (e.g., 10/27/25), newest rows first
*/
export type DrawRow = {
  date: string;
  mains: number[];
  supps: number[];
  isSimulated?: boolean;
};

export type CsvParseResult = {
  rows: DrawRow[];
  header: string[];
};

const DEFAULT_HEADER = ["date","main1","main2","main3","main4","main5","main6","supp1","supp2"];

export function parseCsv(content: string): CsvParseResult {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], header: DEFAULT_HEADER.slice() };
  const first = lines[0].trim();
  const tokens = first.split(",").map(s => s.trim());
  const looksLikeHeader = tokens[0].toLowerCase() === "date" || tokens.some(t => isNaN(Number(t)));
  let startIdx = 0;
  let header = DEFAULT_HEADER.slice();
  if (looksLikeHeader) {
    header = tokens.slice(0, 9);
    startIdx = 1;
  }
  const rows: DrawRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(",").map(s => s.trim());
    if (cols.length < 9) continue;
    const date = cols[0];
    const nums = cols.slice(1, 9).map(n => Number(n));
    if (nums.some(n => !Number.isInteger(n))) continue;
    rows.push({ date, mains: nums.slice(0, 6), supps: nums.slice(6, 8) });
  }
  return { rows, header };
}

export function formatRow(row: DrawRow): string {
  return [row.date, ...row.mains, ...row.supps].join(",");
}

export function toCsv(rows: DrawRow[], header: string[] = DEFAULT_HEADER): string {
  const dates = new Set<string>();
  for (const row of rows) {
    if (row.isSimulated) continue;
    const error = drawScheduleDateError(row.date);
    if (error) throw new Error(`CSV not saved. ${error} Use Smart History Review to correct this row.`);
    const key = datePartsToIso(parseDrawDateParts(row.date)!);
    if (dates.has(key)) throw new Error(`CSV not saved. More than one result uses ${key}. Resolve the duplicate date in Smart History Review.`);
    dates.add(key);
  }
  const head = header.length >= 9 ? header.slice(0, 9) : DEFAULT_HEADER;
  return [head.join(","), ...rows.map(formatRow)].join("\n");
}

// Prepend so newest is first after header
export function prependRowToCsv(existingCsv: string, newRow: DrawRow): string {
  const { rows, header } = parseCsv(existingCsv);
  return toCsv([newRow, ...rows], header);
}

// File System Access API helpers
export type CsvFileHandle = FileSystemFileHandle;

export async function pickCsvFile(existing?: CsvFileHandle): Promise<CsvFileHandle> {
  if (existing) return existing;
  if (!("showOpenFilePicker" in window)) {
    throw new Error("File System Access API not supported in this browser.");
  }
  const [handle] = await (window as any).showOpenFilePicker({
    multiple: false,
    types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
    excludeAcceptAllOption: false,
  });
  return handle;
}

export function isFilePickerCancelError(caught: unknown): boolean {
  if (!caught || typeof caught !== "object") {
    return false;
  }
  const value = caught as { name?: unknown; message?: unknown };
  const name = typeof value.name === "string" ? value.name : "";
  const message = typeof value.message === "string" ? value.message : "";
  return name === "AbortError" || /aborted|cancelled|canceled/i.test(message);
}

export async function readCsvFromHandle(handle: CsvFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

export async function writeCsvToHandle(handle: CsvFileHandle, content: string): Promise<void> {
  const perm = await (handle as any).requestPermission?.({ mode: "readwrite" });
  if (perm && perm !== "granted") throw new Error("Write permission denied.");
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export function downloadCsvFallback(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Optional global event
export function broadcastDrawHistoryUpdated(detail: { rows: DrawRow[], added: DrawRow }) {
  window.dispatchEvent(new CustomEvent("draw-history-updated", { detail }));
}
