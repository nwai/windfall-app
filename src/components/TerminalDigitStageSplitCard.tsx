import React, { useEffect, useMemo, useState } from "react";

import type { Draw } from "../types";
import {
  analyzeTerminalDigitStageSplit,
  type TerminalDigitLowFamilyMode,
  type TerminalDigitMonthLengthFilter,
  type TerminalDigitStageMetric,
  type TerminalDigitStageNextDrawEvidence,
} from "../lib/terminalDigitStageSplit";
import {
  MONTHLY_BUCKET_KEYS,
  bucketLabelForTimes,
  monthlyBucketDisplayForTimes,
  type StageIdealDrawState,
} from "../lib/monthlyDrawSummary";
import { HigField, InfoHelp } from "./shared/HigControls";
import "./TerminalDigitStageSplitCard.css";

interface TerminalDigitStageSplitCardProps {
  draws: Draw[];
  allDraws?: Draw[];
  includeSupp: boolean;
  stageIdealDrawState?: StageIdealDrawState | null;
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

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

const formatPointDifference = (value: number): string => (
  `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`
);

const modeLabel = (mode: TerminalDigitLowFamilyMode): string => (
  mode === "below-expected" ? "Below expected" : "Bottom 3 + ties"
);

const metricLabel = (metric: TerminalDigitStageMetric): string => (
  metric === "occurrences" ? "Occurrences" : "Draw presence"
);

const nextDrawEvidenceLabel = (evidence: TerminalDigitStageNextDrawEvidence): string => {
  if (evidence.eligibleMonths < 8 || evidence.ratio === null) return "Thin evidence";
  const olderRatio = evidence.olderPeriod.ratio;
  const newerRatio = evidence.newerPeriod.ratio;
  const directionHolds = olderRatio !== null && olderRatio > 1 && newerRatio !== null && newerRatio > 1;
  const clearsUncertainty = evidence.confidenceInterval !== null
    && evidence.confidenceInterval.low > 1
    && evidence.randomComparisonPValue !== null
    && evidence.randomComparisonPValue < 0.05;
  if (evidence.ratio > 1 && directionHolds && clearsUncertainty) return "Historically elevated";
  if (evidence.ratio > 1 && directionHolds) return "Promising, not confirmed";
  if (evidence.ratio > 1) return "Mixed positive evidence";
  if (evidence.ratio >= 0.95) return "Near expectation";
  return "Below expectation";
};

export const TerminalDigitStageSplitCard: React.FC<TerminalDigitStageSplitCardProps> = ({
  draws,
  allDraws,
  includeSupp,
  stageIdealDrawState = null,
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
  const nextDrawConfidenceText = analysis.nextDraw.confidenceInterval
    ? `${analysis.nextDraw.confidenceInterval.low.toFixed(3)}-${analysis.nextDraw.confidenceInterval.high.toFixed(3)}x`
    : "n/a";
  const nextDrawPValueText = analysis.nextDraw.randomComparisonPValue === null
    ? "n/a"
    : `p=${analysis.nextDraw.randomComparisonPValue.toFixed(3)}`;
  const nextDrawEvidenceStatus = nextDrawEvidenceLabel(analysis.nextDraw);
  const hasImmediateHistory = analysis.nextDraw.eligibleMonths > 0;
  const hasRemainderHistory = analysis.eligibleMonthCount > 0;
  const sourceLabel = historyScope === "baseline" ? "Baseline history" : "Active WFMQYH";
  const comparableMonthLabel = monthLength === "all"
    ? "complete calendar months"
    : `complete ${monthLength}-draw months`;

  useEffect(() => {
    if (monthLength !== "all" && !analysis.availableMonthLengths.includes(monthLength)) {
      setMonthLength("all");
    }
  }, [analysis.availableMonthLengths, monthLength]);

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
            Test what followed terminal families that were quiet early in a valid calendar-month sequence. No score from this card changes candidate generation.
          </p>
        </div>
        <span className="terminal-stage-split__split-pill">{splitLabel}</span>
      </header>

      <div className="terminal-stage-split__controls">
        <HigField
          label="History source"
          help="Immediate replay accepts an unbroken real D1-through-target prefix. Remainder evidence requires a complete calendar month. Mid-month WFMQYH slices are rejected."
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
            <option value="all">All month lengths</option>
            {analysis.availableMonthLengths.map((length) => (
              <option key={length} value={length}>{length}-draw months</option>
            ))}
          </select>
        </HigField>
      </div>

      <div className="terminal-stage-split__definition">
        <strong>{modeLabel(analysis.lowFamilyMode)}</strong> families are identified from {`D1-D${analysis.earlyDrawCount}`} using {metricLabel(analysis.metric).toLowerCase()}. <strong>Early quiet is not an avoid list.</strong> The immediate response tests only D{analysis.nextDraw.targetDrawNumber}; the remainder response separately tests D{analysis.lateStartDraw} through month end.
      </div>

      {hasImmediateHistory ? (
        <div className="terminal-stage-split__next-draw">
          <div className="terminal-stage-split__table-heading">
            <div>
              <strong>Immediate next-draw response</strong>
              <span>No-lookahead replay: classify through D{analysis.earlyDrawCount}, then inspect D{analysis.nextDraw.targetDrawNumber} only.</span>
            </div>
            <span className="terminal-stage-split__evidence-status">{nextDrawEvidenceStatus}</span>
          </div>
          <div className="terminal-stage-split__stats terminal-stage-split__stats--inside">
            <StatCard label="Comparable transitions" value={String(analysis.nextDraw.eligibleMonths)} detail={`D${analysis.earlyDrawCount} → D${analysis.nextDraw.targetDrawNumber}`} />
            <StatCard label={`D${analysis.nextDraw.targetDrawNumber} observed / expected`} value={`${formatMetricValue(analysis.nextDraw.actual)} / ${formatMetricValue(analysis.nextDraw.expected)}`} detail={metricLabel(analysis.metric)} />
            <StatCard label="Immediate ratio" value={formatRatio(analysis.nextDraw.ratio)} detail={`${formatLift(analysis.nextDraw.liftPercent)} versus expectation`} emphasis={analysis.nextDraw.ratio !== null && analysis.nextDraw.ratio > 1} />
            <StatCard label="Any quiet family" value={`${analysis.nextDraw.monthsWithAnyHit} / ${analysis.nextDraw.eligibleMonths}`} detail={`${analysis.nextDraw.expectedMonthsWithAnyHit.toFixed(1)} draws expected`} />
            <StatCard label="Bootstrap interval" value={nextDrawConfidenceText} detail="95% transition-resample interval" />
            <StatCard label="Random subset check" value={nextDrawPValueText} detail="Matched family-count comparison" />
          </div>
          <div className="terminal-stage-split__stability terminal-stage-split__stability--inside" aria-label="Immediate next-draw older and newer period stability">
            <span><strong>Older:</strong> {analysis.nextDraw.olderPeriod.months} transitions · {formatRatio(analysis.nextDraw.olderPeriod.ratio)}</span>
            <span><strong>Newer:</strong> {analysis.nextDraw.newerPeriod.months} transitions · {formatRatio(analysis.nextDraw.newerPeriod.ratio)}</span>
            <span className="terminal-stage-split__stability-note">A broad quiet set often produces at least one hit by chance; the observed/expected ratio is the more informative comparison.</span>
          </div>
        </div>
      ) : (
        <div className="terminal-stage-split__no-evidence" role="status">
          <strong>No comparable next-draw transitions for this setup</strong>
          <span>{sourceLabel} contains no valid D1-D{analysis.earlyDrawCount} prefix followed by a real recorded D{analysis.nextDraw.targetDrawNumber}.</span>
          <span>No estimate has been substituted. Choose Baseline history, widen WFMQYH to include a valid calendar-month prefix, or select an available month length.</span>
        </div>
      )}

      <CandidateTranslationCard
        translation={analysis.candidateTranslation}
        currentMonthKey={analysis.currentMonth?.monthKey ?? null}
        earlyDrawCount={analysis.earlyDrawCount}
        includeSupp={analysis.includeSupp}
        stageIdealDrawState={stageIdealDrawState}
      />

      {hasRemainderHistory ? (
        <>
          <div className="terminal-stage-split__evidence-heading">
            <strong>Remainder-of-month response</strong>
            <span>D{analysis.lateStartDraw} through month end answers a different question from the immediate next draw.</span>
          </div>
          <div className="terminal-stage-split__stats">
            <StatCard label="Comparable months" value={String(analysis.eligibleMonthCount)} detail={`${analysis.excludedIncompleteMonthCount} incomplete or partial excluded`} />
            <StatCard label="Remainder observed / expected" value={`${formatMetricValue(analysis.actual)} / ${formatMetricValue(analysis.expected)}`} detail={metricLabel(analysis.metric)} />
            <StatCard label="Remainder ratio" value={formatRatio(analysis.ratio)} detail={`${formatLift(analysis.liftPercent)} versus expectation`} emphasis={analysis.ratio !== null && analysis.ratio > 1} />
            <StatCard label="Remainder month support" value={`${analysis.aboveMonths} / ${supportTotal}`} detail={`${analysis.equalMonths} equal · ${analysis.belowMonths} below`} />
            <StatCard label="Bootstrap interval" value={confidenceText} detail="95% month-resample interval" />
            <StatCard label="Random subset check" value={pValueText} detail="One-sided comparison, not win probability" />
          </div>

          <div className="terminal-stage-split__stability" aria-label="Older and newer period stability">
            <span><strong>Older:</strong> {analysis.olderPeriod.months} months · {formatRatio(analysis.olderPeriod.ratio)}</span>
            <span><strong>Newer:</strong> {analysis.newerPeriod.months} months · {formatRatio(analysis.newerPeriod.ratio)}</span>
            <span className="terminal-stage-split__stability-note">A credible pattern should keep a similar direction in both periods.</span>
          </div>
        </>
      ) : (
        <div className="terminal-stage-split__no-evidence" role="status">
          <strong>No comparable completed months for the remainder test</strong>
          <span>{sourceLabel} contains no {comparableMonthLabel} extending beyond D{analysis.earlyDrawCount}.</span>
          <span>No partial month has been treated as a completed remainder-of-month result.</span>
        </div>
      )}

      {analysis.warnings.map((warning) => (
        <div key={warning} className="terminal-stage-split__warning">{warning}</div>
      ))}

      <CurrentMonthCard
        currentMonth={analysis.currentMonth}
        metric={analysis.metric}
        earlyDrawCount={analysis.earlyDrawCount}
        nextDraw={analysis.nextDraw}
      />

      {(hasImmediateHistory || hasRemainderHistory) && <div className="terminal-stage-split__table-block">
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
                <th>Next transitions</th>
                <th>Avg quiet families</th>
                <th>Next draw observed / expected</th>
                <th>Next draw ratio</th>
                <th>Remainder observed / expected</th>
                <th>Remainder ratio</th>
                <th>Remainder months above / equal / below</th>
              </tr>
            </thead>
            <tbody>
              {analysis.cutoffRows.map((row) => (
                <tr key={row.earlyDrawCount} className={row.earlyDrawCount === analysis.earlyDrawCount ? "is-selected" : undefined}>
                  <td>D1-D{row.earlyDrawCount} → D{row.earlyDrawCount + 1}-end</td>
                  <td>{row.eligibleMonths}</td>
                  <td>{row.nextDrawTransitions}</td>
                  <td>{row.averageSelectedDigits.toFixed(1)}</td>
                  <td>{formatMetricValue(row.nextDrawActual)} / {formatMetricValue(row.nextDrawExpected)}</td>
                  <td>{formatRatio(row.nextDrawRatio)}</td>
                  <td>{formatMetricValue(row.actual)} / {formatMetricValue(row.expected)}</td>
                  <td>{formatRatio(row.ratio)}</td>
                  <td>{row.aboveMonths} / {row.equalMonths} / {row.belowMonths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      <details className="terminal-stage-split__method">
        <summary>Method and truthfulness guardrails</summary>
        <ul>
          <li>Only real, dated Monday/Wednesday/Friday draws enter the analysis. An immediate replay needs an unbroken D1-through-target prefix; the remainder test still requires a complete calendar month.</li>
          <li>The early block selects terminal families without reading that month&apos;s later draws.</li>
          <li>The immediate response reads only D{analysis.nextDraw.targetDrawNumber}; the remainder response reads D{analysis.lateStartDraw} through month end. Neither result is allowed to redefine which families were early quiet.</li>
          <li>The candidate translation maps frozen terminal families to their complete 1-45 number pool and compares next-draw hits with the exact same-pool-size random expectation. No synthetic draw is inserted.</li>
          <li>Early quiet means below the selected early-stage rule. It is not an instruction to exclude those terminal digits.</li>
          <li>Expected counts account for terminal digits 1-5 having five available numbers and 0/6/7/8/9 having four.</li>
          <li>The immediate bootstrap interval resamples valid transitions; the remainder interval resamples complete months. The random-subset check compares equally sized random terminal-family selections.</li>
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

const CandidateTranslationCard: React.FC<{
  translation: ReturnType<typeof analyzeTerminalDigitStageSplit>["candidateTranslation"];
  currentMonthKey: string | null;
  earlyDrawCount: number;
  includeSupp: boolean;
  stageIdealDrawState: StageIdealDrawState | null;
}> = ({ translation, currentMonthKey, earlyDrawCount, includeSupp, stageIdealDrawState }) => {
  const statusText = translation.currentState === "awaiting-target"
    ? `Awaiting real D${translation.targetDrawNumber}`
    : translation.currentState === "target-recorded"
      ? `Real D${translation.targetDrawNumber} recorded`
      : translation.currentState === "insufficient-early-block"
        ? `D1-D${earlyDrawCount} not yet complete`
        : "No open-month pool";

  return (
    <div className="terminal-stage-split__translation">
      <div className="terminal-stage-split__table-heading">
        <div>
          <strong>Candidate translation replay</strong>
          <span>Observe only · maps the frozen quiet families to every matching number from 1-45.</span>
        </div>
        <span className="terminal-stage-split__evidence-status">{statusText}</span>
      </div>

      <div className="terminal-stage-split__translation-current" aria-live="polite">
        <div className="terminal-stage-split__translation-label">
          <span>Current family pool</span>
          <strong>
            {translation.currentSelectedDigits.length
              ? translation.currentSelectedDigits.join(", ")
              : "Not available"}
          </strong>
          <small>
            {translation.currentPoolNumbers.length
              ? `${translation.currentPoolNumbers.length} eligible numbers; family membership is not an individual-number rank.`
              : "Windfall will show the pool after the selected early block is complete in an unbroken real month."}
          </small>
        </div>
        {translation.currentPoolNumbers.length > 0 && (
          <div className="terminal-stage-split__number-pool" aria-label="Current terminal-family number pool">
            {translation.currentPoolNumbers.map((number) => <span key={number}>{number}</span>)}
          </div>
        )}
      </div>

      <MonthlyBucketCrossCheck
        translation={translation}
        currentMonthKey={currentMonthKey}
        includeSupp={includeSupp}
        stageIdealDrawState={stageIdealDrawState}
      />

      {translation.eligibleTransitions > 0 ? (
        <>
          <div className="terminal-stage-split__stats terminal-stage-split__stats--inside terminal-stage-split__translation-stats">
            <StatCard label="Real transitions" value={String(translation.eligibleTransitions)} detail={`Frozen D${earlyDrawCount} → real D${translation.targetDrawNumber}`} />
            <StatCard label="Average pool hits" value={translation.observedAverageHits.toFixed(2)} detail={`${includeSupp ? "8-number" : "6-number"} target draw`} />
            <StatCard label="Exact random average" value={translation.expectedAverageHits.toFixed(2)} detail="Same pool size, without replacement" />
            <StatCard label="Observed / random" value={formatRatio(translation.ratio)} detail="Descriptive replay ratio" emphasis={translation.ratio !== null && translation.ratio > 1} />
            <StatCard label="Older transitions" value={formatRatio(translation.olderPeriod.ratio)} detail={`${translation.olderPeriod.transitions} dated rows`} />
            <StatCard label="Newer transitions" value={formatRatio(translation.newerPeriod.ratio)} detail={`${translation.newerPeriod.transitions} dated rows`} />
          </div>

          <div className="terminal-stage-split__translation-grid">
            <div className="terminal-stage-split__translation-section">
              <div className="terminal-stage-split__translation-section-heading">
                <strong>Next-draw hit-count distribution</strong>
                <span>Observed real transitions versus exact hypergeometric expectation.</span>
              </div>
              <div className="terminal-stage-split__table-scroll terminal-stage-split__table-scroll--translation-distribution">
                <table>
                  <thead>
                    <tr>
                      <th>Pool hits</th>
                      <th>Observed</th>
                      <th>Observed share</th>
                      <th>Random expected</th>
                      <th>Random share</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {translation.distribution.map((row) => (
                      <tr key={row.hitCount}>
                        <td>{row.hitCount}</td>
                        <td>{row.observedTransitions}</td>
                        <td>{formatPercent(row.observedPercent)}</td>
                        <td>{row.randomExpectedTransitions.toFixed(2)}</td>
                        <td>{formatPercent(row.randomExpectedPercent)}</td>
                        <td>{formatPointDifference(row.observedPercent - row.randomExpectedPercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="terminal-stage-split__translation-section">
              <div className="terminal-stage-split__translation-section-heading">
                <strong>Real-draw audit ledger</strong>
                <span>Newest first. A qualifying CSV draw adds a row automatically; there is no manual success entry.</span>
              </div>
              <div className="terminal-stage-split__table-scroll terminal-stage-split__table-scroll--translation-audit">
                <table>
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>Frozen families</th>
                      <th>Candidate pool</th>
                      <th>Real draw</th>
                      <th>Pool hits</th>
                      <th>Hits / expected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {translation.auditRows.map((row) => (
                      <tr key={`${row.monthKey}-${row.targetDate}`}>
                        <td>{formatMonth(row.monthKey)} · D{row.targetDrawNumber}<small>{row.targetDate}</small></td>
                        <td>{row.selectedDigits.length ? row.selectedDigits.join(", ") : "none"}</td>
                        <td>{row.poolNumbers.length}: {row.poolNumbers.length ? row.poolNumbers.join(" ") : "none"}</td>
                        <td>{row.targetNumbers.join(" ")}</td>
                        <td>{row.hitNumbers.length ? row.hitNumbers.join(" ") : "none"}</td>
                        <td>{row.hitCount} / {row.expectedHits.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="terminal-stage-split__empty">
          No valid real D1-D{earlyDrawCount} → D{translation.targetDrawNumber} transition is available for this setup. Windfall has not inserted a simulated or fallback result.
        </p>
      )}

      <p className="terminal-stage-split__translation-note">
        The replay answers how many whole numbers from the terminal-family pool appeared next. It does not claim that every number in the pool is equally useful, and it does not alter generation.
      </p>
    </div>
  );
};

const MonthlyBucketCrossCheck: React.FC<{
  translation: ReturnType<typeof analyzeTerminalDigitStageSplit>["candidateTranslation"];
  currentMonthKey: string | null;
  includeSupp: boolean;
  stageIdealDrawState: StageIdealDrawState | null;
}> = ({ translation, currentMonthKey, includeSupp, stageIdealDrawState }) => {
  if (!stageIdealDrawState) {
    return (
      <div className="terminal-stage-split__cross-check is-unavailable" role="status">
        <strong>Monthly Draw Summary cross-check unavailable</strong>
        <span>Stage IDM has not published a comparable next-stage bucket target. No fallback target has been substituted.</span>
      </div>
    );
  }

  if (!includeSupp) {
    return (
      <div className="terminal-stage-split__cross-check is-unavailable" role="status">
        <strong>Scopes do not match</strong>
        <span>Candidate Translation is using mains only, while Monthly Draw Summary Stage IDM uses all 8 drawn numbers. Turn on Mains + supps before comparing them.</span>
      </div>
    );
  }

  const monthMatches = currentMonthKey === stageIdealDrawState.workingMonthLabel;
  const drawMatches = translation.targetDrawNumber === stageIdealDrawState.targetStageDrawCount;
  if (!monthMatches || !drawMatches) {
    const neededEarlyDrawCount = Math.max(1, stageIdealDrawState.targetStageDrawCount - 1);
    return (
      <div className="terminal-stage-split__cross-check is-misaligned" role="status">
        <strong>Not directly comparable yet</strong>
        <span>
          Candidate Translation targets {currentMonthKey ?? "no open month"} D{translation.targetDrawNumber}; Monthly Draw Summary Stage IDM targets {stageIdealDrawState.workingMonthLabel} D{stageIdealDrawState.targetStageDrawCount}.
          {monthMatches && neededEarlyDrawCount >= 3 && neededEarlyDrawCount <= 10
            ? ` Set Early block ends to D${neededEarlyDrawCount} to compare the same next draw.`
            : " The month and target draw must match before Windfall will compare them."}
        </span>
      </div>
    );
  }

  if (!translation.currentPoolNumbers.length) {
    return (
      <div className="terminal-stage-split__cross-check is-unavailable" role="status">
        <strong>Aligned target, but no terminal-family pool</strong>
        <span>The selected early block has not produced a current candidate pool, so there is nothing truthful to cross-check against Stage IDM.</span>
      </div>
    );
  }

  const poolSet = new Set(translation.currentPoolNumbers);
  const rows = MONTHLY_BUCKET_KEYS.map((key, times) => {
    const bucketNumbers = [...stageIdealDrawState.bucketSets[key]].sort((left, right) => left - right);
    const overlapNumbers = bucketNumbers.filter((number) => poolSet.has(number));
    const requestedCount = stageIdealDrawState.idealDrawBucketCounts[times] ?? 0;
    return {
      key,
      times,
      bucketNumbers,
      overlapNumbers,
      requestedCount,
      shortfall: Math.max(0, requestedCount - overlapNumbers.length),
    };
  });
  const activeRows = rows.filter((row) => row.bucketNumbers.length > 0 || row.requestedCount > 0);
  const compatible = rows.every((row) => row.shortfall === 0);
  const requestedTotal = rows.reduce((sum, row) => sum + row.requestedCount, 0);
  const overlapTotal = rows.reduce((sum, row) => sum + row.overlapNumbers.length, 0);

  return (
    <div className="terminal-stage-split__cross-check">
      <div className="terminal-stage-split__cross-check-heading">
        <div>
          <strong>Candidate Translation × Monthly Draw Summary</strong>
          <span>Same target: {stageIdealDrawState.workingMonthLabel} D{stageIdealDrawState.targetStageDrawCount} · Stage IDM baseline {stageIdealDrawState.comparableMonthCount} comparable month{stageIdealDrawState.comparableMonthCount === 1 ? "" : "s"}</span>
        </div>
        <span className={`terminal-stage-split__compatibility${compatible ? " is-compatible" : " is-tension"}`}>
          {compatible ? "Composition-compatible" : "Bucket tension"}
        </span>
      </div>

      <div className="terminal-stage-split__cross-check-summary">
        <span><strong>{translation.currentPoolNumbers.length}</strong> terminal-family numbers</span>
        <span><strong>{overlapTotal}</strong> mapped into current buckets</span>
        <span><strong>{requestedTotal}</strong> Stage IDM target picks</span>
      </div>

      <div className="terminal-stage-split__table-scroll terminal-stage-split__table-scroll--cross-check">
        <table>
          <thead>
            <tr>
              <th>Monthly bucket</th>
              <th>All numbers now</th>
              <th>Translation overlap</th>
              <th>Stage IDM target</th>
              <th>Compatibility</th>
              <th>Overlapping numbers</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row) => {
              const display = monthlyBucketDisplayForTimes(row.times);
              return (
                <tr key={row.key}>
                  <td>
                    <span
                      className="terminal-stage-split__bucket-chip"
                      style={{ backgroundColor: display.softColor, borderColor: display.color, color: display.color }}
                    >
                      {bucketLabelForTimes(row.times)}
                    </span>
                  </td>
                  <td>{row.bucketNumbers.length}</td>
                  <td>{row.overlapNumbers.length}</td>
                  <td>{row.requestedCount}</td>
                  <td>{row.shortfall === 0 ? "Enough overlap" : `Short by ${row.shortfall}`}</td>
                  <td>{row.overlapNumbers.length ? row.overlapNumbers.join(" ") : "none"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="terminal-stage-split__cross-check-note">
        {compatible
          ? "The terminal-family pool can supply the Stage IDM bucket recipe. This is compatibility between two different diagnostics, not proof that either is accurate or that their intersection is more predictive."
          : "The terminal-family pool cannot supply every Stage IDM bucket target. That is genuine tension between the current diagnostics, not permission to silently alter either result."}
        {" "}Accuracy requires a separate no-lookahead joint replay against real target draws and matched random baselines.
      </p>
    </div>
  );
};

const CurrentMonthCard: React.FC<{
  currentMonth: ReturnType<typeof analyzeTerminalDigitStageSplit>["currentMonth"];
  metric: TerminalDigitStageMetric;
  earlyDrawCount: number;
  nextDraw: TerminalDigitStageNextDrawEvidence;
}> = ({ currentMonth, metric, earlyDrawCount, nextDraw }) => (
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
          <span>Early quiet after D{earlyDrawCount}: <strong>{currentMonth.selectedDigits.length ? currentMonth.selectedDigits.join(", ") : "none"}</strong></span>
          <span>Later so far: <strong>{formatMetricValue(currentMonth.postSplitActual)} / {formatMetricValue(currentMonth.postSplitExpected)}</strong></span>
          <span>Ratio: <strong>{formatRatio(currentMonth.postSplitRatio)}</strong></span>
        </div>
        <p className="terminal-stage-split__current-note">
          <strong>Do not read early quiet as avoid.</strong>{" "}
          {currentMonth.recordedDraws === earlyDrawCount
            ? `The next unrecorded draw is D${earlyDrawCount + 1}; the prior-response columns show what followed the same classification in valid historical month prefixes.`
            : `D${earlyDrawCount + 1} is already recorded in this month, so this is a retrospective split rather than a next-draw preview.`}
          {" "}{currentMonth.note}
        </p>
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
                <th>Prior D{earlyDrawCount + 1} response</th>
                <th>Prior D{earlyDrawCount + 1} presence</th>
              </tr>
            </thead>
            <tbody>
              {currentMonth.rows.map((row) => {
                const response = nextDraw.digitRows.find((candidate) => candidate.digit === row.digit);
                return (
                  <tr key={row.digit} className={row.selected ? "is-quiet" : undefined}>
                    <td><span className="terminal-stage-split__digit">{row.digit}</span></td>
                    <td>{row.familyNumbers.join(" ")}</td>
                    <td>{formatMetricValue(row.earlyActual)}</td>
                    <td>{formatMetricValue(row.earlyExpected)}</td>
                    <td>{row.earlyIndex === null ? "n/a" : row.earlyIndex.toFixed(2)}</td>
                    <td>{row.selected ? "Early quiet" : "Not early quiet"}</td>
                    <td>{formatMetricValue(row.postSplitActual)} / {formatMetricValue(row.postSplitExpected)}</td>
                    <td>
                      {row.selected && response
                        ? `${formatMetricValue(response.actual)} / ${formatMetricValue(response.expected)} · ${formatRatio(response.ratio)}`
                        : "—"}
                    </td>
                    <td>
                      {row.selected && response
                        ? `${response.presenceHits} / ${response.trials} draws · ${response.expectedPresenceHits.toFixed(1)} expected`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    )}
  </div>
);

export default TerminalDigitStageSplitCard;
