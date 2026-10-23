import React, { useId, useMemo, useState } from "react";
import type { Draw } from "../types";
import { formatUserExclusionReminder, normalizeUserExclusionLocks } from "../lib/userExclusionLocks";
import { filterRealDrawHistory } from "../lib/realDrawHistory";
import { sortDrawsChronologically } from "../lib/recentDraws";
import { strictValidateDraws } from "../lib/strictDrawValidation";
import { formatIsoDateAsMdyy, normalizeHistoryDate } from "../lib/drawHistoryReview";
import { InfoHelp } from "./shared/HigControls";
import { NumberTrendMovementReplay } from "./NumberTrendMovementReplay";
import { calculateNumberTrendRate, NUMBER_TREND_WEEK_DRAW_WINDOW, NUMBER_TREND_MONTH_DRAW_WINDOW } from "../lib/numberTrendMovement";

export { NUMBER_TREND_WEEK_DRAW_WINDOW, NUMBER_TREND_MONTH_DRAW_WINDOW } from "../lib/numberTrendMovement";

export type NumberTrend = {
  number: number;   // 1..45
  // New short windows
  d3: number;       // last 3 draws
  d9: number;       // last 9 draws
  d15: number;      // last 15 draws
  // Existing windows (now measured in draws)
  fortnight: number; // 6 draws
  month: number;     // 13 draws, the typical calendar-month window for a 3-draw/week game
  quarter: number;   // 36 draws
  year: number;      // 156 draws
  all: number;       // all draws in the provided history
};

