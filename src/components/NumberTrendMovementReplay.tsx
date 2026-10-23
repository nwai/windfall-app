import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Draw } from "../types";
import {
  analyzeNumberTrendMovement, NUMBER_TREND_MOVEMENT_VERSION,
  NUMBER_TREND_NEUTRAL_RATE, numberTrendMovementBand, type NumberTrendMovementPoint,
} from "../lib/numberTrendMovement";
import { formatIsoDateAsMdyy } from "../lib/drawHistoryReview";
import InlineCollapsibleCard from "./shared/InlineCollapsibleCard";
import { HigButton, HigField, HigSlider, InfoHelp } from "./shared/HigControls";
import "./NumberTrendMovementReplay.css";

const EMPTY_HISTORY: Draw[] = [];
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
const percent = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const directionName = (direction: string) => direction === "up" ? "Up" : direction === "down" ? "Down" : "Flat";
const outcome = (point: NumberTrendMovementPoint) => point.nextStatus === "pending" ? "Not available in this source"
  : point.nextStatus === "gap" ? "Not scored: history gap" : point.nextHit ? "Hit" : "Miss";

export function NumberTrendMovementReplay({ history = EMPTY_HISTORY, sourceLabel }: { history?: Draw[]; sourceLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  return <InlineCollapsibleCard id="number-trends-movement-replay" title="Movement Replay"
    subtitle="Draw-by-draw frequency movement · observe-only" expanded={expanded} onExpandedChange={setExpanded}
    collapsedLabel="Open replay" collapsedSummary={`${NUMBER_TREND_MOVEMENT_VERSION} · ${sourceLabel} · No selection or generation effect.`}>
    {expanded ? <MovementReplayContent history={history} sourceLabel={sourceLabel} /> : null}
  </InlineCollapsibleCard>;
}

function MovementReplayContent({ history, sourceLabel }: { history: Draw[]; sourceLabel: string }) {
  const [number, setNumber] = useState(1);
  const [displayCount, setDisplayCount] = useState(120);
  const [inspectDate, setInspectDate] = useState<string | null>(null);
  const replay = useMemo(() => analyzeNumberTrendMovement(history, number), [history, number]);
  const current = replay.points[replay.points.length - 1];
  const visible = useMemo(() => displayCount ? replay.points.slice(-displayCount) : replay.points, [replay.points, displayCount]);
  const inspectedIndex = Math.max(0, inspectDate && visible.some(point => point.date === inspectDate)
    ? visible.findIndex(point => point.date === inspectDate) : visible.length - 1);
  const inspected = visible[inspectedIndex];
  const currentBand = current?.fullWindow ? numberTrendMovementBand(current.deltaPP) : null;
  const ignoredCount = Object.values(replay.ignored).reduce((sum, count) => sum + count, 0);
  const { summary } = replay;

  return <div className="windfall-trend-replay" data-evidence-family="frequency-recency" data-evidence-role="consumer" data-evidence-use="observe-only">
    <div className="windfall-trend-replay__controls">
      <HigField label="Inspect number">
        <select value={number} onChange={event => setNumber(Number(event.target.value))}>
          {Array.from({ length: 45 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select>
      </HigField>
      <HigField label="Timeline draws">
        <select value={displayCount} onChange={event => setDisplayCount(Number(event.target.value))}>
          <option value={60}>Latest 60</option><option value={120}>Latest 120</option><option value={0}>All in source</option>
        </select>
      </HigField>
      <span className="windfall-trend-replay__scope" role="status">{sourceLabel} · {replay.points.length} qualifying real draws{current ? ` · through ${formatIsoDateAsMdyy(current.date)}` : ""}</span>
      <InfoHelp label="About Movement Replay">
        The score is 100 times (appearances in the latest 3 draws / available recent draws minus appearances in the latest 13 / available comparison draws).
        Positive means a higher recent rate, not a hit. Negative means a lower recent rate, not a miss. Flat includes -5.5 to +5.5 percentage points.
        Each plotted value uses only draws up to that date. The first 12 positions are warm-up, not part of full-window summaries or next-draw comparisons.
        The timeline control changes the chart and log only. All summaries and comparisons use the chosen History source.
        Inspecting a number does not select it for generation. Historical highs and lows are observations, not predictive barriers.
      </InfoHelp>
    </div>
    {ignoredCount > 0 ? <p className="windfall-trend-replay__notice" role="status">
      Replay omitted {replay.ignored.simulated} simulated, {replay.ignored.malformed} malformed, {replay.ignored.offSchedule} off-schedule and {replay.ignored.duplicateDateRows} duplicate-date rows.
      Every row on a duplicate date is omitted rather than choosing a result. This stricter replay scope can differ from the counts above.
    </p> : null}
    {!current ? <p role="status">No qualifying real draws in this source. No replay values have been substituted.</p> : <>
      <dl className="windfall-trend-replay__metrics">
        <div><dt>Current value · n{number}</dt><dd>{signed(current.deltaPP)} <small>pp · {directionName(current.direction)}</small></dd>
          <span>{current.hits3}/{current.recentDrawCount} recent vs {current.hits13}/{current.comparisonDrawCount} comparison draws</span></div>
        <div><dt>Observed lowest</dt><dd>{summary.lowest ? `${signed(summary.lowest.deltaPP)} pp` : "n/a"}</dd>
          <span>{summary.lowest ? formatIsoDateAsMdyy(summary.lowest.date) : "Needs 13 real draws"}</span></div>
        <div><dt>Observed highest</dt><dd>{summary.highest ? `${signed(summary.highest.deltaPP)} pp` : "n/a"}</dd>
          <span>{summary.highest ? formatIsoDateAsMdyy(summary.highest.date) : "Needs 13 real draws"}</span></div>
        <div><dt>Typical range · P10-P90</dt><dd>{summary.typicalRange ? `${signed(summary.typicalRange[0])} to ${signed(summary.typicalRange[1])}` : "n/a"}</dd>
          <span>{summary.fullWindowCount} full-window {summary.fullWindowCount === 1 ? "state" : "states"} · descriptive, not a confidence interval</span></div>
      </dl>
      <p className="windfall-trend-replay__note">
        Mathematical limits at the current window size: <strong>{signed(-summary.mathematicalLimit!)} to {signed(summary.mathematicalLimit!)} pp</strong>.
        With 13 draws they are -76.9 to +76.9 pp because the latest three draws are also inside the thirteen.
        {summary.fullWindowCount < 30 ? " Thin history for this number; ranges and rates are not stable estimates." : " Observed extremes can be exceeded."}
      </p>

      <MovementChart points={visible} inspectedIndex={inspectedIndex} number={number} />
      <div className="windfall-trend-replay__legend"><span className="windfall-trend-replay__main">● Main hit</span><span className="windfall-trend-replay__supp">● Supp hit</span><span>Unmarked point: not drawn</span><span>Blue ring: inspected draw</span><span>Dashed limits: full 13-draw mathematical bounds</span></div>
      {inspected ? <>
        <div className="windfall-trend-replay__scrubber">
          <HigField label={`Inspect draw · ${formatIsoDateAsMdyy(inspected.date)}`}>
            <HigSlider min={0} max={Math.max(0, visible.length - 1)} step={1} value={inspectedIndex} disabled={visible.length < 2}
              onCommit={index => setInspectDate(visible[index].date)} />
          </HigField>
          <HigButton size="compact" onClick={() => setInspectDate(null)}>Latest</HigButton>
        </div>
        <div className="windfall-trend-replay__inspection" role="status">
          <strong>{formatIsoDateAsMdyy(inspected.date)} · {signed(inspected.deltaPP)} pp · {directionName(inspected.direction)}</strong>
          <span>{inspected.hits3}/{inspected.recentDrawCount} recent ({percent(inspected.hits3 / inspected.recentDrawCount)}) minus {inspected.hits13}/{inspected.comparisonDrawCount} comparison ({percent(inspected.hits13 / inspected.comparisonDrawCount)})</span>
          <span className={inspected.role === "main" ? "windfall-trend-replay__main" : inspected.role === "supp" ? "windfall-trend-replay__supp" : ""}>
            n{number}: {inspected.role === "main" ? "main hit" : inspected.role === "supp" ? "supp hit" : "not drawn"}{!inspected.fullWindow ? " · Warm-up" : ""}
          </span>
          <span>Next scheduled draw: {outcome(inspected)}{inspected.nextStatus === "scored" ? ` (${formatIsoDateAsMdyy(inspected.nextDate!)})` : ""}</span>
        </div>
      </> : null}

      <section className="windfall-trend-replay__section" aria-label="Time in each trend state">
        <h4>Time in each state</h4>
        <p className="windfall-trend-replay__note">{summary.fullWindowCount} full-window {summary.fullWindowCount === 1 ? "state" : "states"}; {summary.warmupCount} warm-up positions excluded. {current.fullWindow ? `Current ${directionName(current.direction)} run: ${summary.currentRun} recorded ${summary.currentRun === 1 ? "draw" : "draws"}.` : "Current state is still in warm-up."}</p>
        <div className="windfall-trend-replay__table" role="region" aria-label="Trend state durations" tabIndex={0}>
          <table><thead><tr><th>State</th><th>Recorded draws</th><th>Share</th><th>Longest run</th></tr></thead>
            <tbody>{replay.states.map(state => <tr key={state.direction}><th scope="row">{directionName(state.direction)}</th><td>{state.count}</td>
              <td>{summary.fullWindowCount ? percent(state.count / summary.fullWindowCount) : "n/a"}</td><td>{state.longestRun || "n/a"}</td></tr>)}</tbody></table>
        </div>
      </section>
      <section className="windfall-trend-replay__section" aria-label="Historical next-draw comparison">
        <div className="windfall-trend-replay__heading"><h4>What followed similar values?</h4><InfoHelp label="About next-draw trend comparisons">
          Fixed bands compare this same number's full-window score after draw t with whether it appeared in draw t+1 as a main or supp.
          The outcome is never used to calculate its earlier score. Missing next scheduled dates and the unrecorded next draw are not scored.
          Rates are raw historical hits divided by trials, not calibrated probabilities. Fewer than 30 trials is labelled thin.
          Rolling windows overlap, so trials are not independent. Exploring many numbers or bands can find chance patterns. No significance or generation advantage is claimed.
        </InfoHelp></div>
        <p className="windfall-trend-replay__note">Same number only · fixed score bands · neutral reference {percent(NUMBER_TREND_NEUTRAL_RATE)} (8/45). Current band is marked below. No smoothing, simulated outcomes or generation influence.</p>
        {!replay.bands.some(band => band.trials > 0) ? <p className="windfall-trend-replay__note" role="status">No scored full-window next-draw trials in this source. A score needs 13 recorded draws, followed by the next scheduled result.</p> : null}
        <div className="windfall-trend-replay__table" role="region" aria-label="Next-draw results by fixed trend band" tabIndex={0}>
          <table><thead><tr><th>Value band (pp)</th><th>Next-draw hits / trials</th><th>Observed rate</th><th>Vs 8/45</th><th>Sample</th></tr></thead>
            <tbody>{replay.bands.map(band => <tr key={band.id} data-current-band={band.id === currentBand ? "true" : undefined}>
              <th scope="row">{band.label}{band.id === currentBand ? <span className="windfall-trend-replay__current-band">Current</span> : null}</th>
              <td>{band.hits} / {band.trials}</td><td>{percent(band.rate)}</td><td>{band.liftPP === null ? "n/a" : `${signed(band.liftPP)} pp`}</td>
              <td>{band.trials === 0 ? "No trials" : band.trials < 30 ? "Thin" : "Descriptive"}</td>
            </tr>)}</tbody></table>
        </div>
        <p className="windfall-trend-replay__note">Historical association only, not a next-draw forecast. Scores use no future draws; overlapping windows and exploratory inspection limit what these rates can prove.</p>
      </section>
      <section className="windfall-trend-replay__section" aria-label="Movement audit log">
        <h4>Draw-by-draw log</h4>
        <p className="windfall-trend-replay__note">Newest first · {visible.length} timeline positions shown. Highs, lows and comparison tables above still use the complete selected source.</p>
        <div className="windfall-trend-replay__table windfall-trend-replay__log" role="region" aria-label="Movement replay draw log" tabIndex={0}>
          <table><thead><tr><th>Through draw</th><th>Value (pp)</th><th>State</th><th>Recent hits / draws</th><th>Comparison hits / draws</th><th>n{number} in this draw</th><th>Next draw</th></tr></thead>
            <tbody>{visible.slice().reverse().map(point => <tr key={point.date}><th scope="row">{formatIsoDateAsMdyy(point.date)}</th>
              <td>{signed(point.deltaPP)}</td><td>{directionName(point.direction)}{!point.fullWindow ? " · warm-up" : ""}</td>
              <td>{point.hits3}/{point.recentDrawCount}</td><td>{point.hits13}/{point.comparisonDrawCount}</td>
              <td className={point.role === "main" ? "windfall-trend-replay__main" : point.role === "supp" ? "windfall-trend-replay__supp" : ""}>{point.role === "absent" ? "Not drawn" : `${point.role === "main" ? "Main" : "Supp"} hit`}</td>
              <td>{point.fullWindow ? outcome(point) : "Not scored: warm-up"}</td></tr>)}</tbody></table>
        </div>
      </section>
    </>}
  </div>;
}

function MovementChart({ points, inspectedIndex, number }: { points: NumberTrendMovementPoint[]; inspectedIndex: number; number: number }) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      if (!container.clientWidth) return;
      const nextWidth = Math.max(640, Math.round(container.clientWidth));
      setWidth(previous => previous === nextWidth ? previous : nextWidth);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const height = 270, left = 58, right = 24, top = 25, bottom = 42;
  const x = (index: number) => points.length < 2 ? width / 2 : left + index * (width - left - right) / (points.length - 1);
  const y = (value: number) => top + (80 - value) * (height - top - bottom) / 160;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.deltaPP).toFixed(2)}`).join(" ");
  const current = points[inspectedIndex];
  const labels = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  return <div ref={containerRef} className="windfall-trend-replay__chart-scroll" tabIndex={0} role="region" aria-label="Scrollable trend movement timeline">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Number {number} movement by recorded draw</title>
      <desc id={`${id}-description`}>Oldest left, newest right. Vertical axis is recent minus comparison appearance rate in percentage points. Hit markers show main or supplementary appearances. Exact values are in the inspection readout and draw log.</desc>
      <rect x={left} y={y(5.5)} width={width - left - right} height={y(-5.5) - y(5.5)} fill="#eef1f4" />
      {[-76.9230769231, -40, 0, 40, 76.9230769231].map(value => <g key={value}>
        <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke={value === 0 ? "#8a969f" : "#d4dce1"} strokeDasharray={Math.abs(value) > 70 ? "4 4" : undefined} />
        <text x={left - 8} y={y(value) + 4} textAnchor="end">{signed(value)}</text>
      </g>)}
      <text x={left} y={14}>Trend value (pp)</text>
      <path d={path} fill="none" stroke="#426c91" strokeWidth={2} />
      {points.map((point, index) => point.role !== "absent" ? <circle key={point.date} cx={x(index)} cy={y(point.deltaPP)} r={3.5}
        fill={point.role === "main" ? "#b42318" : "#237f52"} stroke="#fff" strokeWidth={1}><title>{formatIsoDateAsMdyy(point.date)} · {signed(point.deltaPP)} pp · {point.role} hit</title></circle> : null)}
      {current ? <g><line x1={x(inspectedIndex)} x2={x(inspectedIndex)} y1={top} y2={height - bottom} stroke="#2c6ca3" strokeDasharray="3 4" />
        <circle cx={x(inspectedIndex)} cy={y(current.deltaPP)} r={5} fill={current.role === "main" ? "#b42318" : current.role === "supp" ? "#237f52" : "#fff"} stroke="#2c6ca3" strokeWidth={2} /></g> : null}
      {labels.map(index => <text key={index} x={x(index)} y={height - 16} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{formatIsoDateAsMdyy(points[index].date)}</text>)}
    </svg>
  </div>;
}
