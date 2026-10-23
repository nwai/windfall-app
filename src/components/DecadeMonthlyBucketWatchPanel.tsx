import React, { useMemo, useState } from "react";
import type { Draw } from "../types";
import { analyzeDecadeMonthlyBuckets, DECADE_BUCKET_GROUPS, type DecadeBucketWatchOptions } from "../lib/decadeMonthlyBucketWatch";
import { HigField, InfoHelp } from "./shared/HigControls";
import "./DecadeMonthlyBucketWatchPanel.css";

const bucketLabel = (bucket: number): string => bucket === 0 ? "Undrawn" : bucket === 8 ? "8x+" : `${bucket}x`;
const percent = (value: number | null): string => value === null ? "n/a" : `${(100 * value).toFixed(1)}%`;

export default function DecadeMonthlyBucketWatchPanel({ history, today }: { history: readonly Draw[]; today: string }) {
  const [ordinal, setOrdinal] = useState<DecadeBucketWatchOptions["ordinal"]>("target");
  const [monthLength, setMonthLength] = useState<DecadeBucketWatchOptions["monthLength"]>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const analysis = useMemo(() => analyzeDecadeMonthlyBuckets(history, { now: today, ordinal, monthLength }), [history, today, ordinal, monthLength]);
  const selected = analysis.cells.find(cell => `${cell.group}:${cell.bucket}` === selectedKey);

  return (
    <div className="decade-bucket-watch">
      <div className="decade-bucket-watch__status">
        <strong>Observe-only · No generation influence</strong>
        <span>{analysis.modelVersion} · mains + supps · baseline history, independent of WFMQYH</span>
      </div>
      <div className="decade-bucket-watch__controls">
        <HigField label="Draw ordinal" id="decade-bucket-watch-ordinal">
          <select value={ordinal} onChange={event => setOrdinal(event.target.value === "all" || event.target.value === "target" ? event.target.value : Number(event.target.value))}>
            <option value="target">Next target{analysis.target ? ` · D${analysis.target.ordinal}` : " · unavailable"}</option>
            <option value="all">All ordinals</option>
            {Array.from({ length: 14 }, (_, index) => <option key={index + 1} value={index + 1}>D{index + 1}</option>)}
          </select>
        </HigField>
        <HigField label="Month length" id="decade-bucket-watch-month-length">
          <select value={monthLength} onChange={event => setMonthLength(event.target.value === "all" || event.target.value === "target" ? event.target.value : Number(event.target.value))}>
            <option value="all">All month lengths</option>
            <option value="target">Same as target{analysis.target ? ` · ${analysis.target.length}D` : " · unavailable"}</option>
            {[12, 13, 14].map(length => <option key={length} value={length}>{length}D months</option>)}
          </select>
        </HigField>
        <InfoHelp label="How to read the decade bucket watch">
          Each cell shows actual hits divided by number-draw opportunities. A number in 3x before a draw moves to 4x if drawn. Five available numbers across two target draws create ten opportunities. The 17.8% comparison is the fair 8-from-45 reference, not a calibrated forecast. Thin means fewer than 30 draws with opportunities or fewer than 10 represented months; it is a caution label, not a reliability test. Select a cell for its counts and current planning numbers.
        </InfoHelp>
      </div>
      <div className="decade-bucket-watch__scope" aria-live="polite">
        {analysis.matchedDraws} real target draws across {analysis.matchedMonths} months · {analysis.ordinal === "all" ? "all ordinals" : analysis.ordinal ? `D${analysis.ordinal}` : "no target context"} · {analysis.monthLength === "all" ? "all month lengths" : analysis.monthLength ? `${analysis.monthLength}D months` : "no month context"}.
        {analysis.target ? ` Planning ${analysis.target.date} · ${analysis.target.month} D${analysis.target.ordinal}/${analysis.target.length}.` : ""}
      </div>
      {analysis.warnings.length > 0 && <div className="decade-bucket-watch__warnings">{analysis.warnings.join(" ")}</div>}
      {!analysis.matchedDraws && <p role="status">No eligible real targets match this scope. No fallback evidence has been substituted.</p>}
      <div className="decade-bucket-watch__scroll" tabIndex={0} role="region" aria-label="Decade and monthly origin bucket table">
        <table>
          <caption>Historical response by before-draw bucket</caption>
          <thead><tr><th scope="col">Group</th>{Array.from({ length: 9 }, (_, bucket) => <th scope="col" key={bucket}>{bucketLabel(bucket)}</th>)}</tr></thead>
          <tbody>{DECADE_BUCKET_GROUPS.map((group, groupIndex) => (
            <tr key={group.label}>
              <th scope="row">{group.label}<small>{group.last - group.first + 1} numbers</small></th>
              {analysis.cells.filter(cell => cell.group === groupIndex).map(cell => {
                const key = `${cell.group}:${cell.bucket}`;
                return <td key={key}>
                  <button type="button" className="decade-bucket-watch__cell" aria-pressed={key === selectedKey} aria-label={`Inspect ${group.label}, ${bucketLabel(cell.bucket)}: ${cell.hits} hits from ${cell.opportunities} opportunities, ${cell.sample.toLowerCase()}`} onClick={() => setSelectedKey(current => current === key ? null : key)}>
                    <strong>{cell.opportunities ? `${cell.hits}/${cell.opportunities}` : "n/a"}</strong>
                    <span>{percent(cell.observedRate)}</span>
                    <small className={cell.sample === "Thin" ? "decade-bucket-watch__thin" : ""}>{cell.sample}</small>
                  </button>
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {selected && <section className="decade-bucket-watch__detail" aria-live="polite" aria-label="Selected decade bucket evidence">
        <strong>{DECADE_BUCKET_GROUPS[selected.group].label} · {bucketLabel(selected.bucket)} · {selected.sample}</strong>
        <dl>
          <div><dt>Actual hits / opportunities</dt><dd>{selected.hits} / {selected.opportunities} · {percent(selected.observedRate)}</dd></div>
          <div><dt>Draws / months with opportunities</dt><dd>{selected.draws} / {selected.months}</dd></div>
          <div><dt>Fair-reference hits</dt><dd>{selected.expectedHits.toFixed(1)} · 17.8% per opportunity</dd></div>
          <div><dt>Observed difference</dt><dd>{selected.differencePP === null ? "n/a" : `${selected.differencePP >= 0 ? "+" : ""}${selected.differencePP.toFixed(1)} percentage points`}</dd></div>
          <div><dt>Earlier half</dt><dd>{selected.early.hits}/{selected.early.opportunities} · {percent(selected.early.rate)}</dd></div>
          <div><dt>Later half</dt><dd>{selected.later.hits}/{selected.later.opportunities} · {percent(selected.later.rate)}</dd></div>
        </dl>
        <p><strong>Numbers now in this planning group:</strong> {analysis.target?.prefixComplete ? selected.currentNumbers.join(", ") || "None" : "Unavailable: incomplete monthly history"}.</p>
        <p className="decade-bucket-watch__scope">Current numbers describe the planning month, even when a different historical stage or month length is selected. They are not recommendations or forced inclusions.</p>
      </section>}
      <details className="decade-bucket-watch__method">
        <summary>Evidence scope and limitations</summary>
        <p>All {analysis.validDraws} validated real draws; {analysis.baselineDraws} baseline draws after the opening-month policy. Latest recorded: {analysis.latestDate ?? "none"}. Only targets with every earlier scheduled draw in their month recorded are eligible. Current incomplete months contribute only their recorded, valid prefixes.</p>
        <p>Counts use the bucket before each target. Zero opportunities means no sample, not a measured 0% appearance rate. The 1-9 group stays separate; 40-45 contains six numbers. Expectations use actual available numbers, so unequal group sizes are not disguised.</p>
        <p>Chronological halves are a sensitivity check, not independent confirmation. Repeated number opportunities are related observations; no naive independence-based confidence interval is shown. Small cells remain visible. No result is a calibrated next-draw probability.</p>
        <p>This watch updates from real history. It does not learn new weights, select numbers, change WFMQYH, or affect generation. It shares the monthly-stage evidence family with the monthly lab; it is not an extra independent consensus vote.</p>
      </details>
    </div>
  );
}
