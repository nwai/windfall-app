import React, { useEffect, useState } from "react";

interface CollapsibleSectionProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summaryHint?: string;
  storageKey?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false, summaryHint, storageKey }) => {
  const derivedKey = storageKey ?? (typeof title === "string" ? `cs-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!derivedKey || typeof window === "undefined") {
      setLoadedStorageKey(undefined);
      return;
    }
    const saved = window.localStorage.getItem(derivedKey);
    if (saved === "true") setOpen(true);
    if (saved === "false") setOpen(false);
    setLoadedStorageKey(derivedKey);
  }, [derivedKey]);

  useEffect(() => {
    if (!derivedKey || loadedStorageKey !== derivedKey || typeof window === "undefined") return;
    window.localStorage.setItem(derivedKey, open ? "true" : "false");
  }, [open, derivedKey, loadedStorageKey]);

  const handleToggle: React.ReactEventHandler<HTMLDetailsElement> = (e) => {
    const isOpen = e.currentTarget.open;
    setOpen(isOpen);
  };

  return (
    <details className="windfall-section" open={open} onToggle={handleToggle}>
      <summary className="windfall-section__summary">
        <span className="windfall-section__title">{title}</span>
        {summaryHint ? (
          <span className="windfall-section__hint">({summaryHint})</span>
        ) : null}
      </summary>
      <div className="windfall-section__body">
        {children}
      </div>
    </details>
  );
};

export default CollapsibleSection;
