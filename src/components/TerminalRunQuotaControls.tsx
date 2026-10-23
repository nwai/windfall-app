import React, { useState } from "react";
import type { GeneratedCompositionSnapshot } from "../lib/generatedComposition";
import { HigButton, InfoHelp } from "./shared/HigControls";
import { buildTerminalRunQuotas, terminalRunSelectionError, terminalRunShares, type TerminalRunRuleOptions } from "../lib/terminalDigitRuns";
import { TERMINAL_RUN_ALLOCATION_LIMITS } from "../lib/terminalRunQuotas";
import { formatIsoDateAsMdyy } from "../lib/drawHistoryReview";
import "./TerminalRunQuotaControls.css";

interface Props {
  options: TerminalRunRuleOptions;
  sourceDraws: number;
  requested: number;
  bypassed: boolean;
  plannerManaged?: boolean;
  outputSnapshot?: GeneratedCompositionSnapshot | null;
  onChange: (options: Pick<TerminalRunRuleOptions, "enabled" | "mode" | "selectedRuns" | "allocationBasis">) => void;
  onAllObservedChange: (enabled: boolean) => void;
  shapeLink?: { enabled: boolean; active: boolean; matchingDraws: number; shapeCount: number; error: string | null; onChange: (enabled: boolean) => void };
}

