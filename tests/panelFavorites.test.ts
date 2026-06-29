import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { PanelFavoritesProvider } from "../src/context/PanelFavoritesContext";
import { WorkflowAnchor } from "../src/components/layout/AppWorkflowNav";
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

  it("can render a favorite button in a workflow anchor", async () => {
    const onToggleFavorite = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          PanelFavoritesProvider,
          { favoritePanelIds: ["diamond-grid-analysis"], onToggleFavorite },
          React.createElement(WorkflowAnchor, {
            id: "workflow-dga",
            title: "Diamond Grid Analysis",
            summary: "Inspect spatial, simulated, and monthly-bucket views without changing the source draw history.",
            favoritePanelId: "diamond-grid-analysis",
          }),
        ),
      );
    });

    const workflowAnchor = container.querySelector(".windfall-workflow-anchor");
    const workflowNavTarget = container.querySelector("#workflow-dga");
    const favoriteButton = container.querySelector(".windfall-workflow-anchor .windfall-section__favorite-button") as HTMLButtonElement | null;

    expect(workflowAnchor?.id).toBe(getFavoritePanelDomId("diamond-grid-analysis"));
    expect(workflowNavTarget).not.toBeNull();
    expect(favoriteButton).not.toBeNull();
    expect(favoriteButton?.getAttribute("aria-pressed")).toBe("true");
    expect(favoriteButton?.getAttribute("aria-label")).toBe("Remove Diamond Grid Analysis (DGA) from favorites");

    await act(async () => {
      favoriteButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onToggleFavorite).toHaveBeenCalledWith("diamond-grid-analysis");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("can render a disclosure button in a workflow anchor", async () => {
    const onExpandedChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          PanelFavoritesProvider,
          { favoritePanelIds: [], onToggleFavorite: vi.fn() },
          React.createElement(WorkflowAnchor, {
            id: "workflow-dga",
            title: "Diamond Grid Analysis",
            summary: "Inspect spatial, simulated, and monthly-bucket views without changing the source draw history.",
            collapsible: true,
            expanded: true,
            controlsId: "dga-body",
            onExpandedChange,
          }),
        ),
      );
    });

    const disclosureButton = container.querySelector(".windfall-workflow-anchor__disclosure-button") as HTMLButtonElement | null;

    expect(disclosureButton).not.toBeNull();
    expect(disclosureButton?.getAttribute("aria-expanded")).toBe("true");
    expect(disclosureButton?.getAttribute("aria-controls")).toBe("dga-body");

    await act(async () => {
      disclosureButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onExpandedChange).toHaveBeenCalledWith(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
