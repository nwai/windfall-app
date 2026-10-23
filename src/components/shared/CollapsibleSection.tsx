import React, { useRef, useState } from "react";
import { usePanelFavorites } from "../../context/PanelFavoritesContext";
import { getPanelOwnership } from "../../lib/evidenceFamilyRegistry";
import { getFavoritePanelDomId } from "../../lib/panelFavorites";
import { PanelHelp } from "./PanelHelp";
import { panelTitleText } from "./panelTitleText";

interface CollapsibleSectionProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summaryHint?: string;
  /** Legacy key retained for callers; disclosure state is no longer persisted. */
  storageKey?: string;
  panelId?: string;
  panelTitle?: string;
  favoriteable?: boolean;
  chrome?: "default" | "bodyOnly";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  bodyId?: string;
  headerActions?: React.ReactNode;
  deferContentWhileCollapsed?: boolean;
}

interface DeferredSectionContentProps {
  children: React.ReactNode;
  frozen: boolean;
}

const DeferredSectionContent = React.memo<DeferredSectionContentProps>(
  ({ children }) => <>{children}</>,
  (_previous, next) => next.frozen,
);

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  summaryHint,
  panelId,
  panelTitle,
  favoriteable = true,
  chrome = "default",
  open: controlledOpen,
  onOpenChange,
  bodyId,
  headerActions,
  deferContentWhileCollapsed = false,
}) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const panelFavorites = usePanelFavorites();
  const registryMeta = panelId ? panelFavorites?.getPanelMeta(panelId) : undefined;
  const ownership = panelId ? getPanelOwnership(panelId) : undefined;
  const resolvedPanelTitle = panelTitle ?? registryMeta?.title;
  const canFavorite = favoriteable && !!panelId && !!resolvedPanelTitle && !!panelFavorites;
  const isFavorite = !!panelId && !!panelFavorites?.favoritePanelIdSet.has(panelId);
  const isControlled = controlledOpen !== undefined;
  const resolvedOpen = controlledOpen ?? open;
  const hasRenderedDeferredContent = useRef(resolvedOpen);
  if (resolvedOpen) hasRenderedDeferredContent.current = true;
  const shouldRenderContent = !deferContentWhileCollapsed || hasRenderedDeferredContent.current;
  const renderedContent = shouldRenderContent ? (
    <DeferredSectionContent frozen={deferContentWhileCollapsed && !resolvedOpen}>
      {children}
    </DeferredSectionContent>
  ) : null;

  // Disclosure state is visit-local. Old stored open flags must not reopen panels at startup.
  const reveal = () => {
    if (!isControlled) setOpen(true);
    onOpenChange?.(true);
  };

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
        data-workflow-home={ownership?.currentHome}
        data-evidence-family={ownership?.primaryFamily}
        data-evidence-role={ownership?.role}
        data-evidence-use={ownership?.allowedUse}
        data-evidence-dependencies={ownership?.dependencies.join(",") || undefined}
        data-panel-placement={ownership?.placementStatus}
        data-collapsed={bodyOnlyOpen ? "false" : "true"}
        tabIndex={panelId ? -1 : undefined}
      >
        <div id={bodyId} className="windfall-section__body" hidden={!bodyOnlyOpen}>
          {renderedContent}
        </div>
      </section>
    );
  }

  return (
    <details
      id={panelId ? getFavoritePanelDomId(panelId) : undefined}
      className={`windfall-section ${isFavorite ? "windfall-section--favorite" : ""}`}
      data-panel-id={panelId}
      data-workflow-home={ownership?.currentHome}
      data-evidence-family={ownership?.primaryFamily}
      data-evidence-role={ownership?.role}
      data-evidence-use={ownership?.allowedUse}
      data-evidence-dependencies={ownership?.dependencies.join(",") || undefined}
      data-panel-placement={ownership?.placementStatus}
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
            <span className="windfall-panel-title-row">
              <span className="windfall-section__title">{title}</span>
              <PanelHelp panelId={panelId} title={resolvedPanelTitle ?? panelTitleText(title)} summary={summaryHint} onReveal={reveal} />
            </span>
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
        {renderedContent}
      </div>
    </details>
  );
};

export default CollapsibleSection;
