import React, { createContext, useContext, useMemo } from "react";
import { getFavoritePanelMeta, normalizeFavoritePanelIds, type FavoritePanelMeta } from "../lib/panelFavorites";

interface PanelFavoritesContextValue {
  favoritePanelIds: string[];
  favoritePanelIdSet: Set<string>;
  toggleFavoritePanel: (panelId: string) => void;
  getPanelMeta: (panelId: string) => FavoritePanelMeta | undefined;
}

const PanelFavoritesContext = createContext<PanelFavoritesContextValue | null>(null);

interface PanelFavoritesProviderProps {
  children: React.ReactNode;
  favoritePanelIds: string[];
  onToggleFavorite: (panelId: string) => void;
}

export const PanelFavoritesProvider: React.FC<PanelFavoritesProviderProps> = ({
  children,
  favoritePanelIds,
  onToggleFavorite,
}) => {
  const normalizedFavorites = useMemo(() => normalizeFavoritePanelIds(favoritePanelIds), [favoritePanelIds]);
  const favoritePanelIdSet = useMemo(() => new Set(normalizedFavorites), [normalizedFavorites]);
  const value = useMemo<PanelFavoritesContextValue>(() => ({
    favoritePanelIds: normalizedFavorites,
    favoritePanelIdSet,
    toggleFavoritePanel: onToggleFavorite,
    getPanelMeta: getFavoritePanelMeta,
  }), [favoritePanelIdSet, normalizedFavorites, onToggleFavorite]);

  return (
    <PanelFavoritesContext.Provider value={value}>
      {children}
    </PanelFavoritesContext.Provider>
  );
};

export function usePanelFavorites(): PanelFavoritesContextValue | null {
  return useContext(PanelFavoritesContext);
}
