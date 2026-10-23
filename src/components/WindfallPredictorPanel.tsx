import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import { portfolioHistoryFingerprint, portfolioIsoDate, preparePortfolioHistory } from "../lib/evidencePortfolio";
import { buildPlanningDrawContext } from "../lib/planningDrawContext";
import { loadPredictionJournalEntries, PREDICTION_JOURNAL_UPDATED_EVENT, type PredictionJournalEntry } from "../lib/predictionJournal";
import { auditSavedWindfallPredictors } from "../lib/windfallPredictorJournal";
import { PREDICTOR_FAMILIES, WINDFALL_PREDICTOR_DISCLAIMER, WINDFALL_PREDICTOR_VERSION, isWindfallPredictorSnapshot,
  predictorConstraintKey, scoreWindfallPredictor, type PredictorGame, type WindfallPredictorSnapshot } from "../lib/windfallPredictor";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import "./WindfallPredictorPanel.css";

const list = (ns: number[]) => ns.join(", ") || "none";
const fixed = (value: number | null, places = 3) => value === null ? "Unavailable" : value.toFixed(places);

export function WindfallPredictorRecord({ snapshot, history, onSimulate }: {
  snapshot: WindfallPredictorSnapshot; history: Draw[]; onSimulate?: (game: PredictorGame) => void;
}) {
  const checked = useMemo(() => scoreWindfallPredictor(snapshot, history), [snapshot, history]);
  const table = (shadow: boolean) => <div className="windfall-predictor__table"><table>
    <thead><tr><th>Game</th><th>Six mains</th><th>Suggested supps</th><th>Overlap</th><th>Main hits</th><th>Supp-role hits</th><th>Six-main prize</th>{onSimulate && !shadow ? <th>Inspect</th> : null}</tr></thead>
    <tbody>{(shadow ? checked.controls : checked.games).map((game, index) => <tr key={game.recipe}>
      <th scope="row">{shadow ? `Control ${index + 1}` : `${index + 1} · ${game.recipe}`}</th>
      <td><strong className="windfall-predictor__mains" aria-label={`Mains: ${list(game.main)}`}>{list(game.main)}</strong></td>
      <td><strong className="windfall-predictor__supps" aria-label={`Suggested supplementaries: ${list(game.supp)}`}>{list(game.supp)}</strong></td>
      <td><span data-outcome={game.status}>{game.status}{game.hits === null ? "" : ` · ${game.hits}/8`}</span></td>
      <td>{game.mainHits === null ? "Pending" : `${game.mainHits}/6`}</td><td>{game.suppHits === null ? "Pending" : `${game.suppHits}/2`}</td>
      <td><strong className={game.division && game.division !== "—" ? "windfall-predictor__prize" : undefined}>{game.division === "—" ? "No prize" : game.division ?? "Pending"}</strong></td>
      {onSimulate && !shadow ? <td><HigButton size="compact" onClick={() => onSimulate({recipe:game.recipe,main:game.main.slice(),supp:game.supp.slice(),suppMethod:game.suppMethod})} aria-label={`Simulate predictor game ${index + 1} in DGA`}>Simulate</HigButton></td> : null}
    </tr>)}</tbody>
  </table></div>;
  return <section className="windfall-predictor__record" aria-label={`Windfall Predictor receipt for ${snapshot.targetDate}`}>
    <p className="windfall-predictor__meta"><strong>Created by Predictor · {snapshot.version}</strong> · target {snapshot.targetDate} · D{snapshot.ordinal}/{snapshot.monthLength} · seed {snapshot.seed}</p>
    <p>Live context: <strong>{snapshot.liveDates.length} current-month draws</strong>{snapshot.liveDates.length ? ` (${snapshot.liveDates[0]} to ${snapshot.liveDates[snapshot.liveDates.length - 1]})` : ""}. Learned history: {snapshot.trainingDraws} real draws in {snapshot.trainingMonths.length} completed prior months.</p>
    {table(false)}
    <p className="windfall-predictor__fine">Hit = all eight overlap; Partial = 1–7; Miss = zero. This is not the prize test. Six-main prize uses only the six listed mains against the official six mains and two supps; the two suggested supplementary roles are not part of a six-number ticket. A displayed division is prize eligibility, not proof the game was purchased.</p>
    {!checked.historyMatches ? <p role="alert">Source history has changed since this receipt was frozen. Rows remain unchanged; this entry is excluded from formal forward comparison.</p> : null}
    {snapshot.warnings.map(warning => <p key={warning} className="windfall-predictor__notice">{warning}</p>)}
    <details><summary>Unplayed comparison · four uniform controls</summary>
      <p>Generated comparison suggestions, not simulated historical evidence or recommended plays. The same forced/excluded numbers apply, but learned factors and coverage weighting do not. They were frozen before the outcome and are never selected for looking good afterwards.</p>
      {table(true)}
      {checked.actual ? <p>Mean actual-main matches per six-number row: suggestions {fixed(checked.meanMainHits, 2)}; controls {fixed(checked.controlMeanMainHits, 2)}. One target is an observation, not a verdict.</p> : null}
    </details>
    <details><summary>Evidence receipt, audit gates and applied rules</summary>
      <p>Frozen {new Date(snapshot.frozenAt).toLocaleString()}; history cutoff {snapshot.cutoffDate}; fingerprint {snapshot.historyFingerprint}. Forced [{list(snapshot.constraints.forced)}]; excluded [{list(snapshot.constraints.excluded)}]. Other main-generator controls are not applied by this standalone fixed recipe.</p>
      <p>Current-month context is not the latest 13 draws across a month boundary. Every eligible number 1–45 remains available unless explicitly excluded; undrawn numbers are not silently removed.</p>
      <div className="windfall-predictor__table"><table><thead><tr><th>Family</th><th>Held-out targets / months</th><th>Brier error</th><th>Neutral error</th><th>Mean monthly improvement</th><th>Screen</th></tr></thead><tbody>
        {snapshot.audits.map(audit => <tr key={audit.family}><th scope="row">{audit.label}</th><td>{audit.targets} / {audit.months}</td><td>{fixed(audit.brier)}</td><td>{fixed(audit.baselineBrier)}</td><td>{fixed(audit.improvement, 5)}</td><td>{audit.cleared ? "Retrospective screen passed" : "Neutral"}<small>{audit.reason}</small></td></tr>)}
      </tbody></table></div>
      <p>Lower Brier error is better. Training is frozen for each test month, then that month's real outcomes are added for later months. A gate needs 60 held-out targets across six months and a positive lower bound in an approximate 99% month-level improvement interval. This is not a multiple-testing-adjusted guarantee or a candidate-level winning probability.</p>
      <p><strong>Supplementary-role audit:</strong> {snapshot.roleAudit.targets} real known-eight tests across {snapshot.roleAudit.months} months; mean supp-role hits {fixed(snapshot.roleAudit.meanHits)} versus exact random 0.500; exact-pair rate {snapshot.roleAudit.exactPairRate === null ? "Unavailable" : `${(snapshot.roleAudit.exactPairRate * 100).toFixed(1)}%`} versus random 1/28. {snapshot.roleAudit.reason} This reveals the eight numbers but conceals their roles, so it is not an eight-number prediction test.</p>
      <p>Monthly buckets and month-local absence share one family; directional neighbour overlaps share one family; terminal heat, size and frequency share one family. No downstream panel adds another vote. The existing drought, Auto supp, OGA, confluence and other observe-only learners are not silently promoted into this recipe.</p>
      <p>Prior months excluded as incomplete: {snapshot.excludedMonths.join(", ") || "none"}. Training months: {snapshot.trainingMonths.join(", ") || "none"}. The current incomplete month is live context, never a completed training month.</p>
      <div className="windfall-predictor__table"><table><thead><tr><th>Number</th><th>Month bucket</th><th>Month-local gap</th>{snapshot.audits.map(audit => <th key={audit.family}>{audit.label} factor</th>)}</tr></thead><tbody>
        {snapshot.numberEvidence.map(row => <tr key={row.number}><th scope="row">{row.number}</th><td>{row.bucket}x{row.bucket === 8 ? "+" : ""}</td><td>{row.monthGap}</td>{PREDICTOR_FAMILIES.map(family => <td key={family}>×{row.factors[family].toFixed(3)}<small>{row.stateTrials[family]} prior number-state trials</small></td>)}</tr>)}
      </tbody></table></div>
      <p>Factors are bounded experimental sampling weights (0.8–1.2), not appearance probabilities. Within a family, fewer than 20 state trials gives neutral ×1. Balanced evidence averages log factors equally; Monthly state uses only its family; Neighbour / terminal averages those two. Coverage hedge also favours numbers used less in the other three rows; that is diversity, not extra evidence.</p>
      {snapshot.games.map((game, index) => <p key={game.recipe}>Game {index + 1} supplementary assignment: {game.suppMethod}</p>)}
    </details>
  </section>;
}

