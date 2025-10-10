import React from "react";

type OperatorSliderProps = {
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  onChange: (value: number) => void;
  tooltip: string;
  unit?: string;
  marks?: { value: number; label: string }[];
  preview?: React.ReactNode;
  disabled?: boolean;
};

export const OperatorSlider: React.FC<OperatorSliderProps> = ({
  label,
  min,
  max,
  value,
  step = 0.01,
  onChange,
  tooltip,
  unit,
  marks,
  preview,
  disabled = false,
}) => (
  <div style={{ marginBottom: 24, width: 370, opacity: disabled ? 0.4 : 1 }}>
    <label style={{ display: "block", fontWeight: "bold", marginBottom: 2 }}>
      {label}
      <span
        style={{
          fontSize: 13,
          color: "#888",
          marginLeft: 8,
          cursor: "help",
          borderBottom: "1px dotted #aaa",
        }}
        title={tooltip}
      >
        ⓘ
      </span>
    </label>
    <div style={{ display: "flex", alignItems: "center" }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ flex: 1, marginRight: 12 }}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
      <span style={{ width: 48, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value}
        {unit}
      </span>
    </div>
    {marks && (
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginTop: 2 }}>
        {marks.map((m) => (
          <span key={m.value} style={{ textAlign: "center", flex: "1" }}>
            {m.label}
          </span>
        ))}
      </div>
    )}
    {preview && <div style={{ fontSize: 13, color: "#1976d2", marginTop: 3 }}>{preview}</div>}
  </div>
);