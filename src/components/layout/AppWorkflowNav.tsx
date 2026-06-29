import React from "react";
import { usePanelFavorites } from "../../context/PanelFavoritesContext";
import { getFavoritePanelDomId } from "../../lib/panelFavorites";

const WORKFLOW_LINKS = [
  { id: "workflow-history", label: "History" },
  { id: "workflow-signals", label: "Signals" },
  { id: "workflow-validation", label: "Validation" },
  { id: "workflow-generation", label: "Generation" },
  { id: "workflow-dga", label: "DGA" },
  { id: "workflow-patterns", label: "Patterns" },
] as const;

export const AppWorkflowNav: React.FC = () => (
  <nav className="windfall-workflow-nav" aria-label="Workflow sections">
    {WORKFLOW_LINKS.map((link) => (
      <a key={link.id} className="windfall-workflow-nav__link" href={`#${link.id}`}>
        {link.label}
      </a>
    ))}
  </nav>
);

interface WorkflowAnchorProps {
  id: string;
  title: string;
  summary: string;
  favoritePanelId?: string;
  favoritePanelTitle?: string;
  collapsible?: boolean;
  expanded?: boolean;
  controlsId?: string;
  onExpandedChange?: (expanded: boolean) => void;
}

export const WorkflowAnchor: React.FC<WorkflowAnchorProps> = ({
  id,
  title,
  summary,
  favoritePanelId,
  favoritePanelTitle,
  collapsible = false,
  expanded = true,
  controlsId,
  onExpandedChange,
}) => {
  const panelFavorites = usePanelFavorites();
  const registryMeta = favoritePanelId ? panelFavorites?.getPanelMeta(favoritePanelId) : undefined;
  const resolvedPanelTitle = favoritePanelTitle ?? registryMeta?.title;
  const canFavorite = !!favoritePanelId && !!resolvedPanelTitle && !!panelFavorites;
  const isFavorite = !!favoritePanelId && !!panelFavorites?.favoritePanelIdSet.has(favoritePanelId);
  const rootId = favoritePanelId ? getFavoritePanelDomId(favoritePanelId) : id;

  const handleFavoriteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!favoritePanelId) return;
    panelFavorites?.toggleFavoritePanel(favoritePanelId);
  };

  const handleDisclosureClick = () => {
    onExpandedChange?.(!expanded);
  };

  return (
    <div id={rootId} className="windfall-workflow-anchor" tabIndex={-1} data-panel-id={favoritePanelId}>
      {favoritePanelId ? <span id={id} className="windfall-workflow-anchor__nav-target" aria-hidden="true" /> : null}
      <div className="windfall-workflow-anchor__topline">
        <div className="windfall-workflow-anchor__copy">
          <div className="windfall-workflow-anchor__eyebrow">Workflow</div>
          <div className="windfall-workflow-anchor__title-row">
            {collapsible ? (
              <button
                type="button"
                className="windfall-workflow-anchor__disclosure-button"
                aria-expanded={expanded}
                aria-controls={controlsId}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
                onClick={handleDisclosureClick}
              >
                <span className="windfall-workflow-anchor__disclosure-icon" aria-hidden="true">
                  {expanded ? "▾" : "▸"}
                </span>
                <span className="windfall-visually-hidden">{expanded ? "Collapse" : "Expand"}</span>
              </button>
            ) : null}
            <h2 className="windfall-workflow-anchor__title">{title}</h2>
          </div>
        </div>
        <div className="windfall-workflow-anchor__actions">
          {canFavorite ? (
            <button
              type="button"
              className="windfall-section__favorite-button windfall-workflow-anchor__favorite"
              aria-pressed={isFavorite}
              aria-label={`${isFavorite ? "Remove" : "Add"} ${resolvedPanelTitle} ${isFavorite ? "from" : "to"} favorites`}
              onClick={handleFavoriteClick}
            >
              <span className="windfall-section__favorite-icon" aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
              <span className="windfall-section__favorite-text">{isFavorite ? "Favorite" : "Mark"}</span>
            </button>
          ) : null}
        </div>
      </div>
      <p className="windfall-workflow-anchor__summary">{summary}</p>
    </div>
  );
};
