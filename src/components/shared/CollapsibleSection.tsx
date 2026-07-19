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
  chrome?: "default" | "bodyOnly";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  bodyId?: string;
  headerActions?: React.ReactNode;
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
  chrome = "default",
  open: controlledOpen,
  onOpenChange,
  bodyId,
  headerActions,
}) => {
  const derivedKey = storageKey ?? (typeof title === "string" ? `cs-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | undefined>(undefined);
  const panelFavorites = usePanelFavorites();
  const registryMeta = panelId ? panelFavorites?.getPanelMeta(panelId) : undefined;
  const resolvedPanelTitle = panelTitle ?? registryMeta?.title;
  const canFavorite = favoriteable && !!panelId && !!resolvedPanelTitle && !!panelFavorites;
  const isFavorite = !!panelId && !!panelFavorites?.favoritePanelIdSet.has(panelId);
  const isControlled = controlledOpen !== undefined;
  const resolvedOpen = controlledOpen ?? open;

  useEffect(() => {
    if (!derivedKey || typeof window === "undefined") {
      setLoadedStorageKey(undefined);
      return;
    }
    const saved = window.localStorage.getItem(derivedKey);
    if (!isControlled && saved === "true") setOpen(true);
    if (!isControlled && saved === "false") setOpen(false);
    setLoadedStorageKey(derivedKey);
  }, [derivedKey, isControlled]);

  useEffect(() => {
    if (isControlled || !derivedKey || loadedStorageKey !== derivedKey || typeof window === "undefined") return;
    window.localStorage.setItem(derivedKey, open ? "true" : "false");
  }, [isControlled, open, derivedKey, loadedStorageKey]);

  const handleToggle: React.ReactEventHandler<HTMLDetailsElement> = (e) => {
    const isOpen = e.currentTarget.open;
    if (!isControlled) setOpen(isOpen);
    onOpenChange?.(isOpen);
  };

  const handleHeaderActionsClick: React.MouseEventHandler<HTMLSpanElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFavoriteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!panelId) return;
    panelFavorites?.toggleFavoritePanel(panelId);
  };

  if (chrome === "bodyOnly") {
    const bodyOnlyOpen = resolvedOpen;

    return (
      <section
        id={panelId ? getFavoritePanelDomId(panelId) : undefined}
        className={`windfall-section windfall-section--body-only ${isFavorite ? "windfall-section--favorite" : ""}`}
        data-panel-id={panelId}
        data-collapsed={bodyOnlyOpen ? "false" : "true"}
        tabIndex={panelId ? -1 : undefined}
      >
        <div id={bodyId} className="windfall-section__body" hidden={!bodyOnlyOpen}>
          {children}
        </div>
      </section>
    );
  }

  return (
    <details
      id={panelId ? getFavoritePanelDomId(panelId) : undefined}
      className={`windfall-section ${isFavorite ? "windfall-section--favorite" : ""}`}
      data-panel-id={panelId}
      tabIndex={panelId ? -1 : undefined}
      open={resolvedOpen}
      onToggle={handleToggle}
    >
      <summary className="windfall-section__summary">
        <span className="windfall-section__heading">
          <span className="windfall-section__disclosure-button" aria-hidden="true">
            <span className="windfall-section__disclosure-icon">{resolvedOpen ? "▾" : "▸"}</span>
          </span>
          <span className="windfall-section__heading-copy">
            <span className="windfall-section__title">{title}</span>
            {summaryHint ? (
              <span className="windfall-section__hint">({summaryHint})</span>
            ) : null}
          </span>
        </span>
        {headerActions || canFavorite ? (
          <span className="windfall-section__actions" onClick={handleHeaderActionsClick}>
            {headerActions}
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
          </span>
        ) : null}
      </summary>
      <div className="windfall-section__body">
        {children}
      </div>
    </details>
  );
};

export default CollapsibleSection;
