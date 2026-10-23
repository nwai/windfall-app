import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import type { AppPresetSnapshot } from "../lib/presets";
import {
  auditEvidencePortfolios, EVIDENCE_PORTFOLIO_MODEL, EVIDENCE_PORTFOLIO_POOL_SIZE,
  portfolioHistoryFingerprint, portfolioIsoDate, preparePortfolioHistory, scoreEvidencePortfolio,
  type EvidencePortfolioSnapshot, type PortfolioCandidate,
} from "../lib/evidencePortfolio";
import { loadPredictionJournalEntries, PREDICTION_JOURNAL_UPDATED_EVENT, type PredictionJournalEntry } from "../lib/predictionJournal";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import { EvidencePortfolioReplayCard } from "./EvidencePortfolioReplayCard";
import "./EvidencePortfolioPanel.css";

const numberText = (numbers: number[]): string => numbers.join(", ");
const signed = (value: number): string => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
const Numbers: React.FC<{ numbers: number[]; role: "main" | "supp" }> = ({ numbers, role }) => (
  <span className={`ep-numbers ep-numbers--${role}`} aria-label={`${role === "main" ? "Mains" : "Supps"}: ${numberText(numbers)}`}>{numberText(numbers)}</span>
);

export type EvidencePortfolioSimulationSource = "portfolio" | "shadow-baseline";
type SimulatePortfolioCandidate = (candidate: PortfolioCandidate, source: EvidencePortfolioSimulationSource) => void;

