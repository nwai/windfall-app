import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import type { NumberGroupAudit, NumberGroupComparison } from "../lib/numberGroupFrequencyAudit";
import {
  NUMBER_GROUP_GENERATOR_PROTOCOL, numberGroupReplaySourceKey, summarizeNumberGroupGeneratorReplay,
  type NumberGroupGeneratorReplayResult, type NumberGroupReplayArm, type NumberGroupReplayScenario,
} from "../lib/numberGroupGeneratorReplay";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";

const decimal = (n: number | null) => n === null ? "n/a" : n.toFixed(3);
const signed = (n: number | null) => {
  if (n === null) return "n/a";
  const rounded = Number(n.toFixed(3));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(3)}`;
};
const interval = (comparison: NumberGroupComparison, scale = 1) => comparison.interval95
  ? `${signed(comparison.interval95[0] * scale)} to ${signed(comparison.interval95[1] * scale)}` : "n/a (<30 complete targets)";

function ReplayTable({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="number-group-audit__scroll" tabIndex={0} role="region" aria-label={title}>
    <table><caption>{title}</caption>{children}</table>
  </div>;
}

export default function NumberGroupGeneratorReplayCard({ history, audit }: { history: readonly Draw[]; audit: NumberGroupAudit }) {
  const [scenario, setScenario] = useState<NumberGroupReplayScenario>("isolated");
  const [result, setResult] = useState<NumberGroupGeneratorReplayResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [inspectDate, setInspectDate] = useState<string | null>(null);
  const [inspectArm, setInspectArm] = useState<NumberGroupReplayArm>("On");
  const worker = useRef<Worker | null>(null);
  const sourceKey = useMemo(() => numberGroupReplaySourceKey(audit), [audit]);
  const summary = useMemo(() => result ? summarizeNumberGroupGeneratorReplay(result.records) : null, [result]);
  const stale = !!result && (result.sourceKey !== sourceKey || result.options.scenario !== scenario);
  const inspected = result?.records.find(row => row.date === inspectDate);
  const current = audit.current?.scales.find(row => row.scale === 15);
  useEffect(() => () => worker.current?.terminate(), []);

  const run = () => {
    if (!audit.targets || running) return;
    setRunning(true); setResult(null); setInspectDate(null); setMessage(""); setProgress({ done: 0, total: audit.targets });
    try {
      const next = new Worker(new URL("../workers/numberGroupGeneratorReplayWorker.ts", import.meta.url), { type: "module" });
      worker.current = next;
      next.onmessage = (event: MessageEvent<{ progress?: typeof progress; result?: NumberGroupGeneratorReplayResult; error?: string }>) => {
        if (worker.current !== next) return;
        if (event.data.progress) { setProgress(event.data.progress); return; }
        if (event.data.result) {
          setResult(event.data.result); setInspectDate(event.data.result.records[event.data.result.records.length - 1]?.date ?? null);
          setMessage("Replay complete. Live generation and journal entries remain unchanged.");
        } else setMessage(event.data.error ?? "Replay failed. No live setting was changed.");
        setRunning(false); next.terminate(); worker.current = null;
      };
      next.onerror = () => {
        if (worker.current !== next) return;
        setMessage("The replay worker failed. No results were substituted and live settings remain unchanged.");
        setRunning(false); next.terminate(); worker.current = null;
      };
      next.postMessage({ history, options: { window: audit.config.window, asOfDate: audit.config.asOfDate, scenario } });
    } catch (error) {
      worker.current?.terminate(); worker.current = null; setRunning(false);
      setMessage(error instanceof Error ? error.message : "Unable to start replay. No results were substituted.");
    }
  };
  const cancel = () => {
    worker.current?.terminate(); worker.current = null; setRunning(false);
    setMessage("Replay cancelled; no partial results were presented as a completed comparison. Live settings remain unchanged.");
  };
  const exportResult = () => {
    if (!result) return;
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `windfall-${result.protocol.version}-${result.options.scenario}-${result.options.asOfDate}.json`;
      anchor.click(); globalThis.setTimeout(URL.revokeObjectURL.bind(URL, url), 1000);
      setMessage("Replay download requested. Includes all seeds, generated rows, real outcomes, weights, source data and settings.");
    } catch { setMessage("The replay download could not be started. Retained results are unchanged."); }
  };

  return <details className="number-group-audit__details number-group-generator-replay">
    <summary>Paired generator replay: NGFA 15-group weighting Off / On</summary>
    <p><strong>Research only. No live boost toggle is enabled.</strong> Runs the production generator with fixed settings. Test rows are generated, unplayed comparison candidates; outcomes come only from real recorded draws. This does not reconstruct past user settings or create journal predictions.</p>
    <div className="number-group-audit__controls">
      <HigField id="number-group-replay-scenario" label="Replay scenario" help="Local to this experiment; no current live controls are imported.">
        <select value={scenario} disabled={running} onChange={event => setScenario(event.target.value as NumberGroupReplayScenario)}>
          <option value="isolated">Isolated: all other weights and filters Off</option>
          <option value="composition">Fixed stress: 4:4 odd/even; last-draw maximum 2</option>
        </select>
      </HigField>
      <HigButton size="compact" onClick={run} disabled={running || !audit.targets}>{running ? `Replaying ${progress.done}/${progress.total}` : "Run paired generator replay"}</HigButton>
      {running && <HigButton size="compact" onClick={cancel}>Cancel replay</HigButton>}
      <InfoHelp label="How the paired generator experiment works">
        {NUMBER_GROUP_GENERATOR_PROTOCOL.version}: always 15 groups of three numbers, independent of Inspect grouping above. Training follows the local audit window. Each target uses fixed seeds 0, 1, 17, 42, mixed with its date, and 25 rows per seed per arm. Off uses neutral 1x weights; On uses group appearance estimate / (8/45), identically for all three group members. Overgen is 1 and each seed has a 2,500-attempt budget. There is no seed selection, outcome-tuned strength, survivor ranking or automatic adoption.
      </InfoHelp>
    </div>
    <p className="number-group-audit__scope">{audit.targets} eligible targets | 100 rows requested per arm per target | fixed seeds {NUMBER_GROUP_GENERATOR_PROTOCOL.seeds.join(", ")} | NGFA-GR1 | same history, seed schedule and hard gates in both arms.</p>
    <p className="number-group-audit__scope">The stress scenario requires exactly four odd and four even numbers across all eight, and at most two matches to the immediately preceding draw. GPWF, Lambda, Numbers diagnostic, drought, neighbour, monthly, digit and other boosts stay Off in both scenarios. Forced inclusions/exclusions are empty. It tests fixed production construction, not the complete live post-generation ranking pipeline.</p>
    {!audit.targets && <p>No replay targets yet. No fabricated results or fallback draw history are used.</p>}
    {message && <p role="status">{message}</p>}
    {stale && <p role="alert" className="number-group-audit__notice">History, training window or scenario changed. Retained results below belong to the earlier source/settings; run again for a current comparison. Export preserves their original settings.</p>}
    {result && summary && <>
      <p><strong>{summary.completeTargets} complete paired targets</strong> of {summary.targets}; {summary.incompleteTargets} incomplete pairs. Historical dates: {result.records[0]?.date ?? "none"} to {result.records[result.records.length - 1]?.date ?? "none"}. Completed results: {result.options.scenario === "isolated" ? "isolated scenario" : "fixed composition stress"}; training {result.options.window === "all" ? "all prior draws in each continuous segment" : `newest ${result.options.window} prior draws`}.</p>
      <p><strong>Primary comparison:</strong> {summary.mainDifference.interval95
        ? summary.mainDifference.interval95[0] <= 0 && summary.mainDifference.interval95[1] >= 0
          ? "The main-hit difference interval includes zero; this replay does not distinguish an advantage from a disadvantage."
          : `The main-hit difference interval is ${summary.mainDifference.mean! > 0 ? "above" : "below"} zero. This is an exploratory result, not independent validation or permission for automatic adoption.`
        : "Fewer than 30 complete targets: no difference interval is available."}</p>
      <ReplayTable title="Generator comparison: complete paired targets only">
        <thead><tr><th scope="col">Arm</th><th scope="col">Generated rows</th><th scope="col">Six-main hits / row</th><th scope="col">Eight-number overlap / row</th><th scope="col">Six-main prize rows</th><th scope="col">Prize share</th><th scope="col">Mean union / seed</th><th scope="col">Pair overlap / seed</th></tr></thead>
        <tbody>{summary.pairedArms.map(({ arm, metrics }) => <tr key={arm}>
          <th scope="row">{arm === "Off" ? "Off: neutral weights" : "On: 15-group weights"}</th><td>{metrics.rows}</td><td>{decimal(metrics.mainHits)}</td><td>{decimal(metrics.eightHits)}</td><td>{metrics.prizeRows}</td><td>{metrics.prizeRate === null ? "n/a" : `${(metrics.prizeRate * 100).toFixed(2)}%`}</td><td>{decimal(metrics.unionSize)}</td><td>{decimal(metrics.meanPairOverlap)}</td>
        </tr>)}</tbody>
      </ReplayTable>
      <p className="number-group-audit__scope">A playable ticket is the six main numbers. Generated supps do not count toward the prize column; eight-number overlap is separate diagnostic coverage, not a six-number ticket prize. Fair independent-draw references: 0.800 main hits and 1.422 eight-number hits per row. Union is distinct numbers across each 25-row seed batch; pair overlap is shared numbers across pairs of eight-number candidates.</p>
      <ReplayTable title="Paired differences: On minus Off">
        <thead><tr><th scope="col">Measure</th><th scope="col">Mean difference</th><th scope="col">Earlier half</th><th scope="col">Later half</th><th scope="col">Approx. 95% interval</th></tr></thead>
        <tbody>{[
          { label: "Six-main hits / row (primary)", comparison: summary.mainDifference, scale: 1 },
          { label: "Eight-number overlap / row", comparison: summary.eightDifference, scale: 1 },
          { label: "Six-main prize share (pp)", comparison: summary.prizeDifference, scale: 100 },
          { label: "Pair overlap (diversity diagnostic)", comparison: summary.overlapDifference, scale: 1 },
        ].map(({ label, comparison, scale }) => <tr key={label}><th scope="row">{label}</th><td>{signed(comparison.mean === null ? null : comparison.mean * scale)}</td><td>{signed(comparison.earlierMean === null ? null : comparison.earlierMean * scale)}</td><td>{signed(comparison.laterMean === null ? null : comparison.laterMean * scale)}</td><td>{interval(comparison, scale)}</td></tr>)}</tbody>
      </ReplayTable>
      <p className="number-group-audit__scope">Positive hit/prize differences favour On; higher pair overlap means less diversity, not better prediction. Displayed values are rounded; differences use unrounded values and the export retains them. Each real target contributes one seed-averaged difference. Seeds and rows are not extra independent draw trials. Intervals use the audit's approximate six-lag method, need 30 complete pairs, and are exploratory and unadjusted. Earlier/later are retrospective sensitivity halves, not untouched confirmation. No winner is adopted.</p>
      <ReplayTable title="Generation completion: all eligible targets">
        <thead><tr><th scope="col">Arm</th><th scope="col">Produced</th><th scope="col">Requested</th><th scope="col">Missing rows</th><th scope="col">Attempts used</th></tr></thead>
        <tbody>{summary.arms.map(({ arm, metrics }) => <tr key={arm}><th scope="row">{arm}</th><td>{metrics.rows}</td><td>{summary.targets * 100}</td><td>{metrics.shortfall}</td><td>{metrics.attempts}</td></tr>)}</tbody>
      </ReplayTable>
      <p className="number-group-audit__scope">An incomplete pair is withheld from paired performance, not hidden: every generated row, shortfall, warning and rejection count remains in the ledger/export. No failed run is replaced by a new seed or a relaxed rule.</p>
      <div className="number-group-audit__controls"><HigButton size="compact" onClick={exportResult}>Export generator replay JSON</HigButton>
        <HigField id="number-group-replay-inspect-arm" label="Inspect arm (results only)"><select value={inspectArm} onChange={event => setInspectArm(event.target.value as NumberGroupReplayArm)}><option value="Off">Off: neutral</option><option value="On">On: 15-group weights</option></select></HigField>
      </div>
      <ReplayTable title="Generator target ledger: latest first">
        <thead><tr><th scope="col">Target</th><th scope="col">Training through / N</th><th scope="col">Off main hits</th><th scope="col">On main hits</th><th scope="col">Paired status</th><th scope="col">Inspect</th></tr></thead>
        <tbody>{result.records.slice().reverse().map(row => <tr key={row.date}><th scope="row">{row.date}<small>D{row.ordinal} / {row.monthLength}D</small></th><td>{row.trainingThrough}<small>{row.trainingDraws} draws</small></td><td>{decimal(row.metrics.Off.mainHits)}</td><td>{decimal(row.metrics.On.mainHits)}</td><td>{row.completePair ? "Complete" : "Incomplete"}</td><td><HigButton size="compact" aria-expanded={inspectDate === row.date} onClick={() => setInspectDate(inspectDate === row.date ? null : row.date)}>{inspectDate === row.date ? "Close rows" : "Inspect rows"}</HigButton></td></tr>)}</tbody>
      </ReplayTable>
      {inspected && <div className="number-group-audit__replay-inspect" aria-label="Inspected generator replay target">
        <p><strong>Real outcome {inspected.date}:</strong> mains <span className="number-group-audit__mains">{inspected.actual.main.join(", ")}</span>; supps <span className="number-group-audit__supps">{inspected.actual.supp.join(", ")}</span>. Training {inspected.trainingFrom} to {inspected.trainingThrough}. Generated rows below are unplayed comparisons.</p>
        <ReplayTable title={`Generated ${inspectArm} rows for ${inspected.date}`}>
          <thead><tr><th scope="col">Seed / row</th><th scope="col">Six main numbers</th><th scope="col">Two supplementary numbers</th><th scope="col">Ticket main / supp hits</th><th scope="col">Eight hits</th><th scope="col">Six-main prize</th></tr></thead>
          <tbody>{inspected.seeds.flatMap(seed => seed.arms[inspectArm].rows.map((row, index) => <tr key={`${seed.seed}-${index}`}><th scope="row">{seed.seed} / {index + 1}</th><td className="number-group-audit__mains">{row.main.join(", ")}</td><td className="number-group-audit__supps">{row.supp.join(", ")}</td><td>{row.mainHits} / {row.ticketSuppHits}</td><td>{row.eightHits}</td><td>{row.division}</td></tr>))}</tbody>
        </ReplayTable>
        <details className="number-group-audit__details"><summary>Trace and exact group multipliers for {inspected.date}</summary>
          <p>Off = 1x for all 45 numbers. On uses the following factors for both mains and supp construction. The trace shows the first fixed seed; all seeds share these factors. Effects occur before row-specific normalisation and filtering, not as promised final frequencies.</p>
          <ReplayTable title={`On sampling weights for ${inspected.date}`}><thead><tr><th scope="col">Group numbers</th><th scope="col">Multiplier per number</th></tr></thead><tbody>{Array.from({ length: 15 }, (_, i) => <tr key={i}><th scope="row">{i * 3 + 1}, {i * 3 + 2}, {i * 3 + 3}</th><td>{inspected.numberMultipliers[i * 3 + 1].toFixed(6)}x</td></tr>)}</tbody></ReplayTable>
          <pre className="number-group-audit__trace">{inspected.trace[inspectArm].join("\n")}</pre>
          {inspected.seeds.map(seed => seed.arms[inspectArm].warning ? <p className="number-group-audit__notice" key={seed.seed}>Seed {seed.seed}: {seed.arms[inspectArm].warning}</p> : null)}
        </details>
      </div>}
    </>}
    <details className="number-group-audit__details"><summary>Current 15-group sampling preview (not applied)</summary>
      {current && audit.current ? <><p>Target after latest recorded: {audit.current.date}; training {audit.current.trainingFrom} to {audit.current.trainingThrough} ({audit.current.trainingDraws} draws). These are current local-scope estimates, not the retained replay's weights.</p>
        {audit.current.date <= audit.config.asOfDate && <p className="number-group-audit__notice">This target date has already arrived. Update history before interpreting this preview as current.</p>}
        <ReplayTable title="Current experimental 15-group multipliers"><thead><tr><th scope="col">Numbers</th><th scope="col">Off</th><th scope="col">On preview</th></tr></thead><tbody>{current.ranges.map(([first, last], i) => <tr key={first}><th scope="row">{first}-{last}</th><td>1.000x</td><td>{(current.predictedCounts[i] / (8 / 15)).toFixed(6)}x</td></tr>)}</tbody></ReplayTable></> : <p>Unavailable until 100 continuous baseline draws exist. No weights are applied.</p>}
    </details>
  </details>;
}
