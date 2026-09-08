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
import {
  analyzeDroughtShortlistSourceReplay,
  type DroughtShortlistHitDetail,
  type DroughtShortlistSourceReplayResult,
} from "../lib/droughtShortlistSourceReplay";

type DroughtDisplayMode = "strict" | "empirical";
type DroughtReplayScope = "all-baseline" | "wfmqyh";

export const DroughtHazardPanel: React.FC<{
  history: Draw[];
  fullHistory?: Draw[];
  baselineHistory?: Draw[];
  baselineHistoryScopeLabel?: string;
  wfmqyhHistoryScopeLabel?: string;
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
  baselineHistory,
  baselineHistoryScopeLabel,
  wfmqyhHistoryScopeLabel,
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
  const [replayScope, setReplayScope] = React.useState<DroughtReplayScope>("all-baseline");
  const empirical = React.useMemo(() => computeDroughtHazard(history), [history]);
  const strict = React.useMemo(
    () => computeStrictDroughtShortlist(history, fullHistory?.length ? fullHistory : history, { threshold: strictThreshold }),
    [fullHistory, history, strictThreshold],
  );
  const replayHistory = replayScope === "all-baseline"
    ? (baselineHistory?.length ? baselineHistory : fullHistory?.length ? fullHistory : history)
    : history;
  const replayScopeLabel = replayScope === "all-baseline"
    ? (baselineHistoryScopeLabel ?? `All baseline history (${replayHistory.length} real draw${replayHistory.length === 1 ? "" : "s"})`)
    : (wfmqyhHistoryScopeLabel ?? `Current WFMQYH window (${history.length} real draw${history.length === 1 ? "" : "s"})`);
  const droughtSourceReplay = React.useMemo(
    () => analyzeDroughtShortlistSourceReplay(replayHistory, {
      contextHistory: fullHistory?.length ? fullHistory : replayHistory,
      strictThreshold,
      topK: top,
    }),
    [fullHistory, replayHistory, strictThreshold, top],
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
      <DroughtSourceReplayAudit
        result={droughtSourceReplay}
        scope={replayScope}
        scopeLabel={replayScopeLabel}
        onScopeChange={setReplayScope}
      />
      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Strict rank uses full-history current drought first. Break maturity is the share of that number's completed {strict.threshold}+ drought episodes that were broken at or before its current drought length. Max observed empirical drought length k = {maxK}. Sparse empirical lengths are stabilized with {priorTrials} baseline prior trials. Month bucket is context only; it does not drive the rate.
      </div>
    </section>
  );
};

