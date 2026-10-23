import React from "react";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import { InlineCollapsibleCard } from "./shared/InlineCollapsibleCard";
import { buildOgaDecileGate, ogaDecileRangeLabel, ogaForecastBiasSummary,
  type OgaForecastBiasOptions, type PreferredOgaDecile } from "../lib/ogaDecileAcceptance";

interface Props {
  options: OgaForecastBiasOptions;
  baselineMode: "window" | "all";
  referenceDrawCount: number;
  bypassedByRandomCoverage?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onBaselineModeChange: (mode: "window" | "all") => void;
  onPreferredBandChange: (band: "auto" | "low" | "mid" | "high") => void;
  onPreferredDecilesChange: (deciles: PreferredOgaDecile[]) => void;
}

export const OgaForecastBiasControls: React.FC<Props> = ({ options, baselineMode, referenceDrawCount, bypassedByRandomCoverage = false,
  onEnabledChange, onBaselineModeChange, onPreferredBandChange, onPreferredDecilesChange }) => {
  const preferences = options.preferredDeciles ?? [];
  const thresholds = options.deciles?.thresholds ?? [];
  const gate = buildOgaDecileGate(options);
  const summary = bypassedByRandomCoverage && options.enabled
    ? "Bypassed by RwR45/PNUaRW45; standard OGA settings retained" : ogaForecastBiasSummary(options);
  const toggle = (index: number) => {
    onPreferredDecilesChange(preferences.some((item) => item.index === index)
      ? preferences.filter((item) => item.index !== index)
      : [...preferences, { index, weight: 1 }].sort((a, b) => a.index - b.index));
  };
  return (
    <div className="windfall-engine-ranking-subsection" id="windfall-generation-oga-forecast" tabIndex={-1}>
      <div className="windfall-engine-ranking-subsection__title">OGA Forecast Bias (KDE)</div>
      <p className="windfall-engine-ranking-note">Optional OGA acceptance bias. Diagnostic evidence, not a calibrated next-draw probability.</p>
      <label className="windfall-engine-ranking-toggle" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={!!options.enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
        Enable OGA acceptance bias
      </label>
      <div className="windfall-engine-ranking-field-grid" style={{ alignItems: "start" }}>
        <HigField label="Forecast baseline" help="Band cutoffs use the active WFMQYH draws. Their OGA scores and candidate OGA scores both use this reference history.">
          <select value={baselineMode} style={{ minHeight: 44, width: "100%" }} onChange={(event) => onBaselineModeChange(event.target.value as "window" | "all")}>
            <option value="window">Windowed</option>
            <option value="all">Full History</option>
          </select>
        </HigField>
        <HigField label="Preferred band" help={preferences.length
          ? "Inactive while detailed OGA score bands are selected. Clear those selections to use Low/Mid/High."
          : "Used only with no detailed bands selected. Auto chooses the strongest KDE-supported historical band, not a winning-number forecast."}>
          <select value={options.preferredBand ?? "auto"} disabled={preferences.length > 0} style={{ minHeight: 44, width: "100%" }}
            onChange={(event) => onPreferredBandChange(event.target.value as "auto" | "low" | "mid" | "high")}>
            <option value="auto">Auto</option>
            <option value="low">Low (&le;p10)</option>
            <option value="mid">Mid (p10&ndash;p90)</option>
            <option value="high">High (&ge;p90)</option>
          </select>
        </HigField>
      </div>
      <div className="windfall-engine-ranking-note">
        Evidence: {options.evidenceDrawCount ?? 0} active WFMQYH real draws; reference: {baselineMode === "all" ? "Full History" : "Windowed"} ({referenceDrawCount} real draws).
      </div>
      <div role="status" className="windfall-engine-ranking-note">Next generation OGA acceptance: {summary}</div>
      {gate.error && options.enabled && !bypassedByRandomCoverage && <div role="alert" className="windfall-engine-ranking-note" style={{ color: "#b42318" }}>{gate.error}. Generation is blocked until this is resolved or the bias is turned off.</div>}
      <InlineCollapsibleCard title="Preferred OGA score bands (advanced)" defaultExpanded={false}
        collapsedSummary={preferences.length ? `${preferences.length} selected; ${bypassedByRandomCoverage ? "saved, bypassed by RwR45" : options.enabled ? "selected bands only" : "saved, not active"}` : "No detailed selections; Low/Mid/High controls remain available."}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <HigButton size="compact" disabled={!preferences.length} onClick={() => onPreferredDecilesChange([])}>Clear bands</HigButton>
          <InfoHelp label="OGA score band weighting details">
            D0-D9 are ten historical OGA score intervals, not monthly draw ordinals or terminal digits. Only selected bands with positive weights can pass.
            Within those bands, algorithm acceptance equals the band weight divided by the sum of selected weights. Failed checks never fall back to Low/Mid/High.
            These weights are not candidate quotas or winning probabilities. Exact cutoff ties belong to the lower interval; ties can leave some intervals empty.
            Displayed cutoffs use eight significant digits; the full-precision cutoffs are recorded in Trace.
            Changes apply to the next generation run; previously generated rows are not re-filtered by a new selection.
          </InfoHelp>
        </div>
        <div className="windfall-engine-decile-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {Array.from({ length: 10 }, (_, index) => {
            const selection = preferences.find((item) => item.index === index);
            return <div className="windfall-engine-decile" key={index} style={{ display: "grid", alignContent: "start", minHeight: 80, gap: 4, fontWeight: 400 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 44, fontWeight: 700 }}>
                <input type="checkbox" checked={!!selection} onChange={() => toggle(index)} aria-label={`Use OGA band D${index}`} />
                D{index}
              </label>
              <span>{ogaDecileRangeLabel(index, thresholds)}</span>
              <HigField label={`D${index} weight`}>
                <input type="number" min={0} step={0.1} value={selection?.weight ?? 1} disabled={!selection}
                  style={{ width: "100%", minHeight: 44 }}
                  onChange={(event) => {
                    const weight = Number(event.target.value);
                    if (!Number.isFinite(weight)) return;
                    onPreferredDecilesChange(preferences.map((item) => item.index === index ? { ...item, weight: Math.max(0, weight) } : item));
                  }} />
              </HigField>
            </div>;
          })}
        </div>
      </InlineCollapsibleCard>
    </div>
  );
};