export default function TerminalRunQuotaControls({ options, sourceDraws, requested, bypassed, plannerManaged, onChange, onAllObservedChange, shapeLink, outputSnapshot }: Props) {
  const [length, setLength] = useState("3");
  const [latestSort, setLatestSort] = useState<"ascending" | "descending" | null>(null);
  const selectedRunSet = new Set(options.selectedRuns);
  const rows = options.runOptions.filter((row) => length === "all" || row.digits.length === Number(length)).sort((a, b) => {
    const selectionOrder = Number(selectedRunSet.has(b.run)) - Number(selectedRunSet.has(a.run));
    if (selectionOrder) return selectionOrder;
    if (latestSort) {
      const left = a.latestOccurrence?.drawNumber ?? null, right = b.latestOccurrence?.drawNumber ?? null;
      if (left === null && right !== null) return 1;
      if (left !== null && right === null) return -1;
      if (left !== null && right !== null && left !== right) return latestSort === "ascending" ? left - right : right - left;
    }
    return b.count - a.count || a.run.localeCompare(b.run);
  });
  const shares = terminalRunShares(options), quotas = buildTerminalRunQuotas(requested, options), error = terminalRunSelectionError(options);
  const allObserved = !!options.useAllObservedRuns;
  const update = (change: Partial<Pick<TerminalRunRuleOptions, "enabled" | "mode" | "selectedRuns" | "allocationBasis">>) => onChange({ enabled: options.enabled, mode: options.mode, selectedRuns: options.selectedRuns, allocationBasis: options.allocationBasis ?? "history", ...change });
  const toggle = (run: string) => update({ selectedRuns: options.selectedRuns.includes(run)
    ? options.selectedRuns.filter((item) => item !== run) : [...options.selectedRuns, run] });
  return <section id="windfall-terminal-run-quotas" className="terminal-run-quotas" aria-labelledby="terminal-run-quota-heading" tabIndex={-1}>
    <div className="terminal-run-quotas__heading">
      <h3 id="terminal-run-quota-heading">Terminal Run Quotas</h3>
      <InfoHelp label="About exact terminal run quotas">
        Each run is maximal and circular: 2-3-4-5 is one run, never separate 2-3-4 and 3-4-5 counts. Exact 2-3-4 requires endings 2, 3 and 4, with endings 1 and 5 absent. Two runs need a missing ending between them; 9-0-1-2 wraps through zero.
        Occurrence % counts real WFMQYH draws containing that exact maximal run. Separate runs can occur together, so occurrence percentages need not total 100%.
        Selected Use rows stay at the top of the displayed run-length group and move back when deselected. This changes display order only, not selections, observations or allocations.
        Latest occurrence shows the most recent match within that same window. D is its chronological draw number in the full loaded real history, not its position within the month or WFMQYH window. A dash means no occurrence was observed in this window. Select its column heading to sort newest first, then select again to reverse within the selected and unselected groups; rows without a draw number stay last within each group.
        Use all observed runs selects every observed run across all lengths and allocates using real WFMQYH counts. Switching it off restores your manual selections, mode and allocation basis. It does not turn on run rules.
        Allocation % uses either relative WFMQYH counts or an explicit equal manual allocation. Equal selected runs lets you test unobserved runs without inventing observations: their Draws and Occurrence % stay zero. Each candidate receives one assigned run; incidental separate runs earn no extra allocation credit. Require all instead requires every selected exact run in each candidate. Neither mode predicts the winning sequence.
      </InfoHelp>
    </div>
    <div className="terminal-run-quotas__toolbar">
      {!plannerManaged && <label className="terminal-run-quotas__toggle"><input type="checkbox" checked={options.enabled} onChange={(event) => update({ enabled: event.target.checked })} />Use terminal run rules</label>}
      <label className="terminal-run-quotas__toggle"><input type="checkbox" checked={allObserved} onChange={(event) => onAllObservedChange(event.target.checked)} />Use all observed runs</label>
      {!plannerManaged && <label>Mode <select aria-label="Terminal run mode" value={options.mode} disabled={allObserved} onChange={(event) => update({ mode: event.target.value as TerminalRunRuleOptions["mode"] })}>
        <option value="allocation">Allocate across selected runs</option><option value="requireAll">Require all selected runs</option>
      </select></label>}
      {!plannerManaged && options.mode === "allocation" && <label>Allocation shares <select aria-label="Terminal run allocation shares" value={options.allocationBasis ?? "history"} disabled={allObserved}
        onChange={(event) => update({ allocationBasis: event.target.value as TerminalRunRuleOptions["allocationBasis"] })}>
        <option value="history">WFMQYH counts</option><option value="equal">Equal selected runs</option>
      </select></label>}
      <label>Run length <select aria-label="Terminal run length" value={length} onChange={(event) => setLength(event.target.value)}>
        <option value="all">All lengths</option>{[2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n} digits</option>)}
      </select></label>
      <HigButton size="compact" disabled={allObserved || !options.selectedRuns.length} onClick={() => update({ selectedRuns: [] })}>Clear</HigButton>
    </div>
    {shapeLink && <details>
      <summary style={{ minHeight: 44, display: "list-item", alignContent: "center", cursor: "pointer" }}>Historical run / shape linking</summary>
      <div className="terminal-run-quotas__link">
      <label className="terminal-run-quotas__toggle"><input type="checkbox" checked={shapeLink.enabled}
        onChange={(event) => shapeLink.onChange(event.target.checked)} />Link shapes to selected runs</label>
      <InfoHelp label="About linking shapes to selected runs">
        Turning on this link also turns on terminal run rules. While run rules are on, observed matching repetition shapes are selected automatically and shape quotas are on. Allocate mode uses real draws containing any selected exact run; Require all uses draws containing every selected exact run. Each matching draw is counted once, even when it contains several selected runs. Shape shares use this matching sample, not all draws in WFMQYH. These are historical associations, not predictions. No matching sample means generation needs attention; no fallback shapes are invented. Turn off the link or run rules to restore your independent shape switch and selections. Changing WFMQYH updates the linked evidence, not your saved independent choices. Existing quotas and hard filters remain enforced, so shortfalls are still possible.
      </InfoHelp>
      <div className="terminal-run-quotas__link-status" aria-live="polite">{!shapeLink.enabled
        ? "Independent shapes · Your repetition shape controls work separately."
        : !shapeLink.active ? "Link paused · Run rules are off; independent shape settings are restored."
        : shapeLink.error ? <><span role="alert">{shapeLink.error}.</span>{" "}<HigButton size="compact" onClick={() => shapeLink.onChange(false)}>Edit shapes independently</HigButton></>
        : `Linked to selected runs · ${shapeLink.shapeCount} shapes observed across ${shapeLink.matchingDraws} matching draws · each draw counted once.`}</div>
    </div></details>}
    <div className="terminal-run-quotas__scope">{sourceDraws} valid real WFMQYH draws · mains + supps · exact maximal runs only</div>
    <div className="terminal-run-quotas__scope" aria-live="polite">{allObserved
      ? `All observed runs · ${options.selectedRuns.length} selected across all lengths. WFMQYH changes update this selection; turn off to restore your manual choices.`
      : options.mode === "requireAll" ? "Manual selection · Every selected exact run is required; unobserved runs can be tested without claiming historical support."
      : options.allocationBasis === "equal" ? "Manual equal allocation · A user-defined testing plan, not historical support. Zero-observed runs keep zero observations."
      : "Manual selection · Allocation shares use real WFMQYH counts. Unobserved runs need Equal selected runs or Require all mode."}</div>
    {options.selectedRuns.length > 0 && <div className="terminal-run-quotas__selected" aria-label="Selected terminal runs">
      {options.selectedRuns.map((run) => <HigButton key={run} size="compact" variant="quiet" disabled={allObserved} aria-label={allObserved ? `Observed terminal run ${run}` : `Remove terminal run ${run}`} onClick={() => toggle(run)}>
        {run} <span aria-hidden="true">{"\u00d7"}</span>
      </HigButton>)}
    </div>}
    <div className="terminal-run-quotas__scroll" tabIndex={0} role="region" aria-label="Exact terminal run evidence and quotas">
      <table><thead><tr><th scope="col">Use</th><th scope="col">Exact run</th>
        <th scope="col" aria-sort={latestSort ?? "none"}><HigButton variant="quiet" size="compact" className="terminal-run-quotas__sort"
          aria-label="Sort latest occurrence by draw number" onClick={() => setLatestSort((previous) => previous === "descending" ? "ascending" : "descending")}>
          Latest occurrence <span aria-hidden="true">{latestSort === "descending" ? "\u2193" : latestSort === "ascending" ? "\u2191" : "\u2195"}</span>
        </HigButton></th>
        <th scope="col">Draws</th><th scope="col">Occurrence %</th><th scope="col">Exact random %</th><th scope="col">Allocation %</th><th scope="col">Candidate target</th>{outputSnapshot && <th scope="col">Last RwR45 rows</th>}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.run} data-selected={options.selectedRuns.includes(row.run)}>
          <td><label className="terminal-run-quotas__selection"><input type="checkbox" aria-label={`${row.run} exact terminal run`} checked={options.selectedRuns.includes(row.run)}
            disabled={allObserved} onChange={() => toggle(row.run)} /></label></td>
          <th scope="row">{row.run}{!row.count && <small>Not observed</small>}</th>
          <td>{row.latestOccurrence ? <>{row.latestOccurrence.drawNumber !== null && `D${row.latestOccurrence.drawNumber} \u00b7 `}<time dateTime={row.latestOccurrence.date}>{formatIsoDateAsMdyy(row.latestOccurrence.date)}</time></> : <span aria-label="Not observed in this WFMQYH window">{"\u2014"}</span>}</td>
          <td>{row.count}</td><td>{row.percent.toFixed(1)}%</td><td>{row.expectedPercent.toFixed(1)}%</td>
          <td>{bypassed || shares[row.run] === undefined ? "\u2014" : `${shares[row.run].toFixed(1)}%`}</td>
          <td>{!bypassed && options.enabled && options.selectedRuns.includes(row.run) && !error ? options.mode === "requireAll" ? `${requested}/${requested}` : `${quotas[row.run]}/${requested}` : "\u2014"}</td>
          {outputSnapshot && <td>{outputSnapshot.rows.length ? `${outputSnapshot.runCounts[row.run] ?? 0}/${outputSnapshot.rows.length}` : "\u2014"}</td>}
        </tr>)}</tbody>
      </table>
    </div>
    {outputSnapshot && <div className="terminal-run-quotas__scope">
      Last RwR45 actual runs (all lengths): {Object.entries(outputSnapshot.runCounts).map(([run, count]) => `${run}: ${count}/${outputSnapshot.rows.length} rows`).join("; ") || "None"}.
      {" "}Counts can overlap. {outputSnapshot.context}. Observed output only; selections unchanged.
    </div>}
    <div className="terminal-run-quotas__status" aria-live="polite">
      {bypassed ? "RwR45 / PNUaRW45 bypasses terminal run rules."
        : error ? <span role="alert">{error}. Generation will not relax this rule.</span>
        : !options.enabled ? "OFF · No terminal run rule affects generation."
        : options.mode === "allocation" ? `ON · ${options.allocationBasis === "equal" ? "Manual equal" : "WFMQYH count-based"} candidate allocations sum to 100%. Each candidate counts once toward its assigned exact run; other quotas and filters remain enforced.`
        : "ON · Every candidate must contain all selected exact maximal runs. Extra separate runs are allowed; extensions or mergers are not."}
    </div>
    <InfoHelp label="About terminal run allocation limits">
      Joint allocation uses verified integer assignments, not predicted results. The integer search has a {TERMINAL_RUN_ALLOCATION_LIMITS.solveMs}-millisecond budget per pass, with up to {TERMINAL_RUN_ALLOCATION_LIMITS.cells} reserve cells and {TERMINAL_RUN_ALLOCATION_LIMITS.rows.toLocaleString()} genuine passing rows. Model preparation and verification take additional time. A bounded search can report a shortfall without proving the request impossible. No fractional or invented candidates are displayed.
    </InfoHelp>
  </section>;
}
