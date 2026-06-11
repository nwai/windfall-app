import React from "react";
import {
  getFavoritePanelDomId,
  getFavoritePanelMeta,
  normalizeFavoritePanelIds,
  type FavoritePanelMeta,
} from "../../lib/panelFavorites";

interface PanelFavoritesStripProps {
  favoritePanelIds: string[];
  onClearFavorites: () => void;
}

export const PanelFavoritesStrip: React.FC<PanelFavoritesStripProps> = ({ favoritePanelIds, onClearFavorites }) => {
  const favorites = normalizeFavoritePanelIds(favoritePanelIds)
    .map((id) => getFavoritePanelMeta(id))
    .filter((panel): panel is FavoritePanelMeta => Boolean(panel));

  if (favorites.length === 0) return null;

  const focusPanel = (event: React.MouseEvent<HTMLAnchorElement>, panelId: string) => {
    event.preventDefault();
    const target = document.getElementById(getFavoritePanelDomId(panelId));
    if (!target) return;

    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.classList.remove("windfall-section--focus-pulse");
    void target.offsetWidth;
    target.classList.add("windfall-section--focus-pulse");
    target.focus({ preventScroll: true });
    window.setTimeout(() => target.classList.remove("windfall-section--focus-pulse"), 1400);
    window.history.replaceState(null, "", `#${getFavoritePanelDomId(panelId)}`);
  };

  return (
    <section className="windfall-favorites-strip" aria-label="Favorite panels">
      <div className="windfall-favorites-strip__label">Favorites</div>
      <div className="windfall-favorites-strip__links">
        {favorites.map((panel) => (
          <a
            key={panel.id}
            href={`#${getFavoritePanelDomId(panel.id)}`}
            className="windfall-favorites-strip__link"
            onClick={(event) => focusPanel(event, panel.id)}
          >
            <span className="windfall-favorites-strip__marker" aria-hidden="true">★</span>
            <span>{panel.title}</span>
          </a>
        ))}
      </div>
      <button
        type="button"
        className="windfall-favorites-strip__clear"
        onClick={onClearFavorites}
      >
        Clear
      </button>
    </section>
  );
};
