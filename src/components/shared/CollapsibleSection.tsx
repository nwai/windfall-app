import React from "react";

interface CollapsibleSectionProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summaryHint?: string; // optional small hint text next to title
}

// Unified panel title style: bold, size 16, color unified
const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
  color: "#1a4fa3", // unified accent color
};

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = true, summaryHint }) => {
  return (
    <details open={defaultOpen} style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer" }}>
        <span style={titleStyle}>{title}</span>
        {summaryHint ? (
          <span style={{ fontWeight: 400, fontSize: 12, color: "#666", marginLeft: 8 }}>({summaryHint})</span>
        ) : null}
      </summary>
      <div style={{ marginTop: 8 }}>
        {children}
      </div>
    </details>
  );
};

export default CollapsibleSection;
