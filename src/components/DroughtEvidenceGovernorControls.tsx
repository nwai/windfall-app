import React from "react";
import {
  DROUGHT_GOVERNOR_BUCKET_LABELS,
  DROUGHT_GOVERNOR_MAX_MULTIPLIER,
  type DroughtEvidenceGovernorMode,
  type DroughtEvidenceGovernorProfile,
  type DroughtEvidenceGovernorSettings,
} from "../lib/droughtEvidenceGovernor";
import type { MonthlyBucketKey } from "../lib/monthlyDrawSummary";
import { HigButton, HigField, InfoHelp } from "./shared/HigControls";
import "./DroughtEvidenceGovernorControls.css";

interface Props {
  profile: DroughtEvidenceGovernorProfile;
  onModeChange: (mode: DroughtEvidenceGovernorMode) => void;
  onSettingsChange: (settings: DroughtEvidenceGovernorSettings) => void;
}

const weightOptions = Array.from({ length: Math.round((DROUGHT_GOVERNOR_MAX_MULTIPLIER - 1) * 100) + 1 }, (_, index) => 1 + index / 100);
const bucketKeys = Object.keys(DROUGHT_GOVERNOR_BUCKET_LABELS) as MonthlyBucketKey[];
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

function WeightSelect({ value, onChange, disabled, label }: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  label?: string;
}) {
  return <select aria-label={label} value={value.toFixed(2)} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}>
    {weightOptions.map((weight) => <option key={weight.toFixed(2)} value={weight.toFixed(2)}>{weight.toFixed(2)}x</option>)}
  </select>;
}