const CandidateTable: React.FC<{ rows: PortfolioCandidate[]; snapshot: EvidencePortfolioSnapshot; history: Draw[]; shadow?: boolean; challenger?: boolean; onSimulate?: SimulatePortfolioCandidate }> = ({ rows, snapshot, history, shadow = false, challenger = false, onSimulate }) => {
  const score = useMemo(() => scoreEvidencePortfolio(snapshot, history), [snapshot, history]);
  const scores = challenger ? score.challenger : shadow ? score.shadowBaseline : score.candidates;
  return <div className="ep-table-scroll"><table>
    <thead><tr><th scope="col">Role</th><th scope="col">Six mains</th><th scope="col">Two supps</th><th scope="col">Ticket M / S hits</th><th scope="col">8-number hits</th><th scope="col">Supp-role hits</th><th scope="col">Six-main prize</th>{onSimulate ? <th scope="col">Simulation</th> : null}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.role}-${index}`}>
      <th scope="row">{shadow ? `Control ${index + 1}` : row.role === "Independent Evidence" ? "Cross-group Support" : row.role}{row.stageFallback ? <small>Stage gate unavailable; {challenger ? "coverage" : "consensus"} fallback</small> : null}</th>
      <td><Numbers numbers={row.main} role="main" /></td><td><Numbers numbers={row.supp} role="supp" /></td>
      <td>{scores[index] ? `${scores[index].mainHits} / ${scores[index].ticketSuppHits}` : "Pending"}</td><td>{scores[index]?.uniqueHits ?? "Pending"}</td><td>{scores[index]?.supplementaryRoleHits ?? "Pending"}</td><td>{scores[index]?.division ?? "Pending"}</td>
      {onSimulate ? <td><HigButton size="compact" className="ep-simulate" aria-label={`Simulate ${shadow ? `control ${index + 1}` : row.role} in DGA`} onClick={() => onSimulate({ ...row, main: row.main.slice(), supp: row.supp.slice(), contributions: { ...row.contributions } }, shadow ? "shadow-baseline" : "portfolio")}>Simulate in DGA</HigButton></td> : null}
    </tr>)}</tbody>
  </table></div>;
};

export const EvidencePortfolioRecord: React.FC<{ snapshot: EvidencePortfolioSnapshot; history: Draw[]; onSimulate?: SimulatePortfolioCandidate }> = ({ snapshot, history, onSimulate }) => {
  const score = useMemo(() => scoreEvidencePortfolio(snapshot, history), [snapshot, history]);
  return <section className="ep-record" aria-label={`Evidence Portfolio for ${snapshot.targetDate}`}>
    <div className="ep-meta"><span><b>{snapshot.modelVersion}</b> · target {snapshot.targetDate} · D{snapshot.targetOrdinal}/{snapshot.monthLength}</span><span>Frozen {new Date(snapshot.frozenAt).toLocaleString()}</span><span>Seed {snapshot.seed}</span></div>
    <p className="ep-scope">Cutoff {snapshot.cutoffDate} · WFMQYH {snapshot.scopes.windowLabel}: {snapshot.scopes.active} real draws · {snapshot.scopes.allReal} all real · {snapshot.scopes.baseline} baseline · {snapshot.poolSize.toLocaleString()} proposals.</p>
    <InfoHelp label="Ticket and prediction match measures">Ticket M / S counts actual mains and actual supplementaries found in the six listed mains only. That is the six-number ticket prize check. 8-number hits also includes the two extra suggestions, which are not part of a six-number ticket. Supp-role hits checks whether those two suggestions match the actual supplementary pair. Eight-number system entries are a different ticket.</InfoHelp>
    <CandidateTable rows={snapshot.candidates} snapshot={snapshot} history={history} onSimulate={onSimulate} />
    <p role="status">{score.reason}{score.averageHits !== null ? ` Mean 8-number hits: portfolio ${score.averageHits.toFixed(2)}, unplayed control ${score.baselineAverageHits!.toFixed(2)}.` : ""}</p>
    {snapshot.warnings.map(warning => <p key={warning} className="ep-notice">{warning}</p>)}
    <details><summary>Frozen evidence and rules</summary>
      <p>Applied: forced [{numberText(snapshot.appliedConstraints.forced) || "none"}]; excluded [{numberText(snapshot.appliedConstraints.excluded) || "none"}]. Other main-generator controls were recorded for context and are not applied by this fixed portfolio model.</p>
      <p>Maximum one contribution per group. Frequency-derived views share frequency state; strict and empirical lists share drought state. Group labels organise sources; they do not prove statistical independence.</p>
      <div className="ep-table-scroll"><table><thead><tr><th>Group</th><th>State</th><th>Scope</th><th>Method</th></tr></thead><tbody>{snapshot.groups.map(group => <tr key={group.id}><th>{group.label}</th><td>{group.active ? "Included" : "Unavailable"}</td><td>{group.scope}</td><td>{group.reason}</td></tr>)}</tbody></table></div>
      <div className="ep-table-scroll"><table><thead><tr><th>Candidate</th>{snapshot.groups.map(group => <th key={group.id}>{group.label}</th>)}<th>Supp assignment</th></tr></thead><tbody>{snapshot.candidates.map(row => <tr key={row.role}><th>{row.role}</th>{snapshot.groups.map(group => <td key={group.id}>{row.contributions[group.id].toFixed(2)}</td>)}<td>{row.suppMethod}</td></tr>)}</tbody></table></div>
      <details><summary>All registered families</summary><div className="ep-table-scroll"><table><thead><tr><th>Family</th><th>Use</th><th>Reason</th></tr></thead><tbody>{snapshot.familyAvailability.map(family => <tr key={family.family}><th>{family.label}</th><td>{family.status}</td><td>{family.reason}</td></tr>)}</tbody></table></div></details>
    </details>
    <details><summary>Unplayed shadow baseline</summary><p>Four seeded uniform eight-number controls with the same forced inclusions and exclusions. They are generated comparison rows, not recorded historical draws or recommended plays. Prize checks use only each row's six mains. The same seed and number constraints produce the same controls even when history changes; these controls do not learn.</p><CandidateTable rows={snapshot.shadowBaseline} snapshot={snapshot} history={history} shadow onSimulate={onSimulate} /></details>
    {snapshot.challenger ? <details><summary>Unplayed experimental challenger · {snapshot.challenger.modelVersion}</summary><p>Frozen with this portfolio, using the same proposal pool and number constraints. Equal frequency counts share support, boundary ties stay together, broad families are discounted by their uncovered share of the 45-number field, and unavailable stage evidence uses a coverage fallback. These are unvalidated heuristics, not calibrated probabilities. EP-1 remains the active four-row model.</p><CandidateTable rows={snapshot.challenger.candidates} snapshot={snapshot} history={history} challenger /><div className="ep-table-scroll"><table><thead><tr><th>Group</th><th>State</th><th>Method</th></tr></thead><tbody>{snapshot.challenger.groups.map(group => <tr key={group.id}><th>{group.label}</th><td>{group.active ? "Shadow support" : "Unavailable"}</td><td>{group.reason}</td></tr>)}</tbody></table></div></details> : <p className="ep-scope">Legacy record: no EP-R1 challenger was frozen. It will not be reconstructed after the result.</p>}
    <details><summary>Leave-one-group-out audit</summary>
      <p>The alternate portfolios were built and frozen before the result. Positive difference means this portfolio matched more of the actual eight numbers than its alternate without that group. One draw gives an observation, not a verdict.</p>
      <div className="ep-table-scroll"><table><thead><tr><th>Removed group</th><th>Without: mean hits</th><th>With minus without</th></tr></thead><tbody>{snapshot.groups.filter(group => snapshot.ablations[group.id]).map(group => {
        const effect = score.attribution.find(row => row.group === group.id);
        return <tr key={group.id}><th>{group.label}</th><td>{effect?.withoutMeanHits.toFixed(2) ?? "Pending"}</td><td>{effect ? signed(effect.difference) : "Pending"}</td></tr>;
      })}</tbody></table></div>
    </details>
  </section>;
};

interface EvidencePortfolioPanelProps {
  history: Draw[];
  activeHistory: Draw[];
  targetDate: string;
  windowLabel: string;
  forcedNumbers: number[];
  excludedNumbers: number[];
  getSetupSnapshot: () => AppPresetSnapshot;
  onSave: (snapshot: EvidencePortfolioSnapshot, reviewed: boolean) => void;
  onViewJournal: () => void;
  onSimulate?: SimulatePortfolioCandidate;
}

export const EvidencePortfolioPanel: React.FC<EvidencePortfolioPanelProps> = ({ history, activeHistory, targetDate, windowLabel, forcedNumbers, excludedNumbers, getSetupSnapshot, onSave, onViewJournal, onSimulate }) => {
  const [seed, setSeed] = useState(1);
  const [preview, setPreview] = useState<EvidencePortfolioSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<PredictionJournalEntry[]>(() => typeof window === "undefined" ? [] : loadPredictionJournalEntries());
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    const refresh = () => setEntries(loadPredictionJournalEntries());
    window.addEventListener(PREDICTION_JOURNAL_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(PREDICTION_JOURNAL_UPDATED_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const records = useMemo(() => entries.filter(entry => entry.evidencePortfolio && !entry.archivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [entries]);
  const audit = useMemo(() => auditEvidencePortfolios(entries.flatMap(entry => entry.evidencePortfolio ? [{ snapshot: entry.evidencePortfolio, reviewed: entry.reviewStatus === "reviewedByUser", archived: Boolean(entry.archivedAt), savedAt: entry.createdAt, reviewedAt: entry.reviewedAt }] : []), history), [entries, history]);
  const prepared = useMemo(() => preparePortfolioHistory(history).draws, [history]);
  const historyKey = useMemo(() => portfolioHistoryFingerprint(prepared), [prepared]);
  const liveExclusions = excludedNumbers.slice().sort((a, b) => a - b).join(",");
  const liveForced = forcedNumbers.slice().sort((a, b) => a - b).join(",");
  const activeDates = useMemo(() => preparePortfolioHistory(activeHistory).draws.map(draw => portfolioIsoDate(draw.date)).join(","), [activeHistory]);
  const stale = Boolean(preview && (preview.historyFingerprint !== historyKey || preview.targetDate !== targetDate || preview.appliedConstraints.excluded.join(",") !== liveExclusions || preview.appliedConstraints.forced.join(",") !== liveForced || preview.scopes.activeDates.join(",") !== activeDates));
  const saved = Boolean(preview && entries.some(entry => entry.evidencePortfolio?.id === preview.id));
  const build = () => {
    setMessage(""); setRunning(true); setPreview(null); setReviewed(false);
    try {
      const worker = new Worker(new URL("../workers/evidencePortfolioWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ snapshot?: EvidencePortfolioSnapshot; error?: string }>) => {
        if (workerRef.current !== worker) return;
        if (event.data.snapshot) { setPreview(event.data.snapshot); setMessage("Four EP-1 candidates, controls and the unplayed EP-R1 challenger are frozen. Review before saving to the journal."); }
        else setMessage(event.data.error ?? "Unable to build portfolio.");
        setRunning(false); worker.terminate(); workerRef.current = null;
      };
      worker.onerror = () => { if (workerRef.current !== worker) return; setMessage("Portfolio worker failed. No prediction was saved."); setRunning(false); worker.terminate(); workerRef.current = null; };
      worker.postMessage({ history, activeHistory, targetDate, seed, now: new Date().toISOString(), windowLabel, forcedNumbers, excludedNumbers, settingsSnapshot: getSetupSnapshot() });
    } catch (error) {
      workerRef.current?.terminate(); workerRef.current = null; setRunning(false);
      setMessage(error instanceof Error ? error.message : "Unable to start portfolio construction. No prediction was saved.");
    }
  };
  const save = () => {
    if (!preview || stale || saved) return;
    try { onSave(preview, reviewed); setMessage("Saved four EP-1 forecast rows, the controls and the unplayed EP-R1 challenger in one journal entry."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Journal save failed. The preview remains available."); }
  };
  const copy = async () => {
    if (!preview) return;
    try { await navigator.clipboard.writeText(preview.candidates.map(row => [...row.main, ...row.supp].join(",")).join("\n")); setMessage("Copied four rows, mains first and supps last."); }
    catch { setMessage("Clipboard unavailable. The four rows remain visible."); }
  };
  return <section className="ep-panel" aria-label="Evidence Portfolio">
    <div className="ep-meta"><span className="ep-badge">Experimental · {EVIDENCE_PORTFOLIO_MODEL}</span><span>Next target {targetDate}</span><span>WFMQYH: {windowLabel} · {activeHistory.length} real draws</span></div>
    <p>Four fixed candidate roles combine bounded historical support. Their rankings are diagnostic, with no calibrated winning probability. A frozen shadow baseline and family-removal alternatives allow comparison when the real draw arrives.</p>
    <p>Forced inclusions: <b>{numberText(forcedNumbers) || "none"}</b> · exclusions: <b>{numberText(excludedNumbers) || "none"}</b>. These are the only main-generator constraints applied here.</p>
    <div className="ep-actions"><HigField id="ep-seed" label="Candidate seed"><input type="number" min={0} max={4294967295} step={1} value={seed} disabled={running} onChange={event => setSeed(Number(event.target.value))} /></HigField>
      <HigButton variant="primary" onClick={build} disabled={running || prepared.length < 24 || !Number.isInteger(seed) || seed < 0 || seed > 4294967295}>{running ? "Building portfolio..." : "Build four candidates"}</HigButton>
      {running ? <HigButton onClick={() => { workerRef.current?.terminate(); workerRef.current = null; setRunning(false); setMessage("Construction stopped. No prediction was saved."); }}>Cancel</HigButton> : null}
      <InfoHelp label="Evidence Portfolio recipes">Consensus Core uses the equal bounded sum. Cross-group Support (stored as Independent Evidence in older records) favours numbers supported by more declared groups, not proven independent signals. Stage Context adds monthly evidence only after its fixed audit gate passes; otherwise EP-1 uses consensus. Coverage Hedge favours supported numbers used less in the other three rows. The same seed and evidence reproduce the result from up to {EVIDENCE_PORTFOLIO_POOL_SIZE} uniform proposals. New portfolios also freeze an unplayed EP-R1 challenger; it never replaces the four EP-1 rows automatically.</InfoHelp>
      <HigButton onClick={onViewJournal}>View journal</HigButton>
    </div>
    {message ? <p role="status" className="ep-notice">{message}</p> : null}
    {stale ? <p role="alert" className="ep-notice">History, scope, target or number constraints changed. Build a new portfolio before saving this preview.</p> : null}
    {preview ? <><EvidencePortfolioRecord snapshot={preview} history={history} onSimulate={onSimulate} /><div className="ep-actions"><label className="ep-review"><input type="checkbox" checked={reviewed} disabled={saved} onChange={event => setReviewed(event.target.checked)} />Reviewed by user</label><HigButton variant="primary" onClick={save} disabled={saved || stale}>{saved ? "Saved to journal" : "Save portfolio to journal"}</HigButton><HigButton onClick={copy}>Copy four rows</HigButton></div><p>Saving records hypotheses; it does not declare these games were purchased. Unreviewed entries remain available for descriptive checks. Formal audits require review and a freeze date before the target calendar date.</p></> : null}
    <details><summary>Progressive family audit · {audit.eligibleDraws} eligible target draws</summary><p>Earliest reviewed, unarchived portfolio per target date. Saving and review must precede the target Melbourne calendar date. Verdicts need at least 30 different targets across six months. Month-level intervals are approximate; results remain observational and never change weights automatically.</p><div className="ep-table-scroll"><table><thead><tr><th>Group</th><th>Trials</th><th>Months</th><th>Mean with − without</th><th>Verdict</th></tr></thead><tbody>{audit.families.map(row => <tr key={row.group}><th>{row.group}</th><td>{row.trials}</td><td>{row.months}</td><td>{row.meanDifference === null ? "Unavailable" : signed(row.meanDifference)}</td><td>{row.verdict}</td></tr>)}</tbody></table></div></details>
    <EvidencePortfolioReplayCard history={history} activeDrawCount={activeHistory.length} />
    <details><summary>Saved evidence portfolios · {records.length}</summary>{records.length ? records.map(entry => <details key={entry.id}><summary>{entry.evidencePortfolio!.targetDate} · seed {entry.evidencePortfolio!.seed} · {entry.reviewStatus === "reviewedByUser" ? "Reviewed" : "Not reviewed"}</summary><EvidencePortfolioRecord snapshot={entry.evidencePortfolio!} history={history} onSimulate={onSimulate} /></details>) : <p>No evidence portfolios saved yet.</p>}</details>
  </section>;
};

export default EvidencePortfolioPanel;
