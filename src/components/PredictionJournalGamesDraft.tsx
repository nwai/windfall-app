import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import type { PredictionJournalInputs, PredictionJournalReviewStatus } from "../lib/predictionJournal";
import {
  buildPredictionCaptureBatch, parsePredictionCaptureRows, predictionCaptureGameReasons,
  type PredictionCaptureBatch, type PredictionCaptureSession,
} from "../lib/predictionCapture";
import { formatPredictionSelectionReasons, getPredictionSelectionReasons, type PredictionJournalSelectionReason } from "../lib/predictionSelectionReasons";
import { PredictionSelectionReasonOptions } from "./PredictionSelectionReasonOptions";
import { PredictionGameHistoryOverview, PredictionGameInspection } from "./PredictionGameInspection";
import { analyzePredictionGameHistory } from "../lib/predictionGameHistory";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import "./PredictionJournalGamesDraft.css";

export interface PlayedGamesDraftValue {
  batch: PredictionCaptureBatch;
  inputs: PredictionJournalInputs;
  reviewStatus: PredictionJournalReviewStatus;
}

export const PredictionJournalGamesDraft: React.FC<{
  latestDraw: Draw | null;
  history: Draw[];
  targetDate: string;
  initialText?: string;
  session?: PredictionCaptureSession | null;
  initialBatch?: PredictionCaptureBatch;
  initialInputs?: PredictionJournalInputs;
  initialReviewStatus?: PredictionJournalReviewStatus;
  now: () => string;
  onSave: (value: PlayedGamesDraftValue) => string | null;
  onCancel: () => void;
  onSimulateGame?: (numbers: number[]) => void;
}> = ({ latestDraw, history, targetDate, initialText, session, initialBatch, initialInputs = {}, initialReviewStatus = "notReviewed", now, onSave, onCancel, onSimulateGame }) => {
  const [draftDate] = useState(now);
  const [text, setText] = useState(() => initialText ?? initialBatch?.games.flatMap(game => Array.from({ length: game.quantity }, () => game.numbers.join(", "))).join("\n") ?? "");
  const [reasons, setReasons] = useState(() => initialBatch?.selectionReasons ?? getPredictionSelectionReasons(initialInputs));
  const [overrides, setOverrides] = useState<Record<string, PredictionJournalSelectionReason[] | undefined>>(() => Object.fromEntries(
    (initialBatch?.games ?? []).filter(game => game.selectionReasonOverride !== undefined).map(game => [game.mainKey, game.selectionReasonOverride]),
  ));
  const [notes, setNotes] = useState(initialInputs.notes ?? "");
  const [reviewStatus, setReviewStatus] = useState(initialReviewStatus);
  const [message, setMessage] = useState("");
  const rows = useMemo(() => parsePredictionCaptureRows(text, { playedOnly: true }), [text]);
  const errors = rows.filter(row => row.error);
  const batch = useMemo(() => {
    const result = buildPredictionCaptureBatch({ session, externalRows: rows, includeAnalyticalForecasts: false, now: draftDate });
    const order = new Map<string, number>();
    rows.forEach((row, index) => { if (row.game) { const key = row.game.slice().sort((a, b) => a - b).join("-"); if (!order.has(key)) order.set(key, index); } });
    result.games.sort((a, b) => (order.get(a.mainKey) ?? 0) - (order.get(b.mainKey) ?? 0));
    result.games = result.games.map(game => {
      const saved = initialBatch?.games.find(item => item.mainKey === game.mainKey);
      return { ...game, ...(saved ? { id: saved.id, provenance: saved.provenance, inputSources: saved.inputSources } : {}),
        ...(overrides[game.mainKey] !== undefined ? { selectionReasonOverride: overrides[game.mainKey] } : {}) };
    });
    const runIds = new Set(result.games.flatMap(game => game.provenance.runIds));
    result.runSnapshots = [...new Map([...(initialBatch?.runSnapshots ?? []), ...result.runSnapshots].filter(run => runIds.has(run.id)).map(run => [run.id, run])).values()];
    result.sourceSummary.capturedGames = result.games.filter(game => game.provenance.status === "matched").length;
    result.sourceSummary.externalGames = result.games.length - result.sourceSummary.capturedGames;
    result.selectionReasons = reasons;
    if (initialBatch) { result.id = initialBatch.id; result.savedAt = initialBatch.savedAt; result.unitCostCents = initialBatch.unitCostCents; }
    return result;
  }, [draftDate, initialBatch, overrides, reasons, rows, session]);
  const historical = useMemo(() => analyzePredictionGameHistory(history, batch.games, latestDraw?.date ?? ""), [history, batch.games, latestDraw?.date]);
  return <div className="prediction-games-draft" aria-label="Pasted six-number games">
    <div className="prediction-games-draft__heading">
      <strong>{initialBatch ? "Edit recorded games" : "Paste games"}</strong>
      <span>Next draw: {targetDate}</span>
      <InfoHelp label="Paste games help">One complete six-number game per line. These are not eight-number draw hypotheses. Reasons are user-declared; only exact captured-row matches provide recorded generation provenance. Current settings are saved as entry-time context, not proof of how pasted games were chosen.</InfoHelp>
    </div>
    <div className="prediction-games-draft__grid">
      <fieldset><legend>Games</legend>
        <HigField label="Six-number game rows">
          <textarea value={text} rows={7} onChange={event => { setText(event.target.value); setMessage(""); }} placeholder="Paste one game per line" spellCheck={false} />
        </HigField>
        <div role="status">{batch.games.length} distinct games · {batch.sourceSummary.purchasedLines} recorded lines</div>
        {errors.length ? <ul role="alert" className="prediction-games-draft__errors">{errors.map(row => <li key={row.lineNumber}>Line {row.lineNumber}: {row.error}</li>)}</ul> : null}
      </fieldset>
      <fieldset><legend>Shared selection reasons</legend>
        <PredictionSelectionReasonOptions value={reasons} onChange={value => {
          setReasons(value);
          setNotes(current => {
            const base = current.split(/\r?\n/).filter(line => !line.trim().startsWith("Selection reason:")).join("\n").trimEnd();
            const summary = formatPredictionSelectionReasons(value);
            return [base, summary ? `Selection reason: ${summary}` : ""].filter(Boolean).join("\n");
          });
        }} label="Shared selection reasons" />
      </fieldset>
    </div>
    {batch.games.length && !errors.length ? <PredictionGameHistoryOverview analysis={historical} games={batch.games} /> : null}
    {batch.games.length ? <fieldset><legend>Individual game reasons</legend>
      <div className="prediction-games-draft__games">
        {batch.games.map((game, index) => {
          const custom = game.selectionReasonOverride !== undefined;
          const effective = predictionCaptureGameReasons(batch, game);
          return <details key={game.mainKey} className="prediction-games-draft__game" aria-label={`Game ${index + 1} reasons`}>
            <summary><span className="windfall-section__disclosure-button" aria-hidden="true"><span className="windfall-section__disclosure-icon">▸</span></span><span>Game {index + 1}</span><strong>{game.numbers.join(", ")}</strong>
              <span>{custom ? "Custom reasons" : "Shared reasons"}{game.quantity > 1 ? ` · ${game.quantity} identical lines` : ""}</span></summary>
            <div className="prediction-games-draft__game-body">
              <label className="prediction-games-draft__check"><input type="checkbox" checked={custom}
                onChange={event => setOverrides(current => ({ ...current, [game.mainKey]: event.target.checked ? reasons.map(reason => ({ ...reason })) : undefined }))} />Use custom reasons for game {index + 1}</label>
              {custom ? <PredictionSelectionReasonOptions value={effective} label={`Game ${index + 1} selection reasons`}
                onChange={value => setOverrides(current => ({ ...current, [game.mainKey]: value }))} />
                : <div>{formatPredictionSelectionReasons(effective) || "No shared reasons selected."}</div>}
              {!errors.length ? <PredictionGameInspection game={game} index={index} batch={batch} analysis={historical} onSimulate={onSimulateGame} /> : null}
            </div>
          </details>;
        })}
      </div>
    </fieldset> : null}
    <div className="prediction-games-draft__grid">
      <fieldset><legend>Notes</legend><HigField label="Game notes"><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} /></HigField></fieldset>
      <fieldset><legend>Review status</legend>
        {(["notReviewed", "reviewedByUser"] as const).map(value => <label key={value} className="prediction-games-draft__check">
          <input type="radio" name="played-games-review-status" value={value} checked={reviewStatus === value} onChange={() => setReviewStatus(value)} />
          {value === "reviewedByUser" ? "Reviewed by user" : "Not reviewed"}
        </label>)}
        <div>Source: {batch.sourceSummary.capturedGames} exact captured matches · {batch.sourceSummary.externalGames} external / unknown.</div>
      </fieldset>
    </div>
    <div className="prediction-games-draft__actions">
      <HigButton variant="primary" disabled={!latestDraw || !batch.games.length || errors.length > 0} onClick={() => {
        const reasonLine = formatPredictionSelectionReasons(reasons);
        const cleanNotes = notes.split(/\r?\n/).filter(line => !line.trim().startsWith("Selection reason:")).join("\n").trimEnd();
        const error = onSave({ batch, inputs: { selectionReasons: reasons, notes: [cleanNotes, reasonLine ? `Selection reason: ${reasonLine}` : ""].filter(Boolean).join("\n") }, reviewStatus });
        if (error) setMessage(error);
      }}>{initialBatch ? "Update prediction" : "Save prediction"}</HigButton>
      <HigButton variant="quiet" onClick={onCancel}>Cancel</HigButton>
      {message ? <span role="alert">{message}</span> : null}
    </div>
  </div>;
};
