import React from "react";
import { Draw } from "../types";
import {
  STRICT_DROUGHT_DEFAULT_THRESHOLD,
  type DroughtHazardNumberRow,
  type StrictDroughtNumberRow,
  computeDroughtHazard,
  computeStrictDroughtShortlist,
} from "../lib/droughtHazard";
import {
  formatUserExclusionReminder,
  normalizeUserExclusionLocks,
  removeUserExcludedNumbers,
} from "../lib/userExclusionLocks";

type DroughtDisplayMode = "strict" | "empirical";

export const DroughtHazardPanel: React.FC<{
  history: Draw[];
  fullHistory?: Draw[];
  top?: number;
  title?: string;
  strictThreshold?: number;
  defaultMode?: DroughtDisplayMode;
  onToggleNumber?: (n: number) => void;
  forcedNumbers?: number[];
  excludedNumbers?: number[];
  maxForcedSelections?: number;
  bucketLabels?: Record<number, string>;
}> = ({
  history,
  fullHistory,
  top = 12,
  title,
  strictThreshold = STRICT_DROUGHT_DEFAULT_THRESHOLD,
  defaultMode = "strict",
  onToggleNumber,
  forcedNumbers = [],
  excludedNumbers = [],
  maxForcedSelections,
  bucketLabels,
}) => {
  const [mode, setMode] = React.useState<DroughtDisplayMode>(defaultMode);
  const empirical = React.useMemo(() => computeDroughtHazard(history), [history]);
  const strict = React.useMemo(
    () => computeStrictDroughtShortlist(history, fullHistory?.length ? fullHistory : history, { threshold: strictThreshold }),
    [fullHistory, history, strictThreshold],
  );
  const { baselineProbability, maxK, byNumber, priorTrials } = empirical;
  const userExcludedNumbers = React.useMemo(
    () => normalizeUserExclusionLocks(excludedNumbers),
    [excludedNumbers],
  );
  const userExcludedSet = React.useMemo(() => new Set(userExcludedNumbers), [userExcludedNumbers]);
  const userExclusionReminder = React.useMemo(
    () => formatUserExclusionReminder(userExcludedNumbers),
    [userExcludedNumbers],
  );
  const forcedSet = React.useMemo(
    () => new Set(removeUserExcludedNumbers(forcedNumbers, userExcludedNumbers)),
    [forcedNumbers, userExcludedNumbers],
  );
  const forcedCount = forcedSet.size;
  const maxReached = typeof maxForcedSelections === "number" && forcedCount >= maxForcedSelections;
  const fallbackLabels = React.useMemo(() => {
    const counts = Array(46).fill(0);
    history.forEach((d) => {
      [...d.main, ...d.supp].forEach((n) => {
        if (n >= 1 && n <= 45) counts[n] += 1;
      });
    });
    return counts.map((c) => (c === 0 ? "Undrawn" : `${c}x`));
  }, [history]);
  const empiricalRows = React.useMemo(
    () => byNumber.slice().sort((a, b) => b.p - a.p || b.k - a.k || a.number - b.number).slice(0, top),
    [byNumber, top]
  );
  const strictRows = React.useMemo(() => strict.rows.slice(0, top), [strict.rows, top]);

  const renderNumberButton = (number: number) => {
    const isUserExcluded = userExcludedSet.has(number);
    const isForced = !isUserExcluded && forcedSet.has(number);
    const disabled = !!onToggleNumber && (isUserExcluded || (!isForced && maxReached));
    const toggleLabel = isForced
      ? `Remove drought-break forced inclusion ${number}`
      : isUserExcluded
        ? `Number ${number} is unavailable because it is excluded`
        : disabled
        ? `Maximum drought-break forced inclusions reached; remove another number before adding ${number}`
        : `Add drought-break forced inclusion ${number}`;
    const title = isUserExcluded
      ? `Clear the active exclusion or turn off the rule before selecting ${number}.`
      : toggleLabel;

    if (!onToggleNumber) return number;

    return (
      <button
        type="button"
        onClick={() => onToggleNumber(number)}
        disabled={disabled}
        aria-pressed={isForced}
        aria-label={toggleLabel}
        title={title}
        style={numberButton(isForced, disabled)}
        data-drought-number-button="true"
        data-user-excluded={isUserExcluded ? "true" : undefined}
      >
        {number}
      </button>
    );
  };

  const rowBackground = (number: number): string | undefined => (
    forcedSet.has(number) ? "#f0fdf4" : undefined
  );

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, background: "#fff", marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>{title || "Drought-break shortlist (mains + supps)"}</div>
        {onToggleNumber && typeof maxForcedSelections === "number" && (
          <div
            aria-live="polite"
            style={{
              border: `1px solid ${forcedCount ? "#bbf7d0" : "#e2e8f0"}`,
              borderRadius: 999,
              background: forcedCount ? "#f0fdf4" : "#f8fafc",
              color: forcedCount ? "#166534" : "#64748b",
              fontSize: 12,
              fontWeight: 800,
              padding: "3px 8px",
            }}
          >
            {forcedCount}/{maxForcedSelections} selected for forced inclusion
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
        Strict mode ranks numbers with a full-history current drought of {strict.threshold}+ draws before using historical drought behavior as support. Empirical hazard mode shows pooled next-appearance evidence by drought length, shrunk toward the {(baselineProbability * 100).toFixed(1)}% neutral 8-of-45 baseline.
      </div>
      <div role="group" aria-label="Drought shortlist mode" style={segmentedControl}>
        <button
          type="button"
          aria-pressed={mode === "strict"}
          onClick={() => setMode("strict")}
          style={modeButton(mode === "strict")}
        >
          Strict drought {strict.threshold}+
        </button>
        <button
          type="button"
          aria-pressed={mode === "empirical"}
          onClick={() => setMode("empirical")}
          style={modeButton(mode === "empirical")}
        >
          Empirical hazard
        </button>
      </div>
      {userExclusionReminder && (
        <div role="status" style={{ fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 9px", marginBottom: 8 }}>
          {userExclusionReminder}. Clear the manual exclusion or turn off the rule that excludes them before selecting them here.
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        {mode === "strict" ? (
          <StrictDroughtTable
            rows={strictRows}
            threshold={strict.threshold}
            bucketLabels={bucketLabels}
            fallbackLabels={fallbackLabels}
            renderNumberButton={renderNumberButton}
            rowBackground={rowBackground}
          />
        ) : (
          <EmpiricalHazardTable
            rows={empiricalRows}
            bucketLabels={bucketLabels}
            fallbackLabels={fallbackLabels}
            renderNumberButton={renderNumberButton}
            rowBackground={rowBackground}
          />
        )}
      </div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Strict rank uses full-history current drought first. Break maturity is the share of that number's completed {strict.threshold}+ drought episodes that were broken at or before its current drought length. Max observed empirical drought length k = {maxK}. Sparse empirical lengths are stabilized with {priorTrials} baseline prior trials. Month bucket is context only; it does not drive the rate.
      </div>
    </section>
  );
};

const StrictDroughtTable: React.FC<{
  rows: StrictDroughtNumberRow[];
  threshold: number;
  bucketLabels?: Record<number, string>;
  fallbackLabels: string[];
  renderNumberButton: (number: number) => React.ReactNode;
  rowBackground: (number: number) => string | undefined;
}> = ({ rows, threshold, bucketLabels, fallbackLabels, renderNumberButton, rowBackground }) => (
  <table style={tableStyle}>
    <thead>
      <tr style={{ background: "#f7f7f7" }}>
        <th style={th}>#</th>
        <th style={th}>Strict rank</th>
        <th style={{ ...th, textAlign: "left" }}>Month bucket</th>
        <th style={th}>Full drought</th>
        <th style={th}>WFMQYH drought</th>
        <th style={th}>Episodes {threshold}+</th>
        <th style={th}>Typical break</th>
        <th style={th}>Break maturity</th>
        <th style={th}>Empirical rate</th>
        <th style={th}>Hits / trials</th>
        <th style={th}>Vs baseline</th>
      </tr>
    </thead>
    <tbody>
      {rows.length ? rows.map((r) => (
        <tr key={r.number} style={{ background: rowBackground(r.number) }}>
          <td style={td}>{renderNumberButton(r.number)}</td>
          <td style={td}>{r.strictRank ?? "—"}</td>
          <td style={{ ...td, textAlign: "left" }}>{bucketLabels?.[r.number] ?? fallbackLabels[r.number] ?? "—"}</td>
          <td style={td}>{r.currentDrought}</td>
          <td style={td}>{r.activeWindowDrought}</td>
          <td style={td}>{r.historicalDroughtEpisodes}</td>
          <td style={td}>{formatTypicalBreak(r)}</td>
          <td style={td}>{r.breakTimingScore.toFixed(0)}%</td>
          <td style={td}>{(r.p * 100).toFixed(1)}%</td>
          <td style={td}>{r.hitsNext}/{r.trials}</td>
          <td style={baselineCell(r.liftVsBaseline)}>
            {r.liftVsBaseline >= 0 ? "+" : ""}{(r.liftVsBaseline * 100).toFixed(1)}pp
          </td>
        </tr>
      )) : (
        <tr>
          <td style={{ ...td, textAlign: "left" }} colSpan={11}>
            No numbers currently meet the strict {threshold}+ full-history drought threshold.
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

const EmpiricalHazardTable: React.FC<{
  rows: DroughtHazardNumberRow[];
  bucketLabels?: Record<number, string>;
  fallbackLabels: string[];
  renderNumberButton: (number: number) => React.ReactNode;
  rowBackground: (number: number) => string | undefined;
}> = ({ rows, bucketLabels, fallbackLabels, renderNumberButton, rowBackground }) => (
  <table style={tableStyle}>
    <thead>
      <tr style={{ background: "#f7f7f7" }}>
        <th style={th}>#</th>
        <th style={{ ...th, textAlign: "left" }}>Month bucket</th>
        <th style={th}>Current drought (k)</th>
        <th style={th}>Smoothed appearance rate</th>
        <th style={th}>Observed hits / trials</th>
        <th style={th}>Vs baseline</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r.number} style={{ background: rowBackground(r.number) }}>
          <td style={td}>{renderNumberButton(r.number)}</td>
          <td style={{ ...td, textAlign: "left" }}>{bucketLabels?.[r.number] ?? fallbackLabels[r.number] ?? "—"}</td>
          <td style={td}>{r.k}</td>
          <td style={td}>{(r.p * 100).toFixed(1)}%</td>
          <td style={td}>{r.hitsNext}/{r.trials}</td>
          <td style={baselineCell(r.liftVsBaseline)}>
            {r.liftVsBaseline >= 0 ? "+" : ""}{(r.liftVsBaseline * 100).toFixed(1)}pp
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const formatTypicalBreak = (row: StrictDroughtNumberRow): string => {
  if (row.medianBreakLength == null || row.p75BreakLength == null) return "No completed episodes";
  return `med ${formatLength(row.medianBreakLength)} / p75 ${formatLength(row.p75BreakLength)}`;
};

const formatLength = (value: number): string => (
  Number.isInteger(value) ? String(value) : value.toFixed(1)
);

const tableStyle: React.CSSProperties = { width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 14 };
const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd", fontWeight: 700, whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };

const baselineCell = (liftVsBaseline: number): React.CSSProperties => ({
  ...td,
  color: liftVsBaseline >= 0 ? "#b91c1c" : "#1d4ed8",
  fontWeight: 700,
});

const segmentedControl: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 8,
};

const modeButton = (active: boolean): React.CSSProperties => ({
  minHeight: 32,
  border: `1px solid ${active ? "#0f172a" : "#cbd5e1"}`,
  borderRadius: 8,
  background: active ? "#0f172a" : "#ffffff",
  color: active ? "#ffffff" : "#0f172a",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  padding: "5px 10px",
});

const numberButton = (active: boolean, disabled: boolean): React.CSSProperties => ({
  minWidth: 34,
  minHeight: 30,
  border: `1px solid ${active ? "#15803d" : "#cbd5e1"}`,
  borderRadius: 8,
  background: active ? "#dcfce7" : "#ffffff",
  color: disabled ? "#94a3b8" : active ? "#14532d" : "#0f172a",
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
});
