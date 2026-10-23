import React, { useEffect, useState } from "react";
import type { Draw } from "../types";
import type { FamilyDroughtMember, LeadershipResponse, TerminalFamilyLeadershipAnalysis } from "../lib/terminalFamilyLeadership";
import { TERMINAL_LEADERSHIP_PROTOCOL } from "../lib/terminalFamilyLeadership";
import { CollapsibleSection } from "./shared/CollapsibleSection";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import "./TerminalFamilyLeadershipPanel.css";

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number | null): string => value === null ? "n/a" : Number(value.toFixed(2)).toString();
const average = (row: LeadershipResponse, key: "actual" | "expected"): string => row.trials ? decimal(row[key] / row.trials) : "n/a";
const rate = (hits: number, trials: number): string => trials ? pct(hits / trials) : "n/a";
const digits = (values: number[]): string => values.length ? values.join(", ") : "none";
const pp = (hits: number, trials: number): string => {
  if (!trials) return "n/a";
  const difference = (hits / trials - 8 / 45) * 100;
  return `${difference > 0 ? "+" : ""}${difference.toFixed(1)} pp`;
};
type View = "leadership" | "duration" | "drought";

const TableFrame: React.FC<{ title: string; columns: string[]; children: React.ReactNode }> = ({ title, columns, children }) => (
  <div className="terminal-leadership__scroll" role="region" aria-label={title} tabIndex={0}>
    <table>
      <thead><tr><th colSpan={columns.length} className="terminal-leadership__table-title">{title}</th></tr>
        <tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
const NumberTokens: React.FC<{ numbers: readonly number[]; source: "strict" | "empirical" }> = ({ numbers, source }) => (
  <span className={`terminal-leadership__numbers is-${source}`} aria-label={`${source} numbers: ${numbers.length ? numbers.join(", ") : "none"}`}>
    {numbers.length ? numbers.join(", ") : "none"}
  </span>
);
const MemberTokens: React.FC<{ members: FamilyDroughtMember[]; source: "strict" | "empirical" }> = ({ members, source }) => (
  <span className="terminal-leadership__members">
    {members.length ? members.map(member => <span key={member.number}>
      <NumberTokens numbers={[member.number]} source={source} /><small>rank {member.rank} · k{member.k}</small>
    </span>) : "none"}
  </span>
);

export const TerminalFamilyLeadershipView: React.FC<{ analysis: TerminalFamilyLeadershipAnalysis }> = ({ analysis }) => {
  const [view, setView] = useState<View>("leadership");
  const [monthChoice, setMonthChoice] = useState("");
  const month = analysis.months.find(row => row.key === monthChoice)
    ?? analysis.months.find(row => row.key === analysis.planningMonth) ?? analysis.months[0];
  const latest = month?.snapshots[month.snapshots.length - 1];
  const hasTraining = (month?.droughtTrainingDraws ?? 0) >= TERMINAL_LEADERSHIP_PROTOCOL.minPriorDraws;
  return (
    <div className="terminal-leadership">
      <div className="terminal-leadership__scope">
        <strong>Observe-only · No generation influence · {analysis.version}</strong>
        <span>{analysis.completeMonths} completed baseline months · {analysis.completeDraws} real draws · latest {analysis.latestDate ?? "unavailable"}</span>
        <span>Mains + supps. All baseline, not WFMQYH. Partial opening and incomplete months are excluded from outcomes.</span>
      </div>
      <div className="terminal-leadership__definition">
        <span><b>Leaders:</b> top three family hit counts over the preceding three monthly draws, adjusted for family size. Exact third-place ties are included.</span>
        <InfoHelp label="About terminal family leadership and ties">
          Endings 1-5 have five numbers; endings 0 and 6-9 have four. Index = observed hits / fair-share hits. For ending 7, three draws have 3 x 8 x 4 / 45 = 2.13 fair-share hits. Three actual hits give index 1.41x. This is descriptive strength, not a probability. Fewer than three monthly draws means no leadership group is assigned.
        </InfoHelp>
      </div>
      <div className="terminal-leadership__controls" role="group" aria-label="Leadership diagnostic view">
        {([ ["leadership", "Leadership & handover"], ["duration", "Duration & response"], ["drought", "Drought cross-check"] ] as const).map(([id, label]) => (
          <HigButton key={id} size="compact" variant={view === id ? "primary" : "quiet"} aria-pressed={view === id} onClick={() => setView(id)}>{label}</HigButton>
        ))}
      </div>
      <div className="terminal-leadership__summary">
        <span><b>Recent leaders, next-draw hits:</b> {average(analysis.response, "actual")} observed vs {average(analysis.response, "expected")} exact random expectation ({analysis.response.trials} draws).</span>
        <span><b>Early-to-final group changed:</b> {analysis.earlyLater.changedGroups}/{analysis.earlyLater.months} completed months.</span>
        <span>Changing leaders is not, by itself, a predictive advantage. Random expectations are calculated analytically; no simulated results are used.</span>
      </div>
      {view === "leadership" ? <>
        <HigField id="terminal-leadership-month" label="Inspect month (local)">
          <select value={month?.key ?? ""} onChange={event => setMonthChoice(event.target.value)} disabled={!analysis.months.length}>
            {!analysis.months.length ? <option value="">No qualifying months</option> : null}
            {analysis.months.map(row => <option key={row.key} value={row.key}>{row.key} · {row.snapshots.length}/{row.expectedDraws}{row.complete ? " completed" : row.prefixComplete ? " recorded" : " incomplete"}</option>)}
          </select>
        </HigField>
        {!month?.prefixComplete ? <p className="terminal-leadership__note">This month is missing scheduled draws before its latest result. Its stages are unavailable; no D1 or duration was invented.</p>
          : !latest ? <p className="terminal-leadership__note">No recorded draws in this planning month. Leadership needs its first three real draws; prior-month leaders are not carried across the boundary.</p>
            : <>
              <p className="terminal-leadership__note">State after {latest.date}, D{latest.ordinal}. {latest.ready ? `Leading endings: ${digits(latest.leaders)}.` : `${3 - latest.ordinal} more real draws needed for leadership.`}
                {latest.leaders.length > 3 ? ` ${latest.leaders.length} families qualify because of exact ties.` : ""}
                {month.complete ? " Month-end runs are unfinished at this boundary, not forecasts for next month." : ` Next scheduled result after this state: ${month.nextAfterState ?? "unavailable"}.`}
                {latest.ready ? "" : " Recent counts use only the monthly draws already recorded."}
              </p>
              <TableFrame title="Family state after the inspected month’s latest recorded draw" columns={["Ending", "Recent hits", "Fair-share hits", "Index", "Leadership", "Since / span", "Family run", "Strict 6+", "Empirical"]}>
                {latest.families.map(family => <tr key={family.digit}>
                  <th scope="row">Ending {family.digit}</th><td>{family.recentHits}</td><td>{decimal(family.expectedHits)}</td><td>{family.index === null ? "n/a" : `${decimal(family.index)}x`}</td>
                  <td>{!latest.ready ? "Awaiting D3" : family.entered ? "New leader" : family.leader ? "Leader" : family.left ? "Left group" : "Outside group"}</td>
                  <td>{family.leaderStart === null ? "n/a" : `D${family.leaderStart} / ${family.leaderSpan} draw${family.leaderSpan === 1 ? "" : "s"}`}</td>
                  <td>{family.confirmed ? `D${family.seedStart} / ${family.runSpan} draws${month.complete ? " · boundary" : ""}` : family.runSpan ? "Seed awaiting next draw" : "No active run"}</td>
                  <td>{hasTraining ? <MemberTokens members={family.strict} source="strict" /> : "Insufficient prior history"}</td>
                  <td>{hasTraining ? <MemberTokens members={family.empirical} source="empirical" /> : "Insufficient prior history"}</td>
                </tr>)}
              </TableFrame>
              <p className="terminal-leadership__note">Drought scope: {month.droughtTrainingDraws} consecutive baseline draws through this state{hasTraining ? ", top eight per list." : "; at least 24 are required before lists are displayed."} Red = Strict; blue = Empirical. A number in both columns belongs to both lists. k counts missed draws.</p>
              <TableFrame title="Recorded monthly leadership timeline · newest first" columns={["Draw", "Date", "Leading endings", "Entered", "Left", "Confirmed runs"]}>
                {[...month.snapshots].reverse().map(snapshot => <tr key={snapshot.ordinal}>
                  <th scope="row">D{snapshot.ordinal}</th><td>{snapshot.date}</td><td>{snapshot.ready ? digits(snapshot.leaders) : "Awaiting D3"}</td>
                  <td>{snapshot.ordinal === 3 ? "Initial group" : digits(snapshot.entered)}</td><td>{digits(snapshot.left)}</td>
                  <td>{snapshot.families.filter(family => family.confirmed).map(family => `${family.digit} (${family.runSpan} draws)`).join("; ") || "none"}</td>
                </tr>)}
              </TableFrame>
            </>}
      </> : null}
      {view === "duration" ? <>
        <p className="terminal-leadership__note">A family run starts with 2+ members in one draw, confirms on the next consecutive draw containing that ending, and ends on a miss. Repeated hits do not restart its age. Duration is observed history, not remaining time.</p>
        <TableFrame title="Confirmed family-run duration · completed baseline months" columns={["Ending", "Ended runs", "Median draws", "Mean draws", "Longest observed", "Unfinished at month-end"]}>
          {analysis.runDurations.map(row => <tr key={row.digit}><th scope="row">Ending {row.digit}</th><td>{row.ended}</td><td>{decimal(row.median)}</td><td>{decimal(row.mean)}</td><td>{row.longest ?? "n/a"}</td><td>{row.censored}</td></tr>)}
        </TableFrame>
        <p className="terminal-leadership__note">Unfinished runs are right-censored: they reached month-end without an observed miss. They are excluded from ended-run averages. Longest observed is not a ceiling.</p>
        <TableFrame title="Family continuation by elapsed run age" columns={["Age before target", "Family opportunities", "Continued", "Observed", "Exact baseline"]}>
          {analysis.runAges.map(row => <tr key={row.age}><th scope="row">{row.age} draw{row.age === 1 ? " · unconfirmed seed" : "s · confirmed"}</th><td>{row.trials}</td><td>{row.actual}</td><td>{rate(row.actual, row.trials)}</td><td>{rate(row.expected, row.trials)}</td></tr>)}
          {!analysis.runAges.length ? <tr><td colSpan={5}>No eligible consecutive real-draw responses.</td></tr> : null}
        </TableFrame>
        <TableFrame title="Next-draw response by monthly target ordinal" columns={["Target", "Leader tests", "Leader hits / draw", "Random hits / draw", "New-leader tests", "New-leader hits / draw", "Random hits / draw (new)", "Confirmed-run opportunities", "Run continued", "Run baseline"]}>
          {analysis.stages.map(row => <tr key={row.ordinal}><th scope="row">D{row.ordinal}</th><td>{row.leaders.trials}</td><td>{average(row.leaders, "actual")}</td><td>{average(row.leaders, "expected")}</td>
            <td>{row.entrants.trials}</td><td>{average(row.entrants, "actual")}</td><td>{average(row.entrants, "expected")}</td><td>{row.runs.trials}</td><td>{rate(row.runs.actual, row.runs.trials)}</td><td>{rate(row.runs.expected, row.runs.trials)}</td></tr>)}
          {!analysis.stages.length ? <tr><td colSpan={10}>No completed baseline months to audit.</td></tr> : null}
        </TableFrame>
        <p className="terminal-leadership__note">New leaders stayed in the group through month-end in {analysis.entrantsHeldToMonthEnd}/{analysis.entrantSpells} observed entries with a later draw available. Late entries have less time to leave; this is not a calibrated persistence forecast. D13/D14 have different month-length exposure; these rows pool available completed months.</p>
      </> : null}
      {view === "drought" ? <>
        <p className="terminal-leadership__note">Both shortlists are rebuilt before each target using only earlier consecutive All-baseline history (minimum 24 draws), not today’s shortlist or a retrospectively tuned WFMQYH window. Strict requires drought 6+; Empirical is ranked hazard and may include shorter droughts.</p>
        <TableFrame title="Drought membership and next-draw appearance" columns={["Condition before draw", "Number-draw opportunities", "Hits", "Observed", "Neutral baseline", "Difference"]}>
          {analysis.droughtComparisons.map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.opportunities}</td><td>{row.hits}</td><td>{rate(row.hits, row.opportunities)}</td><td>{pct(8 / 45)}</td><td>{pp(row.hits, row.opportunities)}</td></tr>)}
        </TableFrame>
        <p className="terminal-leadership__note">One opportunity = one listed number tested against one later draw. Leader and other-family rows partition each list. Run rows overlap them; Strict and Empirical can overlap too. Do not add these rows as independent evidence. Small differences and thin groups are not proven advantages.</p>
        <TableFrame title={`Drought audit ledger · ${analysis.droughtEligibleDraws} eligible draws · newest first`} columns={["Target", "Stage", "Prior draws", "Pre-draw leaders", "Strict eligible (leaders)", "Strict hits", "Empirical eligible (leaders)", "Empirical hits", "Strict run hits", "Empirical run hits"]}>
          {analysis.droughtAudit.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{row.month} D{row.ordinal}</td><td>{row.trainingDraws}</td><td>{digits(row.leaders)}</td>
            <td><NumberTokens source="strict" numbers={row.strict} /></td><td><NumberTokens source="strict" numbers={row.strictHits} /></td>
            <td><NumberTokens source="empirical" numbers={row.empirical} /></td><td><NumberTokens source="empirical" numbers={row.empiricalHits} /></td>
            <td><NumberTokens source="strict" numbers={row.strictRunHits} /></td><td><NumberTokens source="empirical" numbers={row.empiricalRunHits} /></td></tr>)}
          {!analysis.droughtAudit.length ? <tr><td colSpan={10}>No targets with enough earlier baseline history and a measurable family state.</td></tr> : null}
        </TableFrame>
      </> : null}
      <div className="terminal-leadership__definition">
        <span>All outcomes are exploratory. Several families and stages share draws; they are not independent confirmations.</span>
        <InfoHelp label="Leadership replay methodology">
          TFLH-1 fixes three-draw leadership, top three with ties, drought 6+, eight shortlist positions and 24 prior draws. Each next-draw response uses the state known before that draw. Missing dates restart drought training. A complete calendar month must contain every scheduled Monday, Wednesday and Friday result. The current month is inspected separately, not added to completed-month outcomes. No weights, quotas, selections or generator settings are changed, and the diagnostic is not an extra independent portfolio vote.
        </InfoHelp>
      </div>
      {analysis.warnings.length ? <div className="terminal-leadership__warnings" role="note">{analysis.warnings.map(warning => <p key={warning}>{warning}</p>)}</div> : null}
    </div>
  );
};

