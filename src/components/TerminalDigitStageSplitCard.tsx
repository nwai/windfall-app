import React, { useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeTerminalDigitStageSplit,
  type TerminalDigitLowFamilyMode,
  type TerminalDigitMonthLengthFilter,
  type TerminalDigitStageMetric,
} from "../lib/terminalDigitStageSplit";
import { HigField, InfoHelp } from "./shared/HigControls";
import "./TerminalDigitStageSplitCard.css";

interface TerminalDigitStageSplitCardProps {
  draws: Draw[];
  allDraws?: Draw[];
  includeSupp: boolean;
}

type HistoryScope = "baseline" | "wfmqyh";

const formatMonth = (monthKey: string): string => {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" })
    .format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
};

const formatRatio = (value: number | null): string => (
  value === null ? "n/a" : `${value.toFixed(3)}x`
);

const formatLift = (value: number | null): string => {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
};

const formatMetricValue = (value: number): string => (
  Number.isInteger(value) ? String(value) : value.toFixed(1)
);

const modeLabel = (mode: TerminalDigitLowFamilyMode): string => (
  mode === "below-expected" ? "Below expected" : "Bottom 3 + ties"
);

const metricLabel = (metric: TerminalDigitStageMetric): string => (
  metric === "occurrences" ? "Occurrences" : "Draw presence"
);

