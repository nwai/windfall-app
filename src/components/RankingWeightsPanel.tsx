import React from "react";

export interface RankingWeights {
  oga: number;
  selHitsEnabled: boolean;
  sel: number;
  recentHitsEnabled: boolean;
  recent: number;
  selBonusThreshold: number;
  selBonusWeight: number;
}
interface Props {
  weights: RankingWeights;
  setWeights: React.Dispatch<React.SetStateAction<RankingWeights>>;
  scope?: "all" | "oga" | "recency";
  title?: string;
}

export const RankingWeightsPanel: React.FC<Props> = ({ weights, setWeights, scope = "all", title = "Ranking Weights" }) => {
  const { oga, selHitsEnabled, sel, recentHitsEnabled, recent, selBonusThreshold, selBonusWeight } = weights;
  const effectiveSel = selHitsEnabled ? sel : 0;
  const effectiveRecent = recentHitsEnabled ? recent : 0;
  const sum = (oga + effectiveSel + effectiveRecent) || 1;
  const normOGA = (oga / sum) * 100;
  const normSel = (effectiveSel / sum) * 100;
  const normRecent = (effectiveRecent / sum) * 100;
  const recencySum = effectiveSel + effectiveRecent;
  const recencySelShare = recencySum > 0 ? (effectiveSel / recencySum) * 100 : 0;
  const recencyRecentShare = recencySum > 0 ? (effectiveRecent / recencySum) * 100 : 0;

  function update(partial: Partial<RankingWeights>) {
    setWeights((current) => ({ ...current, ...partial }));
  }

  // Handlers convert user entry to internal weight
  const handleOgaChange = (valStr: string) => {
    const v = Number(valStr);
    if (!Number.isFinite(v)) return;
    // Treat entered value as a weight regardless of mode; normalization handles proportions
    update({ oga: Math.max(0, v) });
  };
  const handleSelChange = (valStr: string) => {
    const v = Number(valStr);
    if (!Number.isFinite(v)) return;
    update({ sel: Math.max(0, v) });
  };
  const handleRecentChange = (valStr: string) => {
    const v = Number(valStr);
    if (!Number.isFinite(v)) return;
    update({ recent: Math.max(0, v) });
  };
  const handleSelBonusThresholdChange = (valStr: string) => {
    const v = Number(valStr);
    if (!Number.isFinite(v)) return;
    update({ selBonusThreshold: Math.max(0, Math.floor(v)) });
  };
  const handleSelBonusWeightChange = (valStr: string) => {
    const v = Number(valStr);
    if (!Number.isFinite(v)) return;
    update({ selBonusWeight: Math.max(0, v) });
  };

  return (
    <section style={panelStyle}>
      <h4 style={{ margin: "0 0 6px" }}>{title}</h4>
      <div style={row}>
        {(scope === "all" || scope === "oga") && (
          <label title="Dominant geometric quality signal (OGA percentile)">
            OGA
            <input
              type="number"
              step={0.05}
              min={0}
              max={5}
              value={oga}
              onChange={e => handleOgaChange(e.target.value)}
              style={inp}
            />
          </label>
        )}
        {(scope === "all" || scope === "recency") && (
          <>
            <label title="Weight given to your User Selected (highlight) hits">
              <span style={toggleLabel}>
                <input
                  type="checkbox"
                  checked={selHitsEnabled}
                  onChange={e => update({ selHitsEnabled: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                SelHits {selHitsEnabled ? "On" : "Off"}
              </span>
              Weight
              <input
                type="number"
                step={0.05}
                min={0}
                max={5}
                value={sel}
                disabled={!selHitsEnabled}
                onChange={e => handleSelChange(e.target.value)}
                style={{ ...inp, opacity: selHitsEnabled ? 1 : 0.45 }}
              />
            </label>
            <label title="Weight given to overlap with the most recent draw">
              <span style={toggleLabel}>
                <input
                  type="checkbox"
                  checked={recentHitsEnabled}
                  onChange={e => update({ recentHitsEnabled: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                RecentHits {recentHitsEnabled ? "On" : "Off"}
              </span>
              Weight
              <input
                type="number"
                step={0.05}
                min={0}
                max={5}
                value={recent}
                disabled={!recentHitsEnabled}
                onChange={e => handleRecentChange(e.target.value)}
                style={{ ...inp, opacity: recentHitsEnabled ? 1 : 0.45 }}
              />
            </label>
            <label title="Apply a fixed bonus if SelHits meet or exceed this threshold (before normalization)">
              Sel bonus @≥
              <input
                type="number"
                step={1}
                min={0}
                max={8}
                value={selBonusThreshold}
                onChange={e => handleSelBonusThresholdChange(e.target.value)}
                style={inp}
              />
            </label>
            <label title="Bonus added to composite score when threshold is met (before final sort)">
              Bonus weight
              <input
                type="number"
                step={0.05}
                min={0}
                max={5}
                value={selBonusWeight}
                onChange={e => handleSelBonusWeightChange(e.target.value)}
                style={inp}
              />
            </label>
          </>
        )}
      </div>
      <div style={foot}>
        {scope === "recency" ? (
          <>
            Active recency survivor weights: SelHits {selHitsEnabled ? `${recencySelShare.toFixed(0)}%` : "off"} • RecentHits {recentHitsEnabled ? `${recencyRecentShare.toFixed(0)}%` : "off"} (bonus adds {selBonusWeight.toFixed(2)} if SelHits ≥ {selBonusThreshold})
            <br />
            SelHits and RecentHits default off. Their numeric weights only affect survivor ranking after their switches are turned on.
          </>
        ) : (
          <>
            Normalized: OGA {normOGA.toFixed(0)}% • Sel {normSel.toFixed(0)}% • Recent {normRecent.toFixed(0)}% (bonus adds {selBonusWeight.toFixed(2)} if SelHits ≥ {selBonusThreshold})
            {scope === "all" && (
              <>
                <br />
                SelHits and RecentHits default off. Their numeric weights only affect survivor ranking after their switches are turned on.
              </>
            )}
          </>
        )}
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
  maxWidth: 640
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
const toggleLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 11,
  color: "#334155",
  fontWeight: 700,
};
