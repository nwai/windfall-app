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
  analyzeDroughtBucketMaturity,
  type DroughtBucketMaturityRow,
  type DroughtBucketMaturityStatus,
} from "../lib/droughtBucketMaturity";
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
import DroughtHazardCalibrationAuditPanel from "./DroughtHazardCalibrationAuditPanel";
import DroughtLearningAuditPanel from "./DroughtLearningAuditPanel";

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
  onClearForcedNumbers?: () => void;
  forcedNumbers?: number[];
  excludedNumbers?: number[];
  maxForcedSelections?: number;
  bucketLabels?: Record<number, string>;
  targetDrawDate?: string;
  targetMonthLabel?: string;
  targetDrawOrdinal?: number;
  targetMonthExpectedDrawCount?: number;
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
  onClearForcedNumbers,
  forcedNumbers = [],
  excludedNumbers = [],
  maxForcedSelections,
  bucketLabels,
  targetDrawDate,
  targetMonthLabel,
  targetDrawOrdinal,
  targetMonthExpectedDrawCount,
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
  const activeForcedNumbers = React.useMemo(
    () => Array.from(forcedSet).sort((a, b) => a - b),
    [forcedSet],
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
  const displayedRowNumbers = React.useMemo(
    () => new Set((mode === "strict" ? strictRows : empiricalRows).map((row) => row.number)),
    [empiricalRows, mode, strictRows],
  );
  const forcedOutsideDisplayedRows = React.useMemo(
    () => activeForcedNumbers.filter((number) => !displayedRowNumbers.has(number)),
    [activeForcedNumbers, displayedRowNumbers],
  );
  const maturity = React.useMemo(() => {
    if (!targetMonthLabel || !targetDrawOrdinal || !targetMonthExpectedDrawCount) return null;
    return analyzeDroughtBucketMaturity({
      baselineHistory: baselineHistory?.length
        ? baselineHistory
        : fullHistory?.length
          ? fullHistory
          : history,
      currentHistory: fullHistory?.length ? fullHistory : history,
      targetDrawDate,
      targetMonthLabel,
      targetDrawOrdinal,
      targetMonthExpectedDrawCount,
    });
  }, [
    baselineHistory,
    fullHistory,
    history,
    targetDrawDate,
    targetDrawOrdinal,
    targetMonthExpectedDrawCount,
    targetMonthLabel,
  ]);
  const maturityByNumber = React.useMemo(
    () => new Map((maturity?.byNumber ?? []).map((row) => [row.number, row])),
    [maturity],
  );
  const latestReplay = droughtSourceReplay.latestRows[0] ?? null;

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

    if (!onToggleNumber) {
      return (
        <span style={sourceNumberTokenStyle(mode)} data-drought-source={mode}>
          {number}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onToggleNumber(number)}
        disabled={disabled}
        aria-pressed={isForced}
        aria-label={toggleLabel}
        title={title}
        style={numberButton(mode, isForced, disabled)}
        data-drought-number-button="true"
        data-drought-source={mode}
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
      <CurrentForecastReplayCard
        strictNumbers={strictRows.map((row) => row.number)}
        empiricalNumbers={empiricalRows.map((row) => row.number)}
        topK={top}
        targetDrawDate={targetDrawDate}
        targetDrawOrdinal={targetDrawOrdinal}
        targetMonthExpectedDrawCount={targetMonthExpectedDrawCount}
        replay={latestReplay}
        replayScopeLabel={replayScopeLabel}
      />
      {activeForcedNumbers.length > 0 && onToggleNumber && (
        <div role="status" style={activeForcedCardStyle}>
          <div style={activeForcedHeaderStyle}>
            <div>
              <div style={activeForcedTitleStyle}>Active forced inclusions</div>
              <div style={activeForcedCopyStyle}>
                Selected manually. Drought learning and self-audit never add these numbers. Remove them here even if rank, history scope, or display mode changes.
              </div>
            </div>
            {onClearForcedNumbers && (
              <button
                type="button"
                onClick={onClearForcedNumbers}
                style={clearForcedButtonStyle}
              >
                Clear all
              </button>
            )}
          </div>
          <div role="group" aria-label="Active drought-break forced inclusions" style={activeForcedListStyle}>
            {activeForcedNumbers.map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => onToggleNumber(number)}
                aria-label={`Remove drought-break forced inclusion ${number}`}
                title={`Remove ${number} from drought-break forced inclusions`}
                style={activeForcedNumberButtonStyle}
                data-active-drought-forced-number={number}
              >
                <span>{number}</span>
                <span aria-hidden="true" style={activeForcedRemoveMarkStyle}>x</span>
              </button>
            ))}
          </div>
          {forcedOutsideDisplayedRows.length > 0 && (
            <div style={activeForcedWarningStyle}>
              Not in the current {mode === "strict" ? `Strict top ${top}` : `Empirical top ${top}`}: {forcedOutsideDisplayedRows.join(", ")}. They remain hard inclusions until removed.
            </div>
          )}
        </div>
      )}
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
            maturityByNumber={maturityByNumber}
            renderNumberButton={renderNumberButton}
            rowBackground={rowBackground}
          />
        ) : (
          <EmpiricalHazardTable
            rows={empiricalRows}
            bucketLabels={bucketLabels}
            fallbackLabels={fallbackLabels}
            maturityByNumber={maturityByNumber}
            renderNumberButton={renderNumberButton}
            rowBackground={rowBackground}
          />
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <DroughtHazardCalibrationAuditPanel
          history={baselineHistory?.length ? baselineHistory : fullHistory?.length ? fullHistory : history}
          historyScopeLabel={baselineHistoryScopeLabel}
        />
      </div>
      <DroughtSourceReplayAudit
        result={droughtSourceReplay}
        scope={replayScope}
        scopeLabel={replayScopeLabel}
        onScopeChange={setReplayScope}
      />
      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        Strict rank uses full-history current drought first. Break maturity is the share of that number's completed {strict.threshold}+ drought episodes that were broken at or before its current drought length. Max observed empirical drought length k = {maxK}. Sparse empirical lengths are stabilized with {priorTrials} baseline prior trials. Bucket maturity is a separate observe-only, stage-conditioned comparison; it does not change rank, empirical rate, forced selections, or generation.
        {maturity && (
          <> It uses {maturity.analyzedTargetDraws} baseline target draws after a {maturity.warmupDraws}-draw warm-up and compares the current {maturity.targetMonthExpectedDrawCount}D D{maturity.targetDrawOrdinal} state with matching historical month-bucket states.</>
        )}
      </div>
      {targetMonthLabel && targetDrawOrdinal && targetMonthExpectedDrawCount ? (
        <div style={{ marginTop: 12 }}>
          <DroughtLearningAuditPanel
            history={baselineHistory?.length ? baselineHistory : fullHistory?.length ? fullHistory : history}
            fullHistory={fullHistory?.length ? fullHistory : history}
            historyScopeLabel={baselineHistoryScopeLabel}
            threshold={strict.threshold}
            topK={top}
            targetMonthLabel={targetMonthLabel}
            targetDrawOrdinal={targetDrawOrdinal}
            targetMonthExpectedDrawCount={targetMonthExpectedDrawCount}
          />
        </div>
      ) : null}
    </section>
  );
};