const LeadershipLoader: React.FC<{ history: Draw[] }> = ({ history }) => {
  const [result, setResult] = useState<TerminalFamilyLeadershipAnalysis | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let worker: Worker | undefined;
    setResult(null); setError("");
    try {
      worker = new Worker(new URL("../workers/terminalFamilyLeadershipWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ result?: TerminalFamilyLeadershipAnalysis; error?: string }>) => {
        if (!active) return;
        if (event.data.result) setResult(event.data.result);
        if (event.data.error) setError(event.data.error);
        worker?.terminate();
      };
      worker.onerror = () => {
        if (!active) return;
        setError("The real-history worker failed. No result was substituted."); worker?.terminate();
      };
      worker.postMessage({ history });
    } catch (caught) { worker?.terminate(); setError(caught instanceof Error ? caught.message : "The real-history audit could not start."); }
    return () => { active = false; worker?.terminate(); };
  }, [history, retry]);
  if (error) return <div role="alert">{error} <HigButton size="compact" onClick={() => setRetry(value => value + 1)}>Retry audit</HigButton></div>;
  if (!result) return <p role="status">Reading real-history leadership and drought responses…</p>;
  return <TerminalFamilyLeadershipView analysis={result} />;
};

export const TerminalFamilyLeadershipPanel: React.FC<{ history: Draw[] }> = ({ history }) => (
  <CollapsibleSection title="Terminal Family Leadership & Handover" summaryHint="observe-only monthly leaders, duration and drought overlap"
    panelId="terminal-family-leadership" defaultOpen={false} deferContentWhileCollapsed>
    <LeadershipLoader history={history} />
  </CollapsibleSection>
);
