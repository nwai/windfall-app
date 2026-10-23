import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import { portfolioHistoryFingerprint, preparePortfolioHistory } from "../lib/evidencePortfolio";
import { SUPPLEMENTARY_PAIR_POLICIES, SUPPLEMENTARY_PAIR_POLICY_LABELS, type SupplementaryPairPolicy } from "../lib/supplementaryPairComparison";
import {
  summarizeRandomReplay, summarizeSupplementaryReplay, SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL,
  type ReplayPhase, type SupplementaryPolicyReplayResult, type SupplementaryReplayRecord,
} from "../lib/supplementaryPolicyReplay";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import { InlineCollapsibleCard } from "./shared/InlineCollapsibleCard";
import "./SupplementaryPolicyReplayCard.css";

interface Props { fullHistory: readonly Draw[]; activeDrawCount: number }
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const number = (value: number): string => value.toFixed(3);
const pairs = (rows: { supp: number[] }[]): string => rows.map(row => row.supp.join(" + ")).join("; ");

const ResultsTable: React.FC<{ records: SupplementaryReplayRecord[]; stage: "role" | "portfolio" }> = ({ records, stage }) => {
  const eligible = records.filter(row => stage === "role" || row.portfolio);
  const reference = summarizeRandomReplay(eligible, stage);
  return (
    <div className="supp-replay-results">
      <h5>{stage === "role" ? "1. Known-eight role assignment" : "2. Production EP-1 selections"}</h5>
      <p>{eligible.length} real target draws{stage === "portfolio" ? `; ${eligible.length * 4} frozen eight-number rows. All three policies receive the same selections.` : ". The actual eight numbers are supplied; supplementary roles remain concealed until scoring."}</p>
      <div className="supp-replay-scroll" role="region" tabIndex={0} aria-label={`${stage === "role" ? "Known-eight" : "EP-1"} policy results`}>
        <table>
          <thead><tr><th scope="col">Method</th><th scope="col">Mean supp hits / 2</th><th scope="col">Both supps</th><th scope="col">0 / 1 / 2 hits</th>
            {stage === "portfolio" ? <><th scope="col">Mean main hits / 6</th><th scope="col">Six-main prize rate</th><th scope="col">Duplicate main rows</th></> : null}
            <th scope="col">Tied choices</th><th scope="col">No-evidence fallbacks</th></tr></thead>
          <tbody>
            {SUPPLEMENTARY_PAIR_POLICIES.map(policy => {
              const summary = summarizeSupplementaryReplay(eligible, stage, policy);
              return <tr key={policy}><th scope="row">{SUPPLEMENTARY_PAIR_POLICY_LABELS[policy]}</th>
                <td>{summary.rows ? number(summary.meanSuppHits) : "n/a"}</td><td>{summary.rows ? pct(summary.exactSuppRate) : "n/a"}</td>
                <td>{summary.rows ? `${summary.zeroHits} / ${summary.oneHit} / ${summary.twoHits}` : "n/a"}</td>
                {stage === "portfolio" ? <><td>{summary.rows ? number(summary.meanMainHits) : "n/a"}</td><td>{summary.rows ? pct(summary.prizeRate) : "n/a"}</td><td>{summary.extraDuplicateMainRows}</td></> : null}
                <td>{summary.ties}</td><td>{summary.fallbacks}</td></tr>;
            })}
            <tr className="supp-replay-reference"><th scope="row">Exact random-role expectation</th>
              <td>{eligible.length ? number(reference.meanSuppHits) : "n/a"}</td><td>{eligible.length ? pct(reference.exactSuppRate) : "n/a"}</td><td>Expectation, not observed counts</td>
              {stage === "portfolio" ? <><td>{eligible.length ? number(reference.meanMainHits) : "n/a"}</td><td>{eligible.length ? pct(reference.prizeRate) : "n/a"}</td><td>n/a</td></> : null}
              <td>n/a</td><td>n/a</td></tr>
          </tbody>
        </table>
      </div>
      {stage === "portfolio" ? <p className="supp-replay-muted">Prize checks use the six proposed mains as a playable game, not all eight. Duplicate six-main rows are counted once for the observed prize rate. Random expectation is per proposed row.</p> : null}
    </div>
  );
};