export function DroughtEvidenceGovernorControls({ profile, onModeChange, onSettingsChange }: Props) {
  const { settings, mode } = profile;
  const manual = mode === "manual";
  const update = (patch: Partial<DroughtEvidenceGovernorSettings>) => onSettingsChange({ ...settings, ...patch });
  const overriddenNumbers = Object.keys(settings.numberOverrides).map(Number).sort((a, b) => a - b);

  return <section className="windfall-drought-governor" aria-label="Drought Evidence Governor">
    <div className="windfall-drought-governor__heading">
      <strong>Drought Evidence Governor</strong>
      <InfoHelp label="About Auto evidence and Manual weights">
        Auto uses the historical evidence gate. Manual uses your multipliers even if that gate fails. Only one mode can be on;
        both off disables this governor. A 1.20x weight multiplies a number's construction weight by 1.20; it is not a 20% draw chance.
        Other weights and hard filters still apply. RwR45 bypasses this governor.
      </InfoHelp>
      <label><input type="checkbox" role="switch" checked={mode === "auto"} onChange={(event) => onModeChange(event.target.checked ? "auto" : "off")} />Auto evidence</label>
      <label><input type="checkbox" role="switch" checked={manual} onChange={(event) => onModeChange(event.target.checked ? "manual" : "off")} />Manual weights</label>
    </div>
    <p className="windfall-drought-governor__context"><strong>Planning context: {profile.contextLabel}</strong><span>Month, expected draws, next draw ordinal. Mains + supps.</span></p>
    <p role="status"><strong>{profile.summaryLabel}</strong>{manual ? " · User-set experiment; Auto gate bypassed." : ""}</p>

    <div className="windfall-drought-governor__families">
      {profile.familySummaries.map((family) => {
        const strict = family.family === "strict";
        const name = strict ? "Strict" : "Empirical";
        const bucketKey = strict ? "strictBuckets" : "empiricalBuckets";
        const weightKey = strict ? "strictMultiplier" : "empiricalMultiplier";
        return <fieldset key={family.family}>
          <legend>{name} buckets</legend>
          <p>{strict ? "Strict drought 6+: numbers absent for at least six real draws, ordered by the strict shortlist ranking." : "Empirical hazard: numbers ranked by the smoothed historical hit rate for their current drought length. These can have shorter droughts."}</p>
          <div className="windfall-drought-governor__heading">
            <strong>Auto gate: {family.gatePassed ? "passed" : "not passed"}</strong>
            <InfoHelp label={`How the ${family.family} evidence gate works`}>
              {strict
                ? "Strict replay first tries the same month length and draw ordinal (at least 6 trials), then the same ordinal (12), then all eligible baseline trials (24). Replay advice requires a 1-3-hit lift of at least 2 percentage points, or an average hit lift of at least 0.12."
                : "Empirical replay uses all eligible baseline transitions. Replay advice requires a positive-count observed rate of at least 15% and a lift of at least 2 percentage points above random for at least one shortlist hit."}
              {" "}The governor additionally requires positive replay advice, at least one trial, and a 1-3-hit lift of at least 2 percentage points or an average hit lift of at least 0.10.
              Each historical shortlist uses earlier draws only. Passing these heuristic thresholds is not proof of predictive accuracy.
            </InfoHelp>
          </div>
          <p>{family.sourceLabel} · {family.trials} trials</p>
          <dl className="windfall-drought-governor__evidence">
            <dt>Draws with 1-3 shortlist hits</dt><dd>{family.trials ? `${percent(family.oneToThreeHitRate)} vs ${percent(family.expectedRandomOneToThreeHitRate)} random` : "Unavailable"}</dd>
            <dt>Average shortlist hits</dt><dd>{family.trials ? `${family.averageHits.toFixed(2)} vs ${family.expectedRandomAverageHits.toFixed(2)} random` : "Unavailable"}</dd>
          </dl>
          <p>{family.eligibleNumbers.length} eligible · {family.allowedNumbers.length} allowed by these controls · {family.boostedNumbers.length} weighted now</p>
          <div className="windfall-drought-governor__buckets">
            {bucketKeys.map((key) => <label key={key}>
              <input type="checkbox" aria-label={`${name} bucket ${DROUGHT_GOVERNOR_BUCKET_LABELS[key]}`} disabled={!profile.userEnabled}
                checked={settings[bucketKey].includes(key)}
                onChange={(event) => update({ [bucketKey]: event.target.checked ? [...settings[bucketKey], key] : settings[bucketKey].filter((item) => item !== key) })} />
              {DROUGHT_GOVERNOR_BUCKET_LABELS[key]} ({family.bucketCounts[DROUGHT_GOVERNOR_BUCKET_LABELS[key]] ?? 0})
            </label>)}
          </div>
          <div className="windfall-drought-governor__heading">
            <HigButton size="compact" disabled={!profile.userEnabled} onClick={() => update({ [bucketKey]: [...bucketKeys] })}>All {family.family} buckets</HigButton>
            <HigButton size="compact" disabled={!profile.userEnabled} onClick={() => update({ [bucketKey]: [] })}>No {family.family} buckets</HigButton>
          </div>
          {manual && <HigField label={`${name} soft weight`} help="Applies to allowed numbers without a per-number override. 1.00x is neutral.">
            <WeightSelect value={settings[weightKey]} disabled={false} onChange={(value) => update({ [weightKey]: value })} label={`${name} soft weight`} />
          </HigField>}
        </fieldset>;
      })}
    </div>
    <p>Bucket counts show eligible shortlist numbers, not how many a candidate must contain. 0x means undrawn in the planning month.
      The Auto gate describes the original shortlist replay; custom bucket subsets have not been separately backtested.</p>

    <div className="windfall-drought-governor__carryover">
      <label><input type="checkbox" role="switch" disabled={!profile.userEnabled} checked={settings.carryOverEnabled}
        onChange={(event) => update({ carryOverEnabled: event.target.checked })} />Weight carry-over numbers</label>
      <InfoHelp label="About carry-over overlap numbers">
        These numbers occur in an eligible drought shortlist and were undrawn at the previous month-end.
        On allows their ordinary governor weights; it adds no extra carry-over bonus. Off makes their governor multiplier 1.00x.
        Other app influences can still weight them or select them.
      </InfoHelp>
      <span>Carry-over overlap numbers: <strong>{profile.carryOverNumbers.join(", ") || "none"}</strong> · Count {profile.carryOverNumbers.length}</span>
    </div>

    <div className="windfall-drought-governor__heading">
      <strong>Governor multiplier ledger</strong>
      {manual && <HigButton size="compact" disabled={!overriddenNumbers.length} onClick={() => update({ numberOverrides: {} })}>Reset number overrides</HigButton>}
    </div>
    <p>Applied weights below are this governor's contribution. The two family weights multiply for shared numbers, capped at 1.45x.
      {manual ? " A per-number override replaces that combined value. Weights can be set from 1.00x to 1.45x." : " Turn on Manual weights to edit them."}</p>
    {manual && overriddenNumbers.length > 0 && <p>Saved number overrides: {overriddenNumbers.map((number) => `${number}: ${settings.numberOverrides[number].toFixed(2)}x`).join(", ")}. Only currently allowed shortlist numbers receive them.</p>}
    {profile.numberDetails.length ? <div className="windfall-drought-governor__scroll" tabIndex={0} role="region" aria-label="Governor multiplier ledger">
      <table>
        <thead><tr>{["Number", "Shortlists", "Strict rank / drought", "Empirical rank / drought", "Bucket", "Carry-over", "Applied", "Source", ...(manual ? ["Manual override"] : [])].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{profile.numberDetails.map((detail) => <tr key={detail.number}>
          <th scope="row">{detail.number}</th>
          <td>{detail.families.join(" + ")}</td>
          <td>{detail.strictRank === null ? "-" : `r${detail.strictRank} / ${detail.strictDrought ?? "?"} draws`}</td>
          <td>{detail.empiricalRank === null ? "-" : `r${detail.empiricalRank} / ${detail.empiricalDrought ?? "?"} draws`}</td>
          <td>{detail.bucketLabel}</td><td>{detail.carriedOver ? "Yes" : "No"}</td>
          <td><strong>{detail.multiplier.toFixed(2)}x</strong></td>
          <td>{!detail.allowed ? "Not allowed" : detail.weightSource}</td>
          {manual && <td><select aria-label={`Manual weight for number ${detail.number}`} disabled={!detail.allowed}
            value={settings.numberOverrides[detail.number]?.toFixed(2) ?? "family"}
            onChange={(event) => {
              const overrides = { ...settings.numberOverrides };
              if (event.target.value === "family") delete overrides[detail.number];
              else overrides[detail.number] = Number(event.target.value);
              update({ numberOverrides: overrides });
            }}>
            <option value="family">Family weights</option>
            {weightOptions.map((weight) => <option key={weight.toFixed(2)} value={weight.toFixed(2)}>{weight.toFixed(2)}x</option>)}
          </select></td>}
        </tr>)}</tbody>
      </table>
    </div> : <p>No eligible drought shortlist numbers are available.</p>}
    <p>r = rank in that shortlist; drought = consecutive real draws without that number. New draws refresh the context and shortlists.
      Saved manual overrides remain attached to their number until reset.</p>
  </section>;
}
