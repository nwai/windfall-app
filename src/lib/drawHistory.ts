/* Utilities to read, parse, prepend, and write draw history CSV using the File System Access API.
   CSV schema (matches your file):
   - Header: date,main1,main2,main3,main4,main5,main6,supp1,supp2
   - Date format: M/D/YY (e.g., 10/27/25)
*/
export type DrawRow = {
  date: string;        // e.g., "10/27/25"
  mains: number[];     // length 6
  supps: number[];     // length 2
};

export type CsvParseResult = {
  rows: DrawRow[];
  header: string[]; // original header columns (first 9)
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
    header = normalizeHeader(tokens);
    startIdx = 1;
  }

  const rows: DrawRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(",").map(s => s.trim());
    if (cols.length < 9) continue; // skip malformed
    const date = cols[0];
    const nums = cols.slice(1, 9).map(n => Number(n));
    if (nums.some(n => !Number.isInteger(n))) continue;
    rows.push({
      date,
      mains: nums.slice(0, 6),
      supps: nums.slice(6, 8),
    });
  }
  return { rows, header };
}

function normalizeHeader(cols: string[]): string[] {
  // Preserve the first 9 columns of the detected header if present, else default
  if (cols.length >= 9) return cols.slice(0, 9).map(s => s.trim());
  return DEFAULT_HEADER.slice();
}

export function formatRow(row: DrawRow): string {
  const fields = [
    row.date,
    ...row.mains.map(n => String(n)),
    ...row.supps.map(n => String(n)),
  ];
  return fields.join(",");
}

export function toCsv(rows: DrawRow[], header: string[] = DEFAULT_HEADER): string {
  const head = header.length >= 9 ? header.slice(0,9) : DEFAULT_HEADER;
  const headerLine = head.join(",");
  const body = rows.map(formatRow).join("\n");
  return [headerLine, body].filter(Boolean).join("\n");
}

// Keep newest-first in the file: put the new row at the top after the header.
export function prependRowToCsv(existingCsv: string, newRow: DrawRow): string {
  const { rows, header } = parseCsv(existingCsv);
  const updated = [newRow, ...rows];
  return toCsv(updated, header);
}

// File System Access API helpers

export type CsvFileHandle = FileSystemFileHandle;

export async function pickCsvFile(existing?: CsvFileHandle): Promise<CsvFileHandle> {
  if (existing) return existing;
  if (!("showOpenFilePicker" in window)) {
    throw new Error("File System Access API not supported in this browser. Use Chrome/Edge, or use the download fallback.");
  }
  const [handle] = await (window as any).showOpenFilePicker({
    multiple: false,
    types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
    excludeAcceptAllOption: false,
  });
  return handle;
}

export async function readCsvFromHandle(handle: CsvFileHandle): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
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