export const SupplementaryPolicyReplayCard: React.FC<Props> = ({ fullHistory, activeDrawCount }) => {
  const [localWindow, setLocalWindow] = useState("");
  const [seedInput, setSeedInput] = useState("1");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SupplementaryPolicyReplayResult | null>(null);
  const [phase, setPhase] = useState<ReplayPhase>("confirmation");
  const [ledgerPolicy, setLedgerPolicy] = useState<SupplementaryPairPolicy>("auto");
  const workerRef = useRef<Worker | null>(null);
  const source = useMemo(() => preparePortfolioHistory(fullHistory), [fullHistory]);
  const fingerprint = useMemo(() => portfolioHistoryFingerprint(source.draws), [source]);
  const sourceKey = `${fingerprint}:${fullHistory.length}`;
  const windowSize = localWindow === "" ? Math.max(1, Math.min(activeDrawCount, source.draws.length)) : Number(localWindow);
  const seed = Number(seedInput);
  const validOptions = Number.isInteger(windowSize) && windowSize >= 1 && windowSize <= source.draws.length
    && seedInput.trim() !== "" && Number.isInteger(seed) && seed >= 0 && seed <= 4294967295;
  const enoughHistory = source.draws.length > SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.minPriorDraws;
  const stale = result && (result.sourceFingerprint !== fingerprint || result.options.windowSize !== windowSize || result.options.seed !== seed
    || result.validDraws + result.excludedRows !== fullHistory.length);
  const records = useMemo(() => result?.records.filter(row => row.phase === phase) ?? [], [result, phase]);

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      setRunning(false);
      setMessage("History changed during replay. Run again with the updated source; no partial result was substituted.");
    }
  }, [sourceKey]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const cancel = (): void => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setMessage("Replay cancelled. Any earlier completed report remains unchanged.");
  };
  const run = (): void => {
    if (!validOptions || !enoughHistory || running) return;
    setMessage("");
    setProgress({ completed: 0, total: source.draws.length - SUPPLEMENTARY_POLICY_REPLAY_PROTOCOL.minPriorDraws });
    setRunning(true);
    try {
      const worker = new Worker(new URL("../workers/supplementaryPolicyReplayWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      const finish = (): void => { worker.terminate(); workerRef.current = null; setRunning(false); };
      worker.onmessage = (event: MessageEvent<{ progress?: { completed: number; total: number }; result?: SupplementaryPolicyReplayResult; error?: string }>) => {
        if (workerRef.current !== worker) return;
        if (event.data.progress) setProgress(event.data.progress);
        if (event.data.result) { setResult(event.data.result); setPhase("confirmation"); finish(); }
        if (event.data.error) { setMessage(event.data.error); finish(); }
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        setMessage("The replay worker failed. No result was fabricated; any earlier report remains unchanged.");
        finish();
      };
      worker.postMessage({ history: fullHistory, options: { windowSize, seed } });
    } catch (error) {
      workerRef.current?.terminate();
      workerRef.current = null;
      setRunning(false);
      setMessage(error instanceof Error ? error.message : "Replay could not start.");
    }
  };
  const exportReport = (): void => {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), result }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `windfall-SPRA-1-${result.sourceFingerprint}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("Report exported with every target, pair choice, actual result and skipped-portfolio reason.");
  };
  const status = result?.gate.status === "prospective-check-candidate" ? "Candidate for a future shadow test"
    : result?.gate.status === "insufficient" ? "Insufficient confirmation evidence" : "No validated improvement";

  return (
    <div className="supp-replay" data-testid="supplementary-policy-replay">
      <InlineCollapsibleCard id="supplementary-policy-replay" title="Three-Method Supplementary Replay" subtitle="SPRA-1 · Observe-only"
        collapsedSummary={result ? `${status}. EP-1's live supplementary method is unchanged.` : "Known-eight role assignment and frozen EP-1 selections; no live method changes."} keepMounted>
        <p className="supp-replay-scope">All History: {source.draws.length} qualifying real draws. {fullHistory.length - source.draws.length} rows omitted. No current selections or hard filters are applied to this fixed replay profile.</p>
        <div className="supp-replay-controls">
          <HigField label="Prior-draw window" help={localWindow === "" ? `WFMQYH count: ${windowSize}. Frozen for this run, then applied to the newest prior draws at every target.` : "Local replay override only; global WFMQYH is unchanged."}>
            <input type="number" min={1} max={source.draws.length} step={1} placeholder={String(windowSize)} value={localWindow} disabled={running} onChange={event => setLocalWindow(event.target.value)} />
          </HigField>
          <HigField label="Candidate seed" help="Fixed proposal pool; the same seed is used at every historical target.">
            <input type="number" min={0} max={4294967295} step={1} value={seedInput} disabled={running} onChange={event => setSeedInput(event.target.value)} />
          </HigField>
          <div className="supp-replay-actions">
            <HigButton variant="primary" onClick={run} disabled={running || !enoughHistory || !validOptions}>{running ? "Replaying..." : "Run replay"}</HigButton>
            {running ? <HigButton onClick={cancel}>Cancel replay</HigButton> : null}
            {result ? <HigButton onClick={exportReport} disabled={running}>Export report</HigButton> : null}
            <InfoHelp label="What this supplementary replay can establish">The known-eight test assesses roles, not number prediction. EP-1 builds its own eight-number selections from prior history. A later historical confirmation block checks the development-selected method; even a positive screen does not automatically replace EP-1's live method.</InfoHelp>
          </div>
        </div>
        {!enoughHistory ? <p>At least 61 qualifying real draws are needed for a target after the fixed 60-draw warm-up.</p> : null}
        {!validOptions && enoughHistory ? <p role="alert">Use a whole-number window from 1 to {source.draws.length} and a whole-number seed from 0 to 4294967295.</p> : null}
        {running ? <div className="supp-replay-progress" role="status"><progress max={progress.total || 1} value={progress.completed} /> {progress.completed} / {progress.total} targets tested</div> : null}
        {message ? <p role="status">{message}</p> : null}
        {stale ? <p className="supp-replay-warning" role="alert">Earlier report: history, window or seed has changed. Run again for a current comparison.</p> : null}
        {result ? <>
          <div className="supp-replay-verdict" role="status">
            <strong>{status}</strong>
            <p>Development-selected method: {SUPPLEMENTARY_PAIR_POLICY_LABELS[result.gate.candidate]}. Live EP-1 and DGA Auto supps remain unchanged.</p>
            <details><summary>Screening reasons</summary><ul>{result.gate.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>
          </div>
          <details className="supp-replay-method"><summary>Confirmation difference ranges</summary>
            <p>Monthly average supp-hit differences, with approximate 2.58-standard-error ranges. A range crossing zero does not clear the positive-difference screen. These are descriptive checks, not calibrated probabilities.</p>
            <div className="supp-replay-scroll" tabIndex={0} role="region" aria-label="Confirmation difference ranges"><table>
              <thead><tr><th scope="col">Comparison</th><th scope="col">Difference range (supp hits)</th></tr></thead>
              <tbody>{([
                ["Known eight vs Current Auto supps", result.gate.roleDifferenceInterval],
                ["Known eight vs exact random assignment", result.gate.roleRandomInterval],
                ["EP-1 vs Current Auto supps", result.gate.portfolioDifferenceInterval],
                ["EP-1 vs exact random assignment", result.gate.portfolioRandomInterval],
              ] as const).map(([label, interval]) => <tr key={label}><th scope="row">{label}</th><td>{interval ? `${number(interval[0])} to ${number(interval[1])}` : "n/a - fewer than six confirmation months"}</td></tr>)}</tbody>
            </table></div>
          </details>
          <p className="supp-replay-scope">Tested {result.firstTarget} to {result.lastTarget}; later confirmation starts {result.confirmationStarts ?? "n/a"}. {result.portfolioModel} uses {result.proposalPoolSize.toLocaleString()} seeded proposals per target. Window {result.options.windowSize}; seed {result.options.seed}.</p>
          <HigField label="Results block"><select value={phase} onChange={event => setPhase(event.target.value as ReplayPhase)}><option value="confirmation">Later historical confirmation (30%)</option><option value="development">Earlier development (70%)</option></select></HigField>
          <ResultsTable records={records} stage="role" />
          <ResultsTable records={records} stage="portfolio" />
          <p>{records.filter(row => !row.portfolio).length} EP-1 targets skipped in this block; all remain in the audit ledger. Missing stages are never filled with invented draws.</p>
          <details className="supp-replay-method"><summary>Target audit ledger</summary>
            <HigField label="Ledger method"><select value={ledgerPolicy} onChange={event => setLedgerPolicy(event.target.value as SupplementaryPairPolicy)}>{SUPPLEMENTARY_PAIR_POLICIES.map(policy => <option value={policy} key={policy}>{SUPPLEMENTARY_PAIR_POLICY_LABELS[policy]}</option>)}</select></HigField>
            <div className="supp-replay-scroll supp-replay-ledger" tabIndex={0} role="region" aria-label="Supplementary replay target ledger"><table>
              <thead><tr><th scope="col">Target</th><th scope="col">History cutoff</th><th scope="col">Prior / window</th><th scope="col">Official supps</th><th scope="col">Known-eight pair</th><th scope="col">Hits / 2</th><th scope="col">EP-1 pairs (four roles)</th><th scope="col">Hits / 2 per role</th></tr></thead>
              <tbody>{records.slice().reverse().map(row => <tr key={row.targetDate}><th scope="row">{row.targetDate}</th><td>{row.cutoffDate}</td><td>{row.priorDraws} / {row.windowDraws}</td><td className="supp-replay-pair">{row.actualSupp.join(" + ")}</td><td className="supp-replay-pair">{row.role[ledgerPolicy].supp.join(" + ")}</td><td>{row.role[ledgerPolicy].suppHits}</td><td>{row.portfolio ? <span className="supp-replay-pair">{pairs(row.portfolio[ledgerPolicy])}</span> : row.portfolioSkippedReason}</td><td>{row.portfolio ? row.portfolio[ledgerPolicy].map(outcome => outcome.suppHits).join(" / ") : "Not tested"}</td></tr>)}</tbody>
            </table></div>
          </details>
        </> : null}
        <details className="supp-replay-method"><summary>Fixed protocol and limitations</summary>
          <p>SPRA-1 starts after 60 prior draws and splits eligible targets chronologically: first 70% development, last 30% historical confirmation. The primary measure is mean supplementary-role hits; EP-1's four rows form one target, not four independent trials. Development selects one policy before confirmation is examined.</p>
          <p>All History includes a valid partial opening month. Monthly-stage evidence inside EP-1 retains its own baseline exclusions. Only valid real 6+2 Monday/Wednesday/Friday records qualify; malformed, simulated, off-schedule and duplicate/conflicting records are screened.</p>
          <p>Current Auto supps uses the fixed newest-N prior window and full prior-history tie-breaks. Pair blend and co-draw ordering use full prior history. Unresolved ties use ascending numerical order; absent evidence uses the highest two selected numbers and is recorded as a fallback. No window is shortened to break a tie.</p>
          <p>Exact random-role expectation enumerates all 28 ways to assign two supps within the same eight numbers. It is a mathematical reference against real outcomes, not simulated draw history. In the known-eight test this gives 0.5 mean supp hits and a 1/28 (3.57%) exact-pair rate.</p>
          <p>The conservative screening rule needs at least 60 later portfolio targets across six months, positive month-level paired difference ranges against current and random references, preserved exact-pair performance, no decline in main matches/prize rate, and no extra duplicate main rows. Difference ranges use a fixed 2.58 standard-error multiplier across monthly averages; they are approximate descriptive checks, not proof of predictive skill.</p>
          <p>The CSV has already been inspected during development: this is retrospective confirmation, not an untouched prospective test. Changing the window or seed after viewing results is exploratory. No report changes live settings, saved predictions or generation. Any future promotion requires fresh pre-draw shadow evidence and preservation of distinct playable main rows.</p>
        </details>
      </InlineCollapsibleCard>
    </div>
  );
};
