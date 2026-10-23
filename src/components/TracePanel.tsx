import React from "react";
import { showToast } from "../lib/toastBus";
import CollapsibleSection from "./shared/CollapsibleSection";

export const TracePanel: React.FC<{
  lines: string[];
  onClear: () => void;
}> = ({ lines, onClear }) => {
  const copy = () => {
    if (!lines.length) return;
    const text = lines.join("\n");
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('Trace copied to clipboard'))
        .catch(() => showToast('Failed to copy trace'));
    }
  };
  return (
    <CollapsibleSection panelId="trace" title="Trace" favoriteable={false}>
      <div style={{ margin: "6px 0", display: "flex", gap: 8 }}>
        <button onClick={copy} disabled={!lines.length}>Copy</button>
        <button onClick={onClear} disabled={!lines.length}>Clear</button>
      </div>
      <pre style={{ maxHeight: 240, overflow: "auto", fontSize: 12, background: "#fff", border: "1px solid #eee", padding: 8, borderRadius: 6 }}>
        {lines.join("\n") || "(no trace yet)"}
      </pre>
    </CollapsibleSection>
  );
};