interface Props {
  history: Draw[]; targetDate: string; forced: number[]; excluded: number[];
  onSave: (snapshot: WindfallPredictorSnapshot, reviewed: boolean) => void;
  onViewJournal: () => void; onSimulate?: (game: PredictorGame) => void;
}
export function WindfallPredictorPanel({ history, targetDate, forced, excluded, onSave, onViewJournal, onSimulate }: Props) {
  const [seed, setSeed] = useState(1), [running, setRunning] = useState(false), [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState<WindfallPredictorSnapshot | null>(null), [message, setMessage] = useState("");
  const [entries, setEntries] = useState<PredictionJournalEntry[]>(() => loadPredictionJournalEntries());
  const [savedOpen, setSavedOpen] = useState(false), [openRecords, setOpenRecords] = useState<Set<string>>(() => new Set());
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    const refresh = () => setEntries(loadPredictionJournalEntries());
    window.addEventListener(PREDICTION_JOURNAL_UPDATED_EVENT, refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(PREDICTION_JOURNAL_UPDATED_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const prepared = useMemo(() => preparePortfolioHistory(history).draws, [history]);
  const fingerprint = useMemo(() => portfolioHistoryFingerprint(prepared), [prepared]);
  const latest = prepared[prepared.length - 1];
  const nextRequired = latest ? buildPlanningDrawContext(prepared, {now:latest.date}).targetDrawDate : null;
  const targetLoaded = prepared.some(draw => portfolioIsoDate(draw.date) >= targetDate);
  const historyBehind = nextRequired !== null && nextRequired !== targetDate;
  const constraints = predictorConstraintKey(forced, excluded);
  const stale = preview && (preview.historyFingerprint !== fingerprint || preview.targetDate !== targetDate || preview.seed !== seed
    || predictorConstraintKey(preview.constraints.forced, preview.constraints.excluded) !== constraints);
  const saved = entries.some(entry => entry.windfallPredictor?.id === preview?.id && !!preview);
  const records = useMemo(() => entries.filter(entry => entry.windfallPredictor && !entry.archivedAt), [entries]);
  const audit = useMemo(() => auditSavedWindfallPredictors(entries, history), [entries, history]);
  const build = () => {
    workerRef.current?.terminate(); setRunning(true); setMessage(""); setPreview(null); setReviewed(false);
    try {
      const worker = new Worker(new URL("../workers/windfallPredictorWorker.ts", import.meta.url), {type:"module"}); workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{snapshot?: WindfallPredictorSnapshot; error?: string}>) => {
        if (workerRef.current !== worker) return;
        if (event.data.snapshot && isWindfallPredictorSnapshot(event.data.snapshot)) { setPreview(event.data.snapshot); setMessage("Four experimental games and four unplayed controls frozen. Review before saving."); }
        else setMessage(event.data.error ?? "Invalid predictor result. Nothing was saved.");
        worker.terminate(); workerRef.current = null; setRunning(false);
      };
      worker.onerror = () => { if (workerRef.current !== worker) return; setMessage("Predictor worker failed. Nothing was saved."); worker.terminate(); workerRef.current = null; setRunning(false); };
      worker.postMessage({ history, targetDate, seed, now: new Date().toISOString(), forced, excluded });
    } catch (error) { workerRef.current?.terminate(); workerRef.current = null; setRunning(false); setMessage(error instanceof Error ? error.message : "Unable to start predictor."); }
  };
  return <section className="windfall-predictor" aria-label="Windfall Predictor">
    <p className="windfall-predictor__disclaimer"><strong>Entertainment only</strong><br />{WINDFALL_PREDICTOR_DISCLAIMER}</p>
    <p>Experimental · {WINDFALL_PREDICTOR_VERSION} · next target <strong>{targetDate}</strong>. Live features use only the target month's recorded draws. Global WFMQYH is not changed. Earlier completed months supply learned state counts and prior-only audits; no future draw, synthetic training history or guessed audit result is used.</p>
    <p>Forced: <strong>{list(forced)}</strong> · excluded: <strong>{list(excluded)}</strong>. These apply across all eight suggestions in each row. Other generator controls are <strong>not applied</strong>; this panel is a separate fixed experiment. A short window outperforming All History is a hypothesis, not an established property of this model.</p>
    {targetLoaded ? <p role="alert">The target or a later real result is already loaded. New pre-draw construction is unavailable for this target; saved receipts still receive their outcome checks.</p>
      : historyBehind ? <p role="alert">History needs updating. The next unrecorded scheduled result after the latest CSV draw is {nextRequired}, but the app is planning {targetDate}. Load the missing official result(s) first. No gap is filled with invented evidence.</p> : null}
    <div className="windfall-predictor__actions">
      <HigField label="Candidate seed" id="windfall-predictor-seed"><input type="number" min={0} max={4294967295} step={1} value={seed} disabled={running} onChange={event => setSeed(Number(event.target.value))} /></HigField>
      <HigButton variant="primary" onClick={build} disabled={running || targetLoaded || historyBehind || !prepared.length || !Number.isInteger(seed) || seed < 0 || seed > 4294967295}>{running ? "Building..." : "Create four games"}</HigButton>
      {running ? <HigButton onClick={() => { workerRef.current?.terminate(); workerRef.current = null; setRunning(false); setMessage("Stopped. Nothing was saved."); }}>Cancel</HigButton> : null}
      <HigButton onClick={onViewJournal}>View journal</HigButton>
      <InfoHelp label="Windfall Predictor seed and evidence policy">A seed makes the random sampling reproducible; it is not a lucky number. Each family must clear its fixed retrospective screen before its learned weights are used. Failed or thin evidence stays neutral. Existing observe-only audits are not silently allowed to control generation. Four games represent different recipes, not four independent forecasts.</InfoHelp>
    </div>
    {message ? <p role="status">{message}</p> : null}
    {stale ? <p role="alert">History, target, seed or forced/excluded numbers changed. Create four games again before saving; the old receipt is not relabelled.</p> : null}
    {preview ? <>
      <WindfallPredictorRecord snapshot={preview} history={history} onSimulate={onSimulate} />
      <div className="windfall-predictor__actions"><label><input type="checkbox" checked={reviewed} disabled={saved} onChange={event => setReviewed(event.target.checked)} />Reviewed by user</label>
        <HigButton variant="primary" disabled={!!stale || saved} onClick={() => { if (stale || saved) return; try { onSave(preview, reviewed); setMessage("Saved one Predictor-labelled journal entry containing all four games and the unplayed comparison."); } catch (error) { setMessage(error instanceof Error ? error.message : "Journal save failed; preview retained."); } }}>{saved ? "Saved to journal" : "Save to journal"}</HigButton>
        <HigButton onClick={async () => { try { await navigator.clipboard.writeText(preview.games.map(game => [...game.main, ...game.supp].join(",")).join("\n")); setMessage("Copied four rows, mains first and suggested supps last."); } catch { setMessage("Clipboard unavailable; the rows remain visible."); } }}>Copy four rows</HigButton>
      </div><p className="windfall-predictor__fine">Saving does not declare these games were bought. Unreviewed and same-day entries remain visible but do not qualify for formal prospective comparison. Receipts and generated numbers stay frozen; later real draws supply outcomes only.</p>
    </> : null}
    <section aria-label="Predictor self-review" className="windfall-predictor__audit">
      <h3>Progressive self-review</h3><p>{records.length} active saved batches · {audit.targets} eligible distinct target draws · {audit.months} months.</p>
      <p>{audit.verdict}</p><p>Mean six-main hits: {fixed(audit.meanMainHits, 2)} · unplayed controls: {fixed(audit.controlMainHits, 2)}.</p>
      <p className="windfall-predictor__fine">Uses the earliest reviewed pre-draw receipt per target, excluding archived or revised-source entries. The primary measure is actual-main matches in the six listed mains, not spread coverage over all four games. This is a voluntary saved sample, not a replacement for historical walk-forward training. No automatic recipe changes occur.</p>
    </section>
    <details onToggle={event => { if (event.target === event.currentTarget) setSavedOpen(event.currentTarget.open); }}><summary>Saved Predictor games · automatic outcome flags ({records.length} batches)</summary>
      {!records.length ? <p>No Predictor entries saved yet. Save a batch to retain it across visits.</p> : savedOpen ? records.map(entry => {
        const score = scoreWindfallPredictor(entry.windfallPredictor!, history);
        return <details key={entry.id} open={openRecords.has(entry.id)} onToggle={event => {
          if (event.target !== event.currentTarget) return;
          const open = event.currentTarget.open;
          setOpenRecords(previous => {
            if (previous.has(entry.id) === open) return previous;
            const next = new Set(previous); if (open) next.add(entry.id); else next.delete(entry.id); return next;
          });
        }}><summary>{entry.windfallPredictor!.targetDate} · {score.actual ? `${score.games.filter(game => game.status === "Hit").length} hit / ${score.games.filter(game => game.status === "Partial").length} partial / ${score.games.filter(game => game.status === "Miss").length} miss · ${score.games.filter(game => game.division !== "—").length} prize-eligible` : "Pending real target"} · {entry.reviewStatus === "reviewedByUser" ? "Reviewed" : "Not reviewed"}</summary>{openRecords.has(entry.id) ? <WindfallPredictorRecord snapshot={entry.windfallPredictor!} history={history} onSimulate={onSimulate} /> : null}</details>;
      }) : null}
    </details>
  </section>;
}
