import React from "react";
import type { DrawRow } from "../lib/drawHistory";
import type { useOfficialDrawCheck } from "../hooks/useOfficialDrawCheck";
import { OFFICIAL_RESULTS_PAGE } from "../lib/officialDrawResults";
import { HigButton } from "./shared/HigControls";

export default function OfficialDrawCheckCard({ check, onUseOfficial }: {
  check: ReturnType<typeof useOfficialDrawCheck>; onUseOfficial?: (row: DrawRow) => void;
}) {
  const result = check.result;
  return <section aria-label="Official draw verification" style={{ border: "1px solid #d7dee8", borderRadius: 8, padding: 10, margin: "10px 0", fontSize: 12 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <strong>Official result check</strong>
      <HigButton size="compact" onClick={check.check} disabled={!check.valid || check.checking}>{check.checking ? "Checking..." : "Check against The Lott"}</HigButton>
      <a href={OFFICIAL_RESULTS_PAGE} target="_blank" rel="noopener noreferrer">View official results</a>
    </div>
    <div role="status" style={{ marginTop: 6, lineHeight: 1.5, color: result?.status === "mismatch" ? "#a52b22" : "#374151" }}>
      {check.checking ? "Contacting The Lott's public results service..." : result ? result.message : "Not checked. Format checks cannot detect a valid but incorrect number."}
    </div>
    {result?.official && <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
      <span>Official mains: <strong style={{ color: "#c62828" }}>{result.official.mains.join(", ")}</strong></span>
      <span>Official supps: <strong style={{ color: "#237a43" }}>{result.official.supps.join(", ")}</strong></span>
      {result.drawNumber && <span>Draw {result.drawNumber}</span>}
      {result.status === "mismatch" && onUseOfficial && <HigButton size="compact" onClick={() => onUseOfficial(result.official!)}>Use official numbers</HigButton>}
    </div>}
    {result?.status === "unavailable" && <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
      <input type="checkbox" checked={check.manualConfirmed} onChange={event => check.confirmManual(event.target.checked)} />
      I checked this date, all six mains and both supps against the official results myself. Save without automated verification.
    </label>}
    {result && <small>Checked {new Date(result.checkedAt).toLocaleString()} · The Lott · This check applies only to the current date and numbers.</small>}
  </section>;
}