export const TerminalDigitStageSplitCard: React.FC<TerminalDigitStageSplitCardProps> = ({
  draws,
  allDraws,
  includeSupp,
}) => {
  const [historyScope, setHistoryScope] = useState<HistoryScope>("baseline");
  const [earlyDrawCount, setEarlyDrawCount] = useState(6);
  const [metric, setMetric] = useState<TerminalDigitStageMetric>("occurrences");
  const [lowFamilyMode, setLowFamilyMode] = useState<TerminalDigitLowFamilyMode>("below-expected");
  const [monthLength, setMonthLength] = useState<TerminalDigitMonthLengthFilter>("all");
  const sourceDraws = historyScope === "baseline" && allDraws?.length ? allDraws : draws;

  const analysis = useMemo(() => analyzeTerminalDigitStageSplit(sourceDraws, {
    includeSupp,
    earlyDrawCount,
    metric,
    lowFamilyMode,
    monthLength,
  }), [earlyDrawCount, includeSupp, lowFamilyMode, metric, monthLength, sourceDraws]);

  const splitLabel = `D1-D${analysis.earlyDrawCount} → D${analysis.lateStartDraw}-month end`;
  const supportTotal = analysis.aboveMonths + analysis.equalMonths + analysis.belowMonths;
  const confidenceText = analysis.confidenceInterval
    ? `${analysis.confidenceInterval.low.toFixed(3)}-${analysis.confidenceInterval.high.toFixed(3)}x`
    : "n/a";
  const pValueText = analysis.randomComparisonPValue === null
    ? "n/a"
    : `p=${analysis.randomComparisonPValue.toFixed(3)}`;

  return (
    <section className="terminal-stage-split" aria-labelledby="terminal-stage-split-title">
      <header className="terminal-stage-split__header">
        <div>
          <div className="terminal-stage-split__eyebrow">Observe only · exploratory</div>
          <div className="terminal-stage-split__title-line">
            <h4 id="terminal-stage-split-title">Monthly Terminal Digit Stage-Split Diagnostic</h4>
            <InfoHelp label="About the terminal digit stage-split diagnostic">
              The early block classifies low terminal-digit families without seeing the later block. The later block then measures whether those same families appeared above a size-normalised random expectation. Interactive cutoff searches are exploratory, not predictions.
            </InfoHelp>
          </div>
          <p>
            Test whether terminal families that are quiet early in a complete month become more active later. No score from this card changes candidate generation.
          </p>
        </div>
        <span className="terminal-stage-split__split-pill">{splitLabel}</span>
      </header>

      <div className="terminal-stage-split__controls">
        <HigField
          label="History source"
          help="Complete calendar months only. WFMQYH can contain fewer complete months because partial edge months are rejected."
        >
          <select value={historyScope} onChange={(event) => setHistoryScope(event.target.value as HistoryScope)}>
            <option value="baseline">Complete baseline history</option>
            <option value="wfmqyh">Active WFMQYH</option>
          </select>
        </HigField>

        <HigField label="Early block ends" help={`D${earlyDrawCount + 1} begins the later comparison block.`}>
          <select value={earlyDrawCount} onChange={(event) => setEarlyDrawCount(Number(event.target.value))}>
            {Array.from({ length: 8 }, (_, index) => index + 3).map((drawNumber) => (
              <option key={drawNumber} value={drawNumber}>D{drawNumber}</option>
            ))}
          </select>
        </HigField>

        <HigField
          label="Quiet-family rule"
          help="Below expected can select any number of families. Bottom 3 includes exact ties at the third-lowest normalised index."
        >
          <select value={lowFamilyMode} onChange={(event) => setLowFamilyMode(event.target.value as TerminalDigitLowFamilyMode)}>
            <option value="below-expected">Below expected</option>
            <option value="bottom-three">Bottom 3 + ties</option>
          </select>
        </HigField>

        <HigField
          label="Measure"
          help="Occurrences counts every matching number. Draw presence counts a terminal family at most once per draw."
        >
          <select value={metric} onChange={(event) => setMetric(event.target.value as TerminalDigitStageMetric)}>
            <option value="occurrences">Occurrences</option>
            <option value="draw-presence">Draw presence</option>
          </select>
        </HigField>

        <HigField label="Month length" help="Compare all complete months or only months with the selected scheduled draw count.">
          <select
            value={String(monthLength)}
            onChange={(event) => setMonthLength(event.target.value === "all" ? "all" : Number(event.target.value))}
          >
            <option value="all">All complete months</option>
            {analysis.availableMonthLengths.map((length) => (
              <option key={length} value={length}>{length}-draw months</option>
            ))}
          </select>
        </HigField>
      </div>

      <div className="terminal-stage-split__definition">
        <strong>{modeLabel(analysis.lowFamilyMode)}</strong> families are identified from {`D1-D${analysis.earlyDrawCount}`} using {metricLabel(analysis.metric).toLowerCase()}. Their {`D${analysis.lateStartDraw}-end`} result is compared with the fair-draw expectation after correcting for 4-member and 5-member terminal families.
      </div>

      <div className="terminal-stage-split__stats">
        <StatCard label="Comparable months" value={String(analysis.eligibleMonthCount)} detail={`${analysis.excludedIncompleteMonthCount} incomplete or partial excluded`} />
        <StatCard label="Late observed / expected" value={`${formatMetricValue(analysis.actual)} / ${formatMetricValue(analysis.expected)}`} detail={metricLabel(analysis.metric)} />
        <StatCard label="Late ratio" value={formatRatio(analysis.ratio)} detail={`${formatLift(analysis.liftPercent)} versus expectation`} emphasis={analysis.ratio !== null && analysis.ratio > 1} />
        <StatCard label="Month support" value={`${analysis.aboveMonths} / ${supportTotal}`} detail={`${analysis.equalMonths} equal · ${analysis.belowMonths} below`} />
        <StatCard label="Bootstrap interval" value={confidenceText} detail="95% month-resample interval" />
        <StatCard label="Random subset check" value={pValueText} detail="One-sided comparison, not win probability" />
      </div>

      <div className="terminal-stage-split__stability" aria-label="Older and newer period stability">
        <span><strong>Older:</strong> {analysis.olderPeriod.months} months · {formatRatio(analysis.olderPeriod.ratio)}</span>
        <span><strong>Newer:</strong> {analysis.newerPeriod.months} months · {formatRatio(analysis.newerPeriod.ratio)}</span>
        <span className="terminal-stage-split__stability-note">A credible pattern should keep a similar direction in both periods.</span>
      </div>

      {analysis.warnings.map((warning) => (
        <div key={warning} className="terminal-stage-split__warning">{warning}</div>
      ))}

      <CurrentMonthCard currentMonth={analysis.currentMonth} metric={analysis.metric} earlyDrawCount={analysis.earlyDrawCount} />

      <div className="terminal-stage-split__table-block">
        <div className="terminal-stage-split__table-heading">
          <div>
            <strong>Cutoff comparison</strong>
            <span>Compare split points without silently declaring the highest row predictive.</span>
          </div>
          <span>Selected D{analysis.earlyDrawCount}</span>
        </div>
        <div className="terminal-stage-split__table-scroll">
          <table>
            <thead>
              <tr>
                <th>Split</th>
                <th>Months</th>
                <th>Avg quiet families</th>
                <th>Observed</th>
                <th>Expected</th>
                <th>Ratio</th>
                <th>Months above / equal / below</th>
              </tr>
            </thead>
            <tbody>
              {analysis.cutoffRows.map((row) => (
                <tr key={row.earlyDrawCount} className={row.earlyDrawCount === analysis.earlyDrawCount ? "is-selected" : undefined}>
                  <td>D1-D{row.earlyDrawCount} → D{row.earlyDrawCount + 1}-end</td>
                  <td>{row.eligibleMonths}</td>
                  <td>{row.averageSelectedDigits.toFixed(1)}</td>
                  <td>{formatMetricValue(row.actual)}</td>
                  <td>{formatMetricValue(row.expected)}</td>
                  <td>{formatRatio(row.ratio)}</td>
                  <td>{row.aboveMonths} / {row.equalMonths} / {row.belowMonths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="terminal-stage-split__method">
        <summary>Method and truthfulness guardrails</summary>
        <ul>
          <li>Only real, complete Monday/Wednesday/Friday calendar months enter the historical comparison.</li>
          <li>The early block selects terminal families without reading that month&apos;s later draws.</li>
          <li>Expected counts account for terminal digits 1-5 having five available numbers and 0/6/7/8/9 having four.</li>
          <li>The bootstrap interval resamples complete months. The random-subset check compares equally sized random terminal-family selections.</li>
          <li>Trying several cutoffs increases the chance of finding an attractive result by accident. A setting becomes a forward test only after it is frozen before unseen draws or months arrive.</li>
        </ul>
      </details>
    </section>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
}> = ({ label, value, detail, emphasis = false }) => (
  <div className={`terminal-stage-split__stat${emphasis ? " is-positive" : ""}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>
);

const CurrentMonthCard: React.FC<{
  currentMonth: ReturnType<typeof analyzeTerminalDigitStageSplit>["currentMonth"];
  metric: TerminalDigitStageMetric;
  earlyDrawCount: number;
}> = ({ currentMonth, metric, earlyDrawCount }) => (
  <div className="terminal-stage-split__current">
    <div className="terminal-stage-split__table-heading">
      <div>
        <strong>Current-month inspection</strong>
        <span>Uses the loaded month only when its dated draws form an unbroken prefix from D1.</span>
      </div>
      {currentMonth ? <span>{formatMonth(currentMonth.monthKey)} · {currentMonth.recordedDraws}/{currentMonth.expectedDraws}</span> : <span>No open month</span>}
    </div>

    {!currentMonth ? (
      <p className="terminal-stage-split__empty">The latest loaded month is complete, so there is no open-month preview.</p>
    ) : !currentMonth.hasCompleteEarlyBlock ? (
      <p className="terminal-stage-split__empty">{currentMonth.note}</p>
    ) : (
      <>
        <div className="terminal-stage-split__current-summary">
          <span>Quiet after D{earlyDrawCount}: <strong>{currentMonth.selectedDigits.length ? currentMonth.selectedDigits.join(", ") : "none"}</strong></span>
          <span>Later so far: <strong>{formatMetricValue(currentMonth.postSplitActual)} / {formatMetricValue(currentMonth.postSplitExpected)}</strong></span>
          <span>Ratio: <strong>{formatRatio(currentMonth.postSplitRatio)}</strong></span>
        </div>
        <p className="terminal-stage-split__current-note">{currentMonth.note}</p>
        <div className="terminal-stage-split__table-scroll terminal-stage-split__table-scroll--current">
          <table>
            <thead>
              <tr>
                <th>Digit</th>
                <th>Family</th>
                <th>Early {metric === "occurrences" ? "hits" : "draws present"}</th>
                <th>Expected</th>
                <th>Index</th>
                <th>Classification</th>
                <th>After split so far</th>
              </tr>
            </thead>
            <tbody>
              {currentMonth.rows.map((row) => (
                <tr key={row.digit} className={row.selected ? "is-quiet" : undefined}>
                  <td><span className="terminal-stage-split__digit">{row.digit}</span></td>
                  <td>{row.familyNumbers.join(" ")}</td>
                  <td>{formatMetricValue(row.earlyActual)}</td>
                  <td>{formatMetricValue(row.earlyExpected)}</td>
                  <td>{row.earlyIndex === null ? "n/a" : row.earlyIndex.toFixed(2)}</td>
                  <td>{row.selected ? "Quiet" : "Not selected"}</td>
                  <td>{formatMetricValue(row.postSplitActual)} / {formatMetricValue(row.postSplitExpected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </div>
);

export default TerminalDigitStageSplitCard;
