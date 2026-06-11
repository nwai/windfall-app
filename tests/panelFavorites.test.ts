import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { PanelFavoritesProvider } from "../src/context/PanelFavoritesContext";
import { CollapsibleSection } from "../src/components/shared/CollapsibleSection";
import {
  getFavoritePanelDomId,
  normalizeFavoritePanelIds,
} from "../src/lib/panelFavorites";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("panel favorites", () => {
  it("normalizes favorite ids to known unique panels", () => {
    expect(normalizeFavoritePanelIds([
      "generated-candidates",
      "not-a-panel",
      "generated-candidates",
      "candidate-generation-influences",
      "odd-even-ratio-cadence",
      42,
    ])).toEqual(["generated-candidates", "candidate-generation-influences", "odd-even-ratio-cadence"]);
  });

  it("renders an accessible favorite button without changing panel identity", async () => {
    const onToggleFavorite = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          PanelFavoritesProvider,
          { favoritePanelIds: [], onToggleFavorite },
          React.createElement(
            CollapsibleSection,
            { panelId: "generated-candidates", title: React.createElement("b", null, "Generated Candidates") },
            React.createElement("div", null, "Panel body"),
          ),
        ),
      );
    });

    const details = container.querySelector("details");
    const favoriteButton = container.querySelector(".windfall-section__favorite-button") as HTMLButtonElement | null;

    expect(details?.id).toBe(getFavoritePanelDomId("generated-candidates"));
    expect(favoriteButton).not.toBeNull();
    expect(favoriteButton?.getAttribute("aria-pressed")).toBe("false");
    expect(favoriteButton?.getAttribute("aria-label")).toBe("Add Generated Candidates to favorites");

    await act(async () => {
      favoriteButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onToggleFavorite).toHaveBeenCalledWith("generated-candidates");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