const CurrentForecastReplayCard: React.FC<{
  strictNumbers: number[];
  empiricalNumbers: number[];
  topK: number;
  targetDrawDate?: string;
  targetDrawOrdinal?: number;
  targetMonthExpectedDrawCount?: number;
  replay: DroughtShortlistSourceReplayResult["latestRows"][number] | null;
  replayScopeLabel: string;
}> = ({
  strictNumbers,
  empiricalNumbers,
  topK,
  targetDrawDate,
  targetDrawOrdinal,
  targetMonthExpectedDrawCount,
  replay,
  replayScopeLabel,
}) => {
  const strictReplayHits = replay
    ? [...replay.strictOnlyHits, ...replay.overlappingHits].sort(
      (left, right) => (left.strictRank ?? Number.MAX_SAFE_INTEGER) - (right.strictRank ?? Number.MAX_SAFE_INTEGER),
    )
    : [];
  const empiricalReplayHits = replay
    ? [...replay.empiricalOnlyHits, ...replay.overlappingHits].sort(
      (left, right) => (left.empiricalRank ?? Number.MAX_SAFE_INTEGER) - (right.empiricalRank ?? Number.MAX_SAFE_INTEGER),
    )
    : [];
  const targetStage = targetMonthExpectedDrawCount && targetDrawOrdinal
    ? `${targetMonthExpectedDrawCount}D D${targetDrawOrdinal}`
    : null;

  return (
    <section aria-labelledby="drought-forecast-replay-title" style={forecastReplayCardStyle}>
      <div style={forecastReplayHeaderStyle}>
        <div>
          <div id="drought-forecast-replay-title" style={forecastReplayTitleStyle}>Current forecast and latest draw replay</div>
          <div style={auditFinePrintStyle}>Two different time positions, kept separate so a post-draw shortlist cannot be mistaken for a pre-draw result.</div>
        </div>
        <div aria-label="Drought shortlist source colors" style={sourceLegendStyle}>
          <span style={sourceLegendItemStyle("strict")}>Strict</span>
          <span style={sourceLegendItemStyle("empirical")}>Empirical</span>
        </div>
      </div>

      <div style={forecastReplayGridStyle}>
        <div style={forecastReplaySubcardStyle}>
          <div style={forecastReplaySubcardHeaderStyle}>
            <span>Current forecast</span>
            <span style={forecastReplayMetaStyle}>
              {targetDrawDate ? `Targets ${targetDrawDate}` : "Targets the next unsaved draw"}{targetStage ? ` · ${targetStage}` : ""}
            </span>
          </div>
          <SourceNumberRow source="strict" label={`Strict top ${topK}`} numbers={strictNumbers} />
          <SourceNumberRow source="empirical" label={`Empirical top ${topK}`} numbers={empiricalNumbers} />
          <div style={forecastReplayExplanationStyle}>
            Calculated after the latest saved draw. Strict uses full-history current drought; Empirical uses the active WFMQYH window. These rows therefore forecast the next draw and do not score the draw just saved.
          </div>
        </div>

        <div style={forecastReplaySubcardStyle}>
          <div style={forecastReplaySubcardHeaderStyle}>
            <span>Latest draw replay</span>
            <span style={forecastReplayMetaStyle}>
              {replay ? `${replay.targetDate} · ${formatStage(replay.targetMonthDrawCount, replay.targetDrawOrdinal, replay.targetMonthComplete)}` : "No eligible replay row"}
            </span>
          </div>
          {replay ? (
            <>
              <ReplayHitRow
                source="strict"
                label={`Strict hits ${replay.strictHitCount}/${replay.strictShortlist.length}`}
                hits={strictReplayHits}
              />
              <ReplayHitRow
                source="empirical"
                label={`Empirical hits ${replay.empiricalHitCount}/${replay.empiricalShortlist.length}`}
                hits={empiricalReplayHits}
              />
              <div style={forecastReplayResultStyle}>
                Unique union hits: <strong>{replay.unionHitCount} of 8 drawn numbers</strong>. Rebuilt from {replay.trainingDraws} prior draws only.
              </div>
            </>
          ) : (
            <div style={forecastReplayEmptyStyle}>Not enough prior real draws in this replay scope to score the latest draw.</div>
          )}
          <div style={forecastReplayExplanationStyle}>
            {replayScopeLabel}. The replay hides its target draw until both lists have been rebuilt. Change the replay scope below to inspect sensitivity without changing the live shortlist above.
          </div>
        </div>
      </div>

      <div style={modelGovernanceStyle}>
        <strong>Model governance:</strong> the existing Strict ordering remains the live champion. DLA-1 keeps its stage-conditioned challenger observe-only and may prefer it inside the audit only after at least 60 paired no-lookahead draws, a paired 95% interval wholly above zero, and performance above an equal-size random list. Neither policy changes generation automatically.
      </div>
    </section>
  );
};

