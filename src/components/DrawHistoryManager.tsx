import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  prependRowToCsv,
  broadcastDrawHistoryUpdated,
  parseCsv,
  pickCsvFile,
  readCsvFromHandle,
  writeCsvToHandle,
  downloadCsvFallback,
  type CsvFileHandle,
  type DrawRow,
} from "../lib/drawHistory";

type Props = {
  onDrawsUpdated?: (rows: DrawRow[]) => void;
  mainCount?: number;
  suppCount?: number;
  minNumber?: number;
  maxNumber?: number;
  csvPathHint?: string;
};

function isoToMDYY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const yy = String(y % 100).padStart(2, "0");
  const mm = String(Number(m[2]));
  const dd = String(Number(m[3]));
  return `${mm}/${dd}/${yy}`;
}

export default function DrawHistoryManager({
  onDrawsUpdated,
  mainCount = 6,
  suppCount = 2,
  minNumber = 1,
  maxNumber = 45,
  csvPathHint,
}: Props) {
  const [fileHandle, setFileHandle] = useState<CsvFileHandle | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [mains, setMains] = useState<string[]>(Array(mainCount).fill(""));
  const [supps, setSupps] = useState<string[]>(Array(suppCount).fill(""));

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const busyRef = useRef(false);

  const pickFile = useCallback(async () => {
    try {
      const handle = await pickCsvFile(fileHandle ?? undefined);
      setFileHandle(handle);
      const name = (await handle.getFile()).name;
      setLastFileName(name);
      setStatus(`Selected file: ${name}`);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [fileHandle]);

  const openEntry = useCallback(() => {
    setIsEntryOpen(true);
    setStatus(null);
    setError(null);
  }, []);

  const resetEntry = useCallback(() => {
    setDate(new Date().toISOString().slice(0,10));
    setMains(Array(mainCount).fill(""));
    setSupps(Array(suppCount).fill(""));
  }, [mainCount, suppCount]);

  const onChangeMain = (i: number, v: string) => {
    const next = mains.slice();
    next[i] = v.replace(/\D/g, "");
    setMains(next);
  };
  const onChangeSupp = (i: number, v: string) => {
    const next = supps.slice();
    next[i] = v.replace(/\D/g, "");
    setSupps(next);
  };

  function validate(): { ok: true, row: DrawRow } | { ok: false, message: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, message: "Please enter a valid date (YYYY-MM-DD) using the date picker." };
    }
    const mainsNums = mains.map(s => Number(s)).filter(n => Number.isInteger(n));
    const suppsNums = supps.map(s => Number(s)).filter(n => Number.isInteger(n));
    if (mainsNums.length !== mainCount) return { ok: false, message: `Enter ${mainCount} main numbers.` };
    if (suppsNums.length !== suppCount) return { ok: false, message: `Enter ${suppCount} supplementary numbers.` };
    const all = [...mainsNums, ...suppsNums];
    if (all.some(n => n < minNumber || n > maxNumber)) {
      return { ok: false, message: `Numbers must be between ${minNumber} and ${maxNumber}.` };
    }
    if (new Set(all).size !== all.length) {
      return { ok: false, message: "Numbers must be unique (no duplicates across main and supplementary)." };
    }
    const dateForCsv = isoToMDYY(date);
    return { ok: true, row: { date: dateForCsv, mains: mainsNums, supps: suppsNums } };
  }

  const saveNewDraw = useCallback(async () => {
    if (busyRef.current) return;
    const v = validate();
    if (!v.ok) { setError(v.message); return; }
    setError(null);
    setStatus("Saving...");
    busyRef.current = true;
    try {
      let handle = fileHandle;
      if (!handle) {
        handle = await pickCsvFile();
        setFileHandle(handle);
        const name = (await handle.getFile()).name;
        setLastFileName(name);
      }
      let existing = "";
      try {
        existing = await readCsvFromHandle(handle!);
      } catch {
        existing = "";
      }
      const updatedCsv = prependRowToCsv(existing, v.row);
      try {
        await writeCsvToHandle(handle!, updatedCsv);
        setStatus(`Saved to ${lastFileName ?? "selected file"}.`);
      } catch (writeErr: any) {
        setStatus(`Write not permitted. Offered download instead.`);
        downloadCsvFallback("windfall_history_lottolyzer.csv", updatedCsv);
      }
      const { rows } = parseCsv(updatedCsv);
      onDrawsUpdated?.(rows);
      broadcastDrawHistoryUpdated({ rows, added: v.row });
      resetEntry();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      busyRef.current = false;
    }
  }, [fileHandle, lastFileName, onDrawsUpdated, resetEntry]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, margin: "8px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={openEntry}>Load Next Draw</button>
        <button type="button" onClick={saveNewDraw}>Save New Draw</button>
        <button type="button" onClick={pickFile}>{fileHandle ? "Change CSV file…" : "Select CSV file…"}</button>
        {lastFileName && <span style={{ color: "#555" }}>Selected: {lastFileName}</span>}
      </div>
      {csvPathHint && <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>Target CSV: {csvPathHint}</div>}
      {isEntryOpen && (
        <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label> Date: <input type="date" value={date} onChange={e => setDate(e.target.value)} /> </label>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Main numbers ({mainCount}):</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Array.from({ length: mainCount }).map((_, i) => (
                <input key={`m${i}`} inputMode="numeric" pattern="[0-9]*" placeholder={`M${i+1}`} value={mains[i] ?? ""} onChange={(e) => onChangeMain(i, e.target.value)} style={{ width: 56 }} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Supplementary ({suppCount}):</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Array.from({ length: suppCount }).map((_, i) => (
                <input key={`s${i}`} inputMode="numeric" pattern="[0-9]*" placeholder={`S${i+1}`} value={supps[i] ?? ""} onChange={(e) => onChangeSupp(i, e.target.value)} style={{ width: 56 }} />
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 8, minHeight: 20 }}>
        {error && <div style={{ color: "crimson" }}>Error: {error}</div>}
        {!error && status && <div style={{ color: "#2a6" }}>{status}</div>}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        Tip: Direct file updates work in Chrome/Edge on localhost or HTTPS. If permission is denied, you’ll get a download of the updated CSV; replace your file with it.
      </div>
    </div>
  );
}