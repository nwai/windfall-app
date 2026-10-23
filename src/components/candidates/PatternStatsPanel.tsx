import React, { useId, useMemo, useState } from "react";
import type { Draw } from "../../types";
import { compositionSelectionComparison, historicalDrawComposition, type CompositionFrequencyRow, type PatternFeatures } from "../../lib/patternStats";
import { formatIsoDateAsMdyy } from "../../lib/drawHistoryReview";
import { InfoHelp } from "../shared/HigControls";
import "./PatternStatsPanel.css";

interface PatternStatsPanelProps { draws: Draw[]; selectedNumbers?: number[] }
const EMPTY_SELECTION: number[] = [];
const percent = (value: number) => `${value.toFixed(1)}%`;
const rangeLabel = (row: Pick<CompositionFrequencyRow, "min" | "max">) => row.min === row.max ? String(row.min) : `${row.min}-${row.max}`;
const measures: { key: keyof PatternFeatures; title: string; help: React.ReactNode }[] = [
  { key: "consecPairs", title: "Adjacent number pairs", help: <>
    Counts whole-number neighbours, not terminal digits. In the illustrative selection 5, 6, 7, 18, 29, 40,
    the pairs 5-6 and 6-7 count as two adjacent pairs, within one three-number run. Numbers 45 and 1 do not wrap.
    This example is not a historical observation.
  </> },
  { key: "evenCounts", title: "Even numbers", help: <>
    Counts even numbers in the chosen six- or eight-number scope. The remaining numbers are odd.
    The illustrative selection 5, 6, 7, 18, 29, 40 has three even and three odd numbers.
    This local scope does not change Odd/Even Ratio Filters or generation.
  </> },
  { key: "lowCounts", title: "Low / high balance", help: <>
    Low means 1-22; high means 23-45, using the same definition as Window Stats.
    The illustrative selection 5, 6, 7, 18, 29, 40 has four low and two high numbers.
    This is a fixed grouping, not a temperature or monthly bucket.
  </> },
  { key: "sums", title: "Number sum", help: <>
    Adds the numbers in the chosen scope. The illustrative selection 5, 6, 7, 18, 29, 40 totals 105.
    Historical sums are grouped into fixed 20-point bands, clipped to the possible six- or eight-number limits.
    A common sum band does not identify which numbers will be drawn.
  </> },
];

function categoryLabel(key: keyof PatternFeatures, row: CompositionFrequencyRow, numberCount: number): string {
  if (key === "consecPairs") return `${row.min} ${row.min === 1 ? "pair" : "pairs"}`;
  if (key === "evenCounts") return `${row.min} even / ${numberCount - row.min} odd`;
  if (key === "lowCounts") return `${row.min} low / ${numberCount - row.min} high`;
  return rangeLabel(row);
}

