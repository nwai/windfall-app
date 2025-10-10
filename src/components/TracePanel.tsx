import React from "react";

export const TracePanel: React.FC<{
  lines: string[];
  onClear: () => void;
}> = ({ lines, onClear }) => {
  const copy = () => {
    if (!lines.length) return;
    const text = lines.join("\n");
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };
  return (
    <details open style={{ marginTop: 12 }}>
      <summary><b>Trace</b></summary>
      <div style={{ margin: "6px 0", display: "flex", gap: 8 }}>
        <button onClick={copy} disabled={!lines.length}>Copy</button>
        <button onClick={onClear} disabled={!lines.length}>Clear</button>
      </div>
      <pre style={{ maxHeight: 240, overflow: "auto", fontSize: 12, background: "#fff", border: "1px solid #eee", padding: 8, borderRadius: 6 }}>
        {lines.join("\n") || "(no trace yet)"}
      </pre>
    </details>
  );
};