const SourceNumberRow: React.FC<{
  source: DroughtDisplayMode;
  label: string;
  numbers: number[];
}> = ({ source, label, numbers }) => (
  <div style={sourceNumberRowStyle}>
    <span style={sourceNumberRowLabelStyle(source)}>{label}</span>
    <span style={sourceNumberListStyle}>
      {numbers.length
        ? numbers.map((number) => <SourceNumberToken key={`${source}-${number}`} number={number} source={source} />)
        : <span style={forecastReplayEmptyInlineStyle}>none</span>}
    </span>
  </div>
);

const ReplayHitRow: React.FC<{
  source: DroughtDisplayMode;
  label: string;
  hits: DroughtShortlistHitDetail[];
}> = ({ source, label, hits }) => (
  <div style={sourceNumberRowStyle}>
    <span style={sourceNumberRowLabelStyle(source)}>{label}</span>
    <span style={sourceNumberListStyle}>
      {hits.length ? hits.map((hit) => (
        <span key={`${source}-${hit.number}`} style={replayHitStyle}>
          <SourceNumberToken number={hit.number} source={source} />
          <span style={replayHitMetaStyle}>
            {source === "strict" ? `S${hit.strictRank ?? "?"}` : `E${hit.empiricalRank ?? "?"}`} · {hit.where}
          </span>
        </span>
      )) : <span style={forecastReplayEmptyInlineStyle}>none</span>}
    </span>
  </div>
);

const SourceNumberToken: React.FC<{ number: number; source: DroughtDisplayMode }> = ({ number, source }) => (
  <span style={sourceNumberTokenStyle(source)} data-drought-source={source}>{number}</span>
);

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
              <td style={{ ...compactTd, textAlign: "left" }}><DroughtAuditHitList hits={row.strictOnlyHits} /></td>
              <td style={{ ...compactTd, textAlign: "left" }}><DroughtAuditHitList hits={row.empiricalOnlyHits} /></td>
              <td style={{ ...compactTd, textAlign: "left" }}><DroughtAuditHitList hits={row.overlappingHits} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div style={auditFinePrintStyle}>S = strict rank. E = empirical rank. Rank is rebuilt from prior draws only.</div>
  </div>
);

const DroughtAuditHitList: React.FC<{ hits: DroughtShortlistHitDetail[] }> = ({ hits }) => {
  if (!hits.length) return <span style={auditHitEmptyStyle}>—</span>;

  return (
    <span style={auditHitListStyle}>
      {hits.map((hit) => (
        <span
          key={`${hit.source}-${hit.number}-${hit.where}`}
          style={auditHitDetailStyle}
          aria-label={auditHitAriaLabel(hit)}
        >
          <span
            style={auditHitNumberStyle(hit.source)}
            data-drought-audit-source={hit.source}
          >
            {hit.number}
          </span>
          <span style={auditHitRankGroupStyle}>
            {hit.source !== "empirical-only" ? (
              <span style={auditHitRankStyle("strict")}>S{hit.strictRank ?? "?"}</span>
            ) : null}
            {hit.source === "both" ? <span aria-hidden="true" style={auditHitRankSeparatorStyle}>/</span> : null}
            {hit.source !== "strict-only" ? (
              <span style={auditHitRankStyle("empirical")}>E{hit.empiricalRank ?? "?"}</span>
            ) : null}
          </span>
          <span style={auditHitRoleStyle}>{hit.where}</span>
        </span>
      ))}
    </span>
  );
};

const auditHitAriaLabel = (hit: DroughtShortlistHitDetail): string => {
  const source = hit.source === "both"
    ? `Strict rank ${hit.strictRank ?? "unknown"} and Empirical rank ${hit.empiricalRank ?? "unknown"}`
    : hit.source === "strict-only"
      ? `Strict-only rank ${hit.strictRank ?? "unknown"}`
      : `Empirical-only rank ${hit.empiricalRank ?? "unknown"}`;
  return `Number ${hit.number}, ${source}, drawn as ${hit.where}`;
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
  maturityByNumber: ReadonlyMap<number, DroughtBucketMaturityRow>;
  renderNumberButton: (number: number) => React.ReactNode;
  rowBackground: (number: number) => string | undefined;
}> = ({ rows, threshold, bucketLabels, fallbackLabels, maturityByNumber, renderNumberButton, rowBackground }) => (
  <table style={tableStyle}>
    <thead>
      <tr style={{ background: "#f7f7f7" }}>
        <th style={th}>#</th>
        <th style={th}>Strict rank</th>
        <th style={{ ...th, textAlign: "left" }}>Month bucket</th>
        <th style={th}>Full drought</th>
        <th style={th}>WFMQYH drought</th>
        <th style={{ ...th, textAlign: "left" }}>Bucket maturity</th>
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
          <td style={{ ...td, textAlign: "left" }}>
            <BucketMaturityCell row={maturityByNumber.get(r.number)} />
          </td>
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
          <td style={{ ...td, textAlign: "left" }} colSpan={12}>
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
  maturityByNumber: ReadonlyMap<number, DroughtBucketMaturityRow>;
  renderNumberButton: (number: number) => React.ReactNode;
  rowBackground: (number: number) => string | undefined;
}> = ({ rows, bucketLabels, fallbackLabels, maturityByNumber, renderNumberButton, rowBackground }) => (
  <table style={tableStyle}>
    <thead>
      <tr style={{ background: "#f7f7f7" }}>
        <th style={th}>#</th>
        <th style={{ ...th, textAlign: "left" }}>Month bucket</th>
        <th style={th}>Current drought (k)</th>
        <th style={{ ...th, textAlign: "left" }}>Bucket maturity</th>
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
          <td style={{ ...td, textAlign: "left" }}>
            <BucketMaturityCell row={maturityByNumber.get(r.number)} />
          </td>
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

const MATURITY_STATUS_LABELS: Record<DroughtBucketMaturityStatus, string> = {
  "at-boundary": "At stage bound",
  "near-boundary": "Near stage bound",
  "long-tail": "Long historical tail",
  "within-range": "Within range",
  "stage-start": "Stage start",
  unavailable: "Unavailable",
};

const BucketMaturityCell: React.FC<{ row?: DroughtBucketMaturityRow }> = ({ row }) => {
  if (!row || row.currentDrought === null) {
    return <span style={{ color: "#64748b" }}>No comparable state</span>;
  }

  const stagePosition = row.structuralMaxDrought === null
    ? `k${row.currentDrought}`
    : `k${row.currentDrought}/${row.structuralMaxDrought}`;
  const percentile = row.historicalPercentile === null
    ? "P—"
    : `P${Math.round(row.historicalPercentile * 100)}`;
  const evidence = row.tailTrials > 0
    ? `${row.tailHitsNext}/${row.tailTrials} historical next-draw hits · ${row.sample}`
    : "No at-least-this-mature historical matches";
  const title = row.structuralMaxDrought === null
    ? `0x has no within-month structural drought ceiling. ${stagePosition} is at ${percentile} among comparable month-stage states. ${evidence}.`
    : `${stagePosition} shows the current drought and the maximum mathematically possible drought at this draw stage for a ${row.bucketCount}x number. ${percentile} among comparable month-stage states. ${evidence}.`;

  return (
    <div title={title} aria-label={`${MATURITY_STATUS_LABELS[row.status]}. ${title}`} style={maturityCellStyle}>
      <div style={maturityCellTopLineStyle}>
        <span style={maturityBadgeStyle(row.status)}>{MATURITY_STATUS_LABELS[row.status]}</span>
        <span style={maturityPositionStyle}>{stagePosition} · {percentile}</span>
      </div>
      <div style={maturityEvidenceStyle}>{evidence}</div>
    </div>
  );
};

const formatTypicalBreak = (row: StrictDroughtNumberRow): string => {
  if (row.medianBreakLength == null || row.p75BreakLength == null) return "No completed episodes";
  return `med ${formatLength(row.medianBreakLength)} / p75 ${formatLength(row.p75BreakLength)}`;
};

const formatLength = (value: number): string => (
  Number.isInteger(value) ? String(value) : value.toFixed(1)
);

const tableStyle: React.CSSProperties = { width: "100%", minWidth: 1160, borderCollapse: "collapse", fontSize: 14 };
const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #ddd", fontWeight: 700, whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };

const baselineCell = (liftVsBaseline: number): React.CSSProperties => ({
  ...td,
  color: liftVsBaseline >= 0 ? "#b91c1c" : "#1d4ed8",
  fontWeight: 700,
});

const maturityCellStyle: React.CSSProperties = {
  display: "grid",
  gap: 3,
  minWidth: 190,
};

const maturityCellTopLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const maturityPositionStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 800,
};

const maturityEvidenceStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
};

const maturityBadgeStyle = (status: DroughtBucketMaturityStatus): React.CSSProperties => {
  const emphasized = status === "at-boundary" || status === "long-tail";
  return {
    border: `1px solid ${emphasized ? "#93c5fd" : "#cbd5e1"}`,
    borderRadius: 999,
    background: emphasized ? "#eff6ff" : "#f8fafc",
    color: emphasized ? "#1d4ed8" : "#475569",
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1.2,
    padding: "3px 6px",
    whiteSpace: "nowrap",
  };
};

const segmentedControl: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 8,
};

const activeForcedCardStyle: React.CSSProperties = {
  border: "1px solid #bbf7d0",
  borderRadius: 8,
  background: "#f0fdf4",
  display: "grid",
  gap: 8,
  marginBottom: 10,
  padding: "9px 10px",
};

const activeForcedHeaderStyle: React.CSSProperties = {
  alignItems: "flex-start",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "space-between",
};

const activeForcedTitleStyle: React.CSSProperties = {
  color: "#14532d",
  fontSize: 12,
  fontWeight: 900,
};

const activeForcedCopyStyle: React.CSSProperties = {
  color: "#166534",
  fontSize: 11,
  lineHeight: 1.4,
  marginTop: 2,
};

const activeForcedListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const activeForcedNumberButtonStyle: React.CSSProperties = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #16a34a",
  borderRadius: 999,
  color: "#14532d",
  cursor: "pointer",
  display: "inline-flex",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 900,
  gap: 6,
  minHeight: 32,
  padding: "5px 9px",
};

const activeForcedRemoveMarkStyle: React.CSSProperties = {
  color: "#15803d",
  fontSize: 12,
  fontWeight: 900,
};

const clearForcedButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #86efac",
  borderRadius: 6,
  color: "#166534",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  minHeight: 32,
  padding: "5px 9px",
};

const activeForcedWarningStyle: React.CSSProperties = {
  color: "#166534",
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1.4,
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

const DROUGHT_SOURCE_TONES: Record<DroughtDisplayMode, {
  background: string;
  border: string;
  text: string;
}> = {
  strict: { background: "#fff1f1", border: "#f1a7a0", text: "#b42318" },
  empirical: { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
};

const sourceNumberTokenStyle = (source: DroughtDisplayMode): React.CSSProperties => {
  const tone = DROUGHT_SOURCE_TONES[source];
  return {
    alignItems: "center",
    background: tone.background,
    border: `1px solid ${tone.border}`,
    borderRadius: 999,
    color: tone.text,
    display: "inline-flex",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 900,
    justifyContent: "center",
    minHeight: 26,
    minWidth: 30,
    padding: "2px 7px",
  };
};

const auditHitListStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const auditHitDetailStyle: React.CSSProperties = {
  alignItems: "center",
  display: "inline-flex",
  gap: 4,
  whiteSpace: "nowrap",
};

const auditHitNumberStyle = (source: DroughtShortlistHitDetail["source"]): React.CSSProperties => {
  if (source === "strict-only") return sourceNumberTokenStyle("strict");
  if (source === "empirical-only") return sourceNumberTokenStyle("empirical");
  return {
    ...sourceNumberTokenStyle("strict"),
    background: "linear-gradient(90deg, #fff1f1 0 50%, #eff6ff 50% 100%)",
    borderColor: "#94a3b8",
    boxShadow: "inset 3px 0 0 #b42318, inset -3px 0 0 #1d4ed8",
    color: "#334155",
  };
};

const auditHitRankGroupStyle: React.CSSProperties = {
  alignItems: "baseline",
  display: "inline-flex",
  fontSize: 10,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 850,
};

const auditHitRankStyle = (source: DroughtDisplayMode): React.CSSProperties => ({
  color: DROUGHT_SOURCE_TONES[source].text,
});

const auditHitRankSeparatorStyle: React.CSSProperties = {
  color: "#64748b",
  padding: "0 1px",
};

const auditHitRoleStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 10,
  fontWeight: 750,
};

const auditHitEmptyStyle: React.CSSProperties = {
  color: "#94a3b8",
};

const numberButton = (
  source: DroughtDisplayMode,
  active: boolean,
  disabled: boolean,
): React.CSSProperties => {
  const tone = DROUGHT_SOURCE_TONES[source];
  return {
    minWidth: 34,
    minHeight: 32,
    border: `1px solid ${tone.border}`,
    borderRadius: 8,
    background: tone.background,
    boxShadow: active ? "0 0 0 2px #16a34a" : undefined,
    color: disabled ? "#94a3b8" : tone.text,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
    opacity: disabled ? 0.52 : 1,
  };
};

const forecastReplayCardStyle: React.CSSProperties = {
  background: "#fbfdff",
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  display: "grid",
  gap: 10,
  marginBottom: 10,
  padding: 10,
};

const forecastReplayHeaderStyle: React.CSSProperties = {
  alignItems: "flex-start",
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  justifyContent: "space-between",
};

const forecastReplayTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 900,
};

const sourceLegendStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const sourceLegendItemStyle = (source: DroughtDisplayMode): React.CSSProperties => {
  const tone = DROUGHT_SOURCE_TONES[source];
  return {
    background: tone.background,
    border: `1px solid ${tone.border}`,
    borderRadius: 999,
    color: tone.text,
    fontSize: 11,
    fontWeight: 900,
    padding: "3px 7px",
  };
};

const forecastReplayGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
};

const forecastReplaySubcardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  display: "grid",
  gap: 8,
  minWidth: 0,
  padding: 10,
};

const forecastReplaySubcardHeaderStyle: React.CSSProperties = {
  alignItems: "baseline",
  color: "#0f172a",
  display: "flex",
  flexWrap: "wrap",
  fontSize: 12,
  fontWeight: 900,
  gap: "4px 10px",
  justifyContent: "space-between",
};

const forecastReplayMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 750,
};

const sourceNumberRowStyle: React.CSSProperties = {
  alignItems: "flex-start",
  display: "grid",
  gap: 8,
  gridTemplateColumns: "minmax(104px, auto) minmax(0, 1fr)",
};

const sourceNumberRowLabelStyle = (source: DroughtDisplayMode): React.CSSProperties => ({
  color: DROUGHT_SOURCE_TONES[source].text,
  fontSize: 11,
  fontWeight: 900,
  paddingTop: 5,
  whiteSpace: "nowrap",
});

const sourceNumberListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  minWidth: 0,
};

const replayHitStyle: React.CSSProperties = {
  alignItems: "center",
  display: "inline-flex",
  gap: 4,
};

const replayHitMetaStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 10,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 750,
  whiteSpace: "nowrap",
};

const forecastReplayResultStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 12,
  lineHeight: 1.4,
};

const forecastReplayExplanationStyle: React.CSSProperties = {
  borderTop: "1px solid #eef2f7",
  color: "#64748b",
  fontSize: 11,
  lineHeight: 1.45,
  paddingTop: 7,
};

const forecastReplayEmptyStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  padding: "4px 0",
};

const forecastReplayEmptyInlineStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  paddingTop: 5,
};

const modelGovernanceStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  color: "#475569",
  fontSize: 11,
  lineHeight: 1.45,
  padding: "8px 10px",
};

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
