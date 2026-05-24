import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  prependRowToCsv,
  broadcastDrawHistoryUpdated,
  parseCsv,
  pickCsvFile,
  readCsvFromHandle,
  toCsv,
  writeCsvToHandle,
  downloadCsvFallback,
  type CsvFileHandle,
  type DrawRow,
} from "../lib/drawHistory";
import {
  addSourceRowIfMissing,
  analyzeDrawHistoryRows,
  applyAutomaticHistoryCorrections,
  applySafeOfficialSourceCorrections,
  buildHistoryExactKey,
  compareOfficialSourceRows,
  formatIsoDateAsMdyy,
  normalizeHistoryDate,
  replaceLocalDateWithSourceRow,
  sortHistoryRows,
  type DrawHistoryComparison,
} from "../lib/drawHistoryReview";
import { showToast } from "../lib/toastBus";
import { parseCSVorJSON } from "../parseCSVorJSON";

type Props = {
  onDrawsUpdated?: (rows: DrawRow[], summaryMessage?: string) => void;
  currentRows?: DrawRow[];
  mainCount?: number;
  suppCount?: number;
  minNumber?: number;
  maxNumber?: number;
  csvPathHint?: string;
};

type SourceParseResult = {
  rows: DrawRow[];
  invalidRowCount: number;
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
  currentRows = [],
  mainCount = 6,
  suppCount = 2,
  minNumber = 1,
  maxNumber = 45,
  csvPathHint,
}: Props) {
  const [fileHandle, setFileHandle] = useState<CsvFileHandle | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const fallbackFileInputRef = useRef<HTMLInputElement | null>(null);
  const compareFileInputRef = useRef<HTMLInputElement | null>(null);
  const supportsFileSystemAccess = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [mains, setMains] = useState<string[]>(Array(mainCount).fill(""));
  const [supps, setSupps] = useState<string[]>(Array(suppCount).fill(""));

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [compareInput, setCompareInput] = useState<string>("");
  const [compareSourceLabel, setCompareSourceLabel] = useState<string>("pasted content");
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareSourceRows, setCompareSourceRows] = useState<DrawRow[]>([]);
  const [comparison, setComparison] = useState<DrawHistoryComparison | null>(null);
  const busyRef = useRef(false);

  const localRows = useMemo(() => sortHistoryRows(currentRows, "desc"), [currentRows]);
  const preferSlashDateFormat = useMemo(() => localRows.some((row) => row.date.includes("/")), [localRows]);

  const coerceRowDateFormat = useCallback((row: DrawRow): DrawRow => {
    const normalizedDate = normalizeHistoryDate(row.date);
    return {
      date: preferSlashDateFormat ? formatIsoDateAsMdyy(normalizedDate) : normalizedDate,
      mains: row.mains.slice(),
      supps: row.supps.slice(),
    };
  }, [preferSlashDateFormat]);

  const parseSourceRows = useCallback((input: string): SourceParseResult => {
    const parsed = parseCSVorJSON(input);
    const rows: DrawRow[] = [];
    let invalidRowCount = 0;

    parsed.forEach((candidate) => {
      const mains = candidate.main.map(Number).filter((value) => Number.isInteger(value));
      const supps = candidate.supp.map(Number).filter((value) => Number.isInteger(value));
      const isBlank = candidate.date.trim() === "" && mains.length === 0 && supps.length === 0;
      if (isBlank) {
        return;
      }
      const allNumbers = [...mains, ...supps];
      const isValid =
        candidate.date.trim() !== "" &&
        mains.length === mainCount &&
        supps.length === suppCount &&
        allNumbers.every((value) => value >= minNumber && value <= maxNumber) &&
        new Set(allNumbers).size === allNumbers.length;

      if (!isValid) {
        invalidRowCount += 1;
        return;
      }

      rows.push(coerceRowDateFormat({
        date: candidate.date.trim(),
        mains,
        supps,
      }));
    });

    return { rows, invalidRowCount };
  }, [coerceRowDateFormat, mainCount, maxNumber, minNumber, suppCount]);

  const persistRows = useCallback(async (rowsToSave: DrawRow[], successMessage: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setStatus("Saving...");

    try {
      let handle = fileHandle;
      let existingCsv = csvText ?? "";
      if (supportsFileSystemAccess) {
        if (!handle) {
          try {
            handle = await pickCsvFile();
            setFileHandle(handle);
            const name = (await handle.getFile()).name;
            setLastFileName(name);
          } catch {
            handle = null;
          }
        }
        if (handle) {
          try {
            existingCsv = await readCsvFromHandle(handle);
          } catch {
            existingCsv = "";
          }
        }
      }

      const header = existingCsv ? parseCsv(existingCsv).header : undefined;
      const orderedRows = sortHistoryRows(rowsToSave, "desc");
      const updatedCsv = toCsv(orderedRows, header);

      if (supportsFileSystemAccess && handle) {
        try {
          await writeCsvToHandle(handle, updatedCsv);
          setStatus(successMessage);
        } catch {
          setStatus("Write not permitted. Offered download instead.");
          downloadCsvFallback(lastFileName ?? "windfall_history_lottolyzer.csv", updatedCsv);
        }
      } else {
        const fallbackName = lastFileName ?? "windfall_history_lottolyzer.csv";
        downloadCsvFallback(fallbackName, updatedCsv);
        setStatus(`${successMessage} Downloaded ${fallbackName}.`);
        setCsvText(updatedCsv);
      }

      onDrawsUpdated?.(orderedRows, successMessage);
      showToast(successMessage);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      busyRef.current = false;
    }
  }, [csvText, fileHandle, lastFileName, onDrawsUpdated, supportsFileSystemAccess]);

  const handleFallbackFilePicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      const content = await file.text();
      setCsvText(content);
      setLastFileName(file.name);
      setStatus(`Selected file: ${file.name}`);
      setError(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      event.target.value = "";
    }
  }, []);

  const pickFile = useCallback(async () => {
    try {
      if (!supportsFileSystemAccess) {
        fallbackFileInputRef.current?.click();
        return;
      }
      const handle = await pickCsvFile(fileHandle ?? undefined);
      setFileHandle(handle);
      const name = (await handle.getFile()).name;
      setLastFileName(name);
      setStatus(`Selected file: ${name}`);
      setError(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  }, [fileHandle, supportsFileSystemAccess]);

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
      let existing = "";
      if (supportsFileSystemAccess) {
        if (!handle) {
          handle = await pickCsvFile();
          setFileHandle(handle);
          const name = (await handle.getFile()).name;
          setLastFileName(name);
        }
        try {
          existing = await readCsvFromHandle(handle!);
        } catch {
          existing = "";
        }
      } else {
        if (!csvText) {
          setError("Select CSV file first (Safari uses a file picker + download). ");
          return;
        }
        existing = csvText;
      }
      const { rows: existingRows } = parseCsv(existing);
      const newExactKey = buildHistoryExactKey(v.row);
      const duplicateIndex = existingRows.findIndex((row) => buildHistoryExactKey(row) === newExactKey);
      if (duplicateIndex >= 0) {
        const duplicateDate = existingRows[duplicateIndex]?.date ?? v.row.date;
        const message = `That exact draw already exists in history (${duplicateDate}). Nothing was saved.`;
        setError(message);
        setStatus(null);
        showToast(message);
        return;
      }
      const normalizedDate = normalizeHistoryDate(v.row.date);
      const conflictingDateIndex = existingRows.findIndex(
        (row) => normalizeHistoryDate(row.date) === normalizedDate && buildHistoryExactKey(row) !== newExactKey,
      );
      if (conflictingDateIndex >= 0) {
        const message = "A different draw is already stored for that date. Review or edit the existing entry instead of adding a second version.";
        setError(message);
        setStatus(null);
        showToast(message);
        return;
      }
      const updatedCsv = prependRowToCsv(existing, v.row);
      if (supportsFileSystemAccess && handle) {
        try {
          await writeCsvToHandle(handle, updatedCsv);
          setStatus(`Saved to ${lastFileName ?? "selected file"}.`);
        } catch (writeErr: unknown) {
          setStatus("Write not permitted. Offered download instead.");
          downloadCsvFallback(lastFileName ?? "windfall_history_lottolyzer.csv", updatedCsv);
        }
      } else {
        const fallbackName = lastFileName ?? "windfall_history_lottolyzer.csv";
        downloadCsvFallback(fallbackName, updatedCsv);
        setStatus(`Downloaded updated CSV: ${fallbackName}`);
        setCsvText(updatedCsv);
      }
      const { rows } = parseCsv(updatedCsv);
      onDrawsUpdated?.(rows, `Saved new draw ${v.row.date}.`);
      broadcastDrawHistoryUpdated({ rows, added: v.row });
      resetEntry();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      busyRef.current = false;
    }
  }, [fileHandle, lastFileName, onDrawsUpdated, resetEntry, supportsFileSystemAccess, csvText]);

  const handleCompareFilePicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      const content = await file.text();
      setCompareInput(content);
      setCompareSourceLabel(file.name);
      setCompareStatus(`Loaded source file: ${file.name}`);
      setCompareError(null);
      setComparison(null);
      setCompareSourceRows([]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setCompareError(message);
    } finally {
      event.target.value = "";
    }
  }, []);

  const handleCompareRun = useCallback(() => {
    if (!compareInput.trim()) {
      setCompareError("Paste or upload official/reference draw content first.");
      setCompareStatus(null);
      setComparison(null);
      setCompareSourceRows([]);
      return;
    }

    const { rows, invalidRowCount } = parseSourceRows(compareInput);
    if (rows.length === 0) {
      setCompareError("No valid draw rows were found in the pasted/uploaded source.");
      setCompareStatus(null);
      setComparison(null);
      setCompareSourceRows([]);
      return;
    }

    const sourceReview = analyzeDrawHistoryRows(rows);
    const cleanedRows = applyAutomaticHistoryCorrections(rows, sourceReview);
    const nextComparison = compareOfficialSourceRows(localRows, cleanedRows);
    const notes: string[] = [
      `Compared ${cleanedRows.length} source draw${cleanedRows.length === 1 ? "" : "s"} against ${localRows.length} local draw${localRows.length === 1 ? "" : "s"}.`,
    ];
    if (invalidRowCount > 0) {
      notes.push(`${invalidRowCount} invalid source row${invalidRowCount === 1 ? " was" : "s were"} ignored.`);
    }
    if (sourceReview.autoDropIndices.length > 0) {
      notes.push(`${sourceReview.autoDropIndices.length} exact duplicate source row${sourceReview.autoDropIndices.length === 1 ? " was" : "s were"} removed before comparing.`);
    }
    if (sourceReview.sameDateConflictIssues.length > 0) {
      notes.push(`The source itself has ${sourceReview.sameDateConflictIssues.length} same-date conflict group${sourceReview.sameDateConflictIssues.length === 1 ? "" : "s"}.`);
    }

    setCompareSourceRows(cleanedRows);
    setComparison(nextComparison);
    setCompareError(null);
    setCompareStatus(notes.join(" "));
  }, [compareInput, localRows, parseSourceRows]);

  const handleApplySafeSync = useCallback(async () => {
    if (!comparison) {
      return;
    }
    const nextRows = applySafeOfficialSourceCorrections(localRows, comparison);
    const changedCount = Math.max(0, nextRows.length - localRows.length) + comparison.conflictingDates.filter((group) => group.sourceRows.length === 1).length;
    await persistRows(nextRows, `Applied safe official-source corrections${changedCount > 0 ? ` (${changedCount} change${changedCount === 1 ? "" : "s"})` : ""}.`);
  }, [comparison, localRows, persistRows]);

  const handleAddMissingSourceRow = useCallback(async (row: DrawRow) => {
    await persistRows(addSourceRowIfMissing(localRows, row), `Added missing source draw for ${normalizeHistoryDate(row.date)}.`);
  }, [localRows, persistRows]);

  const handleReplaceConflict = useCallback(async (row: DrawRow) => {
    await persistRows(replaceLocalDateWithSourceRow(localRows, row), `Replaced the local draw for ${normalizeHistoryDate(row.date)} with the source version.`);
  }, [localRows, persistRows]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, margin: "8px 0" }}>
      <input
        ref={fallbackFileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={handleFallbackFilePicked}
      />
      <input
        ref={compareFileInputRef}
        type="file"
        accept=".csv,.json,.txt,.html,.htm,text/csv,application/json,text/html,text/plain"
        style={{ display: "none" }}
        onChange={handleCompareFilePicked}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={openEntry}>Load Next Draw</button>
        <button type="button" onClick={saveNewDraw}>Save New Draw</button>
        <button type="button" onClick={pickFile}>{fileHandle ? "Change CSV file…" : "Select CSV file…"}</button>
        {lastFileName && <span style={{ color: "#555" }}>Selected: {lastFileName}</span>}
      </div>
      {csvPathHint && <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>Target CSV: {csvPathHint}</div>}
      <div style={{ marginTop: 12, padding: 10, border: "1px solid #dbe4f0", borderRadius: 8, background: "#f8fbff" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Compare Against Official / Reference Source</div>
        <div style={{ fontSize: 12, color: "#556", marginBottom: 8 }}>
          Paste or upload source content from `theLott`, `Lottolyzer`, a saved HTML page, CSV, JSON, or copied table rows. The comparison runs locally, so blocked live access is not required.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" onClick={() => compareFileInputRef.current?.click()}>Upload source file…</button>
          <button type="button" onClick={handleCompareRun}>Compare source to local history</button>
          {comparison && <button type="button" onClick={handleApplySafeSync}>Apply safe corrections</button>}
          <span style={{ color: "#555", alignSelf: "center" }}>Source: {compareSourceLabel}</span>
        </div>
        <textarea
          value={compareInput}
          onChange={(event) => {
            setCompareInput(event.target.value);
            setCompareSourceLabel("pasted content");
            setCompareError(null);
            setCompareStatus(null);
            setComparison(null);
            setCompareSourceRows([]);
          }}
          placeholder="Paste official/reference draw content here (CSV, JSON, saved HTML, or copied table text)."
          style={{ width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 12 }}
        />
        <div style={{ marginTop: 8, minHeight: 18 }}>
          {compareError && <div style={{ color: "crimson" }}>Compare error: {compareError}</div>}
          {!compareError && compareStatus && <div style={{ color: "#2a6" }}>{compareStatus}</div>}
        </div>
        {comparison && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, marginBottom: 8 }}>
              <span style={{ background: "#eef4ff", padding: "4px 8px", borderRadius: 999 }}>Exact matches: {comparison.exactMatchCount}</span>
              <span style={{ background: comparison.missingInLocal.length ? "#fff3cd" : "#edf7ed", padding: "4px 8px", borderRadius: 999 }}>Missing locally: {comparison.missingInLocal.length}</span>
              <span style={{ background: comparison.conflictingDates.length ? "#ffe3e3" : "#edf7ed", padding: "4px 8px", borderRadius: 999 }}>Same-date conflicts: {comparison.conflictingDates.length}</span>
              <span style={{ background: comparison.extraInLocal.length ? "#eef4ff" : "#edf7ed", padding: "4px 8px", borderRadius: 999 }}>Extra local-only dates: {comparison.extraInLocal.length}</span>
              <span style={{ background: "#eef4ff", padding: "4px 8px", borderRadius: 999 }}>Parsed source rows: {compareSourceRows.length}</span>
            </div>

            {comparison.missingInLocal.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Source rows missing from local history</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {comparison.missingInLocal.map((group) => (
                    <div key={`missing-${group.normalizedDate}`} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, background: "#fffef7" }}>
                      {group.sourceRows.map((row, index) => (
                        <div key={`missing-row-${group.normalizedDate}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span>{row.date}: Main [{row.mains.join(", ")}] · Supp [{row.supps.join(", ")}]</span>
                          <button type="button" onClick={() => handleAddMissingSourceRow(row)}>Add this draw</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparison.conflictingDates.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Local/source date conflicts</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {comparison.conflictingDates.map((group) => (
                    <div key={`conflict-${group.normalizedDate}`} style={{ border: "1px solid #f1d0d0", borderRadius: 6, padding: 8, background: "#fff9f9" }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{group.normalizedDate}</div>
                      <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Local version(s)</div>
                      <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
                        {group.localRows.map((row, index) => (
                          <div key={`local-${group.normalizedDate}-${index}`}>{row.date}: Main [{row.mains.join(", ")}] · Supp [{row.supps.join(", ")}]</div>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Source version(s)</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {group.sourceRows.map((row, index) => (
                          <div key={`source-${group.normalizedDate}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span>{row.date}: Main [{row.mains.join(", ")}] · Supp [{row.supps.join(", ")}]</span>
                            {group.sourceRows.length === 1 && (
                              <button type="button" onClick={() => handleReplaceConflict(row)}>Use source row for this date</button>
                            )}
                          </div>
                        ))}
                      </div>
                      {group.sourceRows.length > 1 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#8a5" }}>
                          Multiple source rows share this date, so replacement is not auto-applied. Review the source content first.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparison.extraInLocal.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Local-only dates not present in the provided source</div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                  These are shown for review only. They are not auto-removed because your pasted/uploaded source may be incomplete.
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  {comparison.extraInLocal.map((group) => (
                    <div key={`extra-${group.normalizedDate}`}>{group.normalizedDate}: {group.localRows.map((row) => `[${row.mains.join(", ")} | ${row.supps.join(", ")}]`).join(" ; ")}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