export function NumberTrendsTable({
  trends,
  onToggle,
  selected,
  externalSelectedNumbers,
  externalSelectedLabel = "external forced selection",
  // New optional props to support usage in App.tsx
  history,
  allHistory,
  strictDroughtNumbers,
  empiricalDroughtNumbers,
  excludedNumbers,
  trendSelectedNumbers,
  onExcludeToggle,
  onTrendSelectToggle,
  onTrace,
}: {
  trends?: NumberTrend[];
  onToggle?: (n: number) => void;
  selected?: number[];
  externalSelectedNumbers?: number[];
  externalSelectedLabel?: string;
  // New optional props
  history?: Draw[];
  allHistory?: Draw[];
  strictDroughtNumbers?: readonly number[];
  empiricalDroughtNumbers?: readonly number[];
  excludedNumbers?: number[];
  trendSelectedNumbers?: number[];
  onExcludeToggle?: (n: number) => void;
  onTrendSelectToggle?: (n: number) => void;
  onTrace?: (line: string) => void;
}) {
  const sourceId = useId();
  const [historySource, setHistorySource] = useState<"window" | "all">("window");
  const canSwitchSource = history !== undefined && allHistory !== undefined;
  const useAllHistory = canSwitchSource && historySource === "all";
  const sourceHistory = useAllHistory ? allHistory : history;
  const evidence = useMemo(() => {
    if (sourceHistory === undefined) return undefined;
    const real = filterRealDrawHistory(sourceHistory, "Number Trends");
    const valid = strictValidateDraws(real.history);
    return { history: sortDrawsChronologically(valid), simulated: real.simulatedRowsIgnored, invalid: real.history.length - valid.length };
  }, [sourceHistory]);
  const analysisHistory = evidence?.history;
  const recentDrawCount = Math.min(NUMBER_TREND_WEEK_DRAW_WINDOW, analysisHistory?.length ?? NUMBER_TREND_WEEK_DRAW_WINDOW);
  const comparisonDrawCount = Math.min(NUMBER_TREND_MONTH_DRAW_WINDOW, analysisHistory?.length ?? NUMBER_TREND_MONTH_DRAW_WINDOW);
  const dateLabel = (date: string) => formatIsoDateAsMdyy(normalizeHistoryDate(date));
  const strictDroughtSet = useMemo(() => new Set(strictDroughtNumbers), [strictDroughtNumbers]);
  const empiricalDroughtSet = useMemo(() => new Set(empiricalDroughtNumbers), [empiricalDroughtNumbers]);

  // Keep this view's scope separate from the WFMQYH trend data used elsewhere.
  const computedTrends: NumberTrend[] = useMemo(() => {
    if (analysisHistory === undefined) return trends || [];
    const counts = (windowSize: number): number[] => {
      const arr = Array(46).fill(0) as number[];
      const window = analysisHistory.slice(-windowSize);
      for (const d of window) {
        for (const n of new Set([...d.main, ...d.supp])) arr[n] += 1;
      }
      return arr;
    };
    const allCounts = (() => {
      const arr = Array(46).fill(0) as number[];
      for (const d of analysisHistory) for (const n of new Set([...d.main, ...d.supp])) arr[n] += 1;
      return arr;
    })();
    const d3 = counts(3);
    const d9 = counts(9);
    const d15 = counts(15);
    const d6 = counts(6); // fortnight
    const d13 = counts(NUMBER_TREND_MONTH_DRAW_WINDOW); // typical month
    const d36 = counts(36); // quarter
    const d156 = counts(156); // year
    const res: NumberTrend[] = Array.from({ length: 45 }, (_, i) => i + 1).map((n) => ({
      number: n,
      d3: d3[n] || 0,
      d9: d9[n] || 0,
      d15: d15[n] || 0,
      fortnight: d6[n] || 0,
      month: d13[n] || 0,
      quarter: d36[n] || 0,
      year: d156[n] || 0,
      all: allCounts[n] || 0,
    }));
    return res;
  }, [analysisHistory, trends]);

  const ownSelected = trendSelectedNumbers || selected || [];
  const externalSelected = externalSelectedNumbers || [];
  const userExcludedNumbers = useMemo(
    () => normalizeUserExclusionLocks(excludedNumbers),
    [excludedNumbers],
  );
  const userExcludedSet = useMemo(() => new Set(userExcludedNumbers), [userExcludedNumbers]);
  const userExclusionReminder = useMemo(
    () => formatUserExclusionReminder(userExcludedNumbers),
    [userExcludedNumbers],
  );
  const activeSelected = useMemo(
    () => Array.from(new Set([...ownSelected, ...externalSelected])).filter((number) => !userExcludedSet.has(number)),
    [externalSelected, ownSelected, userExcludedSet],
  );
  const ownSelectedSet = useMemo(() => new Set(ownSelected), [ownSelected]);
  const externalSelectedSet = useMemo(() => new Set(externalSelected), [externalSelected]);

  const trendByNumber = useMemo(() => {
    const map = new Map<number, NumberTrend>();
    computedTrends.forEach((trend) => map.set(trend.number, trend));
    return map;
  }, [computedTrends]);

  const trendBlocks = useMemo(
    () =>
      Array.from({ length: 9 }, (_, blockIndex) => {
        const start = blockIndex * 5 + 1;
        const end = start + 4;
        const blockTrends = Array.from({ length: 5 }, (_, offset) => {
          const number = start + offset;
          return trendByNumber.get(number) ?? emptyTrend(number);
        });
        return { start, end, trends: blockTrends };
      }),
    [trendByNumber],
  );

  // Data for chart (only selected numbers)
  const selectedSeries = useMemo(() => {
    const pick = new Map<number, NumberTrend>();
    computedTrends.forEach((t) => {
      if (activeSelected.includes(t.number)) pick.set(t.number, t);
    });
    return Array.from(pick.values()).map((t) => ({
      number: t.number,
      values: [t.d3, t.fortnight, t.d9, t.month, t.d15, t.quarter, t.year, t.all],
    }));
  }, [computedTrends, activeSelected]);

  // Helpers for Δ column: latest week versus a typical calendar month.
  const colorForNumber = (n: number) => `hsl(${(n * 23) % 360}, 70%, 45%)`;
  const shortTermDeltaPP = (t: NumberTrend) => calculateNumberTrendRate(t.d3, t.month, recentDrawCount, comparisonDrawCount);

  const Arrow = ({
    dir,
    color,
    sizePx = 18,
  }: {
    dir: "up" | "down" | "flat";
    color: string;
    sizePx?: number;
  }) => {
    const sym = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
    const c = dir === "flat" ? "#666" : color;
    const opacity = dir === "flat" ? 0.55 : 1;
    return (
      <span
        style={{
          color: c,
          opacity,
          fontWeight: 900,
          fontSize: sizePx,
          display: "inline-block",
          width: sizePx + 2,
          textAlign: "center",
          lineHeight: 1,
          verticalAlign: "middle",
        }}
        aria-hidden
      >
        {sym}
      </span>
    );
  };

  const handleToggle = (n: number) => {
    // Prefer new callbacks; fall back to legacy onToggle
    if (onTrendSelectToggle) onTrendSelectToggle(n);
    else onToggle?.(n);
    onTrace?.(`[NumberTrendsTable] toggled ${n}`);
  };

  return (
    <section className="windfall-number-trends" aria-label="Number trends by five-number range">
      {canSwitchSource && (
        <div className="windfall-number-trends__source-controls">
          <fieldset>
            <legend>History source</legend>
            <label><input type="radio" name={`${sourceId}-history`} checked={!useAllHistory} onChange={() => setHistorySource("window")} />WFMQYH</label>
            <label><input type="radio" name={`${sourceId}-history`} checked={useAllHistory} onChange={() => setHistorySource("all")} />All history</label>
          </fieldset>
          <span className="windfall-number-trends__note">Local to Number Trends; does not change global WFMQYH or generation.</span>
          <InfoHelp label="About Number Trends history sources">
            WFMQYH uses the active global draw window or range. All history uses every loaded real draw, including the opening partial month;
            it is not the baseline-month slice. Simulated and malformed rows are not counted.
            Each D count uses up to that many newest draws in the chosen source; All totals that source.
            Short counts may stay the same in both views when the newest draws are shared.
            Arrows and selected-number chart lines follow this local view. Forced inclusions and exclusions remain shared and unchanged.
          </InfoHelp>
        </div>
      )}
      {analysisHistory !== undefined && (
        <div className="windfall-number-trends__scope windfall-number-trends__note" role="status">
          <strong>{useAllHistory ? "All history" : "WFMQYH"} · {analysisHistory.length} real {analysisHistory.length === 1 ? "draw" : "draws"}</strong>
          {analysisHistory.length > 0 && <span>{dateLabel(analysisHistory[0].date)} to {dateLabel(analysisHistory[analysisHistory.length - 1].date)}</span>}
          <span>Mains + supps · All = total in this source</span>
          {evidence && (evidence.simulated > 0 || evidence.invalid > 0) && <span>Ignored: {evidence.simulated} simulated, {evidence.invalid} malformed rows.</span>}
        </div>
      )}
      <NumberTrendMovementReplay history={sourceHistory} sourceLabel={useAllHistory ? "All history" : "WFMQYH"} />
      {userExclusionReminder && (
        <div
          role="status"
          className="windfall-number-trends__note"
          style={{ marginBottom: 8, borderColor: "#cbd5e1", background: "#f8fafc" }}
        >
          {userExclusionReminder}. Clear the manual exclusion or turn off the rule that excludes them before selecting them here.
        </div>
      )}
      {analysisHistory?.length === 0 ? <p className="windfall-number-trends__note" role="status">No real draws in this source. Historical counts and trend rates are unavailable.</p> : <>
      <div className="windfall-number-trends__drought-key windfall-number-trends__note">
        <span>Live drought flags: Strict / Empirical · Yes = on that shortlist, No = not listed.</span>
        <InfoHelp label="About Number Trends drought flags">
          Flags mirror the current top-eight lists in Drought-break shortlist, before generation exclusions.
          Strict uses the full-history current drought of six or more draws; Empirical uses the active global WFMQYH evidence.
          Switching this panel's History source does not recalculate the drought lists. A new real draw or a global WFMQYH change refreshes their membership.
          A number may belong to both lists. Red Strict Yes and blue Empirical Yes identify membership only, not a prediction, boost, or forced inclusion.
          An excluded number can still be listed but remains unavailable to select. n/a means the shortlist data is unavailable, not No.
        </InfoHelp>
      </div>
      <div className="windfall-number-trends__grid">
        {trendBlocks.map((block) => (
          <section
            key={block.start}
            className="windfall-number-trend-block"
            data-testid="number-trend-block"
            aria-label={`Number trends ${block.start}-${block.end}`}
          >
            <div className="windfall-number-trend-block__header">
              <div>
                <div className="windfall-number-trend-block__eyebrow">Range</div>
                <h3 className="windfall-number-trend-block__title">{block.start}-{block.end}</h3>
              </div>
              <div className="windfall-number-trend-block__count">5 numbers</div>
            </div>

            <div className="windfall-number-trend-block__rows">
              {block.trends.map((trend) => {
                const isUserExcluded = userExcludedSet.has(trend.number);
                const isSelected = !isUserExcluded && activeSelected.includes(trend.number);
                const isExternalOnly = !isUserExcluded && externalSelectedSet.has(trend.number) && !ownSelectedSet.has(trend.number);
                const { r3, r13, deltaPP, dir } = shortTermDeltaPP(trend);
                const clr = colorForNumber(trend.number);
                const arrowColor = dir === "flat" ? "#666666" : clr;
                const directionLabel = dir === "up" ? "Up" : dir === "down" ? "Down" : "Flat";
                const signedDelta = `${deltaPP >= 0 ? "+" : ""}${deltaPP.toFixed(1)}`;
                const strictMember = strictDroughtNumbers === undefined ? undefined : strictDroughtSet.has(trend.number);
                const empiricalMember = empiricalDroughtNumbers === undefined ? undefined : empiricalDroughtSet.has(trend.number);
                const droughtDescriptionId = `${sourceId}-drought-${trend.number}`;
                const ariaLabel = isUserExcluded
                  ? `Number ${trend.number} is unavailable because it is excluded`
                  : isExternalOnly
                  ? `Number ${trend.number} is forced by ${externalSelectedLabel}`
                  : `Toggle forced inclusion for number ${trend.number}`;
                const title = isUserExcluded
                  ? `Clear the active exclusion or turn off the rule before selecting ${trend.number}.`
                  : isExternalOnly
                    ? `Selected in ${externalSelectedLabel}; deselect it there to release it.`
                    : undefined;

                return (
                  <button
                    key={trend.number}
                    type="button"
                    className="windfall-number-trend-row"
                    data-testid="number-trend-row"
                    data-direction={dir}
                    data-external-selected={isExternalOnly ? "true" : undefined}
                    data-user-excluded={isUserExcluded ? "true" : undefined}
                    aria-pressed={isSelected}
                    aria-label={ariaLabel}
                    aria-describedby={droughtDescriptionId}
                    disabled={isExternalOnly || isUserExcluded}
                    title={title}
                    style={{ "--number-trend-color": arrowColor } as React.CSSProperties}
                    onClick={() => handleToggle(trend.number)}
                  >
                    <span className="windfall-number-trend-row__identity">
                      <span className="windfall-number-trend-row__number">{trend.number}</span>
                      <span className="windfall-number-trend-row__status">
                        {isUserExcluded ? "Excluded" : isExternalOnly ? externalSelectedLabel : isSelected ? "Forced" : "Available"}
                      </span>
                    </span>

                    <span className="windfall-number-trend-row__metrics" aria-label={`Trend counts for number ${trend.number}`}>
                      <Metric label="3D" value={trend.d3} />
                      <Metric label="6D" value={trend.fortnight} />
                      <Metric label="9D" value={trend.d9} />
                      <Metric label="13D" value={trend.month} />
                      <Metric label="15D" value={trend.d15} />
                      <Metric label="36D" value={trend.quarter} />
                      <Metric label="156D" value={trend.year} />
                      <Metric label="All" value={trend.all} />
                    </span>

                    <span className="windfall-number-trend-row__context">
                      <span
                        className="windfall-number-trend-row__delta"
                        aria-label={`Short-term rate ${directionLabel}: 3D ${(r3 * 100).toFixed(1)} percent versus 13D ${(r13 * 100).toFixed(1)} percent, delta ${signedDelta} percentage points; available draws ${recentDrawCount} and ${comparisonDrawCount}`}
                      >
                        <Arrow dir={dir} color={clr} sizePx={16} />
                        <span>{directionLabel}</span>
                        <strong>{signedDelta}</strong>
                      </span>
                      <span className="windfall-number-trend-row__drought-flags" id={droughtDescriptionId}
                        aria-label={`Current Strict drought shortlist: ${droughtFlagText(strictMember)}; current Empirical hazard shortlist: ${droughtFlagText(empiricalMember)}`}>
                        <DroughtFlag family="strict" member={strictMember} />
                        <DroughtFlag family="empirical" member={empiricalMember} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Mini chart with slope arrows */}
      <div className="windfall-number-trends__chartScroller">
        <TrendMiniChart series={selectedSeries} recentDrawCount={recentDrawCount} comparisonDrawCount={comparisonDrawCount} />
      </div>

      {/* Optional legend for the new column */}
      <div className="windfall-number-trends__note">
        Δ 3→13 (pp) = (3D count / {recentDrawCount}) − (13D count / {comparisonDrawCount}), multiplied by 100.
        {" "}Uses {recentDrawCount} and {comparisonDrawCount} available draws in this source. Positive = heating; negative = cooling. Descriptive, not a next-draw probability.
      </div>
      </>}
    </section>
  );
}

function droughtFlagText(member: boolean | undefined): string {
  return member === undefined ? "unavailable" : member ? "Yes" : "No";
}

function DroughtFlag({ family, member }: { family: "strict" | "empirical"; member: boolean | undefined }) {
  return <span className="windfall-number-trend-drought-flag" data-drought-family={family}
    data-drought-status={member === undefined ? "unavailable" : member ? "yes" : "no"}>
    {family === "strict" ? "Strict" : "Empirical"} {member === undefined ? "n/a" : droughtFlagText(member)}
  </span>;
}

function emptyTrend(number: number): NumberTrend {
  return {
    number,
    d3: 0,
    d9: 0,
    d15: 0,
    fortnight: 0,
    month: 0,
    quarter: 0,
    year: 0,
    all: 0,
  };
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="windfall-number-trend-metric">
      <span className="windfall-number-trend-metric__label">{label}</span>
      <span className="windfall-number-trend-metric__value">{value}</span>
    </span>
  );
}

function TrendMiniChart({
  series,
  recentDrawCount,
  comparisonDrawCount,
  width = 1000,
  height = 260,
}: {
  series: { number: number; values: number[] }[];
  recentDrawCount: number;
  comparisonDrawCount: number;
  width?: number;
  height?: number;
}) {
  // Empty state
  if (!series || series.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed #ddd",
          borderRadius: 8,
          color: "#888",
          fontSize: 13,
          background: "#fafafa",
        }}
      >
        Select numbers above to compare their counts across draw-window sizes…
      </div>
    );
  }

  // Labels aligned with selectedSeries order
  const labels = ["3D", "6D", "9D", "13D", "15D", "36D", "156D", "All"];
  const margin = { top: 12, right: 16, bottom: 32, left: 12 };
  const innerW = Math.max(1, width - margin.left - margin.right);
  const innerH = Math.max(1, height - margin.top - margin.bottom);
  const xStep = innerW / (labels.length - 1);

  // Y scale
  let yMax = 0;
  series.forEach((s) => s.values.forEach((v) => (yMax = Math.max(yMax, v))));
  if (yMax <= 0) yMax = 1;

  const xToPx = (i: number) => margin.left + xStep * i;
  const yToPx = (v: number) => margin.top + innerH * (1 - v / yMax);

  const colorForNumber = (n: number) => `hsl(${(n * 23) % 360}, 70%, 45%)`;
  const buildPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xToPx(i)} ${yToPx(v)}`).join(" ");

  // Arrow utility with tooltip
  const arrowShape = (
    x: number,
    y: number,
    dir: "up" | "down" | "flat",
    color: string,
    size: number,
    tooltip: string
  ) => {
    if (dir === "flat") {
      return (
        <circle cx={x} cy={y} r={3} fill={color} fillOpacity={0.5} stroke="#fff" strokeWidth={1}>
          <title>{tooltip}</title>
        </circle>
      );
    }
    const points =
      dir === "up"
        ? `${x},${y - size} ${x - size * 0.6},${y + size * 0.6} ${x + size * 0.6},${y + size * 0.6}`
        : `${x},${y + size} ${x - size * 0.6},${y - size * 0.6} ${x + size * 0.6},${y - size * 0.6}`;
    return (
      <polygon points={points} fill={color} fillOpacity={0.85} stroke="#fff" strokeWidth={1}>
        <title>{tooltip}</title>
      </polygon>
    );
  };

  // Place arrows near the 3D point
  const arrowXBase = xToPx(0);
  const arrowX = Math.max(margin.left + 10, arrowXBase - 12);
  const arrowXAlt = Math.min(margin.left + innerW - 10, arrowXBase + 12);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Draw-window count comparison for selected numbers"
      style={{ display: "block", background: "#fff", border: "1px solid #eee", borderRadius: 8 }}
    >
      {/* X axis */}
      <line x1={margin.left} y1={margin.top + innerH} x2={margin.left + innerW} y2={margin.top + innerH} stroke="#ccc" />
      {labels.map((label, i) => (
        <g key={label}>
          <line x1={xToPx(i)} y1={margin.top + innerH} x2={xToPx(i)} y2={margin.top + innerH + 6} stroke="#ccc" />
          <text x={xToPx(i)} y={margin.top + innerH + 20} textAnchor="middle" fontSize={12} fill="#666">
            {label}
          </text>
        </g>
      ))}
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1={margin.left} x2={margin.left + innerW} y1={margin.top + innerH * (1 - p)} y2={margin.top + innerH * (1 - p)} stroke="#f0f0f0" />
      ))}

      {/* Series lines */}
      {series.map((s) => (
        <path key={s.number} d={buildPath(s.values)} fill="none" stroke={colorForNumber(s.number)} strokeWidth={2} />
      ))}
      {/* Points */}
      {series.map((s) =>
        s.values.map((v, i) => (
          <circle key={`${s.number}-${i}`} cx={xToPx(i)} cy={yToPx(v)} r={3} fill="#fff" stroke={colorForNumber(s.number)} strokeWidth={2} />
        ))
      )}

      {/* Short-term slope arrows (rates: 3D/3 vs 13D/13) */}
      {series.map((s) => {
        const c = colorForNumber(s.number);
        const v3 = s.values[0];   // first label is 3D
        const v13 = s.values[3];  // fourth label is 13D
        const { r3, r13, deltaPP, dir } = calculateNumberTrendRate(v3, v13, recentDrawCount, comparisonDrawCount);
        const size = 8 + Math.min(6, Math.abs(deltaPP)); // scale with pp magnitude, capped
        const x = arrowX === arrowXBase - 12 ? arrowX : arrowXAlt;
        const y = yToPx(v3);
        const tooltip = `#${s.number} short-term rate: 3D ${(r3 * 100).toFixed(1)}% vs 13D ${(r13 * 100).toFixed(1)}% • Δ ${deltaPP.toFixed(1)} pp (${dir})`;

        return (
          <g key={`arrow-${s.number}`}>
            {arrowShape(x, y, dir, c, size, tooltip)}
          </g>
        );
      })}

      <text x={margin.left + innerW} y={margin.top + 12} textAnchor="end" fontSize={11} fill="#888">
        Short-term slope arrows at 3D (rates)
      </text>
    </svg>
  );
}