const DroughtSourceReplayAudit: React.FC<{
  result: DroughtShortlistSourceReplayResult;
  scope: DroughtReplayScope;
  scopeLabel: string;
  onScopeChange: (scope: DroughtReplayScope) => void;
}> = ({ result, scope, scopeLabel, onScopeChange }) => {
  const hasTrials = result.eligibleTrials > 0;
  const splitNote = result.exclusiveSplitPValue == null
    ? "Exclusive strict/empirical split needs at least one exclusive hit."
    : result.exclusiveSplitPValue >= 0.05
      ? `Exclusive strict-only vs empirical-only hits are consistent with an even split (p=${formatPValue(result.exclusiveSplitPValue)}).`
      : `Exclusive strict-only vs empirical-only hits are not consistent with an even split (p=${formatPValue(result.exclusiveSplitPValue)}).`;

  return (
    <div style={auditCardStyle}>
      <div style={auditHeaderStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Replay scope: source split</div>
          <div style={auditFinePrintStyle}>
            Replay-only. This switch changes the source-split audit below; it does not recalculate the Strict drought or Empirical hazard shortlist above.
          </div>
        </div>
        <div role="group" aria-label="Drought source split replay scope" style={compactSegmentedControl}>
          <button
            type="button"
            aria-pressed={scope === "all-baseline"}
            onClick={() => onScopeChange("all-baseline")}
            style={compactModeButton(scope === "all-baseline")}
          >
            All baseline
          </button>
          <button
            type="button"
            aria-pressed={scope === "wfmqyh"}
            onClick={() => onScopeChange("wfmqyh")}
            style={compactModeButton(scope === "wfmqyh")}
          >
            WFMQYH
          </button>
        </div>
      </div>
      <div style={auditFinePrintStyle}>
        {scopeLabel}. Scope {result.scope}; top {result.topK} per list; strict threshold {result.strictThreshold}+; warm-up {result.minHistory} prior draws.
        Shortlist rows above keep their own scoring scope: Strict drought uses full-history current drought, while Empirical hazard uses the active WFMQYH window.
      </div>
      {!hasTrials ? (
        <div role="status" style={auditEmptyStyle}>
          Not enough real draws in this scope to replay drought-source hits. Needs more than {result.minHistory} valid prior draws.
        </div>
      ) : (
        <>
          <div style={auditMetricGridStyle}>
            <AuditMetric label="Eligible draws" value={String(result.eligibleTrials)} detail={`${result.firstTargetDate ?? "—"} to ${result.latestTargetDate ?? "—"}`} />
            <AuditMetric label="Avg drought hits" value={formatDecimal(result.averageUnionHits)} detail={`random-size expectation ${formatDecimal(result.expectedRandomUnionHits)}`} />
            <AuditMetric label="Any-hit draws" value={formatPercent(result.unionHitDrawRate)} detail={`random-size expectation ${formatPercent(result.expectedRandomUnionHitDrawRate)}`} />
            <AuditMetric label="Avg list overlap" value={formatDecimal(result.averageShortlistOverlapSize)} detail={`union size ${formatDecimal(result.averageShortlistUnionSize)}`} />
          </div>
          <div style={auditTableGridStyle}>
            <AuditSummaryTable
              title="Source of drawn drought-hit numbers"
              rows={result.sourceRows.map((row) => ({
                key: row.key,
                label: row.label,
                count: row.count,
                share: row.share,
              }))}
            />
            <AuditSummaryTable
              title="Draw class"
              rows={result.drawClassRows.map((row) => ({
                key: row.key,
                label: row.label,
                count: row.count,
                share: row.share,
              }))}
            />
          </div>
          <div style={auditFinePrintStyle}>
            {splitNote}
          </div>
          <div style={auditDetailGridStyle}>
            <StageSourceTable rows={result.stageRows} />
            <LatestSourceRowsTable rows={result.latestRows} />
          </div>
        </>
      )}
    </div>
  );
};

const AuditMetric: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div style={auditMetricStyle}>
    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 11, color: "#64748b" }}>{detail}</div>
  </div>
);

