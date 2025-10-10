import React from "react";

export interface RankingWeights {
  oga: number;
  sel: number;
  recent: number;
}
interface Props {
  weights: RankingWeights;
  setWeights: (w: RankingWeights) => void;
}

export const RankingWeightsPanel: React.FC<Props> = ({ weights, setWeights }) => {
  const { oga, sel, recent } = weights;
  const sum = (oga + sel + recent) || 1;
  const normOGA = (oga / sum) * 100;
  const normSel = (sel / sum) * 100;
  const normRecent = (recent / sum) * 100;

  function update(partial: Partial<RankingWeights>) {
    setWeights({ ...weights, ...partial });
  }

  return (
    <section style={panelStyle}>
      <h4 style={{ margin: "0 0 6px" }}>Ranking Weights</h4>
      <div style={row}>
        <label title="Dominant geometric quality signal (OGA percentile)">
          OGA
          <input
            type="number"
            step={0.05}
            min={0}
            max={5}
            value={oga}
            onChange={e => update({ oga: Number(e.target.value) || 0 })}
            style={inp}
          />
        </label>
        <label title="Weight given to your User Selected (highlight) hits">
          SelHits
          <input
            type="number"
            step={0.05}
            min={0}
            max={5}
            value={sel}
            onChange={e => update({ sel: Number(e.target.value) || 0 })}
            style={inp}
          />
        </label>
        <label title="Weight given to overlap with the most recent draw">
          RecentHits
          <input
            type="number"
            step={0.05}
            min={0}
            max={5}
            value={recent}
            onChange={e => update({ recent: Number(e.target.value) || 0 })}
            style={inp}
          />
        </label>
      </div>
      <div style={foot}>
        Normalized: OGA {normOGA.toFixed(0)}% • Sel {normSel.toFixed(0)}% • Recent {normRecent.toFixed(0)}%
        <br />
        Composite = Σ (normalized weight * normalized metric).
      </div>
    </section>
  );
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #e1e5ec",
  borderRadius: 8,
  padding: 12,
  background: "#ffffff",
  marginTop: 16,
  maxWidth: 420
};
const row: React.CSSProperties = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  fontSize: 12,
  marginBottom: 6
};
const inp: React.CSSProperties = { marginLeft: 6, width: 70 };
const foot: React.CSSProperties = { marginTop: 4, fontSize: 11, color: "#555", lineHeight: 1.4 };