function Distribution({ measure, rows, total, numberCount, selectedValue }: {
  measure: typeof measures[number]; rows: CompositionFrequencyRow[]; total: number; numberCount: number; selectedValue?: number;
}) {
  const id = useId();
  const most = rows.reduce((highest, row) => Math.max(highest, row.count), 0);
  const modes = rows.filter(row => row.count === most && most > 0);
  return <section className="historical-composition__measure" aria-labelledby={id}>
    <div className="historical-composition__measure-heading">
      <h4 id={id}>{measure.title}</h4>
      <InfoHelp label={`About ${measure.title.toLowerCase()}`}>{measure.help}</InfoHelp>
    </div>
    <p className="historical-composition__finding">
      {modes.length === 1 ? "Most common: " : "Tied most common: "}
      <strong>{modes.map(row => categoryLabel(measure.key, row, numberCount)).join("; ")}</strong>
      {" "}in {most} of {total} draws{modes.length > 1 ? " each" : ""} ({percent(modes[0]?.percent ?? 0)}).
    </p>
    <div className="historical-composition__table-scroll" role="region" tabIndex={0} aria-label={`${measure.title} historical distribution`}>
      <table><thead><tr><th scope="col">{measure.key === "sums" ? "Sum band" : "In each draw"}</th><th scope="col">Draws</th><th scope="col">Share of draws</th></tr></thead>
        <tbody>{rows.map(row => {
          const selected = selectedValue !== undefined && selectedValue >= row.min && selectedValue <= row.max;
          return <tr key={row.min} data-comparison={selected || undefined}>
            <th scope="row">{categoryLabel(measure.key, row, numberCount)}{selected && <small>Your selection</small>}</th>
            <td>{row.count}/{total}</td>
            <td><div className="historical-composition__share">
              <span className="historical-composition__track" aria-hidden="true"><span className="historical-composition__bar" style={{ width: `${row.percent}%` }} /></span>
              <span>{percent(row.percent)}</span>
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

export function PatternStatsPanel({ draws, selectedNumbers = EMPTY_SELECTION }: PatternStatsPanelProps) {
  const id = useId();
  const [includeSupp, setIncludeSupp] = useState(false);
  const [compareSelection, setCompareSelection] = useState(false);
  const analysis = useMemo(() => historicalDrawComposition(draws, includeSupp), [draws, includeSupp]);
  const comparison = useMemo(() => compareSelection ? compositionSelectionComparison(selectedNumbers, includeSupp, analysis) : null,
    [compareSelection, selectedNumbers, includeSupp, analysis]);
  const numberCount = includeSupp ? 8 : 6;
  const skipped = Object.values(analysis.ignored).reduce((sum, count) => sum + count, 0);
  return <div className="historical-composition">
    <div className="historical-composition__scope">
      <strong>{analysis.drawCount} eligible real {analysis.drawCount === 1 ? "draw" : "draws"}</strong>
      <span>Active WFMQYH history{analysis.firstDate && analysis.latestDate ? ` · ${formatIsoDateAsMdyy(analysis.firstDate)} to ${formatIsoDateAsMdyy(analysis.latestDate)}` : ""}</span>
      <span className="historical-composition__status">Observe-only · No generation effect</span>
      <InfoHelp label="About historical composition evidence">
        Uses the active WFMQYH rows, including the opening month if selected. It does not substitute the baseline-month history slice.
        Only valid, scheduled, non-simulated six-main plus two-supplementary rows qualify. Identical copies of one date count once;
        dates with conflicting valid results are excluded entirely. Eligible does not mean independently verified against official results.
        These measures overlap with Window Stats and other composition panels; they are not additional independent evidence votes.
      </InfoHelp>
    </div>
    <div className="historical-composition__controls">
      <fieldset><legend>Numbers analysed</legend>
        <label><input type="radio" name={`${id}-scope`} checked={!includeSupp} onChange={() => setIncludeSupp(false)} />Mains only (6)</label>
        <label><input type="radio" name={`${id}-scope`} checked={includeSupp} onChange={() => setIncludeSupp(true)} />Mains + supps (8)</label>
      </fieldset>
      <label className="historical-composition__compare"><input type="checkbox" checked={compareSelection} onChange={event => setCompareSelection(event.target.checked)} />Compare User Selected numbers ({selectedNumbers.length})</label>
      <span className="historical-composition__local">Panel-local controls</span>
    </div>
    {skipped > 0 && <p className="historical-composition__notice" role="status">
      Excluded {skipped} input rows: {analysis.ignored.simulated} simulated, {analysis.ignored.invalid} malformed,
      {" "}{analysis.ignored.offSchedule} off-schedule, {analysis.ignored.duplicate} duplicate copies, {analysis.ignored.conflict} rows on conflicting dates.
    </p>}
    {!analysis.drawCount ? <p role="status">No eligible real draws in this window. Historical frequencies are unavailable.</p> : <>
      {analysis.drawCount < 30 && <p className="historical-composition__notice">Small window: {analysis.drawCount} draws. One new draw can noticeably change these frequencies.</p>}
      <p className="historical-composition__boundary">Describes past draws, not next-draw probabilities. Bars use the same 0-100% scale.</p>
      <div className="historical-composition__measures">
        {measures.map(measure => <Distribution key={measure.key} measure={measure} rows={analysis.distributions[measure.key]}
          total={analysis.drawCount} numberCount={numberCount} selectedValue={comparison?.status === "complete" ? comparison.values[measure.key].value : undefined} />)}
      </div>
    </>}
    {comparison && <section className="historical-composition__comparison" aria-label="Your selection comparison" aria-live="polite">
      <h4>Your selection, described</h4>
      {comparison.status !== "complete" ? <p>{comparison.message}</p> : <>
        <p>{selectedNumbers.join(", ")} · {numberCount} numbers · Each measure is compared separately, not as one combined pattern.</p>
        <div className="historical-composition__table-scroll" tabIndex={0} role="region" aria-label="Selected numbers and historical composition">
          <table><thead><tr><th scope="col">Measure</th><th scope="col">Your value</th><th scope="col">Observed draws</th></tr></thead>
            <tbody>{measures.map(measure => {
              const row = comparison.values[measure.key];
              return <tr key={measure.key}><th scope="row">{measure.title}</th>
                <td>{measure.key === "sums" ? `${row.value} (band ${rangeLabel(row)})` : categoryLabel(measure.key, { ...row, min: row.value, max: row.value }, numberCount)}</td>
                <td>{row.count}/{analysis.drawCount} ({percent(row.percent)})</td></tr>;
            })}</tbody>
          </table>
        </div>
        <p>{comparison.message} These four percentages must not be added or multiplied into a winning chance.</p>
      </>}
    </section>}
  </div>;
}
