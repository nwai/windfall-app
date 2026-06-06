import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DrawRow } from "../lib/drawHistory";
import {
  analyzeDrawHistoryRows,
  applyAutomaticHistoryCorrections,
  describeDrawRow,
  dropHistoryRowAtIndex,
  keepOnlyDateVersion,
  keepOnlyNumbersVersion,
  normalizeHistoryDate,
  replaceHistoryRowAtIndex,
} from "../lib/drawHistoryReview";
import { validateDrawEntry } from "../lib/drawHistoryValidation";
import { showToast } from "../lib/toastBus";

interface DrawHistoryIntegrityPanelProps {
  rows: DrawRow[];
  onApplyRows: (rows: DrawRow[], summaryMessage: string) => void;
  mainCount?: number;
  suppCount?: number;
  minNumber?: number;
  maxNumber?: number;
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 10,
  background: "#fff",
};

function toIsoDateInputValue(rawDate: string): string {
  const normalized = normalizeHistoryDate(rawDate);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : new Date().toISOString().slice(0, 10);
}

export const DrawHistoryIntegrityPanel = ({
  rows,
  onApplyRows,
  mainCount = 6,
  suppCount = 2,
  minNumber = 1,
  maxNumber = 45,
}: DrawHistoryIntegrityPanelProps) => {
  const review = useMemo(() => analyzeDrawHistoryRows(rows), [rows]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDate, setEditDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [editMains, setEditMains] = useState<string[]>(Array(mainCount).fill(""));
  const [editSupps, setEditSupps] = useState<string[]>(Array(suppCount).fill(""));
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (editingIndex === null) {
      return;
    }
    if (!rows[editingIndex]) {
      setEditingIndex(null);
      setEditError(null);
    }
  }, [editingIndex, rows]);

  const commitRows = useCallback((nextRows: DrawRow[], summaryMessage: string) => {
    onApplyRows(nextRows, summaryMessage);
    showToast(summaryMessage);
    setEditingIndex(null);
    setEditError(null);
  }, [onApplyRows]);

  const beginEdit = useCallback((rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) {
      return;
    }
    setEditingIndex(rowIndex);
    setEditDate(toIsoDateInputValue(row.date));
    setEditMains(row.mains.map((value) => String(value)));
    setEditSupps(row.supps.map((value) => String(value)));
    setEditError(null);
  }, [rows]);

  const handleMainChange = useCallback((slot: number, value: string) => {
    setEditMains((current) => {
      const next = current.slice();
      next[slot] = value.replace(/\D/g, "");
      return next;
    });
  }, []);

  const handleSuppChange = useCallback((slot: number, value: string) => {
    setEditSupps((current) => {
      const next = current.slice();
      next[slot] = value.replace(/\D/g, "");
      return next;
    });
  }, []);

  const applyEdit = useCallback(() => {
    if (editingIndex === null) {
      return;
    }
    const currentRow = rows[editingIndex];
    if (!currentRow) {
      setEditError("The selected draw is no longer available. Please reopen the editor.");
      return;
    }

    const validated = validateDrawEntry(
      { date: editDate, mains: editMains, supps: editSupps },
      {
        mainCount,
        suppCount,
        minNumber,
        maxNumber,
        outputDateFormat: currentRow.date.includes("/") ? "mdyy" : "iso",
      },
    );
    if (!validated.ok) {
      setEditError(validated.message);
      return;
    }

    const nextRows = replaceHistoryRowAtIndex(rows, editingIndex, validated.row);
    commitRows(nextRows, `Updated draw ${currentRow.date}.`);
  }, [commitRows, editDate, editMains, editSupps, editingIndex, mainCount, maxNumber, minNumber, rows, suppCount]);

  const handleAutoFixDuplicates = useCallback(() => {
    const nextRows = applyAutomaticHistoryCorrections(rows, review);
    const removedCount = rows.length - nextRows.length;
    if (removedCount <= 0) {
      return;
    }
    commitRows(nextRows, `Removed ${removedCount} exact duplicate draw${removedCount === 1 ? "" : "s"}.`);
  }, [commitRows, review, rows]);

  const handleKeepDateVersion = useCallback((keepIndex: number) => {
    const row = rows[keepIndex];
    if (!row) {
      return;
    }
    const nextRows = keepOnlyDateVersion(rows, keepIndex);
    commitRows(nextRows, `Kept the ${row.date} version you selected and removed other entries for that draw date.`);
  }, [commitRows, rows]);

  const handleKeepNumbersVersion = useCallback((keepIndex: number) => {
    const row = rows[keepIndex];
    if (!row) {
      return;
    }
    const nextRows = keepOnlyNumbersVersion(rows, keepIndex);
    commitRows(nextRows, `Kept ${row.date} for that repeated number set and removed the other matching entries.`);
  }, [commitRows, rows]);

  const handleDropRow = useCallback((rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) {
      return;
    }
    const nextRows = dropHistoryRowAtIndex(rows, rowIndex);
    commitRows(nextRows, `Deleted ${describeDrawRow(row)}.`);
  }, [commitRows, rows]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div style={{ border: "1px solid #d7dee8", borderRadius: 8, padding: 12, marginTop: 12, background: "#f8fbff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Smart History Review</div>
          <div style={{ fontSize: 12, color: "#556" }}>
            Auto-fix exact duplicates, then review same-date conflicts or unusually repeated number sets before they skew analysis.
          </div>
        </div>
        {review.autoDropIndices.length > 0 && (
          <button type="button" onClick={handleAutoFixDuplicates}>
            Remove {review.autoDropIndices.length} exact duplicate{review.autoDropIndices.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, fontSize: 12 }}>
        <span style={{ background: "#eef4ff", padding: "4px 8px", borderRadius: 999 }}>Rows: {review.totalRows}</span>
        <span style={{ background: review.exactDuplicateIssues.length ? "#ffe3e3" : "#edf7ed", padding: "4px 8px", borderRadius: 999 }}>
          Exact duplicates: {review.exactDuplicateIssues.length}
        </span>
        <span style={{ background: review.sameDateConflictIssues.length ? "#fff3cd" : "#edf7ed", padding: "4px 8px", borderRadius: 999 }}>
          Same-date conflicts: {review.sameDateConflictIssues.length}
        </span>
        <span style={{ background: review.sameNumbersDifferentDateIssues.length ? "#fff3cd" : "#edf7ed", padding: "4px 8px", borderRadius: 999 }}>
          Repeated number sets on different dates: {review.sameNumbersDifferentDateIssues.length}
        </span>
      </div>

      {review.issues.length === 0 && (
        <div style={{ marginTop: 12, color: "#2f6b2f", fontSize: 13 }}>
          No duplicate or suspicious draw-history collisions were detected in the currently loaded history.
        </div>
      )}

      {review.sameDateConflictIssues.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Conflicting rows for the same draw date</div>
          <div style={{ display: "grid", gap: 8 }}>
            {review.sameDateConflictIssues.map((issue) => (
              <div key={issue.id} style={cardStyle}>
                <div style={{ fontWeight: 600 }}>{issue.title}</div>
                <div style={{ fontSize: 12, color: "#555", margin: "4px 0 8px" }}>{issue.description}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {issue.rowIndices.map((rowIndex) => {
                    const row = rows[rowIndex];
                    if (!row) {
                      return null;
                    }
                    return (
                      <div key={`${issue.id}-${rowIndex}`} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, background: "#fffdf8" }}>
                        <div style={{ fontSize: 13 }}>{describeDrawRow(row)}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          <button type="button" onClick={() => handleKeepDateVersion(rowIndex)}>Keep this version</button>
                          <button type="button" onClick={() => beginEdit(rowIndex)}>Edit</button>
                          <button type="button" onClick={() => handleDropRow(rowIndex)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {review.sameNumbersDifferentDateIssues.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Repeated number sets on different dates</div>
          <div style={{ display: "grid", gap: 8 }}>
            {review.sameNumbersDifferentDateIssues.map((issue) => (
              <div key={issue.id} style={cardStyle}>
                <div style={{ fontWeight: 600 }}>{issue.title}</div>
                <div style={{ fontSize: 12, color: "#555", margin: "4px 0 8px" }}>{issue.description}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {issue.rowIndices.map((rowIndex) => {
                    const row = rows[rowIndex];
                    if (!row) {
                      return null;
                    }
                    return (
                      <div key={`${issue.id}-${rowIndex}`} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, background: "#fff" }}>
                        <div style={{ fontSize: 13 }}>{describeDrawRow(row)}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          <button type="button" onClick={() => handleKeepNumbersVersion(rowIndex)}>Keep this date</button>
                          <button type="button" onClick={() => beginEdit(rowIndex)}>Edit</button>
                          <button type="button" onClick={() => handleDropRow(rowIndex)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingIndex !== null && rows[editingIndex] && (
        <div style={{ ...cardStyle, marginTop: 12, background: "#ffffff" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Edit selected draw</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label>
              Date:{" "}
              <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
            </label>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Main numbers ({mainCount})</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: mainCount }).map((_, slot) => (
                  <input
                    key={`integrity-main-${slot}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editMains[slot] ?? ""}
                    onChange={(event) => handleMainChange(slot, event.target.value)}
                    style={{ width: 56 }}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Supplementary ({suppCount})</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: suppCount }).map((_, slot) => (
                  <input
                    key={`integrity-supp-${slot}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editSupps[slot] ?? ""}
                    onChange={(event) => handleSuppChange(slot, event.target.value)}
                    style={{ width: 56 }}
                  />
                ))}
              </div>
            </div>
          </div>
          {editError && <div style={{ color: "crimson", marginTop: 8 }}>{editError}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" onClick={applyEdit}>Save correction</button>
            <button type="button" onClick={() => setEditingIndex(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawHistoryIntegrityPanel;
