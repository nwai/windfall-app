import React, { useMemo } from "react";

import {
  MRB_BUCKET_KEYS,
  MRB_BUCKET_LABELS,
  MRB_BUDGET,
  type MRBBucketBoosts,
} from "../lib/numberBiases";
import {
  buildGenerationProvenance,
  normalizeReadinessWeights,
  normalizeSumFilter,
  summarizeAcceptanceNeeds,
  type ReadinessWeights,
  type SumFilterConfig,
} from "../lib/candidateGenerationInfluences";
import type { MonthlyFrequencyConstraints } from "../lib/monthlyDrawSummary";
import type { DigitWidthConstraintScope } from "../lib/digitWidthConstraint";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export interface GenerationConstraintSummary {
  numberCounts: { number: number; count: number }[];
  drawResultCounts: { hits: number; count: number }[];
}

export interface EndingDigitConstraintRow {
  key: string;
  label: string;
  helper: string;
  badge?: string;
  max: number;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  count: number;
  setCount: (count: number) => void;
  singleDigitBoost: number;
  twoDigitBoost: number;
  setSingleDigitBoost: (boost: number) => void;
  setTwoDigitBoost: (boost: number) => void;
  title?: string;
  bucketKey: string;
}

export interface DecadeBiasRow {
  key: string;
  label: string;
  helper: string;
  badge?: string;
  bias: number;
  setBias: (bias: number) => void;
  title?: string;
  bucketKey: string;
}

interface MonthlyRepeatBiasResult {
  drawsSoFarThisMonth: number;
  bucketNums: Record<(typeof MRB_BUCKET_KEYS)[number], number[]>;
}

interface CandidateGenerationInfluencesPanelProps {
  windowSize: number;
  exactConstraintRows: readonly EndingDigitConstraintRow[];
  decadeRows: readonly DecadeBiasRow[];
  endingSummaries: Record<string, GenerationConstraintSummary>;
  decadeSummaries: Record<string, GenerationConstraintSummary>;
  digitWidthConstraintEnabled: boolean;
  setDigitWidthConstraintEnabled: (enabled: boolean) => void;
  digitWidthConstraintScope: DigitWidthConstraintScope;
  setDigitWidthConstraintScope: (scope: DigitWidthConstraintScope) => void;
  digitWidthSingleDigitPercent: number;
  setDigitWidthSingleDigitPercent: (value: number) => void;
  digitWidthTargets: {
    enabled: boolean;
    singleDigitPercent: number;
    twoDigitPercent: number;
    singleDigitCount: number;
    twoDigitCount: number;
    scope: DigitWidthConstraintScope;
  };
  digitWidthPercentOptions: readonly number[];
  formatDigitWidthScopeLabel: (scope: DigitWidthConstraintScope) => string;
  acceptanceNeedsEnabled: boolean;
  setAcceptanceNeedsEnabled: (enabled: boolean) => void;
  acceptanceNeedsCounts: MonthlyFrequencyConstraints;
  setAcceptanceNeedsCounts: Setter<MonthlyFrequencyConstraints>;
  effectiveMianCounts: MonthlyFrequencyConstraints;
  acceptanceNeedsHardExclude: boolean;
  setAcceptanceNeedsHardExclude: (enabled: boolean) => void;
  monthlyConstructiveEnabled: boolean;
  hasMonthlyConstraintPayload: boolean;
  hasMonthlyBucketData: boolean;
  mrbEnabled: boolean;
  setMrbEnabled: (enabled: boolean) => void;
  mrbEffectiveDate: Date;
  monthlyRepeatBiasResult: MonthlyRepeatBiasResult | null;
  mrbBucketBoosts: MRBBucketBoosts;
  setMrbBucketBoosts: Setter<MRBBucketBoosts>;
  mrbIncludeSupp: boolean;
  setMrbIncludeSupp: (enabled: boolean) => void;
  useTrickyRule: boolean;
  setUseTrickyRule: (enabled: boolean) => void;
  ratioOptions: { ratio: string; count: number; percent: number }[];
  selectedRatios: string[];
  onRatioToggle: (ratio: string) => void;
  minRecentMatches: number;
  setMinRecentMatches: (value: number) => void;
  maxLastDrawMatchesEnabled: boolean;
  setMaxLastDrawMatchesEnabled: (enabled: boolean) => void;
  maxLastDrawMatchesValue: number;
  setMaxLastDrawMatchesValue: (value: number) => void;
  recentMatchBias: number;
  setRecentMatchBias: (value: number) => void;
  repeatWindowSizeW: number;
  setRepeatWindowSizeW: (value: number) => void;
  minFromRecentUnionM: number;
  setMinFromRecentUnionM: (value: number) => void;
  maxRepeatWindow: number;
  sumFilter: SumFilterConfig;
  setSumFilter: Setter<SumFilterConfig>;
  enableOGAForecastBias: boolean;
  setEnableOGAForecastBias: (enabled: boolean) => void;
  ogaBaselineMode: "window" | "all";
  setOGABaselineMode: (mode: "window" | "all") => void;
  ogaPreferredBand: "auto" | "low" | "mid" | "high";
  setOGAPreferredBand: (band: "auto" | "low" | "mid" | "high") => void;
  ogaPreferredDeciles: { index: number; weight: number }[];
  setOGAPreferredDeciles: Setter<{ index: number; weight: number }[]>;
  ogaDecileThresholds: number[];
  entropyEnabled: boolean;
  setEntropyEnabled: (enabled: boolean) => void;
  entropyThreshold: number;
  setEntropyThreshold: (value: number) => void;
  hammingEnabled: boolean;
  setHammingEnabled: (enabled: boolean) => void;
  hammingThreshold: number;
  setHammingThreshold: (value: number) => void;
  jaccardEnabled: boolean;
  setJaccardEnabled: (enabled: boolean) => void;
  jaccardThreshold: number;
  setJaccardThreshold: (value: number) => void;
  rdyWeights: ReadinessWeights;
  setRdyWeights: Setter<ReadinessWeights>;
  gpwfEnabled: boolean;
  lambdaEnabled: boolean;
  lambda: number;
  patternConstraintMode: string;
  patternSumTolerance: number;
  patternBoostFactor: number;
  activeMainDigitBoostSummary: string;
  activeMainDecadeBiasSummary: string;
  endingDigitSetLabels: Record<`end${number}`, string>;
  forcedNumbers: number[];
  effectiveExcludedNumbers: number[];
  sde1Enabled: boolean;
  sde1Exclusions: number[];
  hc3Enabled: boolean;
  hc3Exclusions: number[];
  allExclusions: number[];
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: 10,
};

const compactGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 3,
  fontSize: 12,
  color: "#334155",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  minHeight: 30,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "3px 7px",
  background: "#fff",
  color: "#0f172a",
};

const miniButtonStyle: React.CSSProperties = {
  minHeight: 28,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: "#fff",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const clampInt = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min))
);

const clampFloat = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
);

const sortedList = (numbers: number[]): string => (
  numbers.length ? [...numbers].sort((a, b) => a - b).join(", ") : "none"
);

const monthLabel = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
);

const SummaryStrip: React.FC<{ label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }> = ({
  label,
  value,
  tone = "neutral",
}) => {
  const tones = {
    neutral: { background: "#f8fafc", border: "#e2e8f0", color: "#0f172a" },
    good: { background: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
    warn: { background: "#fffbeb", border: "#fde68a", color: "#92400e" },
    bad: { background: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  }[tone];

  return (
    <div style={{ border: `1px solid ${tones.border}`, background: tones.background, borderRadius: 8, padding: 9 }}>
      <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: tones.color, fontSize: 17, fontWeight: 900, lineHeight: 1.25 }}>{value}</div>
    </div>
  );
};

const NumberCounts: React.FC<{ summary: GenerationConstraintSummary | undefined }> = ({ summary }) => {
  if (!summary) return <span style={{ color: "#94a3b8" }}>no data</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {summary.numberCounts.map(({ number, count }) => (
        <span
          key={number}
          title={`${number} appeared ${count} time${count === 1 ? "" : "s"} in WFMQYH mains`}
          style={{
            border: "1px solid #dbe3ef",
            background: count > 0 ? "#f8fafc" : "#f1f5f9",
            color: count > 0 ? "#1e293b" : "#94a3b8",
            borderRadius: 999,
            padding: "1px 6px",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {number}:{count}
        </span>
      ))}
    </div>
  );
};

const WeightInput: React.FC<{ value: number; onChange: (value: number) => void; min?: number; max?: number; disabled?: boolean }> = ({
  value,
  onChange,
  min = 0,
  max = 5,
  disabled = false,
}) => (
  <select
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(clampInt(Number(event.target.value), min, max))}
    style={{ ...inputStyle, opacity: disabled ? 0.45 : 1, minWidth: 66 }}
  >
    {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((option) => (
      <option key={option} value={option}>{option > 0 ? `+${option}` : option}</option>
    ))}
  </select>
);

export const CandidateGenerationInfluencesPanel: React.FC<CandidateGenerationInfluencesPanelProps> = (props) => {
  const sum = useMemo(() => normalizeSumFilter(props.sumFilter), [props.sumFilter]);
  const readiness = useMemo(() => normalizeReadinessWeights(props.rdyWeights), [props.rdyWeights]);
  const acceptance = useMemo(() => summarizeAcceptanceNeeds(props.effectiveMianCounts), [props.effectiveMianCounts]);
  const activeEndingCaps = props.exactConstraintRows.filter((row) => row.enabled).length;
  const activeEndingBoosts = props.exactConstraintRows.filter((row) => row.singleDigitBoost > 0 || row.twoDigitBoost > 0).length;
  const activeDecadeBiases = props.decadeRows.filter((row) => row.bias !== 0).length;
  const mrbUsedBudget = MRB_BUCKET_KEYS.reduce((sumBudget, key) => sumBudget + Math.max(0, (props.mrbBucketBoosts[key] ?? 1) - 1), 0);
  const mrbBudgetTone = mrbUsedBudget > MRB_BUDGET ? "bad" : mrbUsedBudget > MRB_BUDGET * 0.8 ? "warn" : "good";
  const provenance = buildGenerationProvenance({
    windowSize: props.windowSize,
    entropy: props.entropyEnabled ? props.entropyThreshold : "off",
    hamming: props.hammingEnabled ? props.hammingThreshold : "off",
    jaccard: props.jaccardEnabled ? props.jaccardThreshold : "off",
    tricky: props.useTrickyRule,
    ratios: props.selectedRatios,
    minRecentMatches: props.minRecentMatches,
    recentMatchBias: props.recentMatchBias,
    repeatWindowSizeW: props.repeatWindowSizeW,
    minFromRecentUnionM: props.minFromRecentUnionM,
    gpwf: props.gpwfEnabled,
    lambda: props.lambdaEnabled ? props.lambda : "off",
    sumLabel: sum.label,
    patternMode: props.patternConstraintMode,
    patternSumTolerance: props.patternSumTolerance,
    patternBoostFactor: props.patternBoostFactor,
    ogaBias: props.enableOGAForecastBias ? `${props.ogaPreferredBand} @ ${props.ogaBaselineMode}` : "off",
    endingDigitSets: props.endingDigitSetLabels,
    digitWidth: props.digitWidthTargets.enabled
      ? `${props.digitWidthTargets.singleDigitPercent}/${props.digitWidthTargets.twoDigitPercent} ${props.formatDigitWidthScopeLabel(props.digitWidthTargets.scope)} => ${props.digitWidthTargets.singleDigitCount}/${props.digitWidthTargets.twoDigitCount}`
      : "off",
    endingDigitBoosts: props.activeMainDigitBoostSummary || "none",
    decadeBias: props.activeMainDecadeBiasSummary || "none",
    monthlyRepeatBias: props.mrbEnabled ? `ON budget:${mrbUsedBudget.toFixed(1)}/${MRB_BUDGET}` : "off",
  });

  const setAcceptanceCount = (key: keyof MonthlyFrequencyConstraints, value: number) => {
    props.setAcceptanceNeedsCounts((previous) => ({
      ...previous,
      [key]: clampInt(value, 0, 8),
    }));
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <SummaryStrip label="Ending Caps" value={`${activeEndingCaps} on`} />
        <SummaryStrip label="Digit Boosts" value={`${activeEndingBoosts} ending / ${activeDecadeBiases} decade`} tone={activeEndingBoosts || activeDecadeBiases ? "warn" : "neutral"} />
        <SummaryStrip label="Monthly Needs" value={props.acceptanceNeedsEnabled ? `${acceptance.total}/8` : "off"} tone={!acceptance.possible ? "bad" : props.acceptanceNeedsEnabled ? "good" : "neutral"} />
        <SummaryStrip label="Sum Filter" value={sum.label} tone={sum.config.enabled ? "good" : "neutral"} />
        <SummaryStrip label="MRB Budget" value={props.mrbEnabled ? `${mrbUsedBudget.toFixed(1)}/${MRB_BUDGET}` : "off"} tone={props.mrbEnabled ? mrbBudgetTone : "neutral"} />
      </div>

      {(sum.warnings.length > 0 || acceptance.warning) && (
        <div style={{ ...sectionStyle, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e", fontSize: 12 }}>
          {[...sum.warnings, acceptance.warning].filter(Boolean).map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      )}

      <section style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8, color: "#0f172a" }}>Ending Digit Limits And Boosts</div>
        <div style={{ display: "grid", gap: 6 }}>
          {props.exactConstraintRows.map((row) => {
            const summary = props.endingSummaries[row.bucketKey];
            const active = row.enabled || row.singleDigitBoost > 0 || row.twoDigitBoost > 0;
            return (
              <div
                key={row.key}
                title={row.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1.2fr) repeat(4, auto) minmax(220px, 2fr)",
                  gap: 8,
                  alignItems: "center",
                  borderTop: "1px solid #edf2f7",
                  padding: "7px 0",
                  background: active ? "#fffdf7" : "transparent",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#0f172a", fontWeight: 800, fontSize: 12 }}>{row.label}</div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>{row.badge}</div>
                </div>
                <label style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                  <input type="checkbox" checked={row.enabled} onChange={(event) => row.setEnabled(event.target.checked)} />
                  Max
                </label>
                <select
                  value={row.count}
                  disabled={!row.enabled}
                  onChange={(event) => row.setCount(clampInt(Number(event.target.value), 0, row.max))}
                  style={{ ...inputStyle, opacity: row.enabled ? 1 : 0.45, minWidth: 62 }}
                >
                  {Array.from({ length: row.max + 1 }, (_, value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <WeightInput value={row.singleDigitBoost} onChange={row.setSingleDigitBoost} disabled={!row.badge?.includes("1")} />
                <WeightInput value={row.twoDigitBoost} onChange={row.setTwoDigitBoost} />
                <NumberCounts summary={summary} />
              </div>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8, color: "#0f172a" }}>Decade Bias</div>
        <div style={compactGrid}>
          {props.decadeRows.map((row) => {
            const summary = props.decadeSummaries[row.bucketKey];
            return (
              <div key={row.key} title={row.title} style={{ borderTop: "1px solid #edf2f7", paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#0f172a", fontWeight: 800, fontSize: 12 }}>{row.label}</div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>{row.badge}</div>
                  </div>
                  <select
                    value={row.bias}
                    onChange={(event) => row.setBias(clampInt(Number(event.target.value), -5, 5))}
                    style={{ ...inputStyle, minWidth: 72, background: row.bias > 0 ? "#fffbeb" : row.bias < 0 ? "#eff6ff" : "#fff" }}
                  >
                    {Array.from({ length: 11 }, (_, index) => index - 5).map((value) => (
                      <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginTop: 6 }}><NumberCounts summary={summary} /></div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8, color: "#0f172a" }}>Monthly Constraints</div>
        <div style={compactGrid}>
          <div>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={props.digitWidthConstraintEnabled} onChange={(event) => props.setDigitWidthConstraintEnabled(event.target.checked)} />
              Single-digit / two-digit share
            </label>
            <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
              <label style={labelStyle}>
                Count Against
                <select value={props.digitWidthConstraintScope} onChange={(event) => props.setDigitWidthConstraintScope(event.target.value as DigitWidthConstraintScope)} style={inputStyle}>
                  <option value="main">Mains only</option>
                  <option value="mainAndSupp">Main + supps</option>
                </select>
              </label>
              <label style={labelStyle}>
                Single Digit Percent
                <select value={props.digitWidthSingleDigitPercent} onChange={(event) => props.setDigitWidthSingleDigitPercent(Number(event.target.value) || 0)} style={inputStyle}>
                  {props.digitWidthPercentOptions.map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
              </label>
              <div style={{ color: props.digitWidthTargets.enabled ? "#166534" : "#64748b", fontSize: 12 }}>
                Target: {props.digitWidthTargets.singleDigitCount} single / {props.digitWidthTargets.twoDigitCount} two-digit
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={props.acceptanceNeedsEnabled} onChange={(event) => props.setAcceptanceNeedsEnabled(event.target.checked)} />
              Must include from Acceptance needs
            </label>
            {props.monthlyConstructiveEnabled && props.hasMonthlyConstraintPayload && (
              <div style={{ color: "#166534", fontSize: 11, marginTop: 5 }}>Synced from Monthly Draws Summary.</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(82px, 1fr))", gap: 6, marginTop: 8 }}>
              {([
                ["undrawn", "Undrawn"],
                ["times1", "1x"],
                ["times2", "2x"],
                ["times3", "3x"],
                ["times4", "4x"],
                ["times5", "5x"],
                ["times6", "6x"],
                ["times7", "7x"],
                ["times8", "8x+"],
              ] as const).map(([key, label]) => {
                const synced = props.monthlyConstructiveEnabled && props.hasMonthlyConstraintPayload;
                return (
                  <label key={key} style={{ ...labelStyle, fontSize: 11 }}>
                    {label}
                    <input
                      type="number"
                      min={0}
                      max={8}
                      readOnly={synced}
                      value={props.effectiveMianCounts[key]}
                      onChange={(event) => setAcceptanceCount(key, Number(event.target.value))}
                      style={{ ...inputStyle, background: synced ? "#f0fdf4" : "#fff" }}
                    />
                  </label>
                );
              })}
            </div>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 8, fontSize: 12 }}>
              <input type="checkbox" checked={props.acceptanceNeedsHardExclude} onChange={(event) => props.setAcceptanceNeedsHardExclude(event.target.checked)} />
              Hard exclude zero-count buckets
            </label>
            {props.acceptanceNeedsEnabled && !props.hasMonthlyBucketData && (
              <div style={{ color: "#991b1b", fontSize: 11, marginTop: 4 }}>No monthly bucket data is available.</div>
            )}
          </div>

          <div>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={props.mrbEnabled} onChange={(event) => props.setMrbEnabled(event.target.checked)} />
              Monthly Repeat Bias
            </label>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{monthLabel(props.mrbEffectiveDate)}</div>
            {props.mrbEnabled && (
              <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                {MRB_BUCKET_KEYS.map((key) => {
                  const count = props.monthlyRepeatBiasResult?.bucketNums[key].length ?? 0;
                  const otherBudget = MRB_BUCKET_KEYS.reduce((total, otherKey) => (
                    otherKey === key ? total : total + Math.max(0, (props.mrbBucketBoosts[otherKey] ?? 1) - 1)
                  ), 0);
                  const maxForBucket = 1 + Math.max(0, MRB_BUDGET - otherBudget);
                  return (
                    <label key={key} style={{ display: "grid", gridTemplateColumns: "1fr 42px 70px", gap: 6, alignItems: "center", fontSize: 12 }}>
                      <span>{MRB_BUCKET_LABELS[key]}</span>
                      <span style={{ textAlign: "right", color: count ? "#0f172a" : "#94a3b8" }}>{count}</span>
                      <input
                        type="number"
                        min={1}
                        max={maxForBucket}
                        step={0.5}
                        disabled={count === 0}
                        value={props.mrbBucketBoosts[key] ?? 1}
                        onChange={(event) => {
                          const next = clampFloat(Number(event.target.value), 1, maxForBucket);
                          props.setMrbBucketBoosts((previous) => ({ ...previous, [key]: next }));
                        }}
                        style={{ ...inputStyle, minHeight: 26, opacity: count === 0 ? 0.45 : 1 }}
                      />
                    </label>
                  );
                })}
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <input type="checkbox" checked={props.mrbIncludeSupp} onChange={(event) => props.setMrbIncludeSupp(event.target.checked)} />
                  Include supplementary numbers
                </label>
                <button type="button" style={miniButtonStyle} onClick={() => props.setMrbBucketBoosts({ undrawn: 1, times1: 1, times2: 1, times3: 1, times4: 1, times5: 1, times6: 1, times7: 1, times8: 1 })}>
                  Reset boosts
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8, color: "#0f172a" }}>Composition And Recency</div>
        <div style={compactGrid}>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={props.useTrickyRule} onChange={(event) => props.setUseTrickyRule(event.target.checked)} />
              Tricky Rule
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {props.ratioOptions.map(({ ratio }) => (
                <label key={ratio} style={{ display: "inline-flex", gap: 4, alignItems: "center", opacity: props.useTrickyRule ? 0.45 : 1, fontSize: 12 }}>
                  <input type="checkbox" checked={props.selectedRatios.includes(ratio)} disabled={props.useTrickyRule} onChange={() => props.onRatioToggle(ratio)} />
                  {ratio}
                </label>
              ))}
            </div>
          </div>

          <div
            aria-label="Last draw match bias and repeat pool controls"
            style={{
              display: "grid",
              gap: 8,
              padding: 10,
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: 8,
              background: "rgba(254, 242, 242, 0.5)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#991b1b" }}>
              Latest-Draw Overlap Controls
            </div>
            <label style={labelStyle}>
              Minimum Matches To Last Draw
              <input type="number" min={0} max={8} value={props.minRecentMatches} onChange={(event) => props.setMinRecentMatches(clampInt(Number(event.target.value), 0, 8))} style={inputStyle} />
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={props.maxLastDrawMatchesEnabled} onChange={(event) => props.setMaxLastDrawMatchesEnabled(event.target.checked)} />
              Maximum Matches To Last Draw
              <select value={props.maxLastDrawMatchesValue} disabled={!props.maxLastDrawMatchesEnabled} onChange={(event) => props.setMaxLastDrawMatchesValue(clampInt(Number(event.target.value), 1, 8))} style={inputStyle}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
              Minimum and maximum matches are strict filters. Last-draw match bias is only a soft weighting strength.
            </div>
            <label style={labelStyle}>
              Last-Draw Match Bias
              <input type="number" min={0} max={5} step={0.1} value={props.recentMatchBias} onChange={(event) => props.setRecentMatchBias(clampFloat(Number(event.target.value), 0, 5))} style={inputStyle} />
              <span style={{ marginLeft: 4, color: "#b91c1c", fontSize: 11, fontWeight: 700 }}>max 5</span>
            </label>
            <label style={labelStyle}>
              Look Back Over Newest Draws
              <input type="number" min={0} max={props.maxRepeatWindow} value={props.repeatWindowSizeW} onChange={(event) => props.setRepeatWindowSizeW(clampInt(Number(event.target.value), 0, props.maxRepeatWindow))} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Minimum Candidate Numbers From That Pool
              <input type="number" min={0} max={8} value={props.minFromRecentUnionM} onChange={(event) => props.setMinFromRecentUnionM(clampInt(Number(event.target.value), 0, 8))} style={inputStyle} />
            </label>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={props.sumFilter.enabled} onChange={(event) => props.setSumFilter((previous) => ({ ...previous, enabled: event.target.checked }))} />
              Sum range
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <label style={labelStyle}>
                Min
                <input type="number" value={props.sumFilter.min} onChange={(event) => props.setSumFilter((previous) => ({ ...previous, min: Number(event.target.value) }))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Max
                <input type="number" value={props.sumFilter.max} onChange={(event) => props.setSumFilter((previous) => ({ ...previous, max: Number(event.target.value) }))} style={inputStyle} />
              </label>
            </div>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={props.sumFilter.includeSupp} onChange={(event) => props.setSumFilter((previous) => ({ ...previous, includeSupp: event.target.checked }))} />
              Include supplementary numbers
            </label>
            <div style={{ color: sum.config.enabled ? "#166534" : "#64748b", fontSize: 12 }}>Generation uses: {sum.label}</div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
              <input type="checkbox" checked={props.enableOGAForecastBias} onChange={(event) => props.setEnableOGAForecastBias(event.target.checked)} />
              OGA forecast bias
            </label>
            <label style={labelStyle}>
              Baseline
              <select value={props.ogaBaselineMode} onChange={(event) => props.setOGABaselineMode(event.target.value as "window" | "all")} style={inputStyle}>
                <option value="window">Windowed</option>
                <option value="all">Full history</option>
              </select>
            </label>
            <label style={labelStyle}>
              Preferred Band
              <select value={props.ogaPreferredBand} onChange={(event) => props.setOGAPreferredBand(event.target.value as "auto" | "low" | "mid" | "high")} style={inputStyle}>
                <option value="auto">Auto</option>
                <option value="low">Low</option>
                <option value="mid">Mid</option>
                <option value="high">High</option>
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(110px, 1fr))", gap: 5 }}>
              {Array.from({ length: 10 }, (_, index) => {
                const existing = props.ogaPreferredDeciles.find((decile) => decile.index === index);
                return (
                  <label key={index} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 5, fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={!!existing}
                      onChange={() => props.setOGAPreferredDeciles((previous) => (
                        previous.some((decile) => decile.index === index)
                          ? previous.filter((decile) => decile.index !== index)
                          : [...previous, { index, weight: 1 }]
                      ))}
                    />
                    D{index} {props.ogaDecileThresholds[index - 1] !== undefined ? `>= ${props.ogaDecileThresholds[index - 1].toFixed(2)}` : "min"}
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={existing?.weight ?? 1}
                      onChange={(event) => props.setOGAPreferredDeciles((previous) => {
                        const nextWeight = Math.max(0, Number(event.target.value) || 0);
                        const found = previous.findIndex((decile) => decile.index === index);
                        if (found >= 0) {
                          const next = previous.slice();
                          next[found] = { ...next[found], weight: nextWeight };
                          return next;
                        }
                        return [...previous, { index, weight: nextWeight }];
                      })}
                      style={{ ...inputStyle, minHeight: 24, width: 56, marginLeft: 4 }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 8, color: "#0f172a" }}>Core Filters And Readiness</div>
        <div style={compactGrid}>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800 }}>
            <span><input type="checkbox" checked={props.entropyEnabled} onChange={(event) => props.setEntropyEnabled(event.target.checked)} /> Entropy {props.entropyThreshold}</span>
            <input type="range" min={0} max={6} step={0.1} value={props.entropyThreshold} onChange={(event) => props.setEntropyThreshold(Number(event.target.value))} />
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800 }}>
            <span><input type="checkbox" checked={props.hammingEnabled} onChange={(event) => props.setHammingEnabled(event.target.checked)} /> Hamming {props.hammingThreshold}</span>
            <input type="range" min={0} max={8} step={1} value={props.hammingThreshold} onChange={(event) => props.setHammingThreshold(Number(event.target.value))} />
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800 }}>
            <span><input type="checkbox" checked={props.jaccardEnabled} onChange={(event) => props.setJaccardEnabled(event.target.checked)} /> Jaccard {Math.round(props.jaccardThreshold * 100)}%</span>
            <input type="range" min={0} max={1} step={0.01} value={props.jaccardThreshold} onChange={(event) => props.setJaccardThreshold(Number(event.target.value))} />
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            {(["idm", "conv", "oga"] as const).map((key) => (
              <label key={key} style={labelStyle}>
                {key.toUpperCase()} {readiness[key]}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={props.rdyWeights[key]}
                  onChange={(event) => props.setRdyWeights((previous) => ({ ...previous, [key]: Number(event.target.value) }))}
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#0f172a" }}>Provenance</div>
        <div style={{ color: "#334155", fontSize: 12, lineHeight: 1.5 }}>{provenance}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
          <div>
            <strong>Forced numbers ({props.forcedNumbers.length})</strong>
            <div>{sortedList(props.forcedNumbers)}</div>
          </div>
          <div>
            <strong>User exclusions ({props.effectiveExcludedNumbers.length})</strong>
            <div>{sortedList(props.effectiveExcludedNumbers)}</div>
          </div>
          <div>
            <strong>System exclusions</strong>
            <div>SDE1 {props.sde1Enabled ? "ON" : "OFF"}: {props.sde1Exclusions.length}</div>
            <div>HC3 {props.hc3Enabled ? "ON" : "OFF"}: {props.hc3Exclusions.length}</div>
            <div>Combined: {sortedList(props.allExclusions)}</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CandidateGenerationInfluencesPanel;
