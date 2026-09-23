import React from "react";
import type { EffectiveSettingsLedger } from "../../lib/settingsTransparency";

export function EffectiveSettings({ ledger, status, error }: { ledger: EffectiveSettingsLedger; status?: string; error?: string | null }) {
  if (!ledger || !Array.isArray(ledger.rows)) return null;
  return <section aria-label="Effective Settings" style={{ margin: "10px 0", borderTop: "1px solid #d5d9df", paddingTop: 10 }}>
    {error && <p role="alert">{error}</p>}
    <details>
      <summary style={{ minHeight: 44, cursor: "pointer", fontWeight: 700 }}>Effective Settings · {ledger.rows.length} entries · {typeof ledger.version === "string" ? ledger.version : "Unversioned"}</summary>
      {status && <p style={{ fontSize: 12 }}>{status}</p>}
      <div role="region" aria-label="Effective settings table" tabIndex={0} style={{ overflow: "auto", maxHeight: 420 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 1080, tableLayout: "fixed", fontSize: 12 }}>
          <colgroup>{[160, 155, 180, 100, 195, 290].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
          <thead><tr>{["Setting", "Requested", "Applied", "Source", "Effect / scope", "Reason"].map(label => <th key={label} scope="col" style={{ position: "sticky", top: 0, background: "#f3f5f7", textAlign: "left", padding: 8, zIndex: 1 }}>{label}</th>)}</tr></thead>
          <tbody>{ledger.rows.filter(row => row && typeof row === "object").map((row, index) => <tr key={`${row.id}-${index}`}>
            {[row.label, row.requested, row.applied, row.source, `${row.effect} · ${row.scope}`, row.reason].map((value, col) => <td key={col} style={{ padding: 8, borderBottom: "1px solid #e2e5e9", verticalAlign: "top", minWidth: col === 0 ? 130 : 90, overflowWrap: "anywhere" }}>{typeof value === "string" ? value : "Unavailable"}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
