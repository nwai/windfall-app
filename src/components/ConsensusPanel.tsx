import React, { useMemo } from "react";

type SurvivalRow = { number: number; baseProb?: number; biasedProb?: number };
type ChurnRow = { number: number; pChurn: number };
type ReturnRow = { number: number; pReturn: number };

type Props = {
  survival?: SurvivalRow[];      // from SurvivalAnalyzer onStats (use biasedProb or baseProb)
  churn?: ChurnRow[];            // from ChurnPredictor onPredictions
  reactivate?: ReturnRow[];      // from ReturnPredictor onPredictions
  numbers?: number;              // total numbers (default 45)
};

export const ConsensusPanel: React.FC<Props> = ({
  survival,
  churn,
  reactivate,
  numbers = 45,
}) => {
  const hasAny =
    (survival && survival.length) ||
    (churn && churn.length) ||
    (reactivate && reactivate.length);

  const consensus = useMemo(() => {
    const sMap = new Map<number, number>();
    const cMap = new Map<number, number>();
    const rMap = new Map<number, number>();

    if (survival) {
      for (const r of survival) {
        const s = r.biasedProb ?? r.baseProb ?? 0;
        sMap.set(r.number, s);
      }
    }
    if (churn) {
      for (const r of churn) {
        // Higher is better for consensus => use (1 - churn)
        cMap.set(r.number, Math.max(0, Math.min(1, 1 - r.pChurn)));
      }
    }
    if (reactivate) {
      for (const r of reactivate) {
        rMap.set(r.number, Math.max(0, Math.min(1, r.pReturn)));
      }
    }

    const rows: {
      number: number;
      survival?: number;
      keep?: number;    // 1 - churn
      returnP?: number; // pReturn
      consensus: number;
    }[] = [];

    for (let n = 1; n <= numbers; n++) {
      const s = sMap.get(n);
      const k = cMap.get(n);
      const re = rMap.get(n);
      const vals = [s, k, re].filter((v) => typeof v === "number") as number[];
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      rows.push({ number: n, survival: s, keep: k, returnP: re, consensus: mean });
    }
    rows.sort((a, b) => b.consensus - a.consensus || a.number - b.number);
    return rows;
  }, [survival, churn, reactivate, numbers]);

  return (
    <section style={{ border: "2px solid #6a1b9a", borderRadius: 8, padding: 16, margin: "16px 0", background: "#f8efff" }}>
      <h3 style={{ marginTop: 0 }}>Consensus</h3>
      {!hasAny ? (
        <div style={{ color: "#555" }}>
          No model outputs yet. Train churn/return and run Survival Analysis to populate consensus.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 520, background: "#fff", border: "1px solid #e1bee7" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Survival</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>1 - Churn</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Return</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Consensus</th>
              </tr>
            </thead>
            <tbody>
              {consensus.slice(0, 45).map((r, i) => (
                <tr key={r.number} style={{ background: i < 6 ? "#f3e5f5" : "transparent" }}>
                  <td style={{ padding: "4px 8px" }}><b>{r.number}</b></td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.survival != null ? (r.survival * 100).toFixed(1) + "%" : "–"}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.keep != null ? (r.keep * 100).toFixed(1) + "%" : "–"}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.returnP != null ? (r.returnP * 100).toFixed(1) + "%" : "–"}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700 }}>{(r.consensus * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            Consensus = mean of available signals (Survival, 1–Churn, Return). Empty signals are ignored for that number.
          </div>
        </div>
      )}
    </section>
  );
};