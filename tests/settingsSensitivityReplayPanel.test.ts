import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { SettingsSensitivityReplayPanel } from "../src/components/SettingsSensitivityReplayPanel";
import type { CandidateSet, Draw } from "../src/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draw = (date: string, main: number[], supp: number[] = []): Draw => ({
  date,
  main,
  supp,
});

describe("SettingsSensitivityReplayPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("renders as an observe-only replay panel without seeded target numbers", () => {
    const html = renderToStaticMarkup(React.createElement(SettingsSensitivityReplayPanel, {
      history: [],
      activeHistory: [],
    }));

    expect(html).toContain("Settings Sensitivity Replay");
    expect(html).toContain("Observe-only");
    expect(html).toContain("Retrospective scoring only");
    expect(html).not.toContain("4, 42, 28, 14, 43, 25, 44, 26");
  });

  it("scores current generated candidates after the user runs a target replay", async () => {
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-03", [9, 10, 11, 12, 13, 14], [15, 16]),
      draw("2026-01-05", [17, 18, 19, 20, 21, 22], [23, 24]),
    ];
    const generatedCandidates: CandidateSet[] = [{
      main: [4, 42, 28, 14, 43, 25],
      supp: [44, 26],
    }];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(SettingsSensitivityReplayPanel, {
        history,
        activeHistory: history,
        generatedCandidates,
      }));
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, "4,42,28,14,43,25,44,26");
    await act(async () => {
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const runButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Run replay") as HTMLButtonElement;
    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Best current candidate");
    expect(container.textContent).toContain("Generated #1");
    expect(container.textContent).toContain("Div1");
    expect(container.textContent).toContain("Pre-Registered Profile Replay");
  });

  it("copies a pre-registered profile replay selection without changing settings", async () => {
    const copiedText: string[] = [];
    const history = [
      draw("2026-01-01", [1, 2, 3, 4, 5, 6], [7, 8]),
      draw("2026-01-03", [1, 2, 3, 9, 10, 11], [12, 13]),
      draw("2026-01-05", [1, 2, 14, 15, 16, 17], [18, 19]),
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(SettingsSensitivityReplayPanel, {
        history,
        activeHistory: history,
        initialTargetText: "4,42,28,14,43,25,44,26",
        copyText: (text: string) => {
          copiedText.push(text);
        },
      }));
    });

    const copyButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Copy row") as HTMLButtonElement;
    expect(copyButton).toBeDefined();

    await act(async () => {
      copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(copiedText).toHaveLength(1);
    expect(copiedText[0].split(",").map((part) => Number(part.trim()))).toHaveLength(8);
    expect(container.textContent).toContain("Copied");
    expect(container.textContent).not.toContain("Adopt setting");
  });
});
