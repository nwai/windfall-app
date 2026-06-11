import React, { useEffect, useState } from "react";
import { usePanelFavorites } from "../../context/PanelFavoritesContext";
import { getFavoritePanelDomId } from "../../lib/panelFavorites";

interface CollapsibleSectionProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summaryHint?: string;
  storageKey?: string;
  panelId?: string;
  panelTitle?: string;
  favoriteable?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  summaryHint,
  storageKey,
  panelId,
  panelTitle,
  favoriteable = true,
}) => {
  const derivedKey = storageKey ?? (typeof title === "string" ? `cs-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | undefined>(undefined);
  const panelFavorites = usePanelFavorites();
  const registryMeta = panelId ? panelFavorites?.getPanelMeta(panelId) : undefined;
  const resolvedPanelTitle = panelTitle ?? registryMeta?.title;
  const canFavorite = favoriteable && !!panelId && !!resolvedPanelTitle && !!panelFavorites;
  const isFavorite = !!panelId && !!panelFavorites?.favoritePanelIdSet.has(panelId);

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

  const handleFavoriteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!panelId) return;
    panelFavorites?.toggleFavoritePanel(panelId);
  };

  return (
    <details
      id={panelId ? getFavoritePanelDomId(panelId) : undefined}
      className={`windfall-section ${isFavorite ? "windfall-section--favorite" : ""}`}
      data-panel-id={panelId}
      tabIndex={panelId ? -1 : undefined}
      open={open}
      onToggle={handleToggle}
    >
      <summary className="windfall-section__summary">
        <span className="windfall-section__heading">
          <span className="windfall-section__title">{title}</span>
          {summaryHint ? (
            <span className="windfall-section__hint">({summaryHint})</span>
          ) : null}
        </span>
        {canFavorite ? (
          <button
            type="button"
            className="windfall-section__favorite-button"
            aria-pressed={isFavorite}
            aria-label={`${isFavorite ? "Remove" : "Add"} ${resolvedPanelTitle} ${isFavorite ? "from" : "to"} favorites`}
            onClick={handleFavoriteClick}
          >
            <span className="windfall-section__favorite-icon" aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
            <span className="windfall-section__favorite-text">{isFavorite ? "Favorite" : "Mark"}</span>
          </button>
        ) : null}
      </summary>
      <div className="windfall-section__body">
        {children}
      </div>
    </details>
  );
};

export default CollapsibleSection;
