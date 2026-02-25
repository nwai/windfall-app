import React, { useEffect, useState } from "react";

interface CollapsibleSectionProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summaryHint?: string; // optional small hint text next to title
  storageKey?: string; // optional key to persist open/closed state
}

// Unified panel title style: bold, size 16, color unified
const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
  color: "#1a4fa3", // unified accent color
};

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false, summaryHint, storageKey }) => {
  const derivedKey = storageKey ?? (typeof title === "string" ? `cs-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const effectiveDefault = derivedKey ? false : defaultOpen;

  const [open, setOpen] = useState<boolean>(() => {
    const key = derivedKey;
    if (!key) return effectiveDefault;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (saved === "true") return true;
    if (saved === "false") return false;
    return effectiveDefault;
  });

  useEffect(() => {
    if (!derivedKey) return;
    window.localStorage.setItem(derivedKey, open ? "true" : "false");
  }, [open, derivedKey]);

  const handleToggle: React.ReactEventHandler<HTMLDetailsElement> = (e) => {
    const isOpen = e.currentTarget.open;
    setOpen(isOpen);
  };

  return (
    <details open={open} onToggle={handleToggle} style={{ marginTop: 10 }}>
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