const AuditSummaryTable: React.FC<{
  title: string;
  rows: Array<{ key: string; label: string; count: number; share: number }>;
}> = ({ title, rows }) => (
  <div style={auditSubCardStyle}>
    <div style={auditTableTitleStyle}>{title}</div>
    <table style={compactTableStyle}>
      <thead>
        <tr>
          <th style={{ ...compactTh, textAlign: "left" }}>Bucket</th>
          <th style={compactTh}>Count</th>
          <th style={compactTh}>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td style={{ ...compactTd, textAlign: "left" }}>{row.label}</td>
            <td style={compactTd}>{row.count}</td>
            <td style={compactTd}>{formatPercent(row.share)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const StageSourceTable: React.FC<{ rows: DroughtShortlistSourceReplayResult["stageRows"] }> = ({ rows }) => (
  <div style={auditSubCardStyle}>
    <div style={auditTableTitleStyle}>By draw ordinal / month stage</div>
    <div style={scrollTableWrapStyle}>
      <table style={compactTableStyle}>
        <thead>
          <tr>
            <th style={{ ...compactTh, textAlign: "left" }}>Stage</th>
            <th style={compactTh}>Trials</th>
            <th style={compactTh}>Avg hits</th>
            <th style={compactTh}>Strict avg</th>
            <th style={compactTh}>Emp avg</th>
            <th style={compactTh}>Both avg</th>
            <th style={compactTh}>Zero</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.stageLabel}-${row.trials}`}>
              <td style={{ ...compactTd, textAlign: "left" }}>{row.stageLabel}</td>
              <td style={compactTd}>{row.trials}</td>
              <td style={compactTd}>{formatDecimal(row.averageUnionHits)}</td>
              <td style={compactTd}>{formatDecimal(row.averageStrictHits)}</td>
              <td style={compactTd}>{formatDecimal(row.averageEmpiricalHits)}</td>
              <td style={compactTd}>{formatDecimal(row.averageOverlapHits)}</td>
              <td style={compactTd}>{formatPercent(row.zeroHitRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const LatestSourceRowsTable: React.FC<{ rows: DroughtShortlistSourceReplayResult["latestRows"] }> = ({ rows }) => (
  <div style={auditSubCardStyle}>
    <div style={auditTableTitleStyle}>Latest audit rows</div>
    <div style={scrollTableWrapStyle}>
      <table style={{ ...compactTableStyle, minWidth: 680 }}>
        <thead>
          <tr>
            <th style={{ ...compactTh, textAlign: "left" }}>Date</th>
            <th style={compactTh}>Stage</th>
            <th style={compactTh}>Hits</th>
            <th style={{ ...compactTh, textAlign: "left" }}>Strict-only</th>
            <th style={{ ...compactTh, textAlign: "left" }}>Empirical-only</th>
            <th style={{ ...compactTh, textAlign: "left" }}>Both</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.targetDate}-${row.targetIndex}`}>
              <td style={{ ...compactTd, textAlign: "left" }}>{row.targetDate}</td>
              <td style={compactTd}>{formatStage(row.targetMonthDrawCount, row.targetDrawOrdinal, row.targetMonthComplete)}</td>
              <td style={compactTd}>{row.unionHitCount}</td>
              <td style={{ ...compactTd, textAlign: "left" }}>{formatHits(row.strictOnlyHits)}</td>
              <td style={{ ...compactTd, textAlign: "left" }}>{formatHits(row.empiricalOnlyHits)}</td>
              <td style={{ ...compactTd, textAlign: "left" }}>{formatHits(row.overlappingHits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div style={auditFinePrintStyle}>S = strict rank. E = empirical rank. Rank is rebuilt from prior draws only.</div>
  </div>
);

const formatHits = (hits: DroughtShortlistHitDetail[]): string => {
  if (!hits.length) return "—";
  return hits.map((hit) => {
    const rank = hit.source === "both"
      ? `S${hit.strictRank ?? "?"}/E${hit.empiricalRank ?? "?"}`
      : hit.source === "strict-only"
        ? `S${hit.strictRank ?? "?"}`
        : `E${hit.empiricalRank ?? "?"}`;
    return `${hit.number} ${rank} ${hit.where}`;
  }).join(" · ");
};

const formatStage = (
  monthDrawCount: number | null,
  drawOrdinal: number | null,
  complete: boolean,
): string => {
  if (!monthDrawCount || !drawOrdinal) return "—";
  return `${monthDrawCount}D D${drawOrdinal}${complete ? "" : " open"}`;
};

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatDecimal = (value: number): string => value.toFixed(2);
const formatPValue = (value: number): string => value < 0.001 ? "<0.001" : value.toFixed(3);

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

const auditCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#f8fafc",
  padding: 10,
  marginTop: 12,
};

const auditHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 8,
};

const auditFinePrintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.4,
};

const auditEmptyStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#ffffff",
  color: "#475569",
  fontSize: 12,
  padding: "8px 10px",
  marginTop: 8,
};

const auditMetricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 8,
  marginTop: 8,
};

const auditMetricStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#ffffff",
  padding: "8px 10px",
};

const auditTableGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 8,
  marginTop: 8,
};

const auditDetailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 8,
  marginTop: 8,
};

const auditSubCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#ffffff",
  padding: 8,
  minWidth: 0,
};

const auditTableTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 900,
  marginBottom: 6,
};

const compactSegmentedControl: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
};

const compactModeButton = (active: boolean): React.CSSProperties => ({
  minHeight: 30,
  border: `1px solid ${active ? "#0f172a" : "#cbd5e1"}`,
  borderRadius: 8,
  background: active ? "#0f172a" : "#ffffff",
  color: active ? "#ffffff" : "#0f172a",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  padding: "4px 8px",
});

const compactTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const compactTh: React.CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  color: "#475569",
  fontWeight: 900,
  padding: "5px 6px",
  textAlign: "right",
  whiteSpace: "nowrap",
};

const compactTd: React.CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
  color: "#0f172a",
  padding: "5px 6px",
  textAlign: "right",
  verticalAlign: "top",
};

const scrollTableWrapStyle: React.CSSProperties = {
  maxHeight: 220,
  overflow: "auto",
};
