import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import {
  analyzeNumberGroupFrequencyAudit, NUMBER_GROUP_METHOD_LABELS, NUMBER_GROUP_SCALES,
  type NumberGroupComparison, type NumberGroupScale, type NumberGroupWindow,
} from "../lib/numberGroupFrequencyAudit";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import NumberGroupGeneratorReplayCard from "./NumberGroupGeneratorReplayCard";
import "./NumberGroupFrequencyAuditPanel.css";

const value = (n: number | null, digits = 3): string => n === null ? "n/a" : n.toFixed(digits);
const signed = (n: number | null, multiplier = 1, digits = 3): string => n === null ? "n/a" : `${n * multiplier > 0 ? "+" : ""}${(n * multiplier).toFixed(digits)}`;
const interval = (comparison: NumberGroupComparison, multiplier = 1): string => comparison.interval95
  ? `${signed(comparison.interval95[0], multiplier, multiplier === 1 ? 4 : 3)} to ${signed(comparison.interval95[1], multiplier, multiplier === 1 ? 4 : 3)}` : "n/a (<30 targets)";

function AuditTable({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="number-group-audit__scroll" tabIndex={0} role="region" aria-label={title}>
    <table><caption>{title}</caption>{children}</table>
  </div>;
}

export default function NumberGroupFrequencyAuditPanel({ history, today }: { history: readonly Draw[]; today: string }) {
  const [window, setWindow] = useState<NumberGroupWindow>("all");
  const [scale, setScale] = useState<NumberGroupScale>(9);
  const [exportStatus, setExportStatus] = useState("");
  const audit = useMemo(() => analyzeNumberGroupFrequencyAudit(history, { window, asOfDate: today }), [history, today, window]);
  const current = audit.current?.scales.find(row => row.scale === scale);
  const rows = audit.records.filter(row => row.scale === scale).reverse();
  const ignored = audit.ignored;
  const betterThanFair = (method: "group" | "blend") => audit.summaries.filter(summary => (summary.methods.find(row => row.method === method)?.fairGain.mean ?? 0) > 0).length;

  const exportAudit = () => {
    try {
      const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `windfall-${audit.modelVersion}-${today}.json`;
      anchor.click();
      globalThis.setTimeout(URL.revokeObjectURL.bind(URL, url), 1000);
      setExportStatus("Audit download requested: real source rows, settings and replay ledger included.");
    } catch {
      setExportStatus("The audit download could not be started. No data or settings were changed.");
    }
  };

  return <div className="number-group-audit">
    <div className="number-group-audit__status">
      <strong>Observe-only. No live generation influence.</strong>
      <span>{audit.modelVersion} | mains + supps | one frequency-recency evidence family</span>
    </div>
    <div className="number-group-audit__controls">
      <HigField id="number-group-training-window" label="Training window" help="Local to this audit; does not change WFMQYH.">
        <select value={window} onChange={event => setWindow(event.target.value === "all" ? "all" : Number(event.target.value) as NumberGroupWindow)}>
          <option value="all">All prior draws in each continuous segment</option>
          {[13, 36, 156].map(n => <option value={n} key={n}>Newest {n} prior draws (up to {n})</option>)}
        </select>
      </HigField>
      <HigField id="number-group-inspect-scale" label="Inspect grouping" help="Changes current estimates and audit rows only; all groupings are tested above them.">
        <select value={scale} onChange={event => setScale(Number(event.target.value) as NumberGroupScale)}>
          {NUMBER_GROUP_SCALES.map(n => <option value={n} key={n}>{n} groups of {45 / n} numbers</option>)}
        </select>
      </HigField>
      <HigButton size="compact" onClick={exportAudit}>Export audit JSON</HigButton>
      <InfoHelp label="How to read number-group audit gains">
        Positive gain means less forecast error than the named comparator; negative means more error. It is not a hit percentage or a winning chance. No method is automatically adopted. Current group estimates are fractional averages, not instructions to pick fractional numbers.
      </InfoHelp>
    </div>
    {exportStatus && <p role="status">{exportStatus}</p>}
    <p className="number-group-audit__scope" aria-live="polite">
      {audit.baseline.length} baseline draws from {audit.validDraws} validated real draws. {audit.targets} replay targets
      {audit.firstTarget ? `: ${audit.firstTarget} to ${audit.lastTarget}` : ": none yet"}.
      {audit.excludedMonths.length ? ` Opening partial month excluded: ${audit.excludedMonths.join(", ")} (${ignored.openingMonthRows} rows).` : " No opening partial month excluded."}
    </p>
    <p className="number-group-audit__scope">Fixed model: 100 prior draws before the first test; neutral-pull strength 30; blend 50/50. Every grouping uses the same target dates. Forecast-score baselines are exact, not sampled; the separate generator replay below uses labelled comparison rows and real outcomes only.</p>
    {audit.targets > 0 && <p><strong>Current replay:</strong> Group-only forecasts have lower average number-level error than equal chance in {betterThanFair("group")}/4 groupings; blends in {betterThanFair("blend")}/4. These are related historical comparisons, not independent wins or proof of a predictive advantage.</p>}
    {(ignored.simulated + ignored.malformed + ignored.offSchedule + ignored.future + ignored.ambiguousDateRows + ignored.gapResets > 0) && <p className="number-group-audit__notice">
      Ignored rows: simulated {ignored.simulated}, malformed {ignored.malformed}, off-schedule {ignored.offSchedule}, future {ignored.future}, ambiguous-date {ignored.ambiguousDateRows}.
      {` Missing scheduled draws restarted the 100-draw warm-up ${ignored.gapResets} times. ${ignored.warmupRows} baseline rows are warm-up, not test targets.`}
    </p>}
    {!audit.targets && <p role="status">Not enough continuous real history: 100 prior baseline draws and a subsequent target are required. Results are unavailable; no fallback evidence was substituted.</p>}

    <section aria-labelledby="number-group-test-one">
      <h3 id="number-group-test-one">1. Do strong or quiet groups persist?</h3>
      <p>Strong means the most prior hits; quiet means the fewest. Exact ties stay together. Fair hits account for the actual size of that tied pool. Excess is the per-number appearance-rate difference from 8/45, not a next-draw probability.</p>
      <AuditTable title="Strong and quiet group response">
        <thead><tr><th scope="col">Grouping</th><th scope="col">Prior side</th><th scope="col">Trials</th><th scope="col">Actual hits / draw</th><th scope="col">Fair hits / draw</th><th scope="col">Excess (pp)</th></tr></thead>
        <tbody>{audit.summaries.flatMap(summary => (["high", "quiet"] as const).map(side => <tr key={`${summary.scale}-${side}`}>
          <th scope="row">{summary.scale} x {summary.size}</th><td>{side === "high" ? "Strong" : "Quiet"}</td>
          <td>{summary[side].informativeTrials}</td><td>{value(summary[side].hitsPerDraw)}</td><td>{value(summary[side].fairHitsPerDraw)}</td><td>{signed(summary[side].excessPP)}</td>
        </tr>))}</tbody>
      </AuditTable>
      <p className="number-group-audit__scope">All-group ties are uninformative and excluded from this table only. Positive excess on the strong side is persistence; positive excess on the quiet side is reversal. Neither establishes a dependable pattern on its own.</p>
    </section>

    <section aria-labelledby="number-group-test-two">
      <h3 id="number-group-test-two">2. Does group frequency improve composition estimates?</h3>
      <p>Before every target, forecast how its eight numbers will be divided among the groups. Compare squared count error with the equal-chance estimate of 8 / group count. Lower error is better; positive gain is better.</p>
      <AuditTable title="Next-draw composition accuracy">
        <thead><tr><th scope="col">Grouping</th><th scope="col">Trials</th><th scope="col">Neutral error</th><th scope="col">Group error</th><th scope="col">Gain</th><th scope="col">Earlier gain</th><th scope="col">Later gain</th><th scope="col">Approx. 95% interval</th></tr></thead>
        <tbody>{audit.summaries.map(summary => <tr key={summary.scale}>
          <th scope="row">{summary.scale} x {summary.size}</th><td>{summary.trials}</td><td>{value(summary.neutralCompositionLoss)}</td><td>{value(summary.groupCompositionLoss)}</td>
          <td>{signed(summary.compositionGain.mean)}</td><td>{signed(summary.compositionGain.earlierMean)}</td><td>{signed(summary.compositionGain.laterMean)}</td><td>{interval(summary.compositionGain)}</td>
        </tr>)}</tbody>
      </AuditTable>
      <p className="number-group-audit__scope">Compare models within a row, not raw count errors between different groupings. Earlier / later are chronological sensitivity halves ({audit.earlierTargets} / {audit.laterTargets} targets), not an untouched holdout.</p>
    </section>

    <section aria-labelledby="number-group-test-three">
      <h3 id="number-group-test-three">3. Does grouping add anything beyond individual frequency?</h3>
      <p>Score all 45 number-appearance estimates against the next real draw. Brier loss x 1,000 is lower-is-better error, not a percentage. A blend must improve on individual frequency, not merely look better than a weak alternative.</p>
      <AuditTable title="Number-level forecast comparison">
        <thead><tr><th scope="col">Grouping</th><th scope="col">Method</th><th scope="col">Brier x 1,000</th><th scope="col">Gain vs fair</th><th scope="col">Gain vs individual</th><th scope="col">Earlier vs individual</th><th scope="col">Later vs individual</th><th scope="col">95% interval vs individual</th></tr></thead>
        <tbody>{audit.summaries.flatMap(summary => summary.methods.map(method => <tr key={`${summary.scale}-${method.method}`}>
          <th scope="row">{summary.scale} x {summary.size}</th><td>{NUMBER_GROUP_METHOD_LABELS[method.method]}</td><td>{value(method.loss === null ? null : method.loss * 1000)}</td>
          <td>{signed(method.fairGain.mean, 1000)}</td><td>{signed(method.individualGain.mean, 1000)}</td><td>{signed(method.individualGain.earlierMean, 1000)}</td><td>{signed(method.individualGain.laterMean, 1000)}</td><td>{interval(method.individualGain, 1000)}</td>
        </tr>))}</tbody>
      </AuditTable>
      <p className="number-group-audit__scope">Gains and intervals use the same x 1,000 loss units. Displayed values are rounded; the export retains unrounded values. The stronger-neutral-pull individual control helps distinguish a grouping benefit from ordinary smoothing. Baseline and individual rows repeat across groupings because they are shared controls, not additional trials.</p>
    </section>

    <NumberGroupGeneratorReplayCard history={history} audit={audit} />

    <details className="number-group-audit__details">
      <summary>Current group estimates and raw OGA audit rows</summary>
      {audit.current && current ? <>
        <p>Next scheduled target after latest recorded: <strong>{audit.current.date}</strong>. Training: {audit.current.trainingFrom} to {audit.current.trainingThrough} ({audit.current.trainingDraws} draws).</p>
        {audit.current.date <= today && <p className="number-group-audit__notice">This target date has already arrived. Update history before interpreting these as current estimates.</p>}
        <AuditTable title="Current group count estimates">
          <thead><tr><th scope="col">Number range</th><th scope="col">Prior actual hits</th><th scope="col">Prior hits / draw</th><th scope="col">Neutral estimate</th><th scope="col">Group estimate</th></tr></thead>
          <tbody>{current.ranges.map(([first, last], index) => <tr key={first}>
            <th scope="row">{first}-{last}</th><td>{current.observedCounts[index]}</td><td>{value(current.observedCounts[index] / audit.current!.trainingDraws)}</td><td>{value(8 / scale)}</td><td>{value(current.predictedCounts[index])}</td>
          </tr>)}</tbody>
        </AuditTable>
        <p className="number-group-audit__scope">Unrounded group estimates total eight. Decimals are expected counts, not recorded balls or a required candidate recipe. No individual numbers or supps are recommended.</p>
      </> : <p>Current estimates unavailable until 100 continuous baseline draws are recorded.</p>}
      <p>Raw OGA is the unchanged historical number-group score. Its fair mean is calculated exactly from the same prior counts. A lower raw score favours historically common groups; it is not an accuracy measure and cannot be directly compared across groupings.</p>
      <AuditTable title="Latest number-group audit rows">
        <thead><tr><th scope="col">Target</th><th scope="col">Training through / N</th><th scope="col">Actual mains | supps</th><th scope="col">Raw OGA / fair mean</th><th scope="col">Strong hits / fair</th><th scope="col">Quiet hits / fair</th><th scope="col">Individual loss</th><th scope="col">Group loss</th><th scope="col">Blend loss</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.date}>
          <th scope="row">{row.date}<small>D{row.ordinal} / {row.monthLength}D</small></th><td>{row.trainingThrough}<small>{row.trainingDraws} draws</small></td>
          <td className="number-group-audit__numbers"><span className="number-group-audit__mains">{row.actual.main.join(", ")}</span><span> | </span><span className="number-group-audit__supps">{row.actual.supp.join(", ")}</span></td>
          <td>{value(row.rawOga)} / {value(row.fairOgaMean)}</td><td>{row.high.hits} / {value(row.high.expected)}</td><td>{row.quiet.hits} / {value(row.quiet.expected)}</td>
          <td>{value(row.losses.individual * 1000)}</td><td>{value(row.losses.group * 1000)}</td><td>{value(row.losses.blend * 1000)}</td>
        </tr>)}</tbody>
      </AuditTable>
      <p className="number-group-audit__scope">Latest first. Losses use Brier x 1,000. Export includes exact tied-group indices, actual and estimated group counts, training bounds, model version and validated source rows.</p>
    </details>

    <details className="number-group-audit__details">
      <summary>Method, formulas and limitations</summary>
      <p>Groupings divide 1-45 into contiguous, non-overlapping equal ranges: 3 groups of 15, 5 of 9, 9 of 5, or 15 of 3. These are number ranges, not terminal-digit families, calendar months or monthly frequency buckets.</p>
      <p>For each target, only earlier validated real draws enter training. Simulated, malformed, off-schedule and future rows are excluded. All duplicate-date rows are excluded as ambiguous. The opening partial month follows policy {audit.baselinePolicy}. A missing scheduled draw restarts the 100-draw warm-up; expanding training never bridges that gap. Eligibility does not mean independently verified against official results.</p>
      <p>Let n be training draws, K numbers per group, h an individual hit count, H a group hit count, and p0 = 8/45. Individual estimate = (h + 30 x p0) / (n + 30). Group estimate per number = (H/K + 30 x p0) / (n + 30). Multiply by K for a group count. The blend averages individual and group estimates. The stronger-pull control uses 60 instead of 30. These are model assumptions to test, not calibrated probabilities; 30 and 60 add no historical observations. All models' 45 estimates sum to eight.</p>
      <p>Brier loss is the mean of (estimate - actual appearance)^2 across 45 numbers. Composition error is the mean squared count error across the groups. Fair benchmarks are exact expectations under a uniform 8-from-45 draw, not simulated draws. Raw OGA = sum of actual group counts / (prior average group count + 0.001); its fair mean replaces actual counts with 8 / group count.</p>
      <p>Intervals require at least 30 target draws and use an approximate draw-level Newey-West mean interval with six lags. They account for some serial dependence, not all uncertainty, and are not adjusted for the many comparisons or window choices. Earlier/later halves are retrospective checks, not independent confirmation. No automatic winner, calibrated prediction claim, generation boost or learned adoption follows from this audit. Fresh real draws extend the same fixed replay; changing a setting starts a different exploratory comparison.</p>
      <p>The four groupings and individual-frequency controls belong to one frequency-recency evidence family. They must not be counted as several independent consensus signals.</p>
    </details>
  </div>;
}
