import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EvidencePortfolioReplayCard } from "../src/components/EvidencePortfolioReplayCard";
import { preparePortfolioHistory } from "../src/lib/evidencePortfolio";
import { parseCSVorJSON } from "../src/parseCSVorJSON";
import type { Draw } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const history = preparePortfolioHistory(parseCSVorJSON(readFileSync(resolve(process.cwd(), "src/windfall_history_lottolyzer.csv"), "utf8")) as Draw[]).draws.slice(0, 66);

describe("Observe-only portfolio replay controls", () => {
  it("starts collapsed and discloses its fixed protocol without fabricated result rows", () => {
    const html = renderToStaticMarkup(React.createElement(EvidencePortfolioReplayCard, { history, activeDrawCount: 16 }));
    expect(html).not.toContain("<details open");
    expect(html).toContain("EP-1 / EP-R1 / uniform controls");
    expect(html).toContain("0, 1, 17, 42");
    expect(html).toContain("no automatic adoption");
    expect(html).not.toContain("Target audit ledger");
  });
  it("does not allow fixed zero to silently become an expanding-history run", async () => {
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(EvidencePortfolioReplayCard, { history, activeDrawCount: 16 })));
      const input = container.querySelector<HTMLInputElement>('input[type="number"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(container.textContent).toContain("A fixed window needs a whole number");
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === "Run fixed replay")!;
      expect(button.disabled).toBe(true);
      expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("fixed");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it("reports an unavailable worker and re-enables retry without saving or adopting anything", async () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("Workers unavailable in this test"); } });
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(EvidencePortfolioReplayCard, { history, activeDrawCount: 16 })));
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === "Run fixed replay")!;
      await act(async () => button.click());
      expect(container.textContent).toContain("Workers unavailable in this test");
      expect(button.disabled).toBe(false);
      expect(container.textContent).not.toContain("Target audit ledger");
    } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
});
