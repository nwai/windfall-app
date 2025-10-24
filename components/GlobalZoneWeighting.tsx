import React, { useState } from "react";
import { useZPASettings } from "../context/ZPASettingsContext";
import { showToast } from "../lib/toastBus";

// Stable, top-level component. Controlled <details> so it won't "blip close".
export const GlobalZoneWeighting: React.FC = React.memo(() => {
  const { zoneWeightingEnabled, zoneGamma, setZoneWeightingEnabled, setZoneGamma } = useZPASettings();

  // keep the disclosure open state controlled
  const [open, setOpen] = useState<boolean>(false);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{ marginTop: 10 }}
    >
      <summary>
        <b>Global Zone Weighting</b>{" "}
        <span style={{ fontWeight: 400, color: "#666" }}>(applies to panels that opt-in)</span>
      </summary>

      <div
        style={{
          display: "inline-flex",
          gap: 12,
          alignItems: "center",
          padding: "6px 8px",
          background: "#efe9f7",
          borderRadius: 6,
          marginTop: 8,
        }}
      >
        <label title="Enable soft bias using ZPA per-number weights">
          <input
            type="checkbox"
            checked={zoneWeightingEnabled}
            onChange={(e) => {
              setZoneWeightingEnabled(e.target.checked);
              showToast(e.target.checked ? "Zone weighting enabled" : "Zone weighting disabled");
            }}
          />{" "}
          Enable
        </label>

        <label title="Strength of zone bias (exponent on weights)">
          γ:{" "}
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={zoneGamma}
            onChange={(e) => setZoneGamma(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
      </div>

      <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
        Per-number zone weights come from ZPA (saved). Panels that support zone bias read these values here.
      </div>
    </details>
  );
});