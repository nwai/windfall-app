import React from "react";
import { InfoHelp } from "./shared/HigControls";
import type { GeneratedCompositionSnapshot } from "../lib/generatedComposition";
import "./GenerationOutputAudit.css";

interface Props { snapshot: GeneratedCompositionSnapshot | null | undefined; view?: "all" | "digits" | "monthly" }
export default function RwR45OutputSummary({ snapshot, view = "all" }: Props) {
  if (!snapshot) return null;
  const label = view === "digits" ? "Terminal-digit output" : view === "monthly" ? "Bucket-origin output" : "Composition output";
  return <section className="generation-output-audit" aria-label={`Last RwR45 ${label.toLowerCase()}`}>
    <div className="generation-output-audit__heading"><strong>Last RwR45 · {label}</strong><span>{snapshot.rows.length} valid rows</span>
      <InfoHelp label={`About RwR45 ${label.toLowerCase()}`}>
        Calculated from the actual final RwR45 rows, including six mains and two supplementary numbers. This is observed output, not a target quota, historical observation or prediction. Your selections, boosts and switches are unchanged. Bucket origins are frozen to the planning-month state used for this run; they are not reclassified when history changes. One row can contain several separate maximal terminal runs, so run occurrence counts can overlap.
      </InfoHelp>
    </div>
    <small>Captured context: {snapshot.context} · settings unchanged</small>
    {snapshot.invalidRows > 0 && <p role="alert">{snapshot.invalidRows} malformed output rows were excluded from this readout.</p>}
    {!snapshot.rows.length ? <p>No valid RwR45 rows were returned.</p> : <details open={view !== "all"}>
      <summary>{view === "digits" ? "Actual terminal-digit counts" : "Actual row compositions"}</summary>
      <div className="generation-output-audit__scroll" tabIndex={0} role="region" aria-label={`RwR45 ${label.toLowerCase()} table`}>
        {view === "digits" ? <table><thead><tr><th>Ending</th><th>Number occurrences</th><th>Rows containing ending</th></tr></thead><tbody>
          {snapshot.terminalHits.map((count, digit) => <tr key={digit}><th scope="row">{digit}</th><td>{count}</td><td>{snapshot.terminalRows[digit]}/{snapshot.rows.length}</td></tr>)}
        </tbody></table> : <table><thead><tr><th>Row</th>{view === "all" && <><th>Odd/even</th><th>Terminal shape</th><th>Exact terminal runs</th><th>1-digit / 2-digit</th></>}<th>Bucket origins (all 8)</th></tr></thead><tbody>
          {snapshot.rows.map((row) => <tr key={row.position}><th scope="row">{row.position}</th>{view === "all" && <><td>{row.ratio}</td><td>{row.shape}</td><td>{row.runs.join(" · ") || "None"}</td><td>{row.singleDigits} / {row.twoDigits}</td></>}
            <td>{row.monthlyCounts ? row.monthlyCounts.map((count, index) => count ? `${index === 8 ? "8x+" : `${index}x`}: ${count}` : null).filter(Boolean).join(" · ") : "Unavailable"}</td>
          </tr>)}
        </tbody></table>}
      </div>
    </details>}
  </section>;
}
