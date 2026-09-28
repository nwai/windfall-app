import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPredictionCaptureBatch,
  parsePredictionCaptureRows,
  parsePredictionCaptureSession,
  serializePredictionCaptureSession,
  summarizePredictionCaptureGames,
  type PredictionCaptureBatch,
  type PredictionCaptureSession,
} from "../../lib/predictionCapture";
import { HigButton, InfoHelp } from "../shared/HigControls";

export interface PredictionCaptureCardProps {
  session: PredictionCaptureSession | null;
  storageState: "loading" | "ready" | "error";
  storageMessage?: string;
  onStart: () => void;
  onEnd: () => void;
  onClear: () => void;
  onReplaceSession: (session: PredictionCaptureSession) => void;
  onSaveAsPrediction: (batch: PredictionCaptureBatch) => void;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const downloadSession = (session: PredictionCaptureSession): void => {
  const blob = new Blob([serializePredictionCaptureSession(session)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `windfall-prediction-capture-${session.startedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const PredictionCaptureCard: React.FC<PredictionCaptureCardProps> = ({
  session,
  storageState,
  storageMessage,
  onStart,
  onEnd,
  onClear,
  onReplaceSession,
  onSaveAsPrediction,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [quantityByKey, setQuantityByKey] = useState<Record<string, number>>({});
  const [externalText, setExternalText] = useState("");
  const [externalInputSource, setExternalInputSource] = useState<"pasted" | "manual">("pasted");
  const [includeForecasts, setIncludeForecasts] = useState(true);
  const [clearArmed, setClearArmed] = useState(false);
  const [message, setMessage] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const summaries = useMemo(() => summarizePredictionCaptureGames(session), [session]);
  const availableKeys = useMemo(() => new Set(summaries.map((summary) => summary.mainKey)), [summaries]);
  const parsedExternalRows = useMemo(() => parsePredictionCaptureRows(externalText), [externalText]);
  const validExternalRows = useMemo(
    () => parsedExternalRows.filter((row) => !row.error && row.game),
    [parsedExternalRows],
  );
  const invalidExternalRows = useMemo(
    () => parsedExternalRows.filter((row) => row.error),
    [parsedExternalRows],
  );

  useEffect(() => {
    setSelectedKeys((current) => new Set([...current].filter((key) => availableKeys.has(key))));
  }, [availableKeys]);

  useEffect(() => {
    if (!clearArmed) return undefined;
    const timer = window.setTimeout(() => setClearArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [clearArmed]);

  const draftBatch = useMemo(() => buildPredictionCaptureBatch({
    session,
    selectedCapturedGameKeys: [...selectedKeys],
    externalRows: validExternalRows,
    externalInputSource,
    quantityByGameKey: quantityByKey,
    includeAnalyticalForecasts: includeForecasts,
  }), [externalInputSource, includeForecasts, quantityByKey, selectedKeys, session, validExternalRows]);

  const selectedLineCount = draftBatch.sourceSummary.purchasedLines;
  const isActive = session?.status === "active";
  const statusLabel = !session
    ? "No capture"
    : isActive
      ? "Capture active"
      : "Capture paused";
  const persistenceLabel = storageState === "loading"
    ? "Loading local capture"
    : storageState === "error"
      ? "Local persistence unavailable"
      : "Stored in this browser address";

  const toggleKey = (key: string): void => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleClear = (): void => {
    if (!clearArmed) {
      setClearArmed(true);
      setMessage("Press Confirm clear within five seconds to remove this local capture session.");
      return;
    }
    onClear();
    setSelectedKeys(new Set());
    setQuantityByKey({});
    setExternalText("");
    setClearArmed(false);
    setMessage("Prediction Capture cleared.");
  };

  const handleSave = (): void => {
    if (draftBatch.games.length === 0) {
      setMessage("Select or enter at least one valid six-number played game.");
      return;
    }
    onSaveAsPrediction(draftBatch);
    setMessage(`Prepared ${draftBatch.games.length} distinct game${draftBatch.games.length === 1 ? "" : "s"} for Prediction Journal review.`);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const imported = parsePredictionCaptureSession(await file.text());
      onReplaceSession(imported);
      setSelectedKeys(new Set());
      setQuantityByKey({});
      setMessage(`Imported capture with ${imported.rows.length} recorded row${imported.rows.length === 1 ? "" : "s"}.`);
      setExpanded(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prediction Capture import failed.");
    } finally {
      event.currentTarget.value = "";
    }
  };

  return (
    <section
      aria-label="Prediction Capture Session"
      style={{
        border: `1px solid ${isActive ? "#7fb3e1" : "#d7e0e8"}`,
        borderRadius: 8,
        background: isActive ? "#f2f8fd" : "#fbfcfd",
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          style={{
            width: 32,
            height: 32,
            border: 0,
            borderRadius: 6,
            background: "transparent",
            color: "#31506b",
            cursor: "pointer",
            fontSize: 16,
          }}
          aria-label={`${expanded ? "Hide" : "Show"} Prediction Capture details`}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ color: "#1f3b57" }}>Prediction Capture</strong>
            <span style={{ color: isActive ? "#0b5c9e" : "#5b6875", fontSize: 12, fontWeight: 850 }}>
              {statusLabel}
            </span>
            <InfoHelp label="Prediction Capture help">
              Start capture before generating. Windfall records only displayed candidate rows and their real setup snapshots. Select only games actually played before saving them to Prediction Journal. Six-number games are scored as played lines; optional 6+2 rows remain separate analytical forecasts.
            </InfoHelp>
          </div>
          <div style={{ marginTop: 2, color: "#607080", fontSize: 12 }}>
            {summaries.length} distinct six-number games · {session?.rows.length ?? 0} captured row occurrences · {session?.runs.length ?? 0} immutable setup runs · {persistenceLabel}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <HigButton
            size="compact"
            variant={isActive ? "primary" : "secondary"}
            onClick={onStart}
            disabled={isActive || storageState === "loading"}
          >
            {!session ? "Start Prediction Capture" : isActive ? "Capture active" : "Resume capture"}
          </HigButton>
          <HigButton size="compact" variant="secondary" onClick={onEnd} disabled={!isActive}>
            End capture
          </HigButton>
          <HigButton size="compact" variant={clearArmed ? "danger" : "quiet"} onClick={handleClear} disabled={!session}>
            {clearArmed ? "Confirm clear" : "Clear capture"}
          </HigButton>
        </div>
      </div>

      {expanded ? (
        <div style={{ borderTop: "1px solid #dbe4ec", padding: 12, background: "rgba(255,255,255,0.78)" }}>
          {storageMessage ? (
            <div role={storageState === "error" ? "alert" : "status"} style={{ marginBottom: 10, color: storageState === "error" ? "#991b1b" : "#475569", fontSize: 12, fontWeight: 750 }}>
              {storageMessage}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <div style={{ color: "#24384c", fontSize: 13, fontWeight: 850 }}>Captured candidate games</div>
              <div style={{ color: "#657385", fontSize: 12 }}>Select only lines actually played. “Seen” counts capture evidence, not ticket quantity.</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <HigButton size="compact" variant="quiet" onClick={() => setSelectedKeys(new Set(summaries.map((summary) => summary.mainKey)))} disabled={!summaries.length}>
                Select all
              </HigButton>
              <HigButton size="compact" variant="quiet" onClick={() => setSelectedKeys(new Set())} disabled={!selectedKeys.size}>
                Clear selection
              </HigButton>
            </div>
          </div>

          <div style={{ border: "1px solid #e1e7ed", borderRadius: 8, maxHeight: 320, overflow: "auto", background: "#fff" }}>
            {summaries.length ? summaries.map((summary) => {
              const selected = selectedKeys.has(summary.mainKey);
              const quantity = Math.max(1, Math.trunc(quantityByKey[summary.mainKey] ?? 1));
              return (
                <div
                  key={summary.mainKey}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(230px, 1fr) auto auto",
                    gap: 10,
                    alignItems: "center",
                    minHeight: 44,
                    padding: "6px 9px",
                    borderBottom: "1px solid #edf1f5",
                    background: selected ? "#eef6ff" : "#fff",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, cursor: "pointer" }}>
                    <input type="checkbox" checked={selected} onChange={() => toggleKey(summary.mainKey)} />
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 850, color: "#25384a" }}>
                      {summary.numbers.join(", ")}
                    </span>
                  </label>
                  <span style={{ color: summary.capturedOccurrenceCount > 1 ? "#8a4b00" : "#64748b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
                    Seen {summary.capturedOccurrenceCount}× · {summary.analyticalForecasts.length} forecast{summary.analyticalForecasts.length === 1 ? "" : "s"}
                  </span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#475569", fontSize: 12, whiteSpace: "nowrap" }}>
                    Ticket qty
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={quantity}
                      disabled={!selected}
                      onChange={(event) => setQuantityByKey((current) => ({
                        ...current,
                        [summary.mainKey]: Math.max(1, Math.min(999, Math.trunc(Number(event.currentTarget.value) || 1))),
                      }))}
                      style={{ width: 58, minHeight: 32 }}
                    />
                  </label>
                </div>
              );
            }) : (
              <div style={{ padding: 14, color: "#657385", fontSize: 12 }}>
                Start Prediction Capture, then generate candidates. Nothing is captured while the session is off.
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            <fieldset style={{ minWidth: 0, border: "1px solid #dbe3ec", borderRadius: 8, padding: 10, margin: 0 }}>
              <legend style={{ color: "#334155", fontSize: 12, fontWeight: 850, padding: "0 5px" }}>External or manual games</legend>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <input type="radio" name="capture-input-source" checked={externalInputSource === "pasted"} onChange={() => setExternalInputSource("pasted")} />
                  Pasted rows
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <input type="radio" name="capture-input-source" checked={externalInputSource === "manual"} onChange={() => setExternalInputSource("manual")} />
                  Manual entry
                </label>
              </div>
              <label htmlFor="prediction-capture-external-rows" style={{ display: "block", color: "#475569", fontSize: 12, fontWeight: 800, marginBottom: 5 }}>
                One game per line
              </label>
              <textarea
                id="prediction-capture-external-rows"
                value={externalText}
                onChange={(event) => setExternalText(event.currentTarget.value)}
                rows={5}
                placeholder={"6, 7, 14, 17, 30, 31\n6, 7, 14, 17, 30, 31, 28, 42"}
                style={{ width: "100%", resize: "vertical", boxSizing: "border-box", minHeight: 96 }}
              />
              <div style={{ marginTop: 5, color: invalidExternalRows.length ? "#991b1b" : "#64748b", fontSize: 12 }}>
                {validExternalRows.length} valid row{validExternalRows.length === 1 ? "" : "s"}
                {invalidExternalRows.length ? ` · ${invalidExternalRows.length} need attention: ${invalidExternalRows.map((row) => `line ${row.lineNumber}`).join(", ")}` : ""}
              </div>
            </fieldset>

            <fieldset style={{ minWidth: 0, border: "1px solid #dbe3ec", borderRadius: 8, padding: 10, margin: 0 }}>
              <legend style={{ color: "#334155", fontSize: 12, fontWeight: 850, padding: "0 5px" }}>Capture treatment</legend>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "#334155", fontSize: 12, lineHeight: 1.4 }}>
                <input type="checkbox" checked={includeForecasts} onChange={(event) => setIncludeForecasts(event.currentTarget.checked)} />
                <span>
                  <strong>Preserve explicit 6+2 analytical forecasts.</strong><br />
                  Played-game scoring still uses only each six-number line. Supplementary role forecasts are stored and audited separately.
                </span>
              </label>
              <div style={{ marginTop: 10, display: "grid", gap: 5, fontSize: 12, color: "#475569" }}>
                <span>Distinct games: <strong>{draftBatch.sourceSummary.distinctGames}</strong></span>
                <span>Purchased lines: <strong>{selectedLineCount}</strong></span>
                <span>Captured provenance: <strong>{draftBatch.sourceSummary.capturedGames}</strong></span>
                <span>External / source unknown: <strong>{draftBatch.sourceSummary.externalGames}</strong></span>
                <span>Recorded cost: <strong>{money(selectedLineCount * draftBatch.unitCostCents)}</strong></span>
              </div>
            </fieldset>
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <HigButton size="compact" variant="secondary" disabled={!session} onClick={() => session && downloadSession(session)}>
                Backup capture JSON
              </HigButton>
              <HigButton size="compact" variant="secondary" onClick={() => importInputRef.current?.click()}>
                Import capture JSON
              </HigButton>
              <input ref={importInputRef} type="file" accept=".json,application/json" hidden aria-label="Import Prediction Capture JSON" onChange={(event) => void handleImport(event)} />
            </div>
            <HigButton variant="primary" onClick={handleSave} disabled={draftBatch.games.length === 0 || invalidExternalRows.length > 0}>
              Save as Prediction
            </HigButton>
          </div>
          {message ? <div role="status" style={{ marginTop: 8, color: "#31506b", fontSize: 12, fontWeight: 750 }}>{message}</div> : null}
        </div>
      ) : null}
    </section>
  );
};

export default PredictionCaptureCard;
