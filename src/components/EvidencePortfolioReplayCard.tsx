import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import { portfolioHistoryFingerprint, preparePortfolioHistory } from "../lib/evidencePortfolio";
import { PORTFOLIO_REPLAY_PROTOCOL, summarizePortfolioRemovals, summarizePortfolioReplay, type PortfolioReplayResult } from "../lib/evidencePortfolioReplay";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";

const decimal = (value: number) => value.toFixed(3);
const signed = (value: number) => `${value > 0 ? "+" : ""}${decimal(value)}`;

export const EvidencePortfolioReplayCard: React.FC<{ history: Draw[]; activeDrawCount: number }> = ({ history, activeDrawCount }) => {
  const prepared = useMemo(() => preparePortfolioHistory(history).draws, [history]);
  const [expanding, setExpanding] = useState(activeDrawCount === prepared.length);
  const [windowDraws, setWindowDraws] = useState(Math.max(1, activeDrawCount));
  const [result, setResult] = useState<PortfolioReplayResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<"development" | "confirmation">("confirmation");
  const [inspectDate, setInspectDate] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const fingerprint = useMemo(() => portfolioHistoryFingerprint(prepared), [prepared]);
  const windowSize = expanding ? 0 : windowDraws;
  const validWindow = Number.isInteger(windowSize) && windowSize <= 10000 && (expanding || windowSize >= 1);
  const stale = Boolean(result && (result.sourceFingerprint !== fingerprint || result.windowSize !== windowSize));
  useEffect(() => () => worker.current?.terminate(), []);
  const records = useMemo(() => result?.records.filter(record => record.phase === phase) ?? [], [result, phase]);
  const summaries = useMemo(() => summarizePortfolioReplay(records), [records]);
  const removals = useMemo(() => summarizePortfolioRemovals(records), [records]);
  const inspected = records.find(record => record.targetDate === inspectDate);

  const run = () => {
    if (!validWindow) return;
    setRunning(true); setResult(null); setInspectDate(null); setMessage(""); setProgress({ done: 0, total: 0 });
    try {
      const next = new Worker(new URL("../workers/evidencePortfolioReplayWorker.ts", import.meta.url), { type: "module" });
      worker.current = next;
      next.onmessage = (event: MessageEvent<{ progress?: typeof progress; result?: PortfolioReplayResult; error?: string }>) => {
        if (worker.current !== next) return;
        if (event.data.progress) { setProgress(event.data.progress); return; }
        if (event.data.result) { setResult(event.data.result); setMessage("Replay complete. EP-1 and generation settings remain unchanged."); }
        else setMessage(event.data.error ?? "Replay failed. No model was adopted.");
        setRunning(false); next.terminate(); worker.current = null;
      };
      next.onerror = () => { if (worker.current !== next) return; setMessage("Replay worker failed. No model was adopted."); setRunning(false); next.terminate(); worker.current = null; };
      next.postMessage({ history, windowSize });
    } catch (error) { worker.current?.terminate(); worker.current = null; setRunning(false); setMessage(error instanceof Error ? error.message : "Unable to start replay."); }
  };
  const exportResult = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "windfall-evidence-portfolio-replay.json";
    link.click(); URL.revokeObjectURL(url); setMessage("Exported the complete replay ledger, including every fixed seed and skipped target.");
  };
  return <details className="ep-replay">
    <summary>Portfolio comparison replay · EP-1 / EP-R1 / uniform controls</summary>
    <p>Observe-only · six-main ticket evaluation · no automatic adoption. Historical outcomes come only from real, valid, scheduled CSV draws. Generated comparison rows are not games known to have been played.</p>
    <div className="ep-actions">
      <HigField id="ep-replay-scope" label="Replay evidence window"><select value={expanding ? "expanding" : "fixed"} disabled={running} onChange={event => setExpanding(event.target.value === "expanding")}><option value="fixed">Fixed newest draws</option><option value="expanding">All prior real history</option></select></HigField>
      {!expanding ? <HigField id="ep-replay-window" label="Newest draws per target"><input type="number" min={1} max={10000} step={1} value={windowDraws} disabled={running} onChange={event => setWindowDraws(Number(event.target.value))} /></HigField> : null}
      <HigButton onClick={run} disabled={running || prepared.length <= Math.max(60, windowSize) || !validWindow}>{running ? `Replaying ${progress.done}/${progress.total || "…"}` : "Run fixed replay"}</HigButton>
      {running ? <HigButton onClick={() => { worker.current?.terminate(); worker.current = null; setRunning(false); setMessage("Replay cancelled. No model or journal entry was changed."); }}>Cancel replay</HigButton> : null}
      <InfoHelp label="Portfolio replay protocol">Fixed seeds {PORTFOLIO_REPLAY_PROTOCOL.seeds.join(", ")}; at least 60 prior draws, and the complete requested fixed window. Earlier 70% of eligible targets is development, later 30% is confirmation. Every historical target uses only preceding real history. All seeds contribute equally; no best seed is selected. Live inclusions, exclusions and other generation filters are not reconstructed or applied to this unconstrained comparison. Local replay settings do not change WFMQYH. This retrospective screen is not independent prospective validation.</InfoHelp>
    </div>
    <p className="ep-scope">{prepared.length} valid real draws · local {expanding ? "expanding prior-history scope" : `newest ${windowDraws} draws per target`} · fixed seeds {PORTFOLIO_REPLAY_PROTOCOL.seeds.join(", ")}.</p>
    {!validWindow ? <p role="alert" className="ep-notice">A fixed window needs a whole number from 1 to 10000. Choose All prior real history for an expanding window.</p> : null}
    {prepared.length <= Math.max(60, windowSize) ? <p className="ep-notice">Not enough draws remain after training. Use a shorter local fixed window or all prior real history.</p> : null}
    {message ? <p role="status" className="ep-notice">{message}</p> : null}
    {stale ? <p role="alert" className="ep-notice">History or local scope changed. These are the retained old results, not a current replay.</p> : null}
    {result ? <>
      <p><b>{result.gate.status === "forward-watch-only" ? "Prospective shadow watch only" : result.gate.status === "insufficient" ? "Insufficient confirmation evidence" : "No stable challenger advantage"}</b></p>
      {result.gate.reasons.map(reason => <p key={reason}>{reason}</p>)}
      <div className="ep-actions"><HigField id="ep-replay-block" label="Results block"><select value={phase} onChange={event => { setPhase(event.target.value as typeof phase); setInspectDate(null); }}><option value="development">Earlier development targets</option><option value="confirmation">Later confirmation targets</option></select></HigField><HigButton onClick={exportResult}>Export replay JSON</HigButton></div>
      <p className="ep-scope">{records.length} distinct targets · {records[0]?.targetDate ?? "none"} to {records[records.length - 1]?.targetDate ?? "none"}. Seeds and rows are not independent target draws. Neutral expectations: 0.800 main hits; 1.422 eight-number hits; 0.089 supplementary-role hits.</p>
      <div className="ep-table-scroll"><table><thead><tr><th>Model</th><th>Six-main hits</th><th>8-number hits</th><th>Supp-role hits</th><th>Six-main prize rows</th><th>Union hits / random</th><th>Union size</th><th>Pair overlap</th></tr></thead><tbody>{summaries.map(row => <tr key={row.model}><th>{row.model}</th><td>{row.metrics ? decimal(row.metrics.mainHits) : "No targets"}</td><td>{row.metrics ? decimal(row.metrics.eightHits) : "—"}</td><td>{row.metrics ? decimal(row.metrics.suppRoleHits) : "—"}</td><td>{row.metrics ? `${Math.round(row.metrics.prizeRate * row.metrics.rows)} / ${row.metrics.rows}` : "—"}</td><td>{row.metrics ? `${decimal(row.metrics.unionHits)} / ${decimal(row.metrics.unionSize * 8 / 45)}` : "—"}</td><td>{row.metrics ? decimal(row.metrics.unionSize) : "—"}</td><td>{row.metrics ? decimal(row.metrics.meanPairOverlap) : "—"}</td></tr>)}</tbody></table></div>
      <p className="ep-scope">Union random is the exact neutral reference, 8 × union size / 45. Broader portfolios naturally cover more drawn numbers; that alone is not predictive lift.</p>
      <details><summary>Family-removal comparisons</summary><p>Positive means more matches with the group than without it. This measures the whole selection pipeline, not independent or calibrated family accuracy.</p><div className="ep-table-scroll"><table><thead><tr><th>Model</th><th>Removed family</th><th>Targets</th><th>Main-hit difference</th><th>8-hit difference</th></tr></thead><tbody>{removals.map(row => <tr key={`${row.model}-${row.group}`}><th>{row.model}</th><td>{row.group}</td><td>{row.targets}</td><td>{signed(row.mainDifference)}</td><td>{signed(row.eightDifference)}</td></tr>)}</tbody></table></div></details>
      <details><summary>Target audit ledger · latest first</summary><div className="ep-table-scroll"><table><thead><tr><th>Target</th><th>Prior / window</th><th>EP-1 main hits</th><th>EP-R1 main hits</th><th>Control main hits</th><th>Inspect</th></tr></thead><tbody>{records.slice().reverse().map(record => <tr key={record.targetDate}><th>{record.targetDate}</th><td>{record.priorDraws} / {record.windowDraws}</td><td>{decimal(record.metrics["EP-1"].mainHits)}</td><td>{decimal(record.metrics["EP-R1"].mainHits)}</td><td>{decimal(record.metrics["Uniform controls"].mainHits)}</td><td><HigButton size="compact" onClick={() => setInspectDate(inspectDate === record.targetDate ? null : record.targetDate)} aria-expanded={inspectDate === record.targetDate}>{inspectDate === record.targetDate ? "Close rows" : "Inspect rows"}</HigButton></td></tr>)}</tbody></table></div>
        {inspected ? <><p>Actual {inspected.targetDate}: <span className="ep-numbers ep-numbers--main">{inspected.actualMain.join(", ")}</span> · supps <span className="ep-numbers ep-numbers--supp">{inspected.actualSupp.join(", ")}</span>. Cutoff {inspected.cutoffDate}.</p><div className="ep-table-scroll"><table><thead><tr><th>Seed / model / row</th><th>Six mains</th><th>Two supps</th><th>Ticket M / S</th><th>8 hits</th><th>Prize</th></tr></thead><tbody>{inspected.seeds.flatMap(seed => Object.entries(seed.models).flatMap(([model, data]) => data.rows.map((row, index) => <tr key={`${seed.seed}-${model}-${index}`}><th>{seed.seed} · {model} · {index + 1}</th><td><span className="ep-numbers ep-numbers--main">{row.main.join(", ")}</span></td><td><span className="ep-numbers ep-numbers--supp">{row.supp.join(", ")}</span></td><td>{row.mainHits} / {row.ticketSuppHits}</td><td>{row.eightHits}</td><td>{row.division}</td></tr>)))}</tbody></table></div></> : null}
      </details>
      {result.skipped.length ? <details><summary>Skipped targets · {result.skipped.length}</summary>{result.skipped.map(row => <p key={row.date}>{row.date}: {row.reason}</p>)}</details> : null}
      {result.warnings.map(warning => <p className="ep-notice" key={warning}>{warning}</p>)}
    </> : null}
  </details>;
};
