import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  broadcastDrawHistoryUpdated,
  downloadCsvFallback,
  parseCsv,
  pickCsvFile,
  readCsvFromHandle,
  toCsv,
  writeCsvToHandle,
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
  normalizeHistoryDate,
  replaceLocalDateWithSourceRow,
  sortHistoryRows,
  type DrawHistoryComparison,
} from "../lib/drawHistoryReview";
import {
  buildDrawHistorySummary,
  parseReferenceDrawRows,
  validateDrawEntry,
  type DrawHistoryValidationOptions,
} from "../lib/drawHistoryValidation";
import { showToast } from "../lib/toastBus";
import { MONTH_LABELS_EXCLUDED_FROM_HISTORY_BASELINES } from "../lib/monthlyAverageScope";

type Props = {
  onDrawsUpdated?: (rows: DrawRow[], summaryMessage?: string) => void;
  currentRows?: DrawRow[];
  mainCount?: number;
  suppCount?: number;
  minNumber?: number;
  maxNumber?: number;
  csvPathHint?: string;
};

type ActiveMode = "idle" | "entry" | "compare";

const panelStyle: React.CSSProperties = {
  border: "1px solid #d7dee8",
  borderRadius: 8,
  padding: 12,
  margin: "8px 0",
  background: "#fff",
};

const subtleTextStyle: React.CSSProperties = {
  color: "#526070",
  fontSize: 12,
  lineHeight: 1.45,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  marginTop: 10,
};

function SummaryCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneStyles: Record<typeof tone, React.CSSProperties> = {
    neutral: { borderColor: "#e2e8f0", background: "#f8fafc", color: "#111827" },
    good: { borderColor: "#bbd7bd", background: "#f4fbf4", color: "#1f6b2d" },
    warn: { borderColor: "#efd28a", background: "#fff9e6", color: "#805b00" },
    bad: { borderColor: "#efb3b3", background: "#fff5f5", color: "#9f1d1d" },
  };

  return (
    <div style={{ border: "1px solid", borderRadius: 8, padding: "8px 10px", ...toneStyles[tone] }}>
      <div style={{ fontSize: 11, color: "inherit", opacity: 0.78 }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 16, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function renderRow(row: DrawRow): string {
  return `${row.date}: main [${row.mains.join(", ")}] | supp [${row.supps.join(", ")}]`;
}

function dateFormatForRows(rows: DrawRow[]): "iso" | "mdyy" {
  return rows.some((row) => row.date.includes("/")) ? "mdyy" : "iso";
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
  const fallbackFileInputRef = useRef<HTMLInputElement | null>(null);
  const compareFileInputRef = useRef<HTMLInputElement | null>(null);
  const busyRef = useRef(false);

  const [activeMode, setActiveMode] = useState<ActiveMode>("idle");
  const [fileHandle, setFileHandle] = useState<CsvFileHandle | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mains, setMains] = useState<string[]>(() => Array(mainCount).fill(""));
  const [supps, setSupps] = useState<string[]>(() => Array(suppCount).fill(""));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareInput, setCompareInput] = useState("");
  const [compareSourceLabel, setCompareSourceLabel] = useState("pasted content");
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareSourceRows, setCompareSourceRows] = useState<DrawRow[]>([]);
  const [comparison, setComparison] = useState<DrawHistoryComparison | null>(null);
  const [sourceHasConflicts, setSourceHasConflicts] = useState(false);

  const supportsFileSystemAccess = typeof window !== "undefined" && "showOpenFilePicker" in window;
  const localRows = useMemo(() => sortHistoryRows(currentRows, "desc"), [currentRows]);
  const summary = useMemo(() => buildDrawHistorySummary(localRows), [localRows]);
  const validationOptions = useMemo<DrawHistoryValidationOptions>(() => ({
    mainCount,
    suppCount,
    minNumber,
    maxNumber,
    outputDateFormat: dateFormatForRows(localRows),
  }), [localRows, mainCount, maxNumber, minNumber, suppCount]);

  const resetEntry = useCallback(() => {
    setDate(new Date().toISOString().slice(0, 10));
    setMains(Array(mainCount).fill(""));
    setSupps(Array(suppCount).fill(""));
  }, [mainCount, suppCount]);

  const setMainSlot = useCallback((slot: number, value: string) => {
    setMains((current) => {
      const next = current.slice();
      next[slot] = value.replace(/\D/g, "");
      return next;
    });
  }, []);

  const setSuppSlot = useCallback((slot: number, value: string) => {
    setSupps((current) => {
      const next = current.slice();
      next[slot] = value.replace(/\D/g, "");
      return next;
    });
  }, []);

  const persistRows = useCallback(async (rowsToSave: DrawRow[], successMessage: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setStatus("Saving draw history...");

    try {
      let handle = fileHandle;
      let existingCsv = csvText ?? "";
      let fileName = lastFileName ?? "windfall_history_lottolyzer.csv";

      if (supportsFileSystemAccess) {
        if (!handle) {
          try {
            handle = await pickCsvFile();
            setFileHandle(handle);
            fileName = (await handle.getFile()).name;
            setLastFileName(fileName);
          } catch {
            handle = null;
          }
        }
        if (handle) {
          try {
            const file = await handle.getFile();
            fileName = file.name;
            existingCsv = await readCsvFromHandle(handle);
            setLastFileName(fileName);
          } catch {
            existingCsv = "";
          }
        }
      }

      const header = existingCsv ? parseCsv(existingCsv).header : undefined;
      const orderedRows = sortHistoryRows(rowsToSave, "desc");
      const csv = toCsv(orderedRows.filter((row) => !row.isSimulated), header);

      if (supportsFileSystemAccess && handle) {
        try {
          await writeCsvToHandle(handle, csv);
          setStatus(`${successMessage} Saved to ${fileName}.`);
        } catch {
          downloadCsvFallback(fileName, csv);
          setCsvText(csv);
          setStatus(`${successMessage} Write permission was denied, so a CSV download was created.`);
        }
      } else {
        downloadCsvFallback(fileName, csv);
        setCsvText(csv);
        setStatus(`${successMessage} CSV download created.`);
      }

      onDrawsUpdated?.(orderedRows.filter((row) => !row.isSimulated), successMessage);
      showToast(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(null);
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
      setStatus(`Selected CSV target: ${file.name}`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(null);
    } finally {
      event.target.value = "";
    }
  }, []);

  const pickTargetCsv = useCallback(async () => {
    try {
      if (!supportsFileSystemAccess) {
        fallbackFileInputRef.current?.click();
        return;
      }
      const handle = await pickCsvFile(fileHandle ?? undefined);
      const file = await handle.getFile();
      setFileHandle(handle);
      setLastFileName(file.name);
      setCsvText(await file.text());
      setStatus(`Selected CSV target: ${file.name}`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(null);
    }
  }, [fileHandle, supportsFileSystemAccess]);

  const saveEntry = useCallback(async () => {
    const validated = validateDrawEntry({ date, mains, supps }, validationOptions);
    if (!validated.ok) {
      setError(validated.message);
      setStatus(null);
      return;
    }

    const exactKey = buildHistoryExactKey(validated.row);
    if (localRows.some((row) => buildHistoryExactKey(row) === exactKey)) {
      setError(`That exact draw already exists in history (${validated.row.date}). Nothing was saved.`);
      setStatus(null);
      return;
    }

    const normalizedDate = normalizeHistoryDate(validated.row.date);
    if (localRows.some((row) => normalizeHistoryDate(row.date) === normalizedDate)) {
      setError("A different draw is already stored for that date. Resolve the date conflict before saving another version.");
      setStatus(null);
      return;
    }

    const nextRows = sortHistoryRows([validated.row, ...localRows.filter((row) => !row.isSimulated)], "desc");
    await persistRows(nextRows, `Saved draw ${validated.row.date}.`);
    broadcastDrawHistoryUpdated({ rows: nextRows, added: validated.row });
    resetEntry();
  }, [date, localRows, mains, persistRows, resetEntry, supps, validationOptions]);

  const handleCompareFilePicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      setCompareInput(await file.text());
      setCompareSourceLabel(file.name);
      setCompareStatus(`Loaded reference file: ${file.name}`);
      setCompareError(null);
      setComparison(null);
      setCompareSourceRows([]);
      setSourceHasConflicts(false);
    } catch (caught) {
      setCompareError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      event.target.value = "";
    }
  }, []);

  const runComparison = useCallback(() => {
    if (!compareInput.trim()) {
      setCompareError("Paste or upload reference draw content before comparing.");
      setCompareStatus(null);
      setComparison(null);
      setCompareSourceRows([]);
      return;
    }

    const parsed = parseReferenceDrawRows(compareInput, validationOptions);
    if (parsed.rows.length === 0) {
      setCompareError("No valid draw rows were found in the reference content.");
      setCompareStatus(null);
      setComparison(null);
      setCompareSourceRows([]);
      return;
    }

    const sourceReview = analyzeDrawHistoryRows(parsed.rows);
    const sourceRows = applyAutomaticHistoryCorrections(parsed.rows, sourceReview);
    const nextComparison = compareOfficialSourceRows(localRows.filter((row) => !row.isSimulated), sourceRows);
    const notes = [
      `Compared ${sourceRows.length} reference rows with ${summary.realRows} local real rows.`,
      parsed.rejectedRowCount > 0 ? `${parsed.rejectedRowCount} malformed reference row${parsed.rejectedRowCount === 1 ? "" : "s"} rejected.` : null,
      sourceReview.autoDropIndices.length > 0 ? `${sourceReview.autoDropIndices.length} exact duplicate reference row${sourceReview.autoDropIndices.length === 1 ? "" : "s"} removed.` : null,
      sourceReview.sameDateConflictIssues.length > 0 ? `${sourceReview.sameDateConflictIssues.length} reference date conflict${sourceReview.sameDateConflictIssues.length === 1 ? "" : "s"} must be resolved before safe sync.` : null,
    ].filter((note): note is string => note !== null);

    setCompareSourceRows(sourceRows);
    setComparison(nextComparison);
    setSourceHasConflicts(sourceReview.sameDateConflictIssues.length > 0);
    setCompareError(null);
    setCompareStatus(notes.join(" "));
  }, [compareInput, localRows, summary.realRows, validationOptions]);

  const applySafeSync = useCallback(async () => {
    if (!comparison) return;
    if (sourceHasConflicts) {
      setCompareError("Safe sync is disabled until the reference source has no same-date conflicts.");
      return;
    }
    const nextRows = applySafeOfficialSourceCorrections(localRows.filter((row) => !row.isSimulated), comparison);
    await persistRows(nextRows, "Applied safe reference corrections.");
  }, [comparison, localRows, persistRows, sourceHasConflicts]);

  const addMissingReferenceRow = useCallback(async (row: DrawRow) => {
    const nextRows = addSourceRowIfMissing(localRows.filter((entry) => !entry.isSimulated), row);
    await persistRows(nextRows, `Added reference draw ${row.date}.`);
  }, [localRows, persistRows]);

  const replaceConflictWithReference = useCallback(async (row: DrawRow) => {
    const nextRows = replaceLocalDateWithSourceRow(localRows.filter((entry) => !entry.isSimulated), row);
    await persistRows(nextRows, `Replaced local draw ${row.date} with reference row.`);
  }, [localRows, persistRows]);

  const integrityTone = summary.sameDateConflictIssues > 0 || summary.exactDuplicateIssues > 0
    ? "bad"
    : summary.repeatedNumberSetIssues > 0
      ? "warn"
      : "good";
  const dataTone = summary.simulatedRows > 0 ? "bad" : summary.totalRows > 0 ? "good" : "warn";

  return (
    <section style={panelStyle}>
      <input ref={fallbackFileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFallbackFilePicked} />
      <input ref={compareFileInputRef} type="file" accept=".csv,.json,.txt,.html,.htm,text/csv,application/json,text/html,text/plain" hidden onChange={handleCompareFilePicked} />

      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 750, color: "#111827" }}>Draw history source</div>
          <div style={subtleTextStyle}>
            {lastFileName ? `CSV target: ${lastFileName}` : "No CSV write target selected."}
          </div>
          <div style={{ ...subtleTextStyle, marginTop: 3 }}>
            Windfall All History baselines exclude the opening partial month
            {" "}
            ({MONTH_LABELS_EXCLUDED_FROM_HISTORY_BASELINES.join(", ")}).
          </div>
        </div>
        <div style={buttonRowStyle}>
          <button type="button" onClick={pickTargetCsv}>{lastFileName ? "Change CSV target" : "Select CSV target"}</button>
          <button type="button" onClick={() => { setActiveMode("entry"); setError(null); setStatus(null); }}>Add draw</button>
          <button type="button" onClick={() => { setActiveMode("compare"); setCompareError(null); }}>Compare reference</button>
        </div>
      </header>

      <div style={cardGridStyle}>
        <SummaryCard label="Rows" value={`${summary.realRows} real / ${summary.totalRows} loaded`} tone={dataTone} />
        <SummaryCard label="Latest" value={summary.latestDate ?? "none"} tone={summary.latestDate ? "neutral" : "warn"} />
        <SummaryCard label="Coverage" value={summary.earliestDate && summary.latestDate ? `${summary.earliestDate} to ${summary.latestDate}` : "none"} />
        <SummaryCard label="Integrity" value={summary.issueCount === 0 ? "clear" : `${summary.issueCount} issue${summary.issueCount === 1 ? "" : "s"}`} tone={integrityTone} />
      </div>

      {summary.simulatedRows > 0 && (
        <div style={{ marginTop: 10, color: "#9f1d1d", background: "#fff5f5", border: "1px solid #efb3b3", borderRadius: 8, padding: 8, fontSize: 13 }}>
          {summary.simulatedRows} simulated fallback row{summary.simulatedRows === 1 ? "" : "s"} detected. They are excluded from CSV writes and should be replaced with verified draw history before analysis.
        </div>
      )}

      {csvPathHint && <div style={{ ...subtleTextStyle, marginTop: 8 }}>Configured path hint: {csvPathHint}</div>}

      {activeMode === "entry" && (
        <div style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#374151" }}>
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>Main numbers</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: mainCount }).map((_, slot) => (
                  <input
                    key={`draw-main-${slot}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={`Main number ${slot + 1}`}
                    value={mains[slot] ?? ""}
                    onChange={(event) => setMainSlot(slot, event.target.value)}
                    style={{ width: 54 }}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>Supplementary</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: suppCount }).map((_, slot) => (
                  <input
                    key={`draw-supp-${slot}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={`Supplementary number ${slot + 1}`}
                    value={supps[slot] ?? ""}
                    onChange={(event) => setSuppSlot(slot, event.target.value)}
                    style={{ width: 54 }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div style={{ ...buttonRowStyle, marginTop: 10 }}>
            <button type="button" onClick={saveEntry}>Save draw</button>
            <button type="button" onClick={resetEntry}>Clear</button>
            <button type="button" onClick={() => setActiveMode("idle")}>Close</button>
          </div>
        </div>
      )}

      {activeMode === "compare" && (
        <div style={{ marginTop: 12, border: "1px solid #dbe4f0", borderRadius: 8, padding: 10, background: "#f8fbff" }}>
          <div style={buttonRowStyle}>
            <button type="button" onClick={() => compareFileInputRef.current?.click()}>Upload reference</button>
            <button type="button" onClick={runComparison}>Compare</button>
            <button type="button" onClick={applySafeSync} disabled={!comparison || sourceHasConflicts}>Apply safe corrections</button>
            <span style={subtleTextStyle}>Source: {compareSourceLabel}</span>
          </div>
          <textarea
            value={compareInput}
            onChange={(event) => {
              setCompareInput(event.target.value);
              setCompareSourceLabel("pasted content");
              setCompareStatus(null);
              setCompareError(null);
              setComparison(null);
              setCompareSourceRows([]);
              setSourceHasConflicts(false);
            }}
            placeholder="Paste CSV, JSON, saved HTML, or copied table text."
            style={{ width: "100%", minHeight: 110, marginTop: 8, fontFamily: "monospace", fontSize: 12 }}
          />

          {comparison && (
            <div style={{ ...cardGridStyle, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <SummaryCard label="Reference rows" value={String(compareSourceRows.length)} />
              <SummaryCard label="Exact matches" value={String(comparison.exactMatchCount)} tone="good" />
              <SummaryCard label="Missing locally" value={String(comparison.missingInLocal.length)} tone={comparison.missingInLocal.length ? "warn" : "good"} />
              <SummaryCard label="Date conflicts" value={String(comparison.conflictingDates.length)} tone={comparison.conflictingDates.length ? "bad" : "good"} />
              <SummaryCard label="Local-only dates" value={String(comparison.extraInLocal.length)} tone={comparison.extraInLocal.length ? "warn" : "good"} />
            </div>
          )}

          {comparison && comparison.missingInLocal.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 650, fontSize: 13 }}>Reference rows missing locally</div>
              {comparison.missingInLocal.map((group) => (
                <div key={`missing-${group.normalizedDate}`} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, background: "#fff" }}>
                  {group.sourceRows.map((row, index) => (
                    <div key={`missing-${group.normalizedDate}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 12 }}>{renderRow(row)}</span>
                      <button type="button" onClick={() => addMissingReferenceRow(row)}>Add</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {comparison && comparison.conflictingDates.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 650, fontSize: 13 }}>Same-date conflicts</div>
              {comparison.conflictingDates.map((group) => (
                <div key={`conflict-${group.normalizedDate}`} style={{ border: "1px solid #efb3b3", borderRadius: 6, padding: 8, background: "#fffafa" }}>
                  <div style={{ fontWeight: 650, marginBottom: 6 }}>{group.normalizedDate}</div>
                  <div style={subtleTextStyle}>Local</div>
                  {group.localRows.map((row, index) => <div key={`local-${group.normalizedDate}-${index}`} style={{ fontSize: 12 }}>{renderRow(row)}</div>)}
                  <div style={{ ...subtleTextStyle, marginTop: 6 }}>Reference</div>
                  {group.sourceRows.map((row, index) => (
                    <div key={`source-${group.normalizedDate}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                      <span>{renderRow(row)}</span>
                      {group.sourceRows.length === 1 && <button type="button" onClick={() => replaceConflictWithReference(row)}>Use reference</button>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {comparison && comparison.extraInLocal.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 650, fontSize: 13 }}>Local-only dates</summary>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {comparison.extraInLocal.map((group) => (
                  <div key={`extra-${group.normalizedDate}`} style={{ fontSize: 12 }}>
                    {group.normalizedDate}: {group.localRows.map(renderRow).join(" ; ")}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div style={{ marginTop: 8, minHeight: 20 }}>
        {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>Error: {error}</div>}
        {!error && status && <div style={{ color: "#166534", fontSize: 13 }}>{status}</div>}
        {compareError && <div style={{ color: "#b91c1c", fontSize: 13 }}>Compare error: {compareError}</div>}
        {!compareError && compareStatus && <div style={{ color: "#166534", fontSize: 13 }}>{compareStatus}</div>}
      </div>
    </section>
  